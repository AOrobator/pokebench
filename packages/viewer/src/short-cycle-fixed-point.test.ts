// short-cycle-fixed-point-v1: its loop_breaker records show in Activity History, the trace and the raw inspector, and
// never on the closed TIMELINE (operator decision 2026-10-16).
import { expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { stepOf } from "../test-support/trace.js";
import { RunView } from "./model.js";
import { eventText, inspector } from "./panels.js";
import { lanesSvg } from "./timeline.js";

const NOTE = "SUPERVISOR: Make one tool call based on the game state and what you observed. Your last 7 turns repeated the same 2 turns of navigate_to_target calls, and each time round the game came back to the same sequence of screens, positions and highlighted choices.";

it("labels short-cycle collapses and notes in Activity History and adds nothing to the timeline", () => {
  const log = new Log();
  log.add(0, START);
  const collapse = log.add(100, { type: "loop_breaker", turn: 122, stage: 1, trigger: "short_cycle", repeats: 6, collapsed: 4, text: null, period: 2 });
  const note = log.add(200, { type: "loop_breaker", turn: 123, stage: 2, trigger: "short_cycle", repeats: 7, collapsed: 0, text: NOTE, period: 2 });
  const fixed = log.add(300, { type: "loop_breaker", turn: 140, stage: 1, trigger: "fixed_point", repeats: 3, collapsed: 2, text: null });
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  expect(eventText(collapse, view)).toBe("Loop breaker stage 1 · 4 earlier turns left out of the request across every cycle in it (longest: a cycle of 2 turns (the same tool calls and game state, apart from fields that change on their own) repeated over 6 turns)");
  expect(eventText(note, view)).toBe(`Loop breaker stage 2 note sent to the model (a cycle of 2 turns (the same tool calls and game state, apart from fields that change on their own) repeated over 7 turns) · ${NOTE}`);
  expect(eventText(fixed, view)).toBe("Loop breaker stage 1 · 2 duplicate turns left out of the request (3 identical turns in a row)");
  expect(JSON.stringify(stepOf(collapse, view))).toContain("Loop breaker");
  expect(inspector(note)).toContain("short_cycle");
  expect(view.errors).toEqual([]);
  const svg = lanesSvg(view, BASE_MS + 1000);
  expect(svg).not.toContain("k-loop");
  expect(svg).not.toContain("Loop breaker");
});
