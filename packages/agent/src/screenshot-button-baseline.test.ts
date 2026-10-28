import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { SWITCHABLE_FEATURES, playHarnessFeatures } from "./features.js";
import { normalizeFeatures, parsePlayPreset } from "./play-preset.js";
import { playSystemPrompt, playTools, toolSwitches } from "./play-config.js";
import { gameTools } from "./game-tools.js";
import { IN_GAME } from "../test-support/events.js";

const prompt = "You are playing Pokémon Emerald. Make as much progress as you can. You receive screenshots and can use `observe` to view the screen or `press` to press buttons: A, B, START, SELECT, UP, DOWN, LEFT, RIGHT. Choose your actions from what you see.";
const plain = () => normalizeFeatures(Object.fromEntries(SWITCHABLE_FEATURES.map(id => [id, false])));
const enabled = () => ({ ...plain(), "screenshot-button-baseline-v1": true });

it("selects exactly the operator-approved prompt and keeps OFF bytes", () => {
  const before = playSystemPrompt(plain(), null);
  expect(playSystemPrompt(enabled(), null)).toBe(prompt);
  expect(playSystemPrompt({ ...enabled(), "screenshot-button-baseline-v1": false }, null)).toBe(before);
  expect(normalizeFeatures({ ...plain(), "screenshot-button-baseline-v1": undefined })["screenshot-button-baseline-v1"]).toBe(false);
  expect(playHarnessFeatures(enabled(), null).at(-1)).toBe("screenshot-button-baseline-v1");
});

it("freezes an all-off boot baseline with only the approved prompt treatment", () => {
  const preset = parsePlayPreset(JSON.parse(readFileSync(new URL("../../../experiments/presets/screenshot-button-baseline.json", import.meta.url), "utf8")));
  expect(preset.version).toBe(2);
  if (preset.version !== 2) throw new Error("expected v2 preset");
  expect(preset.start).toBeUndefined();
  expect(preset.features).toEqual(enabled());
  expect(playTools(preset.features)).toEqual(["observe", "press"]);
  expect(preset.limits).toEqual({ maxTurns: 20000, maxWallMs: 1800000, failureLimit: 3 });
  expect(playSystemPrompt(preset.features, null)).toBe(prompt);
});

it("delivers only the screenshot through real observe/press factories while preserving private state and exact inputs", async () => {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write("IHDR", 12); bytes.writeUInt32BE(240, 16); bytes.writeUInt32BE(160, 20);
  const image = { type: "image", data: bytes.toString("base64"), mimeType: "image/png" };
  const calls: { path: string; body: string | undefined }[] = [];
  const fake: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, body: init?.body as string | undefined });
    const body = path === "/pokebench/observation" ? { screenshot_base64: image.data, state_text: "RAM SECRET plus fading-screen note", state: IN_GAME } : path === "/queue_status" ? { queue_empty: true } : {};
    return new Response(JSON.stringify(body));
  };
  const tools = gameTools("http://game", { beforePress: () => undefined, afterPress: async () => undefined }, fake, toolSwitches(enabled()), { sleep: async () => undefined, now: () => 0 });
  expect(tools.map(tool => tool.name)).toEqual(["observe", "press"]);
  for (const tool of tools) {
    const result = await tool.execute("call", tool.name === "press" ? { buttons: ["A", "RIGHT"] } : {});
    expect(result.content).toEqual([image]);
    expect(result.details).toMatchObject({ state: IN_GAME });
  }
  expect(calls.filter(call => call.path === "/action")).toEqual([{ path: "/action", body: JSON.stringify({ buttons: ["A", "RIGHT"], hold_frames: 10, release_frames: 8 }) }]);
  const off = gameTools("http://game", { beforePress: () => undefined, afterPress: async () => undefined }, fake, toolSwitches(plain()));
  expect((await off[0].execute("off", {})).content).toEqual([image, { type: "text", text: "RAM SECRET plus fading-screen note" }]);
});
