import { expect, it } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { pressResult } from "./press-result.js";
const field = { ...IN_GAME, screen: "overworld", field_controls_locked: false, position: { x: 2, y: 2 }, facing: "up" };
it("distinguishes net movement, turn and transition", () => {
  expect(pressResult(field, { ...field, position: { x: 2, y: 1 } }, ["UP"])).toContain("moved");
  expect(pressResult(field, { ...field, facing: "right" }, ["RIGHT"])).toContain("turned up -> right");
  expect(pressResult(field, { ...field, map_id: [0, 10] }, ["UP"])).toContain("transitioned");
  expect(pressResult(field, { ...field, screen: "menu" }, ["START"])).toContain("transitioned");
});
it("does not fabricate collision proof from identical endpoint snapshots", () => {
  expect(pressResult(field, field, ["UP"])).toContain("blocked or unavailable");
  expect(pressResult(field, field, ["UP", "DOWN"])).toContain("intermediate effects unknown");
  expect(pressResult(field, field, ["A"])).toContain("non-direction");
});
it("preserves missing state, locked state and unavailable readiness", () => {
  expect(pressResult(undefined, field, ["UP"])).toContain("no verified before");
  expect(pressResult({ ...field, started: false }, field, ["UP"])).toContain("world position unavailable");
  expect(pressResult(field, { ...field, position: null }, ["UP"])).toContain("unavailable");
  expect(pressResult({ ...field, map_id: null }, field, ["UP"])).toContain("unavailable");
  expect(pressResult(field, { ...field, field_controls_locked: true }, ["UP"])).toContain("locked");
  expect(pressResult({ ...field, field_controls_locked: null }, field, ["UP"])).toContain("readiness unverified");
  expect(pressResult({ ...field, screen: "battle", in_battle: true }, { ...field, screen: "battle" }, ["UP"])).toContain("readiness");
  expect(pressResult({ ...field, in_battle: true }, field, ["UP"])).toContain("readiness");
  expect(pressResult(field, { ...field, in_battle: true }, ["UP"])).toContain("readiness");
  expect(pressResult({ ...field, facing: null }, field, ["UP"])).toContain("blocked or unavailable");
});
