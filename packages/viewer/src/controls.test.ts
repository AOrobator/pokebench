import { describe, expect, it } from "vitest";
import { ALL_ON, FEATURES } from "@pokebench/agent/features";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { availableActions, controlBar, differenceCount, eligibleRuns, overlay, overlayKind, queueText, runSeconds, sideStats, stateLabel, switchboard, type NextRunDraft } from "./controls.js";
import { RunView } from "./model.js";

function view(build: (log: Log) => void = () => undefined): RunView {
  const log = new Log(); log.add(0, START); build(log);
  const v = new RunView(); for (const e of log.events) v.apply(e); return v;
}
const control = (action: "pause" | "resume" | "stop" | "cancel_stop" | "abort", status: "pending" | "applied", extra = {}) => ({ type: "operator_control" as const, turn: 3, action, status, request: 1, ...extra });
const draft: NextRunDraft = { model: "Qwen", thinking: "medium", maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3, maxTokens: 4096, target: null, features: { ...ALL_ON, "state-only-decisions-v1": false } };

describe("run controls", () => {


  it("offers only the controls that apply to the recorded state", () => {
    expect([...availableActions(view(), true)]).toEqual(["pause", "stop", "abort"]);
    expect([...availableActions(view(), false)]).toEqual([]);
    expect([...availableActions(view((l) => l.add(1, control("pause", "pending"))), true)]).toEqual(["resume", "stop", "abort"]);
    expect([...availableActions(view((l) => { l.add(1, control("pause", "pending")); l.add(2, control("pause", "applied", { emulator_frozen: true })); }), true)]).toEqual(["resume", "stop", "abort"]);
    expect([...availableActions(view((l) => l.add(1, control("stop", "pending"))), true)]).toEqual(["cancel_stop", "abort"]);
    expect([...availableActions(view((l) => l.add(1, { type: "run_end", turn: 1, reason: "operator_stop", furthest_milestone: null, turns: 1, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } })), true)]).toEqual([]);
  });

  it("renders PAUSE/STOP/ABORT in the bar, swapping to RESUME and CANCEL STOP", () => {
    const bar = controlBar(view(), true, null);
    expect(bar).toContain('data-control="pause"');
    expect(bar).toContain("hold to abort");
    expect(bar).not.toContain("<kbd>");
    expect(bar).not.toContain("disabled");
    expect(controlBar(view((l) => l.add(1, control("stop", "pending"))), true, null)).toContain('class="control-label">CANCEL STOP</span>');
    expect(controlBar(view((l) => l.add(1, control("pause", "pending"))), true, 0.5)).toContain("--hold:50%");
    expect(controlBar(view(), false, null).match(/disabled/g)).toHaveLength(3);
  });

  it("labels the run state and counts run time without pauses", () => {
    const paused = view((l) => { l.add(1_000, control("pause", "applied", { emulator_frozen: true })); });
    expect(stateLabel(paused, true)).toEqual({ cls: "paused", text: "PAUSED" });
    expect(stateLabel(view(), false)).toEqual({ cls: "idle", text: "REPLAY" });
    expect(runSeconds(paused, BASE_MS + 9_000)).toBe(1);
    expect(runSeconds(new RunView(), BASE_MS)).toBe(0);
  });

  it("puts an overlay on the game screen for each control", () => {
    const now = BASE_MS + 5_000;
    expect(overlayKind(view(), true, false, false)).toBeNull();
    expect(overlay(null, view(), now)).toBe("");
    const pausing = view((l) => l.add(1, control("pause", "pending")));
    expect(overlay(overlayKind(pausing, true, false, false), pausing, now)).toContain("⏸ PAUSING");
    const paused = view((l) => l.add(1, control("pause", "applied", { emulator_frozen: false })));
    const pausedOverlay = overlay(overlayKind(paused, true, false, false), paused, now);
    expect(pausedOverlay).toContain("⏸ PAUSED");
    expect(pausedOverlay).toContain("emulator NOT frozen");
    const stopping = view((l) => l.add(1, control("stop", "pending")));
    expect(overlay(overlayKind(stopping, true, false, false), stopping, now)).toContain("■ STOPPING");
    expect(overlay(overlayKind(view(), true, true, false), view(), now, 0.5)).toContain('width="78"');
    const ended = view((l) => l.add(1, { type: "run_end", turn: 1, reason: "operator_stop", furthest_milestone: null, turns: 1, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } }));
    expect(overlay(overlayKind(ended, true, false, false), ended, now)).toContain("■ RUN ENDED");
    const healed = view((l) => {
      for (const name of ["ROUTE_103", "FIRST_POKECENTER_HEAL"]) l.add(1, { type: "milestone", turn: 1, name, kind: "story", origin: "observed", server_timestamp: 1, evidence: [1] });
      l.add(2, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: "ROUTE_103", turns: 1, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    });
    expect(overlay(overlayKind(healed, true, false, false), healed, now)).toContain("furthest: ROUTE 103 · 2 splits");
    expect(overlayKind(ended, true, false, true)).toBeNull();
    expect(overlayKind(ended, false, false, false)).toBeNull();
    const aborted = view((l) => l.add(1, { type: "run_end", turn: 1, reason: "operator_abort", furthest_milestone: null, turns: 1, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } }));
    expect(overlay(overlayKind(aborted, true, false, false), aborted, now)).toContain("✖ ABORTED");
    expect(overlay(overlayKind(aborted, true, false, false), aborted, now)).toContain("still counts in results");
    expect(overlay(overlayKind(aborted, true, false, false), aborted, now)).not.toContain("excluded");
    const hold = overlay("abort_hold", aborted, now, 0.5);
    expect(hold).toContain("earned progress still counts");
    expect(hold.toLowerCase()).not.toContain("excluded");
  });
});

