import { expect, it } from "vitest";
import { RunView } from "./model.js";
import { eventText, inspector } from "./panels.js";
import { Log, START } from "../test-support/events.js";

// drought-hold-screens-v1: run 37ca turn 1361's note, held on the evolution screen after the Flannery fight.
const HELD = "Not sent (drought-hold-screens-v1): no new story milestone in the last 30 actions, but an evolution or move screen from the battle is up.";

it("shows a screen hold in Activity History and the inspector, and adds nothing to the timeline", () => {
  const log = new Log();
  log.add(0, START);
  const held = log.add(100, { type: "loop_guard", turn: 1361, kind: "milestone_drought", message: HELD, calls: 0, evidence: [5446, 8331], mode: "diagnostic", phase: "would_warn" });
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  if (held.type !== "loop_guard") throw new Error("not a loop_guard");
  expect(eventText(held, v)).toContain("an evolution or move screen from the battle is up");
  expect(inspector(held)).toContain("drought-hold-screens-v1");
  expect(v.errors).toEqual([]);
});
