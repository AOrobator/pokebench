import { expect, it } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { pressResult } from "./press-result.js";
import type { GameStateSnapshot } from "./game-state.js";
const field: GameStateSnapshot = { ...IN_GAME, screen: "overworld", field_controls_locked: false, position: { x: 2, y: 2 }, facing: "up" };
const unavailable = "unavailable/transitioning (world position unavailable)";
const unready = "unavailable/transitioning (field input readiness unverified)";
const blocked = "blocked or unavailable (no movement/turn observed; snapshots cannot distinguish collision from ignored input)";
it("distinguishes each movement and map/screen transition operand", () => {
  expect(pressResult(field, { ...field, position: { x: 2, y: 1 } }, ["UP"])).toBe("moved (2,2) -> (2,1)");
  expect(pressResult(field, { ...field, position: { x: 3, y: 2 }, facing: "right" }, ["RIGHT"])).toBe("moved (2,2) -> (3,2)");
  expect(pressResult(field, { ...field, facing: "right" }, ["RIGHT"])).toBe("turned up -> right; no net movement");
  expect(pressResult(field, { ...field, map_id: [0, 10] }, ["UP"])).toBe("transitioned (map or screen changed)");
  expect(pressResult(field, { ...field, map_id: [1, 9] }, ["UP"])).toBe("transitioned (map or screen changed)");
  expect(pressResult(field, { ...field, screen: "menu" }, ["START"])).toBe("transitioned (map or screen changed)");
});
it("does not invent collision or intermediate effects from endpoint snapshots", () => {
  expect(pressResult(field, field, ["UP"])).toBe(blocked);
  const batch = "unchanged world position/facing (batch or non-direction input; intermediate effects unknown)";
  expect(pressResult(field, field, ["UP", "DOWN"])).toBe(batch);
  expect(pressResult(field, field, ["A"])).toBe(batch);
  expect(pressResult(field, field, [])).toBe(batch);
});
it.each(["started", "position", "map_id"] as const)("isolates missing %s on both sides", (key) => {
  const missing = key === "started" ? { started: false } : key === "position" ? { position: null } : { map_id: null };
  expect(pressResult({ ...field, ...missing }, field, ["UP"])).toBe(unavailable);
  expect(pressResult(field, { ...field, ...missing }, ["UP"])).toBe(unavailable);
});
it("preserves missing before snapshot and both facing-null operands", () => {
  expect(pressResult(undefined, field, ["UP"])).toBe("unavailable (no verified before snapshot)");
  expect(pressResult({ ...field, facing: null }, field, ["UP"])).toBe(blocked);
  expect(pressResult(field, { ...field, facing: null }, ["UP"])).toBe(blocked);
});
it("isolates before and after locks and readiness guards", () => {
  const locked = "locked (field controls locked in a snapshot; no net movement)";
  expect(pressResult({ ...field, field_controls_locked: true }, field, ["UP"])).toBe(locked);
  expect(pressResult(field, { ...field, field_controls_locked: true }, ["UP"])).toBe(locked);
  expect(pressResult({ ...field, field_controls_locked: null }, field, ["UP"])).toBe(unready);
  expect(pressResult(field, { ...field, field_controls_locked: null }, ["UP"])).toBe(unready);
  expect(pressResult({ ...field, screen: "menu" }, { ...field, screen: "menu" }, ["UP"])).toBe(unready);
  expect(pressResult({ ...field, in_battle: true }, field, ["UP"])).toBe(unready);
  expect(pressResult(field, { ...field, in_battle: true }, ["UP"])).toBe(unready);
});
