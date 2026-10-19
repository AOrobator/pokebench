import type { CompletedCall, LoopHit, LoopKind, LoopRule, LoopRuleId, RuleContext } from "../types.js";
import type { GameStateSnapshot } from "../../game-state.js";

export const BATTLE_MENU_RETURNS = 4;
export const BATTLE_MENU_LOOP_MESSAGE =
  "The battle menu is back on the same choice after the POKéMON or BAG screen, and the foe's HP and the battle turn are unchanged. The menu reads FIGHT BAG / POKéMON RUN. POKéMON is the bottom-left. UP from POKéMON moves to FIGHT; LEFT from POKéMON does not move. A on FIGHT chooses a move.";

const MENU_DETOUR_SCREENS = new Set(["party_menu", "party_action_menu", "pokemon_summary", "bag_menu"]);
const menuDetourScreen = (state: GameStateSnapshot): boolean =>
  MENU_DETOUR_SCREENS.has(state.screen) ||
  (state.active_ui?.phase != null && MENU_DETOUR_SCREENS.has(state.active_ui.phase));

const battleStamp = (state: GameStateSnapshot): string | null => {
  const battle = state.battle;
  const battlers = battle?.battlers;
  if (battle == null || battle.turn == null || battlers == null || battlers.length === 0) return null;
  return `${String(battle.turn)}:${battlers.map((b) => `${String(b.battler)}:${b.species}:${String(b.hp)}`).join(",")}`;
};

const actionMenuKey = (state: GameStateSnapshot): string | null => {
  const battle = state.battle;
  const stamp = battleStamp(state);
  if (!state.in_battle || state.screen !== "battle" || battle == null || battle.diagnostic !== null || stamp === null) return null;
  const input = battle.player_inputs?.find((row) => row.ready && row.phase === "action" && row.action_cursor !== null);
  return input === undefined ? null : `${stamp}:${String(input.action_cursor)}:${input.selected ?? ""}`;
};

const clockLookPlace = (state: GameStateSnapshot): string | null => {
  if (state.screen !== "clock" || state.story?.clock_set !== true) return null;
  const phase = state.active_ui?.phase;
  if (phase !== "clock_transition" && phase !== "clock_view") return null;
  if (state.map_id === null || state.position === null) return null;
  return JSON.stringify([state.location, state.map_id, state.position]);
};

const pressAskedForA = (call: CompletedCall): boolean => {
  const source = call.requested ?? call.args;
  const buttons = source["buttons"];
  return Array.isArray(buttons) && buttons.some((button) => button === "A");
};

export class InterfaceRules {
  private clockLooks = { place: "", count: 0 };
  private closedTalk = { text: "", place: "", count: 0 };
  private menuAnchor: string | null = null;
  private menuDetour = false;
  private readonly menuReturns: { key: string; seq: number }[] = [];
  private menuStamp: string | null = null;

  constructor(
    private readonly ineffectiveThreshold: number,
    private readonly clockViews: boolean,
    private readonly closedDialogue: boolean,
    private readonly menuLoop: boolean,
  ) {}

  observeState(state: GameStateSnapshot): boolean {
    if (!this.menuLoop) return false;
    if (!state.in_battle) {
      this.resetMenu();
      return true;
    }
    if (menuDetourScreen(state)) this.menuDetour = true;
    return false;
  }

  clockHit(game: boolean, call: CompletedCall): boolean {
    if (!this.clockViews || !game || call.name === "observe" || call.state === undefined) return false;
    if (call.name === "press") {
      const look = clockLookPlace(call.state);
      if (look !== null) {
        this.clockLooks = look === this.clockLooks.place
          ? { place: look, count: this.clockLooks.count + 1 }
          : { place: look, count: 1 };
        return this.clockLooks.count >= this.ineffectiveThreshold;
      }
    }
    if (call.state.screen === "overworld" && call.state.map_id !== null && call.state.position !== null) {
      const place = JSON.stringify([call.state.location, call.state.map_id, call.state.position]);
      if (place !== this.clockLooks.place) this.clockLooks = { place: "", count: 0 };
    }
    return false;
  }

