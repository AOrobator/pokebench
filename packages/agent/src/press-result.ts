import type { Button } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";
import { blockedBatchResult } from "./blocked-batch.js";
import { scriptHeld } from "./loop-detection.js";


function interfaceProjection(state: GameStateSnapshot): string | undefined {
  if (state.naming != null) return JSON.stringify(["naming",state.naming.text,state.naming.page,state.naming.column,state.naming.row,state.naming.key,state.naming.ready]);
  const ui=state.active_ui;
  if (ui == null || ui.diagnostic !== null || ui.ready === null) return undefined;
  return JSON.stringify([ui.phase,ui.selected,ui.ready,ui.value ?? null]);
}

// Endpoint snapshots prove net changes. They cannot prove every frame accepted
// input or that a temporary script lock did not occur between the snapshots.
// Facts the run's observation switches hide from the model are left out here too.
// blockedBatch (blocked-batch-result-v1) names blocked direction batches; liveMap, ledges, edgeWalls, counters and
// topology say which map facts the model is shown.
export interface PressFacts { readonly position: boolean; readonly fieldLock: boolean; readonly transitions?: boolean; readonly warpArrival?: boolean; readonly blockedBatch?: boolean; readonly liveMap?: boolean; readonly ledges?: boolean; readonly edgeWalls?: boolean; readonly counters?: boolean; readonly topology?: boolean; readonly pushback?: boolean }
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

const cursorOf = (state: GameStateSnapshot): number | null => state.world_context?.message?.cursor ?? null;
// The same opening before and after, with the print cursor moved back: the box closed and the same text began again.
const reprinted = (before: GameStateSnapshot, after: GameStateSnapshot): boolean => {
  const key = openingOf(after), was = cursorOf(before), now = cursorOf(after);
  return key !== null && key === openingOf(before) && was !== null && now !== null && now < was;
};

