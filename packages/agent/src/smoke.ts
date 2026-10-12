import { Agent, type AgentMessage, type ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { loadConfig } from "./config.js";
import { createGameClient, type GameClient } from "./game.js";
import { discoverLanes, selectLane, toPiModel } from "./gateway.js";
import { screenshotTool, stateTool } from "./tools.js";

export class SmokeError extends Error {
  override readonly name = "SmokeError";
}

export interface LlmSmokeOptions {
  readonly gatewayUrl: string;
  readonly modelId: string;
  readonly game: GameClient;
  readonly thinkingLevel?: ThinkingLevel;
}

export interface LlmSmokeReport {
  readonly model: string;
  readonly toolCalls: string[];
  readonly answer: string;
  readonly thinkingChars: number;
  readonly turns: number;
}

const REQUIRED_TOOLS = ["screenshot", "get_state"];

const SYSTEM_PROMPT =
  "You are checking the wiring of a Pokémon Emerald harness. Use the tools exactly as instructed.";

const TASK =
  "First call the screenshot tool. Then call the get_state tool. Then answer in one sentence: " +
  "describe what is on screen and name the location from the state.";

function assistantMessages(messages: readonly AgentMessage[]): AssistantMessage[] {
  return messages.filter((message): message is AssistantMessage => message.role === "assistant");
}

export async function runLlmSmoke(options: LlmSmokeOptions): Promise<LlmSmokeReport> {
  const lane = selectLane(await discoverLanes(options.gatewayUrl), options.modelId);
  if (!lane.vision) {
    throw new SmokeError(`lane ${lane.id} has no vision; the smoke needs to show it a frame`);
  }
  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: toPiModel(lane, options.gatewayUrl),
      thinkingLevel: options.thinkingLevel ?? "low",
      tools: [screenshotTool(options.game), stateTool(options.game)],
    },
    getApiKey: () => "no-auth-on-the-lan-gateway",
  });
  await agent.prompt(TASK);

  const messages = agent.state.messages;
  const replies = assistantMessages(messages);
  const failed = replies.find((reply) => reply.stopReason === "error" || reply.stopReason === "aborted");
  if (failed !== undefined) {
    throw new SmokeError(`model call failed: ${failed.errorMessage ?? failed.stopReason}`);
  }
  const results = messages.filter((message) => message.role === "toolResult");
  const broken = results.find((result) => result.isError);
  if (broken !== undefined) {
    throw new SmokeError(`tool ${broken.toolName} failed: ${JSON.stringify(broken.content)}`);
  }
  const toolCalls = results.map((result) => result.toolName);
  const missing = REQUIRED_TOOLS.filter((name) => !toolCalls.includes(name));
  if (missing.length > 0) {
    throw new SmokeError(`model never called ${missing.join(", ")}; called: ${toolCalls.join(", ") || "nothing"}`);
  }
  const last = replies.at(-1);
  const answer = (last?.content ?? [])
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (answer === "") {
    throw new SmokeError("model gave no final answer");
  }
  const thinkingChars = replies
    .flatMap((reply) => reply.content)
    .reduce((sum, block) => sum + (block.type === "thinking" ? block.thinking.length : 0), 0);
  return { model: lane.id, toolCalls, answer, thinkingChars, turns: replies.length };
}

export interface MainDeps {
  readonly log: (line: string) => void;
  readonly makeGame: (baseUrl: string) => GameClient;
}

const DEFAULT_DEPS: MainDeps = {
  log: (line) => {
    console.log(line);
  },
  makeGame: (baseUrl) => createGameClient(baseUrl),
};

export async function main(
  env: Readonly<Record<string, string | undefined>>,
  deps: MainDeps = DEFAULT_DEPS,
): Promise<number> {
  try {
    const config = loadConfig(env);
    const report = await runLlmSmoke({
      gatewayUrl: config.gatewayUrl,
      modelId: config.model,
      game: deps.makeGame(config.gameServerUrl),
    });
    deps.log(
      `smoke-llm OK: model=${report.model} tools=${report.toolCalls.join(", ")} turns=${String(report.turns)} ` +
        `thinking_chars=${String(report.thinkingChars)}\nanswer: ${report.answer}`,
    );
    return 0;
  } catch (error) {
    deps.log(`smoke-llm FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.env);
}
