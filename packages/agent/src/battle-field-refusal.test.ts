import { gunzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool, StreamFn } from "@mariozechner/pi-agent-core";
import { createAssistantMessageEventStream, type Message, type Model } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { assistant, toolCall, userText } from "../test-support/pi.js";
import { RUN_START_META } from "../test-support/events.js";
import { checkEvent, parseEvent } from "./events.js";
import { parseGameState } from "./game-state.js";
import type { FeatureSet } from "./features.js";
import { attachLoopGuard, Governor, piLoop, play } from "./harness.js";
import { LoopDetector, type LoopNotice } from "./loop-detection.js";
import { contextTools, loopSupervisor } from "./play-wiring.js";
import { FrameStore } from "./frames.js";
import { RunRecorder } from "./recorder.js";
import { RunLog } from "./run-log.js";
import { normalizeFeatures } from "./play-preset.js";

const fixture = JSON.parse(gunzipSync(readFileSync(new URL("../test-support/battle-no-battle-refusals.json.gz", import.meta.url))).toString("utf8")) as {
  source: { run: string; commit: string; events_sha256: string; second_result_seq: number };
  features: FeatureSet;
  events: unknown[];
};
const events = fixture.events.map(checkEvent);
const calls = events.filter(e => e.type === "tool_call" && e.name === "battle_action");
const results = events.filter(e => e.type === "tool_result" && e.name === "battle_action");
const states = new Map(events.filter(e => e.type === "state" && "started" in e).map(e => [e.seq, e]));
function snapshot(seq: number) {
  const event = states.get(seq);
  if (event === undefined) throw new Error(`Missing recorded state ${String(seq)}`);
  return parseGameState(Object.fromEntries(Object.entries(event).filter(([key]) => !["v", "run", "seq", "t", "type", "turn"].includes(key))));
}
const field = snapshot(results[0]?.state_seq ?? -1);
const refusal = "Battle action: nothing pressed: no battle is in progress.";
const model: Model<"openai-completions"> = {
  id: "test", name: "test", api: "openai-completions", provider: "test", baseUrl: "http://127.0.0.1:1",
  reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 65536, maxTokens: 100,
};

