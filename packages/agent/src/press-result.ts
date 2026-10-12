import type { Button } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";

// Endpoint snapshots prove net changes. They cannot prove every frame accepted
// input or that a temporary script lock did not occur between the snapshots.
export function pressResult(before: GameStateSnapshot | undefined, after: GameStateSnapshot, buttons: readonly Button[]): string {
  if (before === undefined) return "unavailable (no verified before snapshot)";
  if (!before.started || !after.started || before.position === null || after.position === null ||
      before.map_id === null || after.map_id === null) return "unavailable/transitioning (world position unavailable)";
  if (before.map_id[0] !== after.map_id[0] || before.map_id[1] !== after.map_id[1] || before.screen !== after.screen) {
    return "transitioned (map or screen changed)";
  }
  if (before.position.x !== after.position.x || before.position.y !== after.position.y) {
    return `moved (${String(before.position.x)},${String(before.position.y)}) -> (${String(after.position.x)},${String(after.position.y)})`;
  }
  if (before.facing !== after.facing && before.facing !== null && after.facing !== null) {
    return `turned ${before.facing} -> ${after.facing}; no net movement`;
  }
  if (before.field_controls_locked === true || after.field_controls_locked === true) {
    return "locked (field controls locked in a snapshot; no net movement)";
  }
  if (before.screen !== "overworld" || before.in_battle || after.in_battle ||
      before.field_controls_locked !== false || after.field_controls_locked !== false) {
    return "unavailable/transitioning (field input readiness unverified)";
  }
  if (buttons.length !== 1 || !["UP", "DOWN", "LEFT", "RIGHT"].includes(buttons[0] ?? "")) {
    return "unchanged world position/facing (batch or non-direction input; intermediate effects unknown)";
  }
  return "blocked or unavailable (no movement/turn observed; snapshots cannot distinguish collision from ignored input)";
}
