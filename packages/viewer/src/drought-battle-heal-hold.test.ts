// drought-battle-heal-hold-v1: a held drought briefing is a would_warn diagnostic for Activity History, the trace and
// the raw inspector, never a mark on the closed TIMELINE (operator decision 2026-10-16).
import { expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { eventText, inspector } from "./panels.js";
import { lanesSvg } from "./timeline.js";

const HELD = "Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but a battle is on screen.";

it("shows a held drought in Activity History and the inspector, and adds nothing to the timeline", () => {
  const log = new Log();
  log.add(0, START);
  const held = log.add(100, { type: "loop_guard", turn: 75, kind: "milestone_drought", message: HELD, calls: 0, evidence: [5446, 8331], mode: "diagnostic", phase: "would_warn" });
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  if (held.type !== "loop_guard") throw new Error("not a loop_guard");
  expect(eventText(held, v)).toContain("but a battle is on screen");
  expect(inspector(held)).toContain("drought-battle-heal-hold-v1");
  expect(v.errors).toEqual([]);
  expect(lanesSvg(v, BASE_MS + 1000)).not.toContain("k-loop");
  // A drought briefing that was sent still draws its existing mark.
  const sent = new Log();
  sent.add(0, START);
  sent.add(100, { type: "loop_guard", turn: 75, kind: "milestone_drought", message: "SUPERVISOR: You are stalling.", calls: 41, evidence: [1], mode: "enforced", phase: "supervisor" });
  const drawn = new RunView();
  for (const event of sent.events) drawn.apply(event);
  expect(drawn.errors).toHaveLength(1);
});
