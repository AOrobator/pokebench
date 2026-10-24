import { describe, expect, it } from "vitest";
import { ALL_ON, featureInfo, SERVER_FEATURES, serverFeatureEnv, SWITCHABLE_FEATURES, playHarnessFeatures, type FeatureSet } from "./features.js";
import { playSystemPrompt, playTools } from "./play-config.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";

const ID = "player-elevation-readout-v1";
const off: FeatureSet = { ...ALL_ON, [ID]: false };
const on: FeatureSet = { ...ALL_ON, [ID]: true };

describe(ID, () => {
  it("registers the factual observation and defaults omitted historical presets OFF", () => {
    expect(SWITCHABLE_FEATURES).toContain(ID);
    expect(SERVER_FEATURES).toContain(ID);
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
  });

  it("the production server environment and recorded metadata honor both arms", () => {
    expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
    expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
    expect(playHarnessFeatures(off, null)).not.toContain(ID);
    expect(playHarnessFeatures(on, null)).toContain(ID);
  });

  it("adds no tool, tool argument, prompt advice or automatic navigation", () => {
    expect(playTools(on)).toEqual(playTools(off));
    expect(playSystemPrompt(on, null)).toBe(playSystemPrompt(off, null));
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import { createAssistantMessageEventStream, type Message, type Model } from "@mariozechner/pi-ai";
import { assistant, toolCall, userText } from "../test-support/pi.js";
import { RUN_START_META } from "../test-support/events.js";
import { FrameStore } from "./frames.js";
import { Governor, piLoop, play } from "./harness.js";
import { RunRecorder } from "./recorder.js";
import { RunLog } from "./run-log.js";
import { parseEvent } from "./events.js";
import { parseGameState } from "./game-state.js";
import { observeTool } from "./game-tools.js";

const native = JSON.parse(readFileSync(new URL("../../../env/tests/env/fixtures/player-elevation-0d5d-21932.json", import.meta.url), "utf8")) as { off_readout: string; expected_position_on: string };
const grid = JSON.parse(readFileSync(new URL("../test-support/elevation-route110-21932-on.json", import.meta.url), "utf8")) as { state: unknown };
const model: Model<"openai-completions"> = { id: "offline-delivery-fixture", name: "offline-delivery-fixture", api: "openai-completions", provider: "fixture", baseUrl: "http://127.0.0.1:1", reasoning: false, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 65536, maxTokens: 100 };

it.each([false, true])("native elevation readout ON=%s reaches the next pinned-pi request and durable tool result unchanged", async enabled => {
 const dir = mkdtempSync(join(tmpdir(), "player-elevation-delivery-"));
 try {
  const state = parseGameState(grid.state);
  const expected = enabled ? native.off_readout.replace("Position: X=17, Y=69, facing up", native.expected_position_on) : native.off_readout;
  const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(13,8); png.write("IHDR",12); png.writeUInt32BE(240,16); png.writeUInt32BE(160,20);
  const fetchFn: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ state, state_text: expected, screenshot_base64: png.toString("base64") })));
  const tool = observeTool("http://offline-fixture", fetchFn);
  const log = RunLog.create(dir, "offline-player-elevation");
  const recorder = new RunRecorder({ log, frames: new FrameStore(dir), milestones: { poll: () => Promise.resolve([]) }, gameState: { read: () => Promise.resolve(state) } });
  await recorder.start({ ...RUN_START_META, harness_features: enabled ? [ID] : [], tools: ["observe"] });
  const governor = new Governor({ limits: { maxTurns: 2, maxWallMs: 60000, failureLimit: 3 }, retry: () => undefined, abort: () => undefined, now: () => 0 });
  let decisions = 0, delivered = "";
  const streamFn: StreamFn = (_model, context) => {
   decisions++;
   if (decisions === 2) {
    delivered = context.messages.filter(m => m.role === "toolResult").flatMap(m => m.content.filter(c => c.type === "text").map(c => c.text)).join("\n");
    expect(delivered).toBe(expected);
   }
   const message = decisions === 1 ? assistant({ toolCalls: [toolCall("elevation", "observe", {})], stopReason: "toolUse" }) : assistant({ text: "offline fixture complete" });
   const stream = createAssistantMessageEventStream(); stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : "stop", message }); return stream;
  };
  const loop = piLoop({ systemPrompt: "Offline native readout transport fixture; no inference or emulator.", tools: [tool], base: { model, convertToLlm: messages => messages as Message[] }, governor, transformContext: recorder.transformContext, emit: recorder.emit, streamFn, signal: new AbortController().signal });
  expect(await play(userText("Fixture"), governor, loop)).toBe("budget"); recorder.end("budget");
  const events = readFileSync(log.eventsPath, "utf8").trim().split("\n").map(l => parseEvent(l));
  const results = events.filter(e => e.type === "tool_result");
  expect(results).toHaveLength(1); expect(decisions).toBe(2);
  expect(results[0]).toMatchObject({ type: "tool_result", name: "observe", is_error: false, text: expected });
  expect(delivered).toBe(expected);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
