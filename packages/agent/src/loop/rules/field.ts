import type { CompletedCall, LoopHit, LoopKind, LoopRule, LoopRuleId, RuleContext } from "../types.js";
import type { GameStateSnapshot } from "../../game-state.js";
import type { PendingCall } from "../call-tracker.js";
import { semanticState, scriptHeld, stable, transientLock } from "../fingerprints.js";
import { legacyParty } from "../../party-facts.js";

export const PUSHBACK_MESSAGE =
  "A game script keeps returning the player to the same place after the same input: each attempt ends back where it started, so repeating it will not get past the script. Read what the script's dialogue says, then choose a different target or approach using observed evidence.";
export const REVISIT_MESSAGE =
  "Your recent moves name different targets but keep ending on the same one or two tiles, with no new map, tile or story milestone in between: switching between these few targets is not getting anywhere. Reassess what stops you there using observed evidence, then choose a different route or destination.";
export const TRANSITION_MESSAGE =
  "Moving back and forth between the same maps is repeating with no new story, party, money, badge or item change. Reassess the objective and choose a different exit or target using observed evidence.";
export const TRIGGER_SCRIPT_MESSAGE = (dialogue: string): string =>
  `The same condition-matching coordinate trigger has run this dialogue again without new story progress: "${dialogue}" Repeating that trigger is not progress. Use the place or action the game just named, or choose a different destination using observed evidence.`;

const DIRECTIONS = new Set(["UP", "DOWN", "LEFT", "RIGHT"]);
const OPPOSITE: Readonly<Record<string, string>> = { up: "down", down: "up", left: "right", right: "left" };
const interfaceOpen = (state: GameStateSnapshot): boolean =>
  state.active_ui != null || state.naming != null || (state.world_context?.dialogue ?? "") !== "" || state.world_context?.message != null;
const placeOf = (state: GameStateSnapshot): string | null =>
  state.started && state.map_id !== null && state.position !== null
    ? JSON.stringify([state.map_id, state.position.x, state.position.y]) : null;
const mapOf = (state: GameStateSnapshot | undefined): string | null =>
  state !== undefined && state.started && state.screen === "overworld" && !state.in_battle && state.map_id !== null
    ? JSON.stringify(state.map_id) : null;
const lastDirection = (buttons: unknown): string | null => {
  if (!Array.isArray(buttons)) return null;
  const directions = buttons.filter((button): button is string =>
    typeof button === "string" && button.toLowerCase() in OPPOSITE);
  return directions.length === 0 ? null : (directions[directions.length - 1] ?? "").toLowerCase();
};
const wayOut = (action: string | undefined): string => {
  const parsed: unknown = action === undefined ? null : JSON.parse(action);
  if (!Array.isArray(parsed) || parsed.length === 0) return action ?? "";
  return typeof parsed[0] === "string" ? JSON.stringify(parsed[0]) : `navigate_to ${JSON.stringify(parsed[0])}`;
};

interface TriggerSeen {
  readonly evidence: number[];
  readonly dialogue: string;
  readonly map: readonly [number, number];
  readonly variable: number;
  readonly required: number;
  readonly current: number;
}

interface FieldRecovery {
  readonly newPlace: boolean;
  readonly held: boolean;
  readonly escaped: boolean;
}

export class FieldRules {
  private readonly triggerScripts = new Map<string, TriggerSeen>();
  private activeTriggerScript: NonNullable<CompletedCall["triggerScript"]> | undefined;
  private readonly mapMoves: string[] = [];
  private lastMap: string | null = null;
  private progress: string | null = null;
  private trip: { anchor: string; place: string | null; actions: string[]; calls: number; left: boolean; scripted: boolean; dir: string | null } | null = null;
  private readonly pushbacks: { key: string; seq: number }[] = [];
  private readonly places: string[] = [];
  private readonly moves: { place: string; map: string; target: string; seq: number }[] = [];
  private readonly movesHeard = new Set<string>();

  constructor(
    private readonly policy: { readonly cycleRepeats: number },
    private readonly interactions: boolean,
    private readonly transitions: boolean,
    private readonly pushback: boolean,
    private readonly ineffectiveLoops: boolean,
    private readonly triggerScriptLoops: boolean,
  ) {}

