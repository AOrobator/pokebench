// ping-pong-fixed-point-v1: its loop_breaker records show in Activity History, the trace and the raw inspector, and
// never on the closed TIMELINE (operator decision 2026-10-16).
import { expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { stepOf } from "../test-support/trace.js";
import { RunView } from "./model.js";
import { eventText, inspector } from "./panels.js";
import { lanesSvg } from "./timeline.js";

const NOTE = "SUPERVISOR: Make one tool call based on the game state and what you observed. Your last 4 turns made the same press call and the game state went back and forth between the same two states after them.";

it("labels ping-pong collapses and notes in Activity History and adds nothing to the timeline", () => {
  const log = new Log();
  log.add(0, START);
  const collapse = log.add(100, { type: "loop_breaker", turn: 134, stage: 1, trigger: "ping_pong", repeats: 3, collapsed: 2, text: null });
  const note = log.add(200, { type: "loop_breaker", turn: 135, stage: 2, trigger: "ping_pong", repeats: 4, collapsed: 0, text: NOTE });
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  expect(eventText(collapse, view)).toBe("Loop breaker stage 1 · 2 duplicate turns left out of the request (3 turns in a row with the same tool calls, the game state going back and forth between two states)");
  expect(eventText(note, view)).toBe(`Loop breaker stage 2 note sent to the model (ping-pong between two states, 4 in a row) · ${NOTE}`);
  expect(JSON.stringify(stepOf(collapse, view))).toContain("Loop breaker");
  expect(inspector(note)).toContain("ping_pong");
  expect(view.errors).toEqual([]);
  const svg = lanesSvg(view, BASE_MS + 1000);
  expect(svg).not.toContain("k-loop");
  expect(svg).not.toContain("Loop breaker");
});
