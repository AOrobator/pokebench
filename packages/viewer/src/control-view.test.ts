import { describe, expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { actionRow } from "./panels.js";
import { lanesSvg } from "./timeline.js";

function controlled(): Log {
  const log = new Log();
  log.add(0, START);
  log.add(1_000, { type: "operator_control", turn: 1, action: "pause", status: "pending", request: 1 });
  log.add(2_000, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1, emulator_frozen: true });
  log.add(12_000, { type: "operator_control", turn: 1, action: "resume", status: "applied", request: 2, paused_ms: 10_000 });
  log.add(13_000, { type: "operator_control", turn: 2, action: "stop", status: "pending", request: 3 });
  return log;
}
const fold = (log: Log): RunView => { const v = new RunView(); for (const e of log.events) v.apply(e); return v; };

describe("operator control in the run view", () => {
  it("tracks control state and paused gaps from recorded events", () => {
    const log = controlled();
    const view = fold(log);
    expect(view.control.state).toBe("stop_pending");
    expect(view.control.pauses).toEqual([{ startMs: BASE_MS + 2_000, endMs: BASE_MS + 12_000 }]);
    expect(view.control.pausedMs(BASE_MS + 20_000)).toBe(10_000);
    log.add(14_000, { type: "operator_control", turn: 2, action: "cancel_stop", status: "applied", request: 4 });
    expect(fold(log).control.state).toBe("running");
    log.add(15_000, { type: "operator_control", turn: 2, action: "pause", status: "pending", request: 5 });
    log.add(16_000, { type: "operator_control", turn: 2, action: "pause", status: "applied", request: 5, emulator_frozen: false });
    const paused = fold(log);
    expect(paused.control.state).toBe("paused");
    expect(paused.control.emulatorFrozen).toBe(false);
    expect(paused.control.pausedMs(BASE_MS + 20_000)).toBe(14_000);
    log.add(18_000, { type: "operator_control", turn: 2, action: "stop", status: "applied", request: 6, paused_ms: 2_000 });
    log.add(18_100, { type: "run_end", turn: 2, reason: "operator_stop", furthest_milestone: null, turns: 2, wall_ms: 18_100, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    const ended = fold(log);
    expect(ended.control.state).toBe("ended");
    expect(ended.control.pauses.at(-1)).toEqual({ startMs: BASE_MS + 16_000, endMs: BASE_MS + 18_000 });
  });

  it("ignores ignored requests", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1_000, { type: "operator_control", turn: 0, action: "resume", status: "ignored", request: 1 });
    expect(fold(log).control.state).toBe("running");
  });

  it("shades the paused gap on the timeline and lists every control row in Activity History", () => {
    const view = fold(controlled());
    const svg = lanesSvg(view, BASE_MS + 30_000);
    expect(svg.match(/class="m-paused"/g)).toHaveLength(1);
    expect(svg).toContain("<title>paused 10s (operator)</title>");
    expect(lanesSvg(view, BASE_MS + 80_000)).not.toContain("m-paused");
    const rows = view.events.map((e) => actionRow(e, view)).filter((r) => r !== null);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain("⏸ pause applied · emulator frozen");
    expect(rows[2]).toContain("▶ resume applied · paused 10s");
    expect(rows[3]).toContain("■ stop requested · ends after the current turn");
    const unfrozen = new Log(); unfrozen.add(0, START);
    const row = actionRow(unfrozen.add(1, { type: "operator_control", turn: 0, action: "pause", status: "applied", request: 1, emulator_frozen: false }));
    expect(row).toContain("emulator NOT frozen");
    expect(row).toContain("ev-error");
    expect(actionRow(unfrozen.add(2, { type: "operator_control", turn: 0, action: "abort", status: "applied", request: 2, paused_ms: 0 }))).toContain("✖ abort applied");
    expect(actionRow(unfrozen.add(3, { type: "operator_control", turn: 0, action: "cancel_stop", status: "ignored", request: 3 }))).toContain("cancel stop ignored");
  });
});

it("closes an open pause when the run ends without an operator event", () => {
  const log = new Log();
  log.add(0, START);
  log.add(1_000, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1, emulator_frozen: true });
  log.add(4_000, { type: "run_end", turn: 1, reason: "crash", furthest_milestone: null, turns: 1, wall_ms: 4_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
  const view = fold(log);
  expect(view.control.pauses).toEqual([{ startMs: BASE_MS + 1_000, endMs: BASE_MS + 4_000 }]);
  expect(view.control.pausedMs(BASE_MS + 60_000)).toBe(3_000);
});
