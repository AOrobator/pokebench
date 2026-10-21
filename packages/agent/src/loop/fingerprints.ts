import type { GameStateSnapshot } from "../game-state.js";
import { legacyParty } from "../party-facts.js";

export function stable(value: unknown): string {
  return JSON.stringify(value, (_key: string, item: unknown): unknown => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, record[key]]),
      );
    }
    return item;
  });
}

// Only surfaces with observable interaction state can establish equivalence.
export function semanticState(state: GameStateSnapshot, interactions = false): string | null {
  if (state.in_battle) return null;
  const ui = state.active_ui;
  if (state.screen === "naming" && state.naming?.ready === true) {
    const naming = state.naming;
    if (ui != null && (
      ui.diagnostic !== null || ui.ready !== true || ui.phase !== "naming_editor" ||
      ui.selected !== naming.key || ui.value !== naming.text ||
      ui.details?.["page"] !== naming.page || ui.details["column"] !== naming.column ||
      ui.details["row"] !== naming.row
    )) return null;
    return stable({ screen: state.screen, naming, owner: ui?.details ?? null });
  }
  if (ui != null) {
    if (ui.diagnostic !== null || ui.ready !== true) return null;
    const selected = ui.phase === "gender_selection"
      ? ["BOY", "GIRL"]
      : ["name_confirmation", "clock_confirmation"].includes(ui.phase) ? ["YES", "NO"] : [];
    const clockValue = ui.value != null && /^(?:[1-9]|1[0-2]):[0-5][0-9] (?:AM|PM)$/.test(ui.value);
    const validChoice = ui.selected !== null && selected.includes(ui.selected) &&
      (ui.phase !== "clock_confirmation" || clockValue);
    const validClock = ui.phase === "clock_adjustment" && ui.selected === null && clockValue;
    if (validChoice || validClock) return stable({
      phase: ui.phase,
      selected: ui.selected,
      ready: ui.ready,
      value: ui.phase.startsWith("clock_") ? ui.value : null,
    });
    return null;
  }
  const message = state.world_context?.message;
  const qualifiedMessage = interactions && Boolean(state.world_context?.dialogue || message?.identity) &&
    message?.ready === true && ["dismiss_wait", "button_wait", "page_wait", "scroll_wait"].includes(message.phase);
  if (state.screen !== "overworld" || !state.started || state.map_id === null || state.position === null ||
      state.facing === null || (state.field_controls_locked !== false &&
      !(state.field_controls_locked === true && qualifiedMessage))) return null;
  return stable({
    screen: state.screen,
    map: state.map_id,
    position: state.position,
    facing: state.facing,
    name: state.name,
    party: legacyParty(state.party),
    money: state.money,
    badges: state.badges,
    story: state.story ?? null,
    dialogue: state.world_context?.dialogue ?? null,
    ...(interactions ? { message: state.world_context?.message ?? null, locked: state.field_controls_locked } : {}),
  });
}

export function battleState(state: GameStateSnapshot): string | null {
  const battle = state.battle;
  if (!state.in_battle || battle == null || battle.diagnostic !== null) return null;
  return stable({
    battle,
    ui: state.active_ui ?? null,
    party: legacyParty(state.party),
    message: state.world_context?.message ?? null,
    dialogue: state.world_context?.dialogue ?? null,
  });
}

export function transientLock(state: GameStateSnapshot): boolean {
  const script = state.resources;
  return state.screen === "overworld" && state.started && !state.in_battle && state.map_id !== null &&
    state.position !== null && state.facing !== null && state.field_controls_locked === true &&
    state.active_ui == null && (state.world_context?.dialogue ?? "") === "" && state.world_context?.message == null &&
    script != null && script.script_mode === 0 && script.script_status === 2;
}

export function scriptHeld(state: GameStateSnapshot): boolean {
  if (state.field_controls_locked !== true || state.active_ui != null || state.naming != null) return false;
  if ((state.world_context?.dialogue ?? "") !== "" || state.world_context?.message != null) return true;
  const script = state.resources;
  return script != null && (script.script_mode === 1 || script.script_mode === 2) &&
    (script.script_status === 0 || script.script_status === 1);
}

const MESSAGE_WAITS = ["dismiss_wait", "button_wait", "page_wait", "scroll_wait"];

export function waitingState(state: GameStateSnapshot): string | null {
  if (state.in_battle || state.screen === "battle") return null;
  const ui = state.active_ui;
  const message = state.world_context?.message;
  const dialogue = state.world_context?.dialogue ?? null;
  const waiting = ui != null ? ui.ready === true && ui.diagnostic === null
    : state.screen === "naming" || state.naming != null ? state.naming?.ready === true
      : state.screen === "overworld" && state.started && state.field_controls_locked === true &&
        message?.ready === true && MESSAGE_WAITS.includes(message.phase) && Boolean(dialogue || message.identity);
  if (!waiting) return null;
  return stable({
    screen: state.screen,
    started: state.started,
    map: state.map_id,
    position: state.position,
    facing: state.facing,
    locked: state.field_controls_locked,
    ui: ui ?? null,
    naming: state.naming ?? null,
    dialogue,
    message: message ?? null,
    name: state.name,
    party: legacyParty(state.party),
    money: state.money,
    badges: state.badges,
    story: state.story ?? null,
  });
}

// Task_ShopMenu in pokeemerald src/shop.c routes MENU_B_PRESSED to Task_HandleShopMenuQuit.
// The shop UI owner is independent of the ordinary field-message decoder.
export function menuRefusalState(state: GameStateSnapshot): string | null {
  if (!state.started || state.in_battle || state.screen !== "overworld" || state.map_id === null || state.position === null) return null;
  const ui = state.active_ui;
  if (ui != null) {
    if (ui.ready !== true || ui.diagnostic !== null) return null;
    return stable({map:state.map_id,position:state.position,ui:{phase:ui.phase,selected:ui.selected,value:ui.value,controls:ui.controls}});
  }
  return state.field_controls_locked === false ? stable({map:state.map_id,position:state.position,ui:null}) : null;
}
