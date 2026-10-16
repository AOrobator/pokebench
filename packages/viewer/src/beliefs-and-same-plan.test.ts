import { expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { eventText, inspector } from "./panels.js";
import { lanesSvg } from "./timeline.js";
import { stepOf } from "../test-support/trace.js";

function view(log: Log): RunView {
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  return v;
}
const LEDGER = "Things the game has contradicted (from this run's own readouts and dialogue; an entry is dropped when a story flag changes or the game shows otherwise):\n- Moving UP from (11,1) in LITTLEROOT TOWN (map 0/9): you tried it 2 times, at turns 142, 144 (latest: press UP). Each time a script moved you back to (11,2); the latest time (turn 144) it showed: TWIN (sprite kind, not a name): \"It's dangerous if you don't have\nyour own POKéMON.\" <b>";

it("shows the disproved-beliefs ledger whole in Activity History and raw inspection, and adds nothing to the timeline", () => {
  const log = new Log();
  log.add(0, START);
  const event = log.add(100, { type: "belief_ledger", turn: 145, text: LEDGER, entries: 1, evidence: [2946, 3017] });
  const result = view(log);
  const text = eventText(event, result);
  expect(text).toContain("Disproved beliefs ledger delivered · 1 entry · 2 references");
  expect(text).toContain("Moving UP from (11,1) in LITTLEROOT TOWN (map 0/9)");
  expect(text).toContain("your own POKéMON.");
  expect(text).toContain("&lt;b&gt;");
  expect(text).not.toContain("<b>");
  expect(inspector(event)).toContain("Things the game has contradicted");
  const svg = lanesSvg(result, BASE_MS + 1000);
  // The timeline is closed to new marks (operator decision 2026-10-16).
  expect(svg).not.toContain("Disproved beliefs");
  expect(svg).not.toContain("Things the game has contradicted");
  expect(JSON.stringify(stepOf(event, result))).toContain("Disproved beliefs delivered");
});

it("labels a same-plan supervisor note in the activity history", () => {
  const log = new Log();
  log.add(0, START);
  const event = log.add(200, { type: "loop_guard", turn: 144, kind: "same_plan", message: "SUPERVISOR: Your last 3 plans (turns 142, 143, 144) were the same and the game state did not change: press UP", calls: 144, evidence: [2946, 3017], mode: "enforced", phase: "supervisor" });
  const result = view(log);
  if (event.type !== "loop_guard") throw new Error("not a loop_guard");
  expect(result.loopLabel(event)).toMatch(/^Same plan repeated supervisor message sent to the model · #\d+ · turn 144 · .*SUPERVISOR: Your last 3 plans \(turns 142, 143, 144\)/);
  expect(JSON.stringify(stepOf(event, result))).toContain("Same plan repeated supervisor message sent to the model");
});
