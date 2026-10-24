import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { expect, it } from "vitest";
import type { AssistantMessage, completeSimple } from "@mariozechner/pi-ai";
import { checkEvent, type RunEvent } from "./events.js";
import {} from "./features.js";
import { contextDiff, decisionOf, distribution, parseRun, parseSwitch, recordedAction, recordedNotes, withSwitches, type DecisionContext, type RecordedRun } from "./decision-probe.js";
import { MAX_SAMPLES, filePorts, gatewaySampler, parseArgs, reportLines, resolveRun, thinkingLevel, type ProbeReport } from "./probe-decision-cli.js";
import { assistant, toolCall } from "../test-support/pi.js";
import { GATEWAY_PROVIDER, type GatewayModel } from "./gateway.js";

const ev = (body: Record<string, unknown>, seq: number, turn = 1): RunEvent => checkEvent({ v: 1, run: "probe-test", t: "2026-10-15T15:00:00.000-04:00", turn, seq, ...body });
const guard = (phase: string, message: string, seq: number, mode: "enforced" | "diagnostic" = "enforced") => ev({ type: "loop_guard", mode, phase, kind: "cycle", calls: 6, message, evidence: [seq] }, seq);

it("parses --switch as a known switch id set on or off", () => {
  expect(parseSwitch("transition-press-result-v1=on")).toEqual({ id: "transition-press-result-v1", on: true });
  expect(parseSwitch("stall-briefing-v1=off")).toEqual({ id: "stall-briefing-v1", on: false });
  expect(() => parseSwitch("no-such-switch=on")).toThrow(/known switch id/);
  expect(() => parseSwitch("stall-briefing-v1")).toThrow(/<feature-id>=on\|off/);
});

it("refuses a flipped set whose switches depend on one that is off", () => {
  expect(withSwitches(ALL_ON, [{ id: "transition-press-result-v1", on: false }])["transition-press-result-v1"]).toBe(false);
  expect(() => withSwitches(ALL_ON, [{ id: "field-dialogue-phase-v1", on: false }])).toThrow(/inconsistent/);
});

it("needs a run_start in the event log", () => {
  expect(() => parseRun(`${JSON.stringify(guard("warning", "m", 1))}\n`)).toThrow(/no run_start/);
});

it("rebuilds the guard text the model saw from the recorded notices", () => {
  const pin = ev({ type: "milestone_hint", text: "NEXT MILESTONE: leave the house", milestone: "LEFT_HOUSE" }, 1);
  const ledger = (turn: number, seq: number) => ev({ type: "ledger_context", text: `LEDGER ${String(turn)}`, evidence: [] }, seq, turn);
  const nav = (turn: number, seq: number) => ev({ type: "navigation_context", text: `NAV ${String(turn)}`, evidence: [] }, seq, turn);
  expect(recordedNotes([], 3)).toEqual([]);
  expect(recordedNotes([guard("warning", "Same input.", 2), ledger(3, 3), nav(3, 4)], 3)).toEqual([
    "LOOP GUARD (cycle): Same input. Recovery is bounded; objective wording and new evidence IDs alone do not establish progress.", "LEDGER 3", "NAV 3",
  ]);
  expect(recordedNotes([pin, guard("warning", "w", 2), guard("supervisor", "SUPERVISOR: brief", 3), ledger(2, 4), nav(3, 5)], 3)).toEqual(["SUPERVISOR: brief", "NEXT MILESTONE: leave the house", "NAV 3"]);
  expect(recordedNotes([guard("warning", "w", 2), guard("recovered", "w", 3), guard("would_warn", "d", 4, "diagnostic")], 3)).toEqual([]);
});

const reply = (parts: Parameters<typeof assistant>[0]): AssistantMessage => assistant(parts);
it("reads a sampled reply as its first tool call, a text-only reply, or a model error", () => {
  expect(decisionOf(reply({ thinking: "a", toolCalls: [toolCall("1", "press", { buttons: ["A"] }), toolCall("2", "observe", {})], stopReason: "toolUse" }))).toEqual({ key: "press {\"buttons\":[\"A\"]}", thinking: "a" });
  expect(decisionOf(reply({ text: "hm" }))).toEqual({ key: "(text only)", thinking: "" });
  expect(decisionOf(reply({ stopReason: "error", errorMessage: "503" })).key).toBe("(model error: 503)");
  expect(decisionOf(reply({ stopReason: "aborted" })).key).toBe("(model error: aborted)");
  expect(distribution([{ key: "b", thinking: "" }, { key: "a", thinking: "" }, { key: "b", thinking: "" }, { key: "c", thinking: "" }])).toEqual([["b", 2], ["a", 1], ["c", 1]]);
});

