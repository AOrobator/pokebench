// first-visit-cycle-credit-v1: a held note is a would_warn diagnostic for Activity History and the raw inspector,
// never a mark on the closed TIMELINE (operator decision 2026-10-16).
import { expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { eventText, inspector } from "./panels.js";
import { lanesSvg } from "./timeline.js";

const CYCLE = "Not sent (first-visit-cycle-credit-v1): walked between MT PYRE 1F (map 24/15) and MT PYRE 2F (map 24/16) 2 times, but MT PYRE EXTERIOR (map 24/21) was entered for the first time this run.";
const DROUGHT = "Not sent (first-visit-cycle-credit-v1): the held note is no longer due: no new story milestone for 5 minutes of play.";

it("shows held notes in Activity History and the inspector, and adds nothing to the timeline", () => {
  const log = new Log();
  log.add(0, START);
  const cycle = log.add(100, { type: "loop_guard", turn: 372, kind: "map_cycle", message: CYCLE, calls: 0, evidence: [27144, 27240], mode: "diagnostic", phase: "would_warn" });
  const drought = log.add(200, { type: "loop_guard", turn: 383, kind: "milestone_drought", message: DROUGHT, calls: 0, evidence: [28000], mode: "diagnostic", phase: "would_warn" });
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  if (cycle.type !== "loop_guard" || drought.type !== "loop_guard") throw new Error("not a loop_guard");
  expect(eventText(cycle, v)).toContain("MT PYRE EXTERIOR (map 24/21) was entered for the first time");
  expect(eventText(drought, v)).toContain("no longer due");
  expect(inspector(cycle)).toContain("first-visit-cycle-credit-v1");
  expect(v.errors).toEqual([]);
  expect(lanesSvg(v, BASE_MS + 1000)).not.toContain("k-loop");
});
