import { afterEach, describe, expect, it } from "vitest";
import {
  GATEWAY_MODELS,
  TINY_PNG_BASE64,
  startFakeGateway,
  textTurn,
  toolCallTurn,
  type FakeGateway,
} from "../test-support/fake-gateway.js";
import type { GameClient } from "./game.js";
import { SmokeError, main, runLlmSmoke } from "./smoke.js";

const game: GameClient = {
  screenshot: () => Promise.resolve({ pngBase64: TINY_PNG_BASE64, step: 9 }),
  state: () =>
    Promise.resolve({ location: "TITLE_SEQUENCE", x: 0, y: 0, inBattle: false, badges: 0, money: 0, step: 9 }),
};

type Message = Record<string, unknown>;

function messages(body: Record<string, unknown>): Message[] {
  return body.messages as Message[];
}

function hasImage(message: Message, base64: string): boolean {
  const content = message.content;
  return (
    Array.isArray(content) &&
    content.some((part: Record<string, unknown>) => {
      const imageUrl = part.image_url as { url?: string } | undefined;
      return part.type === "image_url" && imageUrl?.url === `data:image/png;base64,${base64}`;
    })
  );
}

const HAPPY_TURNS = [
  toolCallTurn("I should look at the screen first.", "call_1", "screenshot", "{}"),
  toolCallTurn("Now the parsed state.", "call_2", "get_state", "{}"),
  textTurn("Done.", "The title screen of Pokémon Emerald; location TITLE_SEQUENCE."),
];

describe("runLlmSmoke against an OpenAI-compatible gateway", () => {
  let gateway: FakeGateway | undefined;
  afterEach(async () => {
    await gateway?.close();
    gateway = undefined;
  });

  it("drives screenshot then get_state and reports what the model said", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: HAPPY_TURNS });
    const report = await runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-swarm", game });
    expect(report).toEqual({
      model: "think-swarm",
      toolCalls: ["screenshot", "get_state"],
      answer: "The title screen of Pokémon Emerald; location TITLE_SEQUENCE.",
      thinkingChars: "I should look at the screen first.".length + "Now the parsed state.".length + "Done.".length,
      turns: 3,
    });
  });

  it("sends the tool's frame to the model as an image and replays reasoning_content", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: HAPPY_TURNS });
    await runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-swarm", game });
    const second = gateway.requests[1]!.body;
    const sent = messages(second);
    expect(sent[0]!.role).toBe("system");
    const assistant = sent.find((message) => message.role === "assistant");
    expect(assistant?.reasoning_content).toBe("I should look at the screen first.");
    expect(sent.some((message) => message.role === "user" && hasImage(message, TINY_PNG_BASE64))).toBe(true);
    expect(second.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(second.max_tokens).toEqual(expect.any(Number));
    expect(second).not.toHaveProperty("store");
    expect(second.model).toBe("think-swarm");
  });

  it("turns thinking off when asked", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: HAPPY_TURNS });
    await runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-swarm", game, thinkingLevel: "off" });
    expect(gateway.requests[0]!.body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("refuses a lane without vision", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: HAPPY_TURNS });
    await expect(runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-faster", game })).rejects.toThrow(
      /think-faster.*vision/,
    );
    expect(gateway.requests).toEqual([]);
  });

  it("fails when the model skips a tool", async () => {
    gateway = await startFakeGateway({
      models: GATEWAY_MODELS,
      turns: [toolCallTurn("look", "call_1", "screenshot", "{}"), textTurn("", "A screen.")],
    });
    await expect(runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-swarm", game })).rejects.toThrow(
      /get_state/,
    );
  });

  it("fails when a tool errors", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: HAPPY_TURNS });
    const broken: GameClient = { ...game, state: () => Promise.reject(new Error("server down")) };
    await expect(runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-swarm", game: broken })).rejects.toThrow(
      SmokeError,
    );
  });

  it("fails when the model gives no final answer", async () => {
    gateway = await startFakeGateway({
      models: GATEWAY_MODELS,
      turns: [...HAPPY_TURNS.slice(0, 2), textTurn("thinking only", "")],
    });
    await expect(runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-swarm", game })).rejects.toThrow(
      /final answer/,
    );
  });

  it("surfaces a gateway error from the model call", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: [] });
    await expect(runLlmSmoke({ gatewayUrl: gateway.url, modelId: "think-swarm", game })).rejects.toThrow(
      SmokeError,
    );
  });
});

describe("main", () => {
  let gateway: FakeGateway | undefined;
  afterEach(async () => {
    await gateway?.close();
    gateway = undefined;
  });

  it("wires config, the game server and the gateway, and prints the report", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: HAPPY_TURNS });
    const lines: string[] = [];
    const code = await main(
      { POKEBENCH_GATEWAY_URL: gateway.url, POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:1" },
      { log: (line) => lines.push(line), makeGame: (url) => (url === "http://127.0.0.1:1" ? game : game) },
    );
    expect(code).toBe(0);
    expect(lines.join("\n")).toMatch(/smoke-llm OK.*think-swarm.*screenshot, get_state/s);
  });

  it("prints the failure and returns 1", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS, turns: [] });
    const lines: string[] = [];
    const code = await main({ POKEBENCH_GATEWAY_URL: gateway.url }, { log: (line) => lines.push(line), makeGame: () => game });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/smoke-llm FAILED/);
  });
});
