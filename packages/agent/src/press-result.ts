import type { Button } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";


function interfaceProjection(state: GameStateSnapshot): string | undefined {
  if (state.naming != null) return JSON.stringify(["naming",state.naming.text,state.naming.page,state.naming.column,state.naming.row,state.naming.key,state.naming.ready]);
  const ui=state.active_ui;
  if (ui == null || ui.diagnostic !== null || ui.ready === null) return undefined;
  return JSON.stringify([ui.phase,ui.selected,ui.ready,ui.value ?? null]);
}

// Endpoint snapshots prove net changes. They cannot prove every frame accepted
// input or that a temporary script lock did not occur between the snapshots.
// Facts the run's observation switches hide from the model are left out here too.
export interface PressFacts { readonly position: boolean; readonly fieldLock: boolean }
export const ALL_PRESS_FACTS: PressFacts = { position: true, fieldLock: true };

export function pressResult(before: GameStateSnapshot | undefined, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts = ALL_PRESS_FACTS): string {
  if (before === undefined) return "unavailable (no verified before snapshot)";
  if (before.active_ui?.diagnostic != null || after.active_ui?.diagnostic != null) return "unavailable (state coverage error; no verified interface outcome)";
  const beforeUi=interfaceProjection(before), afterUi=interfaceProjection(after);
  if (beforeUi !== undefined || afterUi !== undefined) {
    if (beforeUi !== afterUi) return "interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)";
    return "interface unchanged (no net phase, selection, value, or readiness change; intermediate effects unknown)";
  }

  if (!before.started || !after.started || before.position === null || after.position === null ||
      before.map_id === null || after.map_id === null) return "unavailable/transitioning (world position unavailable)";
  if (before.map_id[0] !== after.map_id[0] || before.map_id[1] !== after.map_id[1] || before.screen !== after.screen) {
    return "transitioned (map or screen changed)";
  }
  if (before.position.x !== after.position.x || before.position.y !== after.position.y) {
    return show.position ? `moved (${String(before.position.x)},${String(before.position.y)}) -> (${String(after.position.x)},${String(after.position.y)})` : "moved";
  }
  if (before.facing !== after.facing && before.facing !== null && after.facing !== null) {
    return show.position ? `turned ${before.facing} -> ${after.facing}; no net movement` : "turned; no net movement";
  }
  if (!show.fieldLock) return "no movement or turn observed (cause not reported)";
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