const ctx = (systemPrompt: string, texts: string[], tool = "press"): DecisionContext => ({ turn: 1, systemPrompt, messages: texts.map((t) => ({ role: "user", content: t, timestamp: 0 })), tools: [{ name: tool, description: "d", parameters: { type: "object" } }], size: { messages: texts.length, images: 0, est_tokens: 1 } });
it("names the parts of the context a flip changed", () => {
  expect(contextDiff(ctx("p", ["a", "b"]), ctx("p", ["a", "b"]))).toEqual({ systemPrompt: false, tools: false, messages: [] });
  expect(contextDiff(ctx("p", ["a", "b"]), ctx("q", ["a", "c", "d"], "observe"))).toEqual({ systemPrompt: true, tools: true, messages: [1, 2] });
});

it("finds the recorded action of a turn", () => {
  const start = { start: guard("warning", "x", 0) } as unknown as Pick<RecordedRun, "start">;
  // Only the fields recordedAction reads; the full assistant schema is exercised by the live probe test.
  const said = (turn: number, calls: unknown[]) => ({ type: "assistant", turn, seq: turn, tool_calls: calls }) as unknown as RunEvent;
  const run: RecordedRun = { ...start, events: [said(4, [{ id: "1", name: "press", args: { buttons: ["A"] } }]), said(5, [])] };
  expect(recordedAction(run, 4)).toBe("press {\"buttons\":[\"A\"]}");
  expect(recordedAction(run, 5)).toBeNull();
  expect(recordedAction(run, 6)).toBeNull();
});

it("parses probe arguments with K capped at 8", () => {
  expect(parseArgs(["dc0e", "212", "--switch", "transition-press-result-v1=on", "--samples", "8", "--runs-root", "/r", "--model", "think-fast"])).toEqual({ run: "dc0e", turn: 212, switches: [{ id: "transition-press-result-v1", on: true }], samples: 8, runsRoot: "/r", model: "think-fast", contextOnly: false });
  expect(parseArgs(["dc0e", "212", "--context-only"])).toMatchObject({ samples: 4, contextOnly: true, switches: [], runsRoot: null, model: null });
  expect(() => parseArgs(["dc0e", "212", "--samples", String(MAX_SAMPLES + 1)])).toThrow(/1\.\.8/);
  expect(() => parseArgs(["dc0e", "212", "--samples", "0"])).toThrow(/1\.\.8/);
  expect(() => parseArgs(["dc0e", "212", "--samples"])).toThrow(/needs a value/);
  expect(() => parseArgs(["dc0e", "212", "--bogus"])).toThrow(/unknown option/);
  expect(() => parseArgs(["dc0e"])).toThrow(/usage/);
  expect(() => parseArgs(["dc0e", "T212"])).toThrow(/usage/);
  expect(() => parseArgs(["dc0e", "1", "2"])).toThrow(/usage/);
});

it("resolves a run by id or by its unique suffix", () => {
  const ids = ["2026-10-15T15-06-08_think-fast_dc0e", "2026-10-15T14-21-06_think-fast_6684", "2026-10-15T14-21-07_think-fast_a684", "2026-10-15T14-21-08_think-fast_b000"];
  const exists = (p: string) => ids.some((id) => p === `/r/${id}/events.jsonl`) && !p.includes("b000");
  expect(resolveRun("/r", "dc0e", () => ids, exists)).toBe("/r/2026-10-15T15-06-08_think-fast_dc0e");
  expect(resolveRun("/r", ids[1] ?? "", () => ids, exists)).toBe(`/r/${ids[1] ?? ""}`);
  expect(() => resolveRun("/r", "684", () => ["x_684", "y_684"], (p) => p.endsWith("_684/events.jsonl"))).toThrow(/ambiguous: x_684, y_684/);
  expect(() => resolveRun("/r", "b000", () => ids, exists)).toThrow(/no run b000/);
});

it("reads a recorded frame once, and only from inside the run directory", () => {
  const reads: string[] = [];
  const ports = filePorts("/runs/x", "/repo/env", "s", () => "", (path) => { reads.push(path); return Buffer.from(path); });
  expect(ports.frame("frames/1.png")).toBe(ports.frame("frames/1.png"));
  expect(reads).toEqual(["/runs/x/frames/1.png"]);
  for (const bad of ["/etc/hosts", "../outside.png", "frames/../../x.png", ""]) expect(() => ports.frame(bad)).toThrow(/frame path .* is not inside the run directory/);
  expect(reads).toHaveLength(1);
});

