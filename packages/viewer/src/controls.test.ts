import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_ON, FEATURES } from "@pokebench/agent/features";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { availableActions, controlBar, differenceCount, overlay, overlayKind, queueText, runSeconds, sideStats, splitStrip, splitTimes, stateLabel, switchboard, type NextRunDraft } from "./controls.js";
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
    expect(controlBar(view((l) => l.add(1, control("stop", "pending"))), true, null)).toContain("↺ CANCEL STOP");
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
    expect(overlayKind(ended, true, false, true)).toBeNull();
    expect(overlayKind(ended, false, false, false)).toBeNull();
    const aborted = view((l) => l.add(1, { type: "run_end", turn: 1, reason: "operator_abort", furthest_milestone: null, turns: 1, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } }));
    expect(overlay(overlayKind(aborted, true, false, false), aborted, now)).toContain("✖ ABORTED");
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

  it("lists splits this run against the best run, pauses excluded", () => {
    const v = view((l) => {
      l.add(1_000, control("pause", "applied", { emulator_frozen: true }));
      l.add(6_000, control("resume", "applied", { paused_ms: 5_000 }));
      l.add(10_000, { type: "milestone", turn: 1, name: "NEW_GAME_CREATED", server_timestamp: 1, kind: "story", origin: "observed" });
    });
    const best = { run: "best", milestones: [{ name: "NEW_GAME_CREATED", offsetMs: 7_000 }] };
    const html = splitStrip(v);
    expect(html).toContain('<span class="done">NEW GAME ✔</span>');
    expect(html).toContain('<span class="next">NAME</span>');
    expect(html).not.toContain("splitrows");
    expect(splitTimes(v, best)).toContain('<span class="t">0:00:05</span><span class="d g">−0:00:02</span>');
    expect(splitTimes(v, null)).toContain("no comparable best run yet");
  });

  const mark = (name: string, origin: "observed" | "present_at_start" = "observed") => ({ type: "milestone" as const, turn: 1, name, server_timestamp: 1, kind: "story" as const, origin });

  it("shows every milestone the run recorded in story order, past the starter", () => {
    const v = view((l) => {
      for (const [at, name] of [[1_000, "GAME_RUNNING"], [2_000, "STARTER_CHOSEN"], [4_000, "OLDALE_TOWN"], [3_000, "ROUTE_101_AFTER_HANDOFF"], [2_500, "BIRCH_RESCUE_COMPLETE"], [3_500, "PLAYER_BEDROOM_EXITED_AFTER_CLOCK"], [5_000, "SOME_FUTURE_SPLIT"]] as const) l.add(at, mark(name));
    });
    const html = splitStrip(v);
    const chips = [...html.matchAll(/<span class="(\w*)">([^<]*)<\/span>/g)].map((m) => `${m[1] ?? ""}:${m[2] ?? ""}`);
    expect(chips).toEqual(["done:GAME RUNNING ✔", "done:LEAVE BEDROOM ✔", "done:STARTER ✔", "done:BIRCH RESCUE ✔", "done:BACK ON ROUTE 101 ✔", "done:OLDALE ✔", "done:SOME FUTURE SPLIT ✔", "next:ROUTE 103"]);
    const times = splitTimes(v, { run: "best", milestones: [{ name: "OLDALE_TOWN", offsetMs: 5_000 }] });
    expect(times).toContain('<span>OLDALE</span><span class="t">0:00:04</span><span class="d g">−0:00:01</span>');
    expect(times).toContain('<span>BIRCH RESCUE</span><span class="t">0:00:02</span>');
    expect(times).toContain('<span>ROUTE 103</span><span class="t na">—</span><span class="d na">next</span>');
    expect(times).not.toContain("RT 101");
  });

  it("skips present-at-start splits but starts NEXT after them", () => {
    const v = view((l) => { l.add(1_000, mark("CLOCK_SET", "present_at_start")); });
    expect(splitStrip(v)).toBe('<div class="mspl"><span class="next">LEAVE BEDROOM</span></div>');
    const done = view((l) => { l.add(1_000, mark("ROCK_TOMB_RECEIVED")); });
    expect(splitStrip(done)).toBe('<div class="mspl"><span class="done">ROCK TOMB ✔</span></div>');
  });

  it("points NEXT at the first unreached checkpoint after the deepest checkpoint, and escapes names", () => {
    const v = view((l) => { l.add(1_000, mark("RUNNING_SHOES_RECEIVED")); l.add(2_000, mark("ROUTE_102_TRAINER_CALVIN_DEFEATED")); l.add(3_000, mark("A<B")); });
    expect(splitStrip(v)).toBe('<div class="mspl"><span class="done">RUNNING SHOES ✔</span><span class="done">ROUTE 102 TRAINER CALVIN DEFEATED ✔</span><span class="done">A&lt;B ✔</span><span class="next">ROUTE 102</span></div>');
  });
});

describe("switchboard", () => {
  it("renders every group, switch, description, dependency and the locked measurement rows", () => {
    const html = switchboard({ features: FEATURES, draft, live: null, history: {}, expanded: new Set() });
    for (const f of FEATURES) expect(html).toContain(f.id);
    const observed = FEATURES.filter((f) => f.group === "observation" && f.switchable).length;
    expect(html).toContain(`${observed}/${observed} ON`);
    expect(html).toContain("needs live-map-v1");
    expect(html).toContain("MEASUREMENT · ALWAYS ON");
    expect(html.match(/No matching runs yet/g)).toHaveLength(55);
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

describe("local-only page", () => {
  it("references no off-host URL in the page or its stylesheet", () => {
    for (const file of ["index.html", "style.css"]) {
      const text = readFileSync(join(import.meta.dirname, "../static", file), "utf8");
      expect(text.match(/https?:\/\/[^\s"')]+/g) ?? []).toEqual([]);
      expect(text).not.toContain("//fonts.");
    }
  });
});