describe("feature history censoring", () => {
  it("leaves a milestone an operator-ended run never reached out of that milestone's denominator", () => {
    const arm = { runs: 3, reached: { NEW_GAME_CREATED: 3, CLOCK_SET: 1 }, medianMs: { NEW_GAME_CREATED: 1, CLOCK_SET: 2 }, stopped: [["NEW_GAME_CREATED"]] };
    expect(eligibleRuns(arm, "NEW_GAME_CREATED")).toBe(3);
    expect(eligibleRuns(arm, "CLOCK_SET")).toBe(2);
    expect(eligibleRuns({ runs: 2, reached: {}, medianMs: {} }, "CLOCK_SET")).toBe(2);
  });
});

describe("live side panel", () => {
  it("shows turn, time, failures and context against their caps", () => {
    const v = view((l) => { l.add(1_000, { type: "turn_start", turn: 2, context: { messages: 3, images: 1, est_tokens: 6_000 } }); });
    const html = sideStats(v, BASE_MS + 30_000);
    expect(html).toContain("TURN<b>2</b>of 10");
    expect(html).toContain("TIME<b>0:00:30</b>of 0:01:00");
    expect(html).toContain("FAILURES<b>0</b>of 3");
    expect(html).toContain("CONTEXT<b>~6k</b>of 10k");
  });

  it("shows the prompt size the server measured once the model has answered", () => {
    const v = view((l) => {
      l.add(1_000, { type: "turn_start", turn: 1, context: { messages: 3, images: 1, est_tokens: 4_000 } });
      l.add(2_000, { type: "assistant", turn: 1, thinking: "", text: "", tool_calls: [], usage: { input: 1_500, output: 50, cache_read: 5_600 }, latency_ms: 1_000, ttft_ms: null, stop_reason: "toolUse" });
    });
    expect(sideStats(v, BASE_MS + 3_000)).toContain("CONTEXT<b>7k</b>of 10k");
  });






});