  observeState(state: GameStateSnapshot, seq: number, pending: readonly PendingCall[]): void {
    if (this.pushback) this.tripState(state);
    const held = scriptHeld(state);
    if (this.triggerScriptLoops && state.map_id !== null) {
      for (const [key, seen] of this.triggerScripts) {
        if (seen.map[0] !== state.map_id[0] || seen.map[1] !== state.map_id[1]) continue;
        const live = (state.world_context?.triggers ?? []).find((trigger) =>
          trigger.variable === seen.variable && trigger.required_value === seen.required);
        if (live !== undefined && (live.current_value !== seen.current || live.condition_met !== true)) this.triggerScripts.delete(key);
      }
      const invalid = (seen: Pick<TriggerSeen, "map" | "variable" | "required" | "current">): boolean => {
        if (seen.map[0] !== state.map_id?.[0] || seen.map[1] !== state.map_id[1]) return true;
        const live = (state.world_context?.triggers ?? []).find((trigger) =>
          trigger.variable === seen.variable && trigger.required_value === seen.required);
        return live !== undefined && (live.current_value !== seen.current || live.condition_met !== true);
      };
      if (this.activeTriggerScript !== undefined && invalid(this.activeTriggerScript)) this.activeTriggerScript = undefined;
      for (const call of pending) if (call.triggerScript !== undefined && invalid(call.triggerScript)) delete call.triggerScript;
      if (held && this.activeTriggerScript !== undefined) for (const call of pending) call.triggerScript ??= this.activeTriggerScript;
    }
    if (this.triggerScriptLoops && !held) this.activeTriggerScript = undefined;
    if (this.triggerScriptLoops && state.map_id !== null && state.position !== null && held) {
      const position = state.position;
      const trigger = (state.world_context?.triggers ?? []).find((row) =>
        row.x === position.x && row.y === position.y && row.condition_met === true && row.current_value !== null);
      if (trigger !== undefined) for (const call of pending) {
        const start = call.start;
        const entered = call.pressed === true && start !== undefined && start.map_id !== null && start.position !== null &&
          start.map_id[0] === state.map_id[0] && start.map_id[1] === state.map_id[1] &&
          (start.position.x !== position.x || start.position.y !== position.y) && !scriptHeld(start);
        if (entered && call.triggerEntrySeen !== true) {
          const execution = {
            map: state.map_id,
            variable: trigger.variable,
            required: trigger.required_value,
            current: trigger.current_value ?? trigger.required_value,
            pointer: trigger.script_pointer,
            stateSeq: seq,
          };
          call.triggerEntrySeen = true;
          call.triggerScript = execution;
          this.activeTriggerScript = execution;
        }
      }
    }
  }

  startCall(name: string, latest: GameStateSnapshot | undefined): void {
    if (this.pushback && this.trip === null && name === "navigate_to" && latest !== undefined) this.seed(latest);
  }

  button(buttons: readonly string[], pending: PendingCall, started: boolean): void {
    if (started && this.pushback && this.trip === null && pending.navigation !== true && pending.start !== undefined) this.seed(pending.start);
    if (this.pushback && this.trip !== null) this.trip.dir = lastDirection(buttons) ?? this.trip.dir;
  }

  error(call: CompletedCall): void {
    if (this.pushback && call.isError && (call.name === "press" || call.name === "navigate_to" ||
      (call.name === "act" && call.args["kind"] === "press"))) this.trip = null;
  }

  milestone(): void {
    if (this.transitions) this.mapMoves.length = 0;
  }

  recovery(call: CompletedCall, game: boolean, episode: "pushback" | "revisit" | null): FieldRecovery {
    const place = (this.pushback || this.ineffectiveLoops) && game && call.state !== undefined ? placeOf(call.state) : null;
    const newPlace = place !== null && !this.places.includes(place);
    if (place !== null) {
      this.places.push(place);
      if (this.places.length > 16) this.places.shift();
    }
    const held = episode !== null && !newPlace;
    const escaped = episode !== null && newPlace;
    if (escaped) this.pushbacks.length = 0;
    return { newPlace, held, escaped };
  }

  novel(newPlace: boolean): void {
    if (!this.pushback || newPlace) this.pushbacks.length = 0;
  }

