import { describe, expect, it } from "vitest";
import { parseEvent } from "@pokebench/agent/events";
import { Log, START, BASE_MS } from "../test-support/events.js";
import { RunView } from "./model.js";
import { availableActions, sideStats } from "./controls.js";
import { eventText } from "./panels.js";

it("folds durable extension acknowledgements without changing pause state or original budgets", () => {
  const log = new Log();
  log.add(0, { ...START, extend_run: true });
  log.add(100, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1 });
  const ack = log.add(200, { type: "operator_control", turn: 1, action: "extend_30m", status: "applied", request: 2, previous_max_wall_ms: 60000, max_wall_ms: 1860000 });
  const view = new RunView();
  for (const event of log.events) view.apply(parseEvent(JSON.stringify(event)));
  expect(view.control.state).toBe("paused");
  expect(view.start?.budgets.max_wall_ms).toBe(60000);
  expect(sideStats(view, BASE_MS + 300)).toContain("of 0:31:00");
  expect(sideStats(view, BASE_MS + 300)).toContain("original");
  expect(eventText(ack)).toContain("0:01:00 → 0:31:00");
  expect(availableActions(view, true).has("extend_30m")).toBe(true);
  expect(availableActions(view, false).has("extend_30m")).toBe(false);
});

describe("extension capability", () => {
  it("does not offer extension for old recordings", () => {
    const log = new Log(); log.add(0, START);
    const view = new RunView(); for (const e of log.events) view.apply(e);
    expect(availableActions(view, true).has("extend_30m")).toBe(false);
  });
});