// The states the model was actually given (observe and press results), so a
// press can be compared with what the model last saw, not only the pre-press read.
export class ShownStates {
  #last: GameStateSnapshot | undefined;
  readonly #openings = new Map<string, number>();
  get lastShown(): GameStateSnapshot | undefined { return this.#last; }
  timesShown(state: GameStateSnapshot): number { const key = openingOf(state); return key === null ? 0 : this.#openings.get(key) ?? 0; }
  // `before` is the snapshot the press started from: a conversation that began printing again
  // inside one press (same text, cursor back) is another showing even though the last shown state had it too.
  record(state: GameStateSnapshot, before?: GameStateSnapshot): void {
    const key = openingOf(state);
    if (key !== null && (this.#last === undefined || key !== openingOf(this.#last) || (before !== undefined && reprinted(before, state)))) this.#openings.set(key, this.timesShown(state) + 1);
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
const place = (state: Placed, show: PressFacts): string => `${state.location_display ?? state.location ?? "unknown location"} [map ${String(state.map_id[0])}/${String(state.map_id[1])}]${tile(state, show)}`;
const DIRECTIONS: readonly Button[] = ["UP", "DOWN", "LEFT", "RIGHT"];

// warp-arrival-settle-v1: a map change is reported whatever interface owner a snapshot had. A before
// snapshot taken mid map load (field_transition) is not placed, so the warp starts from the last state shown.
function arrivalWarp(before: GameStateSnapshot, after: GameStateSnapshot, show: PressFacts, shown: ShownStates): string | null {
  if (show.warpArrival !== true || !placed(after)) return null;
  if (placed(before)) return sameMap(before, after) ? null : `warped during this press: ${place(before, show)} -> ${place(after, show)}`;
  const last = shown.lastShown;
  if (before.screen !== "field_transition" || !placed(last) || sameMap(last, after)) return null;
  return `warped during this press (the map change was already under way when it began): ${place(last, show)} -> ${place(after, show)}`;
}

function duringPress(before: GameStateSnapshot, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts, shown: ShownStates): string {
  if ((dialogueOf(before) === null || reprinted(before, after)) && shown.timesShown(after) > 0) {
    return `conversation restarted: this text was already shown (${ordinal(shown.timesShown(after) + 1)} time)`;
  }
  const warped = arrivalWarp(before, after, show, shown);
  if (warped !== null) return warped;
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
  return dialogueChange(before, after, show) ?? basePressResult(before, after, buttons, show);
}

// Box-state notes that describe the state right after this press; dialogue-auto-advance-v1 replaces them with the state after it advanced.
export const OPENED_LOCK_NOTE = " (the message box locks field controls until it closes)";
export const STILL_OPEN_NOTE = " (message box still open; it locks field controls until it closes)";
export const STILL_LOCKED_NOTE = "; field controls are still locked";

// A message box opening, moving on or closing in place is what the press did; the field lock it
// causes is a consequence, so it is named as the box's and never as the press being locked out.
function dialogueChange(before: GameStateSnapshot, after: GameStateSnapshot, show: PressFacts): string | null {
  if (!placed(before) || !placed(after) || !sameMap(before, after) || before.active_ui != null || after.active_ui != null || before.naming != null || after.naming != null) return null;
  if (before.position.x !== after.position.x || before.position.y !== after.position.y) return null;
  const was = dialogueOf(before), now = dialogueOf(after);
  const lock = (state: GameStateSnapshot): boolean | null => show.fieldLock ? state.field_controls_locked ?? null : null;
  if (was === null && now !== null) return `dialogue opened${lock(after) === true ? OPENED_LOCK_NOTE : ""}`;
  if (was !== null && now === null) return `dialogue closed${lock(after) === false ? "; field controls are free now" : lock(after) === true ? STILL_LOCKED_NOTE : ""}`;
  if (was !== null && now !== null && (was !== now || cursorOf(before) !== cursorOf(after) || before.world_context?.message?.phase !== after.world_context?.message?.phase)) {
    return `dialogue advanced${lock(after) === true ? STILL_OPEN_NOTE : ""}`;
  }
  return null;
}

// pushback-press-result-v1: dialogue auto-advance ran after the model's input; a script may have moved the player
// while it advanced. `pressed` is the state when the model's own input ended, `after` the state after auto-advance.
export function pushbackPressResult(line: string, before: GameStateSnapshot | undefined, pressed: GameStateSnapshot, after: GameStateSnapshot, show: PressFacts): string {
  if (!placed(before) || !placed(pressed) || !placed(after)) return line;
  if (sameTile(pressed, after)) return line;
  const path = (from: Placed, to: Placed): string => tilePath(from, to, show);
  const pressMoved = !sameTile(before, pressed);
  const back = pressMoved && sameTile(before, after);
  const press = pressMoved ? `your press moved you${path(before, pressed)}` : "your press did not move you";
  const script = `then a script moved you${back ? " back" : ""}${path(pressed, after)} while the dialogue advanced`;
  const own = pressMoved ? line : line.replaceAll("no net movement", "no movement by the press");
  return `${own}; this call: ${press}, ${script}${back ? "; you are back where this press began" : ""}`;
}

const tilePath = (from: Placed, to: Placed, show: PressFacts): string => !sameMap(from, to) ? ` ${place(from, show)} -> ${place(to, show)}` : show.position ? ` (${String(from.position.x)},${String(from.position.y)}) -> (${String(to.position.x)},${String(to.position.y)})` : "";
const sameTile = (a: Placed, b: Placed): boolean => sameMap(a, b) && a.position.x === b.position.x && a.position.y === b.position.y;
const OPPOSITE: Readonly<Record<string, string>> = { up: "down", down: "up", left: "right", right: "left" };

// pushback-press-result-v1: a script moved the player between two snapshots of one call (navigate_to's auto-advance).
export function scriptMove(from: GameStateSnapshot, to: GameStateSnapshot, show: PressFacts): string | null {
  if (!placed(from) || !placed(to) || sameTile(from, to)) return null;
  return `a script moved you${tilePath(from, to, show)} while the dialogue advanced`;
}

// pushback-press-result-v1: a walk batch is sent at once. When a field message is open after it, exactly one prefix
// of it, taken as one tile per input, explains where the player stands, and the player faces that prefix's last
// direction (a step faces its way; inputs under a message lock turn no one), the inputs after that prefix were
// pressed while the message held field controls. Any other shape (a bump, a turn in place, two prefixes that fit, a
// battle transition or another owner of the lock) proves nothing.
const STEP: Readonly<Record<string, readonly [number, number]>> = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
export function ignoredSteps(before: GameStateSnapshot | undefined, after: GameStateSnapshot, sent: readonly Button[]): Button[] {
  if (!placed(before) || !placed(after) || !sameMap(before, after)) return [];
  if ((after.world_context?.dialogue ?? "") === "" && after.world_context?.message == null) return [];
  const fits: number[] = [];
  let x = before.position.x, y = before.position.y;
  for (let k = 1; k <= sent.length; k++) {
    const step = STEP[sent[k - 1] ?? ""];
    if (step === undefined) return [];
    x += step[0]; y += step[1];
    if (x === after.position.x && y === after.position.y) fits.push(k);
  }
  const k = fits.length === 1 ? fits[0] : undefined;
  if (k === undefined || after.facing !== (sent[k - 1] ?? "").toLowerCase()) return [];
  return sent.slice(k);
}

// pushback-press-result-v1: what a script did around this press, from the snapshots alone.
function scriptTakeover(line: string, before: GameStateSnapshot | undefined, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts, shown: ShownStates): string {
  if (!placed(before) || !placed(after) || !sameMap(before, after)) return line;
  const where = show.position ? ` (${String(after.position.x)},${String(after.position.y)})` : "";
  const holder = (after.world_context?.dialogue ?? "") !== "" || after.world_context?.message != null ? "the message box" : "a running script";
  const dirs = buttons.filter(b => DIRECTIONS.includes(b));
  const pressed = dirs[dirs.length - 1];
  let out = line;
  if (pressed !== undefined && before.field_controls_locked === false && sameTile(before, after) && scriptHeld(after) && after.facing === OPPOSITE[pressed.toLowerCase()]) {
    // From free controls, no input faces the player away from the direction just pressed (54a7 T247: LEFT, then facing right).
    out = `a script took over during your press: you pressed ${pressed} and now face ${after.facing} on the same tile${where}, with field controls held by ${holder}; your press cannot turn you ${after.facing}, so the script turned you or stepped you back between snapshots`;
  } else if (!sameTile(before, after) && line.startsWith("moved") && scriptHeld(after) && holder === "a running script") {
    out = `${line}; then a script took over: field controls are held by a running script (no message yet), which may move you`;
  }
  const last = shown.lastShown;
  // The last result itself showed a script holding the controls (the trigger tile), and this press starts elsewhere.
  if (placed(last) && sameMap(last, before) && !sameTile(last, before) && scriptHeld(last)) {
    out = `a script moved you${tilePath(last, before, show)} after your last result, before this press; this press: ${out}`;
  }
  return out;
}

export function pressResult(before: GameStateSnapshot | undefined, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts = ALL_PRESS_FACTS, shown: ShownStates = new ShownStates()): string {
  const line = pressResultLine(before, after, buttons, show, shown);
  return show.pushback === true ? scriptTakeover(line, before, after, buttons, show, shown) : line;
}

function pressResultLine(before: GameStateSnapshot | undefined, after: GameStateSnapshot, buttons: readonly Button[], show: PressFacts, shown: ShownStates): string {
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
    const blocked = show.blockedBatch === true && show.fieldLock ? blockedBatchResult(before, after, buttons, show) : null;
    if (blocked !== null) return blocked;
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
    const blocked = show.blockedBatch === true ? blockedBatchResult(before, after, buttons, show) : null;
    if (blocked !== null) return blocked;
    return "unchanged world position/facing (batch or non-direction input; intermediate effects unknown)";
  }
  return "blocked or unavailable (no movement/turn observed; snapshots cannot distinguish collision from ignored input)";
}