  pushbackHit(call: CompletedCall, seq: number): number[] | null {
    if (!this.pushback) return null;
    return this.pushedBack(call, seq);
  }

  revisitHit(call: CompletedCall, seq: number): number[] | null {
    return this.ineffectiveLoops ? this.revisit(call, seq) : null;
  }

  transitionHit(call: CompletedCall): boolean {
    return this.transitions && this.mapMove(call);
  }

  triggerHit(call: CompletedCall, seq: number): { readonly evidence: number[]; readonly dialogue: string } | null {
    if (!this.triggerScriptLoops || call.isError || call.triggerScript === undefined) return null;
    const dialogue = (call.spoken ?? call.dialogue ?? []).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join(" | ");
    if (dialogue === "") return null;
    this.activeTriggerScript = undefined;
    const trigger = call.triggerScript;
    const key = JSON.stringify([trigger.map, trigger.variable, trigger.required, trigger.current, dialogue]);
    const before = this.triggerScripts.get(key);
    const evidence = [...(before?.evidence ?? []), seq].slice(-2);
    this.triggerScripts.set(key, { evidence, dialogue, map: trigger.map, variable: trigger.variable, required: trigger.required, current: trigger.current });
    if (this.triggerScripts.size > 8) this.triggerScripts.delete(this.triggerScripts.keys().next().value ?? "");
    return evidence.length >= 2 ? { evidence, dialogue } : null;
  }

  passableCall(call: CompletedCall): boolean {
    return this.passable(call.state) && this.passable(call.beforeState);
  }

  resetCycles(): void {
    this.trip = null;
    this.pushbacks.length = 0;
    this.moves.length = 0;
    this.movesHeard.clear();
  }

  resetNativeProgress(pending: Iterable<PendingCall>): void {
    this.resetCycles();
    this.triggerScripts.clear();
    this.activeTriggerScript = undefined;
    for (const call of pending) delete call.triggerScript;
  }

  private tripState(state: GameStateSnapshot): void {
    if (this.trip === null) return;
    if (scriptHeld(state)) this.trip.scripted = true;
    const place = placeOf(state);
    if (place !== null && place !== this.trip.place) this.trip.left = true;
    if (this.trip.dir !== null && scriptHeld(state) && state.facing === OPPOSITE[this.trip.dir]) this.trip.left = true;
  }

  private settled(state: GameStateSnapshot | undefined): string | null {
    return state !== undefined && state.field_controls_locked === false && (state.world_context?.dialogue ?? "") === "" &&
      state.world_context?.message == null ? semanticState(state, this.interactions) : null;
  }

  private seed(state: GameStateSnapshot): void {
    const anchor = this.settled(state);
    if (anchor !== null) this.trip = { anchor, place: placeOf(state), actions: [], calls: 0, left: false, scripted: false, dir: null };
  }

  private pushedBack(call: CompletedCall, seq: number): number[] | null {
    const state = call.state;
    const settled = this.settled(state);
    if (call.name === "observe") {
      if (state !== undefined && settled !== null && settled !== this.trip?.anchor) this.seed(state);
      else if (this.trip !== null && ++this.trip.calls > 8) this.trip = null;
      return null;
    }
    const start = call.startState ?? call.beforeState;
    if (this.trip === null && start !== undefined) this.seed(start);
    const trip = this.trip;
    if (trip !== null) {
      const asked = call.requested ?? call.args;
      trip.actions.push(JSON.stringify(call.name === "navigate_to" ? [asked["map_id"], asked["x"], asked["y"]] : asked["buttons"] ?? null));
      trip.dir = lastDirection(asked["buttons"]) ?? trip.dir;
      trip.calls++;
      if (call.beforeState !== undefined) this.tripState(call.beforeState);
    }
    if (state === undefined || settled === null) {
      if (trip !== null && trip.calls > 8) this.trip = null;
      return null;
    }
    this.seed(state);
    if (trip === null || trip.anchor !== settled || !trip.left || !trip.scripted) return null;
    const key = `${settled}:${wayOut(trip.actions[0])}`;
    this.pushbacks.push({ key, seq });
    if (this.pushbacks.length > 12) this.pushbacks.shift();
    const same = this.pushbacks.filter((row) => row.key === key);
    return same.length >= this.policy.cycleRepeats ? same.map((row) => row.seq) : null;
  }