it("re-renders through the env renderer with argv only and the server switch environment", async () => {
  const calls: { file: string; args: readonly string[]; cwd: string; off: string | undefined; input: string }[] = [];
  const ports = filePorts("/runs/x", "/repo/env", "reasoning_content", (file, args, options) => {
    calls.push({ file, args, cwd: options.cwd, off: options.env.POKEBENCH_FEATURES_OFF, input: options.input });
    return JSON.stringify({ readouts: ["one"] });
  }, (path) => Buffer.from(path), { PATH: "/bin" });
  expect(ports.frame("frames/1.png")).toBe(Buffer.from("/runs/x/frames/1.png").toString("base64"));
  expect(ports.thinkingSignature).toBe("reasoning_content");
  expect(await ports.rerender([{ path: "raw-ram/1.json.gz", sha256: "s" }], { ...ALL_ON, "battle-details-v2": false })).toEqual(["one"]);
  expect(calls).toEqual([{ file: "uv", args: ["run", "--project", "/repo/env", "python", "-m", "pokebench_env.rerender"], cwd: "/repo/env", off: "battle-details-v2,safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1,post-battle-readout-v1,move-learn-early-comparison-v1,poison-readout-v1,berry-readout-v1,battle-move-learn-input-v1,static-npc-template-approach-v1,coherent-battle-observation-v1,window-escape-route-v1,elevation-aware-map-v1,screen-center-player-v1,blackout-transition-v1,player-elevation-readout-v1,party-menu-message-v1,active-warp-exits-v1,available-exits-presentation-v1", input: JSON.stringify({ run_dir: "/runs/x", raw_ram: [{ path: "raw-ram/1.json.gz", sha256: "s" }] }) }]);
  for (const body of ["{}", "[]", "null", JSON.stringify({ readouts: [1] }), JSON.stringify({ readouts: ["a", "b"] })]) {
    expect(() => filePorts("/r", "/e", "s", () => body).rerender([{ path: "p", sha256: "s" }], ALL_ON)).toThrow(/unexpected body/);
  }
});

it("samples through pi with the recorded thinking level and token budget", async () => {
  expect(thinkingLevel("medium")).toBe("medium");
  expect(thinkingLevel("off")).toBe("off");
  expect(() => thinkingLevel("max")).toThrow(/not one pi knows/);
  const model: GatewayModel = { id: "think-fast", name: "think-fast", api: "openai-completions", provider: GATEWAY_PROVIDER, baseUrl: "http://inference.example/v1", reasoning: true, input: ["text", "image"], contextWindow: 65536, maxTokens: 16384, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const seen: unknown[] = [];
  const complete = ((m: unknown, c: unknown, o: unknown) => { seen.push({ m, c, o }); return Promise.resolve(reply({ text: "ok" })); }) as typeof completeSimple;
  const context = ctx("sys", ["hello"]);
  await gatewaySampler(complete, model, "medium", 4096)(context);
  await gatewaySampler(complete, model, "off", 100)(context);
  expect(seen).toEqual([
    { m: model, c: { systemPrompt: "sys", messages: context.messages, tools: context.tools }, o: expect.objectContaining({ maxTokens: 4096, reasoning: "medium" }) as unknown },
    { m: model, c: { systemPrompt: "sys", messages: context.messages, tools: context.tools }, o: expect.not.objectContaining({ reasoning: expect.anything() as unknown }) as unknown },
  ]);
});

it("reports a mismatch, a flip that changes nothing, and arms without samples", () => {
  const arm = { label: "recorded switches", features: ALL_ON, context: ctx("p", ["a"]), decisions: [] };
  const report: ProbeReport = { run: "r", turn: 3, recorded: { action: null, size: null }, fidelity: false, rerendered: true, arms: [arm, { ...arm, label: "x=on" }], diff: { systemPrompt: false, tools: false, messages: [] } };
  expect(reportLines(report)).toEqual([
    "run r turn 3: recorded action (none)",
    "context rebuilt with today's harness: 1 messages, 0 images, ~1 tokens; recorded: none → differs (today's guard, notes or collapse text differ from the run's; both arms share this); readouts re-rendered from raw RAM in both arms",
    "flipped context differs in: nothing (the switch does not change this decision's context)",
  ]);
  expect(reportLines({ ...report, diff: { systemPrompt: true, tools: true, messages: [4] } })[2]).toBe("flipped context differs in: system prompt; tools; 1 messages (indexes 4)");
});