describe("switchboard", () => {
  it("renders every group, switch, description, dependency and the locked measurement rows", () => {
    const html = switchboard({ features: FEATURES, draft, live: null, history: {}, expanded: new Set() });
    for (const f of FEATURES) expect(html).toContain(f.id);
    const observed = String(FEATURES.filter((f) => f.group === "observation" && f.switchable).length);
    expect(html).toContain(`${observed}/${observed} ON`);
    expect(html).toContain("needs live-map-v1");
    expect(html).toContain("MEASUREMENT · ALWAYS ON");
    expect(html.match(/No matching runs yet/g)).toHaveLength(FEATURES.filter((f) => f.switchable).length);
    expect(html.match(/🔒/g)).toHaveLength(FEATURES.filter(feature=>feature.group === "measurement").length);
  });

  it("flags switches that differ from the live run", () => {
    const live = new Set(FEATURES.filter((f) => f.id !== "story-state-v1" && f.id !== "state-only-decisions-v1").map((f) => f.id));
    const html = switchboard({ features: FEATURES, draft, live, history: {}, expanded: new Set() });
    expect(html.match(/DIFFERS FROM LIVE RUN/g)).toHaveLength(1);
    expect(differenceCount(FEATURES, draft, live)).toBe(1);
    expect(differenceCount(FEATURES, draft, null)).toBe(0);
  });

  it("shows paired on/off bars and, expanded, reach and median splits", () => {
    const history = { "story-state-v1": { on: { runs: 4, reached: { NEW_GAME_CREATED: 4, CLOCK_SET: 3 }, medianMs: { NEW_GAME_CREATED: 41_000, CLOCK_SET: 580_000 } }, off: { runs: 4, reached: { NEW_GAME_CREATED: 4, CLOCK_SET: 1 }, medianMs: { NEW_GAME_CREATED: 43_000, CLOCK_SET: 1_265_000 } } } };
    const collapsed = switchboard({ features: FEATURES, draft: { ...draft, features: { ...ALL_ON, "state-only-decisions-v1": false, "story-state-v1": false } }, live: null, history, expanded: new Set() });
    expect(collapsed).toContain("<b>3·1</b>CLOCK");
    expect(collapsed).toContain("runs with it ON (4)");
    expect(collapsed).toContain("▶ MILESTONES + SPLITS");
    expect(collapsed).not.toContain("etab");
    const open = switchboard({ features: FEATURES, draft, live: null, history, expanded: new Set(["story-state-v1"]) });
    expect(open).toContain('<td>CLOCK</td><td class="g">3/4</td><td class="">1/4</td><td>0:09:40</td><td>0:21:05</td>');
    expect(open).toContain('<td>RT 101</td><td class="">0/4</td><td class="">0/4</td><td class="na">—</td><td class="na">—</td>');
    const censored = { "story-state-v1": { ...history["story-state-v1"], off: { ...history["story-state-v1"].off, stopped: [["NEW_GAME_CREATED"]] } } };
    const withStop = switchboard({ features: FEATURES, draft, live: null, history: censored, expanded: new Set(["story-state-v1"]) });
    expect(withStop).toContain('<td>CLOCK</td><td class="g">3/4</td><td class="">1/3</td>');
    expect(withStop).toContain("1 operator-ended run");
  });

  it("disables a switch whose dependency is off", () => {
    const html = switchboard({ features: FEATURES, draft: { ...draft, features: { ...ALL_ON, "state-only-decisions-v1": false, "live-map-v1": false, "world-coordinate-grid-v1": false, "warp-activation-guidance-v1": false } }, live: null, history: {}, expanded: new Set() });
    expect(html).toMatch(/data-feature="world-coordinate-grid-v1" disabled/);
    expect(html).not.toMatch(/data-feature="live-map-v1"[^>]*disabled/);
  });

  it("describes the queue", () => {
    expect(queueText({ state: "idle" })).toContain("waits for the live one");
    expect(queueText({ state: "queued", runId: "r", waitingFor: "live run x" })).toBe("Queued r · waiting for live run x.");
    expect(queueText({ state: "running", runId: "r" })).toBe("Running r.");
    expect(queueText({ state: "launching", runId: "r" })).toBe("Launching r.");
    expect(queueText({ state: "failed", runId: "r", error: "boom" })).toBe("Launch failed: boom");
  });
});

it("keeps legacy zero-state stats when current completeness metadata is absent",()=>{const html=sideStats(new RunView(),BASE_MS);expect(html).toContain("TURN<b>0</b>");expect(html).toContain("FAILURES<b>0</b>of 3");});