  private revisit(call: CompletedCall, seq: number): number[] | null {
    const state = call.state;
    if (state === undefined) return null;
    const said = call.dialogue ?? [];
    if (state.in_battle || state.active_ui != null || state.naming != null || said.some((text) => !this.movesHeard.has(text))) {
      this.moves.length = 0;
      this.movesHeard.clear();
      for (const text of said) this.movesHeard.add(text);
      return null;
    }
    const asked = call.requested ?? call.args;
    const buttons = asked["buttons"];
    const target = call.name === "navigate_to" ? JSON.stringify([asked["map_id"], asked["x"], asked["y"]])
      : call.name === "press" && Array.isArray(buttons) && buttons.some((button: unknown) =>
        typeof button === "string" && DIRECTIONS.has(button.toUpperCase())) ? JSON.stringify(buttons) : null;
    const start = call.startState ?? call.beforeState;
    const place = placeOf(state);
    const map = JSON.stringify(state.map_id);
    if (place !== null && this.moves.length > 0 && this.moves[this.moves.length - 1]?.map !== map) {
      this.moves.length = 0;
      this.movesHeard.clear();
    }
    if (target === null || place === null || state.screen !== "overworld" || said.length > 0 || interfaceOpen(state) ||
      start === undefined || start.field_controls_locked !== false || interfaceOpen(start)) return null;
    this.moves.push({ place, map, target, seq });
    if (this.moves.length > 12) this.moves.shift();
    const ends = this.moves.filter((move) => move.place === place).slice(-this.policy.cycleRepeats);
    if (ends.length < this.policy.cycleRepeats) return null;
    const loop = this.moves.slice(this.moves.indexOf(ends[0] ?? this.moves[0] ?? { place, map, target, seq }));
    const targets = loop.map((move) => move.target);
    const alternates = targets.some((targetValue, index) => targets.some((candidate, later) =>
      later > index && candidate === targetValue && targets.slice(index + 1, later).some((middle) => middle !== targetValue)));
    return new Set(loop.map((move) => move.place)).size <= 2 && alternates ? ends.map((move) => move.seq) : null;
  }

  private passable(state: GameStateSnapshot | undefined): boolean {
    return state !== undefined && (semanticState(state, this.interactions) !== null || transientLock(state));
  }

  private mapMove(call: CompletedCall): boolean {
    const state = call.state;
    const to = mapOf(state);
    if (state === undefined || to === null) return false;
    const progress = stable({ story: state.story ?? null, party: legacyParty(state.party), money: state.money, badges: state.badges, bag: state.resources?.bag ?? null, pc: state.resources?.pc_items ?? null });
    if (progress !== this.progress) {
      this.mapMoves.length = 0;
      this.progress = progress;
    }
    if (!this.passable(state) || (call.beforeState !== undefined && !this.passable(call.beforeState))) {
      this.mapMoves.length = 0;
      this.lastMap = null;
      return false;
    }
    const before = mapOf(call.beforeState);
    const stops = [this.lastMap, before, to].filter((map): map is string => map !== null);
    this.lastMap = to;
    let moved = false;
    for (let index = 1; index < stops.length; index++) {
      if (stops[index] === stops[index - 1]) continue;
      this.mapMoves.push(`${stops[index - 1] ?? ""}>${stops[index] ?? ""}`);
      if (this.mapMoves.length > 12) this.mapMoves.shift();
      moved = true;
    }
    return moved && repeatingPattern(this.mapMoves, this.policy.cycleRepeats);
  }
}

export const fieldRule = (id: LoopRuleId, kind: LoopKind, enabled = true): LoopRule => ({
  id,
  kind,
  check: (_call: CompletedCall, context: RuleContext): LoopHit | null => enabled ? context.candidates?.get(id) ?? null : null,
  reset: () => undefined,
});

export const repeatingPattern = (items: readonly string[], repeats: number): boolean => {
  for (let size = 2; size <= 4; size++) {
    const length = size * repeats;
    if (items.length < length) continue;
    const tail = items.slice(-length);
    if (new Set(tail.slice(0, size)).size < 2) continue;
    if (tail.every((item, index) => item === tail[index % size])) return true;
  }
  return false;
};
