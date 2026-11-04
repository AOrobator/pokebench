import type { AgentTool } from "@mariozechner/pi-agent-core";
import { expect, it } from "vitest";
import { SWITCHABLE_FEATURES, featuresOf, playHarnessFeatures } from "./features.js";
import { normalizeFeatures } from "./play-preset.js";
import { playSystemPrompt, toolSwitches } from "./play-config.js";
import { gameTools } from "./game-tools.js";
import { IN_GAME } from "../test-support/events.js";

const prompt = "You are playing Pokémon Emerald. Make as much progress as you can. You receive screenshots and can use `observe` to view the screen or `press` to press buttons: A, B, START, SELECT, UP, DOWN, LEFT, RIGHT. Choose your actions from what you see.";
const plain = () => featuresOf([]);
const enabled = () => ({ ...plain(), "screenshot-button-baseline-v1": true });

it("selects exactly the operator-approved prompt and keeps OFF bytes", () => {
  expect(SWITCHABLE_FEATURES[305]).toBe("screenshot-button-baseline-v1");
  const before = playSystemPrompt(plain(), null);
  expect(playSystemPrompt(enabled(), null)).toBe(prompt);
  expect(playSystemPrompt({ ...enabled(), "screenshot-button-baseline-v1": false }, null)).toBe(before);
  const { "screenshot-button-baseline-v1": omitted, ...legacy } = plain();
  expect(omitted).toBe(false);
  expect(normalizeFeatures(legacy)["screenshot-button-baseline-v1"]).toBe(false);
  expect(playHarnessFeatures(enabled(), null).at(-1)).toBe("screenshot-button-baseline-v1");
});

it("delivers only the screenshot through real observe/press factories while preserving private state and exact inputs", async () => {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write("IHDR", 12); bytes.writeUInt32BE(240, 16); bytes.writeUInt32BE(160, 20);
  const image = { type: "image", data: bytes.toString("base64"), mimeType: "image/png" };
  const calls: { path: string; body: string | undefined }[] = [];
  const fake: typeof fetch = (url, init) => {
    const path = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).pathname;
    calls.push({ path, body: init?.body as string | undefined });
    const body = path === "/pokebench/observation" ? { screenshot_base64: image.data, state_text: "RAM SECRET plus fading-screen note", state: IN_GAME } : path === "/queue_status" ? { queue_empty: true } : path === "/pokebench/state" ? IN_GAME : { status: "success" };
    return Promise.resolve(new Response(JSON.stringify(body)));
  };
  const tools: readonly AgentTool[] = gameTools("http://game", { beforePress: () => undefined, afterPress: () => Promise.resolve() }, fake, toolSwitches(enabled()), { sleep: () => Promise.resolve(), now: () => 0 });
  expect(tools.map(tool => tool.name)).toEqual(["observe", "press"]);
  for (const tool of tools) {
    const result = await tool.execute("call", tool.name === "press" ? { buttons: ["A", "RIGHT"] } : {});
    expect(result.content).toEqual([image]);
    expect(result.details).toMatchObject({ state: IN_GAME });
  }
  expect(calls.filter(call => call.path === "/action")).toEqual([{ path: "/action", body: JSON.stringify({ buttons: ["A", "RIGHT"], hold_frames: 10, release_frames: 8 }) }]);
  const off = gameTools("http://game", { beforePress: () => undefined, afterPress: () => Promise.resolve() }, fake, toolSwitches(plain()));
  expect((await off[0].execute("off", {})).content).toEqual([image, { type: "text", text: "RAM SECRET plus fading-screen note" }]);
});
