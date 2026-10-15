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
export interface PressFacts { readonly position: boolean; readonly fieldLock: boolean; readonly transitions?: boolean }
export const ALL_PRESS_FACTS: PressFacts = { position: true, fieldLock: true };

const dialogueOf = (state: GameStateSnapshot | undefined): string | null => state?.world_context?.dialogue ?? null;
// An opening is its text at a place (map and player tile): the same sign text at another tile is a different conversation.
const openingOf = (state: GameStateSnapshot): string | null => {
  const text = dialogueOf(state);
  if (text === null) return null;
  const map = state.map_id === null ? "?" : `${String(state.map_id[0])}/${String(state.map_id[1])}`;
  const tile = state.position === null ? "?" : `${String(state.position.x)},${String(state.position.y)}`;
  return JSON.stringify([map, tile, text]);
};

// The states the model was actually given (observe and press results), so a
// press can be compared with what the model last saw, not only the pre-press read.
export class ShownStates {
  #last: GameStateSnapshot | undefined;
  readonly #openings = new Map<string, number>();
  get lastShown(): GameStateSnapshot | undefined { return this.#last; }
  timesShown(state: GameStateSnapshot): number { const key = openingOf(state); return key === null ? 0 : this.#openings.get(key) ?? 0; }
  record(state: GameStateSnapshot): void {
    const key = openingOf(state);
    if (key !== null && (this.#last === undefined || key !== openingOf(this.#last))) this.#openings.set(key, this.timesShown(state) + 1);
    this.#last = state;
  }
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${String(n)}${suffix}`;
}

type Placed = GameStateSnapshot & { readonly map_id: readonly [number, number]; readonly position: { readonly x: number; readonly y: number } };
const placed = (state: GameStateSnapshot | undefined): state is Placed => state !== undefined && state.started && state.map_id !== null && state.position !== null;
const sameMap = (a: Placed, b: Placed): boolean => a.map_id[0] === b.map_id[0] && a.map_id[1] === b.map_id[1];
const tile = (state: Placed, show: PressFacts): string => show.position ? ` (${String(state.position.x)},${String(state.position.y)})` : "";
const place = (state: Placed, show: PressFacts): string => `${state.location ?? "unknown location"} [map ${String(state.map_id[0])}/${String(state.map_id[1])}]${tile(state, show)}`;
const DIRECTIONS: readonly Button[] = ["UP", "DOWN", "LEFT", "RIGHT"];

function duringPress(before: GameStateSnapshot, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts, shown: ShownStates): string {
  if (dialogueOf(before) === null && shown.timesShown(after) > 0) {
    return `conversation restarted: this text was already shown (${ordinal(shown.timesShown(after) + 1)} time)`;
  }
  if (placed(before) && placed(after) && before.active_ui == null && after.active_ui == null && before.naming == null && after.naming == null) {
    if (!sameMap(before, after)) return `warped during this press: ${place(before, show)} -> ${place(after, show)}`;
    const moved = before.position.x !== after.position.x || before.position.y !== after.position.y;
    if (moved && before.screen === after.screen) {
      const noDirection = !buttons.some(button => DIRECTIONS.includes(button));
      // A direction is held for several frames, so a script can release the lock mid-press and the
      // held direction can then move the player: only a lock in both snapshots rules the press out.
      const lockedBefore = show.fieldLock && before.field_controls_locked === true;
      const lockedAfter = show.fieldLock && after.field_controls_locked === true;
      const path = show.position ? `: (${String(before.position.x)},${String(before.position.y)}) -> (${String(after.position.x)},${String(after.position.y)})` : "";
      if ((noDirection && (lockedBefore || lockedAfter)) || (lockedBefore && lockedAfter)) return `moved by a script while field controls were locked (not by your press)${path}`;
      if (noDirection) return `moved by a script (not by your press; no direction was pressed)${path}`;
      if (lockedBefore) return `${show.position ? `moved (${String(before.position.x)},${String(before.position.y)}) -> (${String(after.position.x)},${String(after.position.y)})` : "moved"}; field controls were locked when the press began`;
    }
  }
  return basePressResult(before, after, buttons, show);
}

export function pressResult(before: GameStateSnapshot | undefined, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts = ALL_PRESS_FACTS, shown: ShownStates = new ShownStates()): string {
  if (show.transitions !== true || before === undefined || before.active_ui?.diagnostic != null || after.active_ui?.diagnostic != null) {
    return basePressResult(before, after, buttons, show);
  }
  const now = duringPress(before, after, buttons, show, shown);
  const last = shown.lastShown;
  if (!placed(last) || !placed(before) || sameMap(last, before)) return now;
  const carried = `warped before this press (carried over from your previous action; your last result still showed the old map): ${place(last, show)} -> ${place(before, show)}`;
  return `${carried}; ${now.startsWith("warped during this press") ? now : `this press: ${now}`}`;
}

function basePressResult(before: GameStateSnapshot | undefined, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts): string {
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