describe("recorded no-battle refusals", () => {
  it("warns at original result28167, across requested moves, and recovers when the field wait changes", () => {
    const notices: LoopNotice[] = [];
    const detector = new LoopDetector(n => notices.push(n), undefined, "enforced", true, undefined, false, false, true, true, true, false, false, false, false, true);
    for (const event of events) detector.observe(event);
    expect(calls).toHaveLength(56);
    expect(new Set(calls.map(c => JSON.stringify(c.args))).size).toBe(2);
    expect(notices.map(n => n.phase)).toEqual(["warning", "recovered"]);
    expect(notices[0]).toMatchObject({ kind: "rejection", calls: 3, evidence: [28155, 28167] });
    expect(notices[0]?.message).toContain(refusal);
  });

  it.each([false, true])("delivers the recorded warning through production supervisor and pinned pi, switch=%s", async on => {
    const root = mkdtempSync(join(tmpdir(), "pokebench-field-refusal-"));
    try {
      const features = { ...normalizeFeatures(fixture.features), "battle-refusal-loop-v1": on };
      expect(features["fixed-point-breaker-v1"]).toBe(false);
      expect(features["duplicate-turn-collapse-v1"]).toBe(true);
      const log = RunLog.create(root, "recorded-refusal-replay");
      const recorder = new RunRecorder({ log, frames: new FrameStore(root), milestones: { poll: () => Promise.resolve([]) }, gameState: { read: () => Promise.resolve(field) } });
      await recorder.start(RUN_START_META);
      const controller = new AbortController();
      const governor = new Governor({ limits: { maxTurns: 56, maxWallMs: 60000, failureLimit: 3 }, now: () => 0, retry: () => undefined, abort: () => controller.abort() });
      const detector = attachLoopGuard(recorder, governor, undefined, "enforced", features["interaction-loop-detection-v1"], loopSupervisor(features, recorder), features["transition-loop-detection-v1"], features["pushback-loop-detection-v1"], features["battle-observation-loop-v1"], features["navigation-truth-v1"], features["ineffective-loops-v1"], features["battle-menu-loop-v1"], features["clock-view-loop-v1"], features["reopened-dialogue-loop-v1"], features["trigger-script-loop-v1"], features["battle-refusal-loop-v1"], features["ineffective-navigation-v2"], features["same-target-no-progress-v1"], features);
      const wired = contextTools(features, recorder, recorder.transformContext);
      let executed = 0;
      const tool: AgentTool = {
        name: "battle_action", label: "battle_action", description: "Replay the recorded tool result without game input.", parameters: Type.Object({ action: Type.String(), move: Type.String() }),
        execute: () => {
          const result = results[executed++];
          if (result === undefined) throw new Error("Unexpected replay call");
          return Promise.resolve({ content: [{ type: "text" as const, text: result.text }], details: { state: snapshot(result.state_seq ?? -1) } });
        },
      };
      const sent: { sourceTurn: number; text: string }[] = [];
      const streamFn: StreamFn = (_model, context) => {
        const call = calls[sent.length];
        if (call === undefined) throw new Error("Unexpected inference request");
        sent.push({ sourceTurn: call.turn, text: context.messages.filter(m => m.role === "user").flatMap(m => typeof m.content === "string" ? [m.content] : m.content.flatMap(p => p.type === "text" ? [p.text] : [])).join("\n") });
        const message = assistant({ toolCalls: [toolCall(call.id, call.name, call.args as Record<string, unknown>)], stopReason: "toolUse" });
        const stream = createAssistantMessageEventStream();
        stream.push({ type: "done", reason: "toolUse", message });
        return stream;
      };
      const loop = piLoop({ systemPrompt: "Recorded replay; no inference endpoint.", tools: [tool], base: { model, convertToLlm: messages => messages as Message[] }, governor, loopDetector: detector, transformContext: wired.transformContext, window: wired.window, emit: recorder.emit, signal: controller.signal, streamFn });
      expect(await play(userText("Replay recorded calls."), governor, loop)).toBe("budget");
      recorder.end("budget");
      const recorded = readFileSync(log.eventsPath, "utf8").trim().split("\n").map(parseEvent);
      const warnings = recorded.filter(e => e.type === "loop_guard" && e.phase === "warning");
      expect(executed).toBe(56);
      expect(sent).toHaveLength(56);
      expect(sent.slice(0, 2).every(s => !s.text.includes("SUPERVISOR: You are currently looping"))).toBe(true);
      if (on) {
        expect(warnings).toHaveLength(1);
        expect(sent[2]).toMatchObject({ sourceTurn: 639 });
        expect(sent[2]?.text).toContain("SUPERVISOR: You are currently looping");
        expect(sent[2]?.text).toContain("the same rejected tool call");
        expect(sent[2]?.text).toContain("If you can't beat me");
      } else {
        expect(warnings).toEqual([]);
        expect(sent.every(s => !s.text.includes("SUPERVISOR: You are currently looping"))).toBe(true);
      }
      expect(recorded.filter(e => e.type === "button_press")).toEqual([]);
      expect(recorded.filter(e => e.type === "loop_breaker" && e.stage === 2)).toEqual([]);
      const proof = process.env["POKEBENCH_REFUSAL_PROOF_DIR"];
      if (proof !== undefined) {
        mkdirSync(proof, { recursive: true });
        writeFileSync(join(proof, `delivery-${String(on)}.json`), JSON.stringify({ source: fixture.source, switch: on, executed, warnings, outgoing: sent }, null, 2));
        copyFileSync(log.eventsPath, join(proof, `events-${String(on)}.jsonl`));
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("does not count missing, unqualified or changing field state, other refusals, or calls that pressed", () => {
    const run = (rows: { state?: typeof field; text?: string; acted?: boolean; isError?: boolean }[]) => {
      const notices: LoopNotice[] = [];
      const d = new LoopDetector(n => notices.push(n), undefined, "enforced", true, undefined, false, false, false, false, false, false, false, false, false, true);
      for (const row of rows) d.complete({ name: "battle_action", args: {}, isError: false, text: refusal, acted: false, ...row });
      return notices;
    };
    const unknown = { ...field, started: false };
    const unready = { ...field, world_context: { ...field.world_context, objects: [], triggers: [], dialogue: null, message: null } };
    for (const state of [undefined, unknown, unready]) expect(run([{ state }, { state }])).toEqual([]);
    expect(run([{ state: field }, { state: { ...field, position: { x: 2, y: 9 } } }])).toEqual([]);
    for (const extra of [{ acted: true }, { isError: true, text: `HTTP 500: ${refusal}` }, { text: "Battle action: selected FIGHT." }, { text: "Battle action: nothing pressed: input not ready." }]) expect(run([{ state: field, ...extra }, { state: field, ...extra }])).toEqual([]);
    expect(run([{ state: field }, { state: field, text: "Battle action: selected FIGHT.", acted: true }, { state: field }])).toEqual([]);
  });
});
