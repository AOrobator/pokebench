// auto-talk-field-only-v1, auto-talk-v3 and untalked-people-header-v1: default OFF, card link, tracked page, and the
// quiet-stretch auto_talk line in Activity History.
import { expect, it } from "vitest";
import { checkEvent } from "@pokebench/agent/events";
import { eventText } from "./panels.js";

it("names a quiet-stretch auto-talk in Activity History and keeps the loop wording for the old triggers", () => {
  const body = { v: 1, run: "r", seq: 1, t: "2026-10-22T12:00:00.000-04:00", turn: 1, type: "auto_talk", repeats: 10, outcome: "talked", target: { kind: "person", name: "WOMAN_4", character: null, key: "1/2#4", x: 2, y: 4, map_id: [1, 2] }, walks: 2, tried: 1, text: null };
  expect(eventText(checkEvent({ ...body, trigger: "quiet_map" }))).toBe("Auto-talk after a quiet stretch (10 turns on this map with no story milestone) · talked to WOMAN_4 at (2,4) · 2 walks, 1 tried");
  expect(eventText(checkEvent({ ...body, trigger: "fixed_point" }))).toBe("Loop breaker stage 3 auto-talk (fixed point, 10 in a row) · talked to WOMAN_4 at (2,4) · 2 walks, 1 tried");
});
