// same-target-no-progress-v1: the warning shows in Activity History, the trace and the raw inspector, never on the
// closed TIMELINE (operator decision 2026-10-16), which keeps drawing the existing loop marks unchanged.
import { expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { stepOf } from "../test-support/trace.js";
import { RunView } from "./model.js";
import { eventText, inspector } from "./panels.js";
import { lanesSvg } from "./timeline.js";

const NOTE = "SUPERVISOR: Since turn 1282, when you were at (4,9), 4 of your navigate_to calls to (29,16) on RUSTURF TUNNEL (map 24/4) have ended within 3 tiles of (4,9).";

function view(log: Log): RunView {
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  return v;
}

it("shows a same-target warning in Activity History, the trace and the inspector, and adds nothing to the timeline", () => {
  const log = new Log();
  log.add(0, START);
  const warning = log.add(100, { type: "loop_guard", turn: 1286, kind: "same_target_no_progress", message: NOTE, calls: 1286, evidence: [41131, 41310], mode: "enforced", phase: "warning" });
  const supervisor = log.add(100, { type: "loop_guard", turn: 1286, kind: "same_target_no_progress", message: NOTE, calls: 1286, evidence: [41131, 41310], mode: "enforced", phase: "supervisor" });
  const result = view(log);
  if (warning.type !== "loop_guard" || supervisor.type !== "loop_guard") throw new Error("not a loop_guard");
  expect(result.loopLabel(supervisor)).toMatch(/^Same target, no progress supervisor message sent to the model · #\d+ · turn 1286 · .*SUPERVISOR: Since turn 1282/);
  expect(eventText(warning, result)).toContain("Same target, no progress warning");
  expect(JSON.stringify(stepOf(supervisor, result))).toContain("Same target, no progress supervisor message sent to the model");
  expect(inspector(supervisor)).toContain("4 of your navigate_to calls to (29,16)");
  expect(result.errors).toEqual([]);
  const svg = lanesSvg(result, BASE_MS + 1000);
  expect(svg).not.toContain("k-loop");
  expect(svg).not.toContain("Same target");

  const other = new Log();
  other.add(0, START);
  other.add(100, { type: "loop_guard", turn: 1, kind: "cycle", message: "cycle", calls: 9, evidence: [1], mode: "enforced", phase: "warning" });
  const drawn = view(other);
  expect(drawn.errors).toHaveLength(1);
  expect(lanesSvg(drawn, BASE_MS + 1000)).toContain("k-loop");
});