  closedDialogueHit(game: boolean, call: CompletedCall): boolean {
    if (!this.closedDialogue || !game || call.name === "observe" || call.state === undefined) return false;
    if (call.state.screen !== "overworld" || call.state.map_id === null || call.state.position === null) {
      this.closedTalk = { text: "", place: "", count: 0 };
      return false;
    }
    const place = JSON.stringify([call.state.location, call.state.map_id, call.state.position]);
    const leftTile = () => {
      if (place !== this.closedTalk.place) this.closedTalk = { text: "", place: "", count: 0 };
    };
    if (call.state.world_context == null) { leftTile(); return false; }
    const open = call.state.world_context.dialogue ?? "";
    if (open !== "") {
      if (open !== this.closedTalk.text) this.closedTalk = { text: "", place: "", count: 0 };
      return false;
    }
    const messageUp = call.state.world_context.message?.ready === true;
    if (call.state.in_battle || call.state.field_controls_locked !== false || call.state.active_ui?.ready === true || messageUp) {
      leftTile();
      return false;
    }
    const text = (call.spoken ?? call.dialogue ?? []).filter((line) => line !== "").join("\n");
    if (text === "" || call.name !== "press" || !pressAskedForA(call)) {
      if (place !== this.closedTalk.place) this.closedTalk = { text: "", place: "", count: 0 };
      return false;
    }
    this.closedTalk = text === this.closedTalk.text && place === this.closedTalk.place
      ? { text, place, count: this.closedTalk.count + 1 }
      : { text, place, count: 0 };
    return this.closedTalk.count >= this.ineffectiveThreshold;
  }

  menuReturn(call: CompletedCall, seq: number): { readonly evidence: number[] | null; readonly stateReset: boolean } {
    if (!this.menuLoop) return { evidence: null, stateReset: false };
    const state = call.state;
    if (state === undefined || !state.in_battle) {
      this.resetMenu();
      return { evidence: null, stateReset: true };
    }
    const stamp = battleStamp(state);
    if (stamp !== null && this.menuStamp !== null && stamp !== this.menuStamp) {
      this.resetMenu();
      this.menuStamp = stamp;
      return { evidence: null, stateReset: true };
    }
    if (stamp !== null) this.menuStamp = stamp;
    if (menuDetourScreen(state)) {
      this.menuDetour = true;
      return { evidence: null, stateReset: false };
    }
    const key = actionMenuKey(state);
    if (key === null) return { evidence: null, stateReset: false };
    if (this.menuAnchor !== null && this.menuAnchor !== key) {
      this.menuAnchor = key;
      this.menuDetour = false;
      this.menuReturns.length = 0;
      return { evidence: null, stateReset: true };
    }
    this.menuAnchor = key;
    if (!this.menuDetour) return { evidence: null, stateReset: false };
    this.menuDetour = false;
    this.menuReturns.push({ key, seq });
    if (this.menuReturns.length > 12) this.menuReturns.shift();
    const same = this.menuReturns.filter((row) => row.key === key);
    return {
      evidence: same.length >= BATTLE_MENU_RETURNS ? same.map((row) => row.seq) : null,
      stateReset: false,
    };
  }

  resetNativeProgress(): void {
    this.closedTalk = { text: "", place: "", count: 0 };
  }

  private resetMenu(): void {
    this.menuAnchor = null;
    this.menuDetour = false;
    this.menuReturns.length = 0;
    this.menuStamp = null;
  }
}

export const interfaceRule = (id: LoopRuleId, kind: LoopKind, enabled = true): LoopRule => ({
  id,
  kind,
  check: (_call: CompletedCall, context: RuleContext): LoopHit | null => enabled ? context.candidates?.get(id) ?? null : null,
  reset: () => undefined,
});
