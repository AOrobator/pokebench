import type { RunEvent } from "./events.js";
import { MEASUREMENT_ONLY_MILESTONES, MILESTONES } from "./milestones.js";
import type { GameStateSnapshot } from "./game-state.js";

// Story progress that resets the guard; measurement-only splits never change guard behavior.
export const NATIVE_PROGRESS_MILESTONES = MILESTONES.filter((m) => m.kind === "story" && !MEASUREMENT_ONLY_MILESTONES.has(m.name));

export const LOOP_POLICY = {
  planning: 6,
  observation: 3,
  ineffective: 3,
  cycleRepeats: 3,
  rejection: 2,
  recovery: 6,
} as const;
export type LoopKind =
  | "planning"
  | "observation"
  | "ineffective"
  | "cycle"
  | "rejection"
  | "trigger_script";
// stall-briefing-v1: stalls the loop checks above do not see.
export type StallKind = "map_cycle" | "milestone_drought" | "interface_dwell" | "same_plan";
export type LoopMode = "enforced" | "diagnostic";
export function readLoopMode(env: NodeJS.ProcessEnv = process.env): LoopMode {
  const flag = env["POKEBENCH_LOOP_GUARD"];
  if (flag !== undefined && flag !== "0" && flag !== "1")
    throw new Error("POKEBENCH_LOOP_GUARD must be 0 or 1");
  return flag === "0" ? "diagnostic" : "enforced";
}
interface NoticeFields {
  readonly kind: LoopKind | StallKind;
  readonly message: string;
  readonly calls: number;
  readonly evidence: readonly number[];
}
export type LoopNotice = NoticeFields &
  (
    | {
        readonly mode: "enforced";
        readonly phase: "warning" | "recovered" | "stop" | "supervisor";
      }
    | {
        readonly mode: "diagnostic";
        readonly phase: "would_warn" | "would_recover" | "would_stop";
      }
  );
export interface CompletedCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly isError: boolean;
  readonly text: string;
  readonly state?: GameStateSnapshot | undefined;
  readonly beforeState?: GameStateSnapshot | undefined;
  readonly acted?: boolean | undefined;
  readonly seq?: number;
  // The tool call's own arguments, before any recorded press replaced its buttons (auto-advance's B presses).
  readonly requested?: Record<string, unknown> | undefined;
  // The state the call's first input started from (later presses of the same call, such as auto-advance's B,
  // replace beforeState but not this).
  readonly startState?: GameStateSnapshot | undefined;
  // ineffective-loops-v1: the dialogue texts (or message identities) shown in states recorded during the call.
  readonly dialogue?: readonly string[] | undefined;
  // reopened-dialogue-loop-v1: readable dialogue shown during the call. Empty means none; absent means the caller supplied dialogue instead.
  readonly spoken?: readonly string[] | undefined;
  readonly triggerScript?: {readonly map:readonly [number,number];readonly variable:number;readonly required:number;readonly current:number;readonly pointer:number;readonly stateSeq:number}|undefined;
}
export type LoopPolicy = { readonly [K in keyof typeof LOOP_POLICY]: number };

function pressAskedForA(call: CompletedCall): boolean {
  const source = call.requested ?? call.args;
  const buttons = source["buttons"];
  return Array.isArray(buttons) && buttons.some((button) => button === "A");
}
const PLANNING = new Set([
  "get_objectives",
  "set_objective",
  "update_objective",
]);
const MESSAGES: Record<LoopKind, string> = {
  planning:
    "Repeated objective calls without game interaction. Writing a next_decision does not execute buttons. Observe if uncertain, then use press when ready.",
  observation:
    "Repeated observations contain no new reliable game information. Reassess whether an interaction is needed; unchanged observations are not recovery.",
  ineffective:
    "Repeated equivalent single-button attempts produced equivalent states. Reassess the observed interface and try an evidence-supported alternative.",
  cycle:
    "A short state/action pattern is repeating without new game information. Reassess the objective and change the approach using observed evidence.",
  rejection:
    "The same tool rejection recurred after correction. Fix the reported argument or evidence problem before trying again.",
  trigger_script:
    "The same condition-matching coordinate trigger has run the same dialogue again without new story progress.",
};

// Only surfaces with observable interaction state can establish equivalence.
// Unknown menus, battle phases and unqualified locked fields withhold equivalence.
// The active UI owner supplies qualified name/gender/clock phase data.
export function semanticState(state: GameStateSnapshot, interactions = false): string | null {
  if (state.in_battle) return null;
  const ui = state.active_ui;
  if (state.screen === "naming" && state.naming?.ready === true) {
    const naming = state.naming;
    // A qualified owner must agree with the cursor readout. Unknown or
    // contradictory owners must never become evidence of equivalence.
    if (ui != null && (
      ui.diagnostic !== null || ui.ready !== true || ui.phase !== "naming_editor" ||
      ui.selected !== naming.key || ui.value !== naming.text ||
      ui.details?.["page"] !== naming.page ||
      ui.details["column"] !== naming.column || ui.details["row"] !== naming.row
    )) return null;
    return stable({screen:state.screen,naming,owner:ui?.details ?? null});
  }
  if (ui != null) {
    if (ui.diagnostic !== null || ui.ready !== true) return null;
    const selected =
      ui.phase === "gender_selection"
        ? ["BOY", "GIRL"]
        : ["name_confirmation", "clock_confirmation"].includes(ui.phase)
          ? ["YES", "NO"]
          : [];
    const clockValue =
      ui.value != null &&
      /^(?:[1-9]|1[0-2]):[0-5][0-9] (?:AM|PM)$/.test(ui.value);
    const validChoice =
      ui.selected !== null &&
      selected.includes(ui.selected) &&
      (ui.phase !== "clock_confirmation" || clockValue);
    const validClock =
      ui.phase === "clock_adjustment" && ui.selected === null && clockValue;
    if (validChoice || validClock)
      return stable({
        phase: ui.phase,
        selected: ui.selected,
        ready: ui.ready,
        value: ui.phase.startsWith("clock_") ? ui.value : null,
      });
    return null;
  }
  const message = state.world_context?.message;
  const qualifiedMessage = interactions && Boolean(state.world_context?.dialogue || message?.identity) && message?.ready === true && ["dismiss_wait", "button_wait", "page_wait", "scroll_wait"].includes(message.phase);
  if (
    state.screen !== "overworld" ||
    !state.started ||
    state.map_id === null ||
    state.position === null ||
    state.facing === null ||
    (state.field_controls_locked !== false && !(state.field_controls_locked === true && qualifiedMessage))
  )
    return null;
  return stable({
    screen: state.screen,
    map: state.map_id,
    position: state.position,
    facing: state.facing,
    name: state.name,
    party: state.party,
    money: state.money,
    badges: state.badges,
    story: state.story ?? null,
    dialogue: state.world_context?.dialogue ?? null,
    ...(interactions ? {message:state.world_context?.message ?? null,locked:state.field_controls_locked} : {}),
  });
}

// battle-observation-loop-v1: the decoded battle as the model can observe it. Any changed field (script pointer,
// controller flags, HP, turn, inputs, signals, execution, menu, message) means the battle moved on. Unknown when
// the battle decoder reports a diagnostic or there is no battle readout.
export function battleState(state: GameStateSnapshot): string | null {
  const battle = state.battle;
  if (!state.in_battle || battle == null || battle.diagnostic !== null) return null;
  return stable({ battle, ui: state.active_ui ?? null, party: state.party, message: state.world_context?.message ?? null, dialogue: state.world_context?.dialogue ?? null });
}

// transition-loop-detection-v1: field controls locked by something other than a script or message,
// such as the door, stairs or warp animation. The game's global script context is stopped
// (SCRIPT_MODE_STOPPED, CONTEXT_SHUTDOWN in pokeemerald src/script.c); unknown script state is not transient.
export function transientLock(state: GameStateSnapshot): boolean {
  const script = state.resources;
  return state.screen === "overworld" && state.started && !state.in_battle && state.map_id !== null &&
    state.position !== null && state.facing !== null && state.field_controls_locked === true &&
    state.active_ui == null && (state.world_context?.dialogue ?? "") === "" && state.world_context?.message == null &&
    script != null && script.script_mode === 0 && script.script_status === 2;
}

// pushback-loop-detection-v1: field controls held by a message or by a running script, with no menu or other
// interface owning the lock. The game's global script context is running when its mode is bytecode or native
// (1 or 2) and its status is CONTEXT_RUNNING (0) or CONTEXT_WAITING (1), as in pokeemerald src/script.c; any other
// or missing value is unknown. A start menu, a door
// animation or an unknown lock is not a script.
export function scriptHeld(state: GameStateSnapshot): boolean {
  if (state.field_controls_locked !== true || state.active_ui != null || state.naming != null) return false;
  if ((state.world_context?.dialogue ?? "") !== "" || state.world_context?.message != null) return true;
  const script = state.resources;
  return script != null && (script.script_mode === 1 || script.script_mode === 2) && (script.script_status === 0 || script.script_status === 1);
}

// ineffective-loops-v1: outside battle, the game waiting for the player's input on an interface the field
// fingerprint cannot see: a ready menu or prompt (no diagnostic), a ready naming screen, or a locked field holding
// a message that waits for a button. Null while the game acts (scripts, transitions, the truck ride, printing text),
// in battle (battle-observation-loop-v1's surface) and on the free field (semanticState's).
const MESSAGE_WAITS = ["dismiss_wait", "button_wait", "page_wait", "scroll_wait"];
export function waitingState(state: GameStateSnapshot): string | null {
  if (state.in_battle || state.screen === "battle") return null;
  const ui = state.active_ui;
  const message = state.world_context?.message;
  const dialogue = state.world_context?.dialogue ?? null;
  const waiting =
    ui != null ? ui.ready === true && ui.diagnostic === null
      : state.screen === "naming" || state.naming != null ? state.naming?.ready === true
        : state.screen === "overworld" && state.started && state.field_controls_locked === true &&
          message?.ready === true && MESSAGE_WAITS.includes(message.phase) && Boolean(dialogue || message.identity);
  if (!waiting) return null;
  return stable({ screen: state.screen, started: state.started, map: state.map_id, position: state.position, facing: state.facing, locked: state.field_controls_locked, ui: ui ?? null, naming: state.naming ?? null, dialogue, message: message ?? null, name: state.name, party: state.party, money: state.money, badges: state.badges, story: state.story ?? null });
}
export const WAITING_MESSAGE =
  "Repeated observations show the same open menu, prompt or message waiting for your input: observing again does not change it. Decide from what the game shows which input it needs, or choose a different approach using observed evidence.";
export const REVISIT_MESSAGE =
  "Your recent moves name different targets but keep ending on the same one or two tiles, with no new map, tile or story milestone in between: switching between these few targets is not getting anywhere. Reassess what stops you there using observed evidence, then choose a different route or destination.";
// battle-menu-loop-v1. pokeemerald src/battle_message.c gText_BattleMenu is "FIGHT BAG / POKéMON RUN".
// src/battle_controller_player.c HandleInputChooseAction: cursor 0 is top-left FIGHT (B_ACTION_USE_MOVE), 1 is top-right
// BAG, 2 is bottom-left POKéMON (B_ACTION_SWITCH), 3 is bottom-right RUN. DPAD_LEFT moves only when cursor & 1
// (BAG or RUN), so LEFT from POKéMON does not move. DPAD_UP moves only when cursor & 2 (POKéMON or RUN). A on
// cursor 0 emits B_ACTION_USE_MOVE. The fourth return matches battle-observation-loop-v1's fourth identical observe.
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
  // A missing turn or battler list is not "the same battle". Collapse those to no stamp, not to an empty key.
  if (battle == null || battle.turn == null || battlers == null || battlers.length === 0) return null;
  return `${String(battle.turn)}:${battlers.map((b) => `${String(b.battler)}:${b.species}:${String(b.hp)}`).join(",")}`;
};
const actionMenuKey = (state: GameStateSnapshot): string | null => {
  const battle = state.battle;
  const stamp = battleStamp(state);
  if (!state.in_battle || state.screen !== "battle" || battle == null || battle.diagnostic !== null || stamp === null) return null;
  const input = battle.player_inputs?.find((row) => row.ready && row.phase === "action" && row.action_cursor !== null);
  if (input === undefined) return null;
  return `${stamp}:${String(input.action_cursor)}:${input.selected ?? ""}`;
};
const DIRECTIONS = new Set(["UP", "DOWN", "LEFT", "RIGHT"]);
const interfaceOpen = (state: GameStateSnapshot): boolean =>
  state.active_ui != null || state.naming != null || (state.world_context?.dialogue ?? "") !== "" || state.world_context?.message != null;

const OPPOSITE: Readonly<Record<string, string>> = { up: "down", down: "up", left: "right", right: "left" };
const lastDirection = (buttons: unknown): string | null => {
  if (!Array.isArray(buttons)) return null;
  const dirs = buttons.filter((b): b is string => typeof b === "string" && b.toLowerCase() in OPPOSITE);
  return dirs.length === 0 ? null : (dirs[dirs.length - 1] ?? "").toLowerCase();
};
const wayOut = (action: string | undefined): string => {
  const parsed: unknown = action === undefined ? null : JSON.parse(action);
  if (!Array.isArray(parsed) || parsed.length === 0) return action ?? "";
  // A button batch leaves by its first button; navigate_to ([map, x, y]) by its target map, whichever tile it named.
  return typeof parsed[0] === "string" ? JSON.stringify(parsed[0]) : `navigate_to ${JSON.stringify(parsed[0])}`;
};

export const PUSHBACK_MESSAGE =
  "A game script keeps returning the player to the same place after the same input: each attempt ends back where it started, so repeating it will not get past the script. Read what the script's dialogue says, then choose a different target or approach using observed evidence.";
export const TRIGGER_SCRIPT_MESSAGE=(dialogue:string)=>`The same condition-matching coordinate trigger has run this dialogue again without new story progress: "${dialogue}" Repeating that trigger is not progress. Use the place or action the game just named, or choose a different destination using observed evidence.`;
const placeOf = (state: GameStateSnapshot): string | null =>
  state.started && state.map_id !== null && state.position !== null ? JSON.stringify([state.map_id, state.position.x, state.position.y]) : null;

const TRANSITION_MESSAGE =
  "Moving back and forth between the same maps is repeating with no new story, party, money, badge or item change. Reassess the objective and choose a different exit or target using observed evidence.";

function mapOf(state: GameStateSnapshot | undefined): string | null {
  return state !== undefined && state.started && state.screen === "overworld" && !state.in_battle && state.map_id !== null
    ? JSON.stringify(state.map_id) : null;
}

// The newest entries repeat a 2-4 entry pattern `repeats` times.
function repeating(items: readonly string[], repeats: number): boolean {
  for (let size = 2; size <= 4; size++) {
    const length = size * repeats;
    if (items.length < length) continue;
    const tail = items.slice(-length);
    if (new Set(tail.slice(0, size)).size < 2) continue;
    if (tail.every((item, i) => item === tail[i % size])) return true;
  }
  return false;
}

function stable(value: unknown): string {
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

function rejectionKey(call: CompletedCall): string | null {
  if (
    !call.isError ||
    /HTTP\s+\d|fetch failed|ECONN|timed? ?out|queue|aborted|network|malformed \/pokebench|observation frame|Game tool did not return|POST .+ failed/i.test(
      call.text,
    )
  )
    return null;
  // Evidence sequence numbers are volatile; actual expected/observed values stay.
  return `${call.name}:${call.text.replace(/(?:state\s*)?#\d+|state(?: sequence)?\s+\d+/gi, "state#").slice(0, 2000)}`;
}

function clockLookPlace(state: GameStateSnapshot): string | null {
  // The opening transition while the clock is being set uses the same phase. Only a set clock counts.
  if (state.screen !== "clock" || state.story?.clock_set !== true) return null;
  const phase = state.active_ui?.phase;
  if (phase !== "clock_transition" && phase !== "clock_view") return null;
  if (state.map_id === null || state.position === null) return null;
  // The minute ticks during the transition, and turning does not leave the tile.
  return JSON.stringify([state.location, state.map_id, state.position]);
}

export class LoopDetector {
  stopped = false;
  private planning = 0;
  private observations = 0;
  private ineffective = { key: "", count: 0 };
  // clock-view-loop-v1: looks at the set wall clock (the minute ticks, so it is not part of the place).
  private clockLooks = { place: "", count: 0 };
  // reopened-dialogue-loop-v1: the same lines shown and then closed, at one place. The first showing is count 0.
  private closedTalk = { text: "", place: "", count: 0 };
  // trigger-script-loop-v1: executions since native progress, grouped by live condition and shown dialogue.
  // Adjacent rows can use different wrapper script pointers for the same gate.
  private readonly triggerScripts=new Map<string,{readonly evidence:number[];readonly dialogue:string}>();
  private readonly rejections = new Map<string, number>();
  private previous: string | null = null;
  private readonly history: string[] = [];
  // transition-loop-detection-v1: map changes since the last progress, and that progress.
  private readonly mapMoves: string[] = [];
  private lastMap: string | null = null;
  private progress: string | null = null;
  private readonly messageVisits: string[] = [];
  // pushback-loop-detection-v1: the last settled result, the model's inputs since it, whether the player left its
  // tile and whether a script or message held the controls since; and the recent push-backs.
  private trip: { anchor: string; place: string | null; actions: string[]; calls: number; left: boolean; scripted: boolean; dir: string | null } | null = null;
  private readonly pushbacks: { key: string; seq: number }[] = [];
  // The places (map and tile) of recent game call results: a push-back episode recovers only somewhere new.
  private readonly places: string[] = [];
  // battle-observation-loop-v1: the previous game call's battle readout and the recent ones.
  private previousBattle: string | null = null;
  private readonly battlesSeen: string[] = [];
  // ineffective-loops-v1: the previous game call's waiting-interface fingerprint and the recent ones; the moves
  // (navigate_to, or a press with a direction) since the last map change, battle or story milestone.
  private previousWaiting: string | null = null;
  private readonly waitingSeen: string[] = [];
  private readonly moves: { place: string; map: string; target: string; seq: number }[] = [];
  private readonly movesHeard = new Set<string>();
  // The same conversation reopened in the same place: closed then shown again, or its print cursor jumping back.
  private readonly conversation = { text: "", place: "", cursor: null as number | null, open: false, restarts: 0 };
  private readonly visited: string[] = [];
  private completed = 0;
  private episode: {
    kind: LoopKind;
    message: string;
    exposed: boolean;
    recovery: number;
    threshold: boolean;
    evidence: number[];
    window: number;
    briefing: string | null;
    pushback: boolean;
    revisit: boolean;
    menu: boolean;
  } | null = null;
  // battle-menu-loop-v1: the battle-menu choice last ready, whether the POKéMON or BAG screen has opened since,
  // the returns to that choice, and foe/party HP plus the battle turn (a change clears the count).
  private menuAnchor: string | null = null;
  private menuDetour = false;
  private readonly menuReturns: { key: string; seq: number }[] = [];
  private menuStamp: string | null = null;
  private stallNote: { text: string; exposed: boolean } | null = null;
  private run: string | null = null;
  private eventSeq = -1;
  private nativeState: GameStateSnapshot | undefined;
  private readonly nativeValues = new Map<string, boolean | null>();
  private readonly achieved = new Set<string>();
  private latest: GameStateSnapshot | undefined;
  private latestSeq = -1;
  private readonly calls = new Map<
    string,
    {
      args: Record<string, unknown>;
      requested: Record<string, unknown>;
      start?: GameStateSnapshot | undefined;
      seq: number;
      before?: GameStateSnapshot | undefined;
      beforeSeq?: number | undefined;
      navigation?: boolean;
      pressed?: boolean;
      dialogue?: string[];
      // reopened-dialogue-loop-v1: readable dialogue only. A message identity is not a line.
      spoken?: string[];
      triggerScript?: {map:readonly [number,number];variable:number;required:number;current:number;pointer:number;stateSeq:number};
    }
  >();

  constructor(
    private readonly notify: (notice: LoopNotice) => void,
    private readonly policy: LoopPolicy = LOOP_POLICY,
    readonly mode: LoopMode = "enforced",
    private readonly interactions = false,
    private readonly supervisor?: (kind: LoopKind, calls: number) => string,
    private readonly transitions = false,
    private readonly pushback = false,
    private readonly battles = false,
    // navigation-truth-v1: the interaction warning mentions a reopened message only when one reopened.
    private readonly messageTruth = false,
    private readonly ineffectiveLoops = false,
    private readonly menuLoop = false,
    // clock-view-loop-v1: a press whose result is the clock transition or the clock view.
    private readonly clockViews = false,
    // reopened-dialogue-loop-v1: lines shown during a call whose result has already closed them.
    private readonly closedDialogue = false,
    private readonly triggerScriptLoops = false,
  ) {}

  observe(event: RunEvent): void {
    this.run ??= event.run;
    if (event.run !== this.run || event.seq <= this.eventSeq) return;
    this.eventSeq = event.seq;
    if (event.type === "turn_start" && this.episode !== null)
      this.episode.exposed = true;
    if (this.transitions && event.type === "milestone" && event.origin !== "present_at_start" && event.name !== "GAME_RUNNING" && !MEASUREMENT_ONLY_MILESTONES.has(event.name))
      this.mapMoves.length = 0;
    if (event.type === "state") {
      this.latestSeq = event.seq;
      if ("started" in event) {
        if (this.pushback) this.tripState(event);
        if (this.menuLoop) this.noteMenuScreen(event, event.seq);
        if (this.ineffectiveLoops) {
          const said = (event.world_context?.dialogue || event.world_context?.message?.identity) ?? "";
          if (said !== "")
            for (const pending of this.calls.values()) if (!(pending.dialogue ??= []).includes(said)) pending.dialogue.push(said);
        }
        if (this.closedDialogue||this.triggerScriptLoops) {
          const line = event.world_context?.dialogue ?? "";
          for (const pending of this.calls.values()) {
            pending.spoken ??= [];
            if (line !== "" && !pending.spoken.includes(line)) pending.spoken.push(line);
          }
        }
        if(this.triggerScriptLoops&&event.map_id!==null&&event.position!==null&&scriptHeld(event)){
          const position=event.position;
          const trigger=(event.world_context?.triggers??[]).find(t=>t.x===position.x&&t.y===position.y&&t.condition_met===true&&t.current_value!==null);
          if(trigger!==undefined)for(const pending of this.calls.values())pending.triggerScript={map:event.map_id,variable:trigger.variable,required:trigger.required_value,current:trigger.current_value??trigger.required_value,pointer:trigger.script_pointer,stateSeq:event.seq};
        }
        this.nativeProgress(event, event.seq);
        this.latest = event;
      } else {
        this.latest = undefined;
        this.nativeValues.clear();
        this.nativeState = undefined;
      }
    } else if (event.type === "telemetry_error" && event.source === "state")
      this.latest = undefined;
    else if (event.type === "tool_call") {
      const args = typeof event.args==="object"&&event.args!==null&&!Array.isArray(event.args)?event.args as Record<string,unknown>:{};
      this.calls.set(event.id, { args, requested: args, seq: event.seq, ...(event.name === "navigate_to" ? {navigation:true,before:this.latest,beforeSeq:this.latestSeq} : {}) });
      // pushback-loop-detection-v1: with no trip under way, the state a call starts from can start one.
      if (this.pushback && this.trip === null && event.name === "navigate_to" && this.latest !== undefined) this.seed(this.latest);
    } else if (event.type === "button_press") {
      const pending = this.calls.get(event.tool_call_id);
      if (pending !== undefined && (!pending.navigation || !pending.pressed)) {
        if (pending.pressed !== true) {
          pending.start = event.before_state_seq === this.latestSeq ? this.latest : undefined;
          if (this.pushback && this.trip === null && !pending.navigation && pending.start !== undefined) this.seed(pending.start);
        }
        if (this.pushback && this.trip !== null) this.trip.dir = lastDirection(event.buttons) ?? this.trip.dir;
        pending.pressed = true;
        if (!pending.navigation && this.interactions) pending.args = {...pending.args, buttons: event.buttons};
        pending.before =
          event.before_state_seq === this.latestSeq ? this.latest : undefined;
        pending.beforeSeq = event.before_state_seq;
      }
    } else if (event.type === "tool_result") {
      const pending = this.calls.get(event.id);
      this.calls.delete(event.id);
      const name=event.name==="act"&&!event.is_error?(pending?.args["kind"]==="press"?"press":pending?.args["kind"]==="wait"?"observe":event.name):event.name;
      this.complete({
        name,
        args: pending?.args ?? {},
        requested: pending?.requested,
        startState: pending?.navigation === true ? pending.before : pending?.start,
        dialogue: pending?.dialogue,
        spoken: pending?.spoken,
        triggerScript:pending?.triggerScript,
        isError: event.is_error,
        text: event.text,
        seq: event.seq,
        beforeState: pending?.before,
        acted: pending?.pressed===true,
        state:
          pending !== undefined &&
          this.latestSeq >
            ((name === "press" || name === "navigate_to")
              ? (pending.beforeSeq ?? Infinity)
              : pending.seq) &&
          (name === "press" || name === "navigate_to" || name === "observe")
            ? this.latest
            : undefined,
      });
    }
  }

  context(): string | null {
    if (this.mode === "diagnostic") return null;
    if (this.episode === null) {
      if (this.stallNote === null) return null;
      this.stallNote.exposed = true;
      return this.stallNote.text;
    }
    this.episode.exposed = true;
    const guard = this.episode.briefing !== null
      ? this.episode.briefing
      : `LOOP GUARD (${this.episode.kind}): ${this.episode.message} Recovery is bounded; objective wording and new evidence IDs alone do not establish progress.`;
    return this.episode.menu && this.episode.briefing !== null && !guard.includes(BATTLE_MENU_LOOP_MESSAGE)
      ? `${guard}\n${BATTLE_MENU_LOOP_MESSAGE}`
      : guard;
  }

  // clock-view-loop-v1: a press whose result is the set clock's transition or view. Closing the clock
  // returns to the same tile and must not clear the count. Any result on a different tile does,
  // including navigate_to. Turning on the tile does not.
  private noteClockLook(game: boolean, call: CompletedCall): boolean {
    if (!this.clockViews || !game || call.state === undefined) return false;
    if (call.name === "press") {
      const look = clockLookPlace(call.state);
      if (look !== null) {
        this.clockLooks = look === this.clockLooks.place ? { place: look, count: this.clockLooks.count + 1 } : { place: look, count: 1 };
        return this.clockLooks.count >= this.policy.ineffective;
      }
    }
    if (call.state.screen === "overworld" && call.state.map_id !== null && call.state.position !== null) {
      const place = JSON.stringify([call.state.location, call.state.map_id, call.state.position]);
      if (place !== this.clockLooks.place) this.clockLooks = { place: "", count: 0 };
    }
    return false;
  }

  // reopened-dialogue-loop-v1: the press printed lines and auto-advance closed them before the result,
  // so the result is the free field (run 2026-10-18T01-30-48_qwen36-gpu0_e6ce, the truck box, turns 52–109).
  // restartedConversation only sees dialogue still on the result. The fourth showing of the same lines
  // at the same tile warns. A different line, or the same lines after leaving that tile, starts over.
  private noteClosedDialogue(game: boolean, call: CompletedCall): boolean {
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
    // No dialogue left on the result. A locked menu, a ready interface, a battle, or a message that is still up is not the free field.
    const messageUp = call.state.world_context.message?.ready === true;
    if (call.state.in_battle || call.state.field_controls_locked !== false || call.state.active_ui?.ready === true || messageUp) { leftTile(); return false; }
    const text = (call.spoken ?? call.dialogue ?? []).filter((line) => line !== "").join("\n");
    if (text === "" || call.name !== "press" || !pressAskedForA(call)) {
      if (place !== this.closedTalk.place) this.closedTalk = { text: "", place: "", count: 0 };
      return false;
    }
    this.closedTalk = text === this.closedTalk.text && place === this.closedTalk.place
      ? { text, place, count: this.closedTalk.count + 1 }
      : { text, place, count: 0 };
    return this.closedTalk.count >= this.policy.ineffective;
  }

  private restartedConversation(state: GameStateSnapshot | undefined, before: GameStateSnapshot | undefined): boolean {
    if (state === undefined || state.screen !== "overworld") return false;
    const c = this.conversation;
    const placeOf = (s: GameStateSnapshot): string => JSON.stringify([s.location, s.map_id, s.position]);
    const place = placeOf(state);
    const text = state.world_context?.dialogue ?? null;
    const cursor = state.world_context?.message?.cursor ?? null;
    if (text === null || text === "") {
      c.open = false;
      c.cursor = null;
      if (place !== c.place) Object.assign(c, { text: "", place, restarts: 0 });
      return false;
    }
    // The press itself printed the text again: the pre-press snapshot showed it further along in the same place.
    const was = before?.world_context?.message?.cursor ?? null;
    const reprinted = before !== undefined && before.world_context?.dialogue === text && placeOf(before) === place && cursor !== null && was !== null && cursor < was;
    if (text === c.text && place === c.place) {
      if (!c.open || (cursor !== null && c.cursor !== null && cursor < c.cursor) || reprinted) c.restarts++;
    } else Object.assign(c, { text, place, restarts: 0 });
    c.open = true;
    c.cursor = cursor;
    return c.restarts >= this.policy.ineffective;
  }

  private noteTriggerScript(call:CompletedCall,seq:number):{readonly evidence:number[];readonly dialogue:string}|null{
    if(!this.triggerScriptLoops||call.isError||call.triggerScript===undefined)return null;
    const dialogue=(call.spoken??call.dialogue??[]).map(line=>line.replace(/\s+/g," ").trim()).filter(Boolean).join(" | ");
    if(dialogue==="")return null;
    const t=call.triggerScript;
    const key=JSON.stringify([t.map,t.variable,t.required,t.current,dialogue]);
    const before=this.triggerScripts.get(key);
    const evidence=[...(before?.evidence??[]),seq].slice(-2);
    this.triggerScripts.set(key,{evidence,dialogue});
    if(this.triggerScripts.size>8)this.triggerScripts.delete(this.triggerScripts.keys().next().value??"");
    return evidence.length>=2?{evidence,dialogue}:null;
  }

  complete(call: CompletedCall): void {
    if (this.stopped) return;
    this.completed++;
    if (this.stallNote?.exposed === true) this.stallNote = null;
    const seq = call.seq ?? this.completed;
    const rejection = rejectionKey(call);
    // pushback-loop-detection-v1: what an errored press or navigate_to did is unknown, so the trip ends.
    // State-only mode's `act` tool presses too; an errored result keeps its outer name.
    if (this.pushback && call.isError && (call.name === "press" || call.name === "navigate_to" || (call.name === "act" && call.args["kind"] === "press"))) this.trip = null;
    if (call.isError && rejection === null) return;
    if (this.episode?.exposed) this.episode.recovery++;
    const fingerprint =
      call.state === undefined ? null : semanticState(call.state, this.interactions);
    const game =
      !call.isError && (call.name === "press" || call.name === "navigate_to" || call.name === "observe");
    const changed =
      game && fingerprint !== null && fingerprint !== this.previous;
    const battle = this.battles && game && call.state !== undefined ? battleState(call.state) : null;
    const waiting = this.ineffectiveLoops && game && call.state !== undefined ? waitingState(call.state) : null;
    const novel = (changed && !this.visited.includes(fingerprint)) || (battle !== null && battle !== this.previousBattle && !this.battlesSeen.includes(battle)) ||
      (waiting !== null && waiting !== this.previousWaiting && !this.waitingSeen.includes(waiting));
    // pushback-loop-detection-v1: a new state on a tile already seen (a menu, a turn, one other button) is not
    // a way out of a push-back; only a new map or tile, or a story milestone, is.
    const place = (this.pushback || this.ineffectiveLoops) && game && call.state !== undefined ? placeOf(call.state) : null;
    const newPlace = place !== null && !this.places.includes(place);
    if (place !== null) {
      this.places.push(place);
      if (this.places.length > 16) this.places.shift();
    }
    // ineffective-loops-v1: a few-target loop episode is held to new places the same way.
    const placeBound = (this.pushback && this.episode?.pushback === true) || this.episode?.revisit === true;
    const held = placeBound && !newPlace;
    if (novel) {
      this.messageVisits.length = 0;
      if (!this.pushback || newPlace) this.pushbacks.length = 0;
    }
    // A push-back episode ends on a new map or tile even when that place's state was seen before.
    const escaped = placeBound && newPlace;
    // Out of the loop: its push-backs no longer count toward the next warning.
    if (escaped) this.pushbacks.length = 0;
    if (
      (novel && !held) || escaped ||
      (game && (call.name === "press" || (call.name === "navigate_to" && call.acted===true)) && this.episode?.kind === "planning")
    )
      this.recover(seq, (novel && !held) || escaped);
    let hit: LoopKind | null = null;
    let pingPong = false;
    let reopened = false;
    let pushed: number[] | null = null;
    let revisited: number[] | null = null;
    let menuLooped: number[] | null = null;
    let triggerLooped:{readonly evidence:number[];readonly dialogue:string}|null=null;
    let waited = false;
    if (!call.isError && PLANNING.has(call.name)) {
      this.planning++;
      if (this.planning >= this.policy.planning) hit = "planning";
    }
    if (game) {
      if (call.name === "press" || changed) this.planning = 0;
      if (call.name === "observe") {
        const unchanged = (fingerprint !== null && fingerprint === this.previous) || (battle !== null && battle === this.previousBattle);
        // A waiting interface the field fingerprint also sees (naming, YES/NO prompts) counts as before; it is named
        // as the waiting interface it is.
        waited = waiting !== null && waiting === this.previousWaiting;
        this.observations = unchanged || waited ? this.observations + 1 : 0;
        if (this.observations >= this.policy.observation) hit ??= "observation";
      } else {
        this.observations = 0;
        const buttons = call.args["buttons"];
        const navigation = call.name === "navigate_to";
        const single =
          Array.isArray(buttons) &&
          buttons.length === 1 &&
          typeof buttons[0] === "string";
        const batch = this.interactions && Array.isArray(buttons) && buttons.length >= 1 && buttons.length <= 8 && buttons.every((b:unknown)=>typeof b === "string" && ["A","B","START","SELECT","UP","DOWN","LEFT","RIGHT"].includes(b));
        const eligible = single || batch || navigation;
        const action:unknown = navigation ? [call.args["map_id"],call.args["x"],call.args["y"]] : batch ? buttons : Array.isArray(buttons) ? buttons[0] : null;
        const before =
          call.beforeState === undefined
            ? null
            : semanticState(call.beforeState, this.interactions);
        const key =
          eligible && fingerprint !== null && fingerprint === before
            ? `${fingerprint}:${JSON.stringify(action)}`
            : "";
        this.ineffective =
          key !== "" && key === this.ineffective.key
            ? { key, count: this.ineffective.count + 1 }
            : { key, count: key === "" ? 0 : 1 };
        const messageKey = this.interactions && batch && fingerprint !== null && call.state?.world_context?.message?.ready === true ? `${fingerprint}:${JSON.stringify(action)}` : "";
        if (messageKey !== "") {
          this.messageVisits.push(messageKey);
          if (this.messageVisits.length > 12) this.messageVisits.shift();
        }
        if(messageKey !== "" && this.messageVisits.filter(item=>item===messageKey).length >= this.policy.ineffective) hit ??= "cycle";
        const restarted = this.interactions && this.restartedConversation(call.state, call.beforeState);
        if (restarted) hit ??= "cycle";
        const clockLoop = this.noteClockLook(game, call);
        if (clockLoop) hit ??= "cycle";
        const closedLoop = this.noteClosedDialogue(game, call);
        if (closedLoop) hit ??= "cycle";
        reopened = call.state?.world_context?.message?.ready === true || restarted || closedLoop;
        if (this.ineffective.count >= this.policy.ineffective)
          hit ??= "ineffective";
        if (eligible && fingerprint !== null && before !== null) {
          this.history.push(JSON.stringify([before, action, fingerprint]));
          if (this.history.length > 12) this.history.shift();
          if (repeating(this.history, this.policy.cycleRepeats)) hit ??= "cycle";
        } else if (!(this.transitions && eligible && this.passable(call.state) && this.passable(call.beforeState)))
          this.history.length = 0;
      }
      if (this.pushback) {
        const back = this.pushedBack(call, seq);
        if (back !== null && hit === null) {
          hit = "cycle";
          pushed = back;
        }
      }
      if (this.ineffectiveLoops) {
        const back = this.revisit(call, seq);
        if (back !== null && hit === null) {
          hit = "cycle";
          revisited = back;
        }
      }
      if (this.transitions && this.mapMove(call) && hit === null) {
        hit = "cycle";
        pingPong = true;
      }
      if (this.menuLoop) {
        const back = this.menuReturn(call, seq);
        if (back !== null && hit === null) {
          hit = "cycle";
          menuLooped = back;
        }
      }
      triggerLooped=this.noteTriggerScript(call,seq);
      if(triggerLooped!==null&&hit===null)hit="trigger_script";
      this.previous = fingerprint;
      if (this.battles) {
        this.previousBattle = battle;
        if (battle !== null) {
          this.battlesSeen.push(battle);
          if (this.battlesSeen.length > 16) this.battlesSeen.shift();
        }
      }
      if (this.ineffectiveLoops) {
        this.previousWaiting = waiting;
        if (waiting !== null) {
          this.waitingSeen.push(waiting);
          if (this.waitingSeen.length > 16) this.waitingSeen.shift();
        }
      }
      if (fingerprint !== null) {
        this.visited.push(fingerprint);
        if (this.visited.length > 16) this.visited.shift();
      }
    }
    if (rejection !== null) {
      const count = (this.rejections.get(rejection) ?? 0) + 1;
      this.rejections.set(rejection, count);
      if (this.rejections.size > 16)
        this.rejections.delete(this.rejections.keys().next().value ?? "");
      if (count >= this.policy.rejection) hit ??= "rejection";
    } else if (!call.isError && !PLANNING.has(call.name))
      this.rejections.clear();
    if (
      this.episode?.exposed &&
      this.episode.recovery >= this.episode.window &&
      !this.episode.threshold
    ) {
      if (this.supervisor !== undefined && this.mode === "enforced") {
        this.episode.briefing = this.supervisor(this.episode.kind, this.completed);
        this.episode.recovery = 0;
        this.notice("supervisor", seq);
        return;
      }
      this.stopped = this.mode === "enforced";
      this.episode.threshold = true;
      this.notice("stop", seq);
      return;
    }
    if (hit === null) return;
    if (this.episode === null) {
      this.episode = {
        kind: hit,
        message: triggerLooped!==null?TRIGGER_SCRIPT_MESSAGE(triggerLooped.dialogue):menuLooped !== null ? BATTLE_MENU_LOOP_MESSAGE : pushed !== null ? PUSHBACK_MESSAGE : revisited !== null ? REVISIT_MESSAGE : hit === "observation" && waited ? WAITING_MESSAGE : pingPong ? TRANSITION_MESSAGE : hit === "ineffective" && call.name === "navigate_to" ? "Repeated navigation attempts to the same target produced equivalent states. Inspect the destination and obstacle before trying again." : this.interactions && (hit === "ineffective" || hit === "cycle") ? `The same interaction or input pattern is repeating without new game information. Use a single input, inspect the resulting interface, and choose an evidence-supported different approach.${this.messageTruth && !reopened ? "" : " Reopening the same message is not story progress."}` : MESSAGES[hit],
        exposed: false,
        recovery: 0,
        threshold: false,
        // The first push-back of the repeated input, or the first of the moves ending on the loop's tile; the notice
        // adds the call that completed the count.
        evidence: triggerLooped?.evidence??(pushed ?? revisited ?? menuLooped)?.slice(0, 1) ?? [seq],
        window: this.policy.recovery,
        briefing: null,
        pushback: pushed !== null,
        revisit: revisited !== null,
        menu: menuLooped !== null,
      };
      this.notice("warning", seq);
      // Speedrun: the supervisor briefs as soon as a loop is found, then again every window while it lasts.
      if (this.supervisor !== undefined && this.mode === "enforced") {
        this.episode.briefing = this.supervisor(hit, this.completed);
        this.notice("supervisor", seq);
      }
    }
  }

  // stall-briefing-v1: a supervisor note for a stall, shown at the next model calls until a call completes.
  // Refused while a loop briefing or an earlier note is open, in diagnostic mode, and after a stop.
  stall(kind: StallKind, text: (calls: number) => string, evidence: readonly number[]): boolean {
    if (this.stopped || this.mode === "diagnostic" || this.episode !== null || this.stallNote !== null) return false;
    const message = text(this.completed);
    this.stallNote = { text: message, exposed: false };
    this.notify({ kind, message, calls: this.completed, evidence: evidence.filter((value, index, all) => all.indexOf(value) === index), mode: "enforced", phase: "supervisor" });
    return true;
  }

  private nativeProgress(state: GameStateSnapshot, seq: number): void {
    let advanced = false;
    for (const milestone of NATIVE_PROGRESS_MILESTONES) {
      const current = milestone.reached(state);
      const previous = this.nativeValues.get(milestone.name);
      if (current === true && !this.achieved.has(milestone.name)) {
        const truck =
          milestone.name !== "FIRST_TRUCK_EXIT" ||
          (this.nativeState?.started === true &&
            this.nativeState.location === "INSIDE OF TRUCK");
        if (previous === false && truck) advanced = true;
        this.achieved.add(milestone.name);
      }
      this.nativeValues.set(milestone.name, current);
    }
    this.nativeState = state;
    if (!advanced || this.stopped) return;
    this.recover(seq, true);
    this.planning = 0;
    this.observations = 0;
    this.previous = null;
    this.history.length = 0;
    this.messageVisits.length = 0;
    this.visited.length = 0;
    this.trip = null;
    this.pushbacks.length = 0;
    this.moves.length = 0;
    this.movesHeard.clear();
    this.closedTalk = { text: "", place: "", count: 0 };
    this.triggerScripts.clear();
  }

  // pushback-loop-detection-v1: what a state since the last settled result says about the trip away from it.
  private tripState(state: GameStateSnapshot): void {
    const trip = this.trip;
    if (trip === null) return;
    if (scriptHeld(state)) trip.scripted = true;
    const place = placeOf(state);
    if (place !== null && place !== trip.place) trip.left = true;
    // No input faces the player away from the direction just pressed: with a script holding the controls, that
    // is the script stepping the player back between snapshots (OldaleTown_EventScript_BlockedPath, 54a7 T247).
    if (trip.dir !== null && scriptHeld(state) && state.facing === OPPOSITE[trip.dir]) trip.left = true;
  }

  // Where the player stands with field controls free and no message: its fingerprint, else null.
  private settled(state: GameStateSnapshot | undefined): string | null {
    return state !== undefined && state.field_controls_locked === false && (state.world_context?.dialogue ?? "") === "" &&
      state.world_context?.message == null ? semanticState(state, this.interactions) : null;
  }

  // A settled state starts a trip (a call's settled result, or the state a call's first input started from).
  private seed(state: GameStateSnapshot): void {
    const anchor = this.settled(state);
    if (anchor !== null) this.trip = { anchor, place: placeOf(state), actions: [], calls: 0, left: false, scripted: false, dir: null };
  }

  // A press or navigate_to whose settled result is where the player last stood settled, after the player left that
  // tile and a script or message held the controls: the evidence seqs when the same input was pushed back
  // `cycleRepeats` times among the last 12 push-backs.
  private pushedBack(call: CompletedCall, seq: number): number[] | null {
    const state = call.state;
    const settled = this.settled(state);
    if (call.name === "observe") {
      if (state !== undefined && settled !== null && settled !== this.trip?.anchor) this.seed(state);
      // Every completed game call counts toward the bound, observes included.
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
    // The way out: the first button (or navigate_to target) of the trip. A loop's period can vary (LEFT then
    // LEFT,LEFT; DOWN,A,A or DOWN,DOWN,A,A) while the player keeps leaving the same way.
    const key = `${settled}:${wayOut(trip.actions[0])}`;
    this.pushbacks.push({ key, seq });
    if (this.pushbacks.length > 12) this.pushbacks.shift();
    const same = this.pushbacks.filter((p) => p.key === key);
    return same.length >= this.policy.cycleRepeats ? same.map((p) => p.seq) : null;
  }

  // ineffective-loops-v1: records a move (a navigate_to, or a press with a direction button, that started from a known
  // state with field controls free and nothing open, and during which no message or dialogue appeared) by the tile it ended on and its target. When the newest
  // move's tile has ended `cycleRepeats` moves, the loop is the moves from the first of those to now: if they ended on
  // at most two tiles and their targets alternate (one named again after a different one), returns the seqs of the
  // moves that ended on the newest tile. A battle, an open menu or naming screen, or a conversation not heard
  // since the moves began clears them (new information); the same conversation again only makes that call not a move.
  // A map change starts them again; a story milestone clears them in nativeProgress.
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
      : call.name === "press" && Array.isArray(buttons) && buttons.some((b: unknown) => typeof b === "string" && DIRECTIONS.has(b.toUpperCase())) ? JSON.stringify(buttons)
        : null;
    const start = call.startState ?? call.beforeState;
    const place = placeOf(state);
    // Any game call that ends on another map (a door or stairs, even one taken while a script held the controls)
    // starts the moves again.
    const map = JSON.stringify(state.map_id);
    if (place !== null && this.moves.length > 0 && this.moves[this.moves.length - 1]?.map !== map) {
      this.moves.length = 0;
      this.movesHeard.clear();
    }
    // Input to the field: the call started from a known state with field controls free and nothing open.
    if (target === null || place === null || state.screen !== "overworld" || said.length > 0 || interfaceOpen(state) || start === undefined || start.field_controls_locked !== false || interfaceOpen(start))
      return null;
    this.moves.push({ place, map, target, seq });
    if (this.moves.length > 12) this.moves.shift();
    const ends = this.moves.filter((m) => m.place === place).slice(-this.policy.cycleRepeats);
    if (ends.length < this.policy.cycleRepeats) return null;
    const loop = this.moves.slice(this.moves.indexOf(ends[0] ?? this.moves[0] ?? { place, map, target, seq }));
    const targets = loop.map((m) => m.target);
    const alternates = targets.some((t, i) => targets.some((u, k) => k > i && u === t && targets.slice(i + 1, k).some((v) => v !== t)));
    return new Set(loop.map((m) => m.place)).size <= 2 && alternates ? ends.map((m) => m.seq) : null;
  }

  // A state that either has a fingerprint or is only a transient lock; skipped instead of clearing the history.
  private passable(state: GameStateSnapshot | undefined): boolean {
    return state !== undefined && (semanticState(state, this.interactions) !== null || transientLock(state));
  }

  // Records a map change by this call; true when the newest map changes repeat with no progress between them.
  private mapMove(call: CompletedCall): boolean {
    const state = call.state;
    const to = mapOf(state);
    if (state === undefined || to === null) return false;
    const progress = stable({ story: state.story ?? null, party: state.party, money: state.money, badges: state.badges, bag: state.resources?.bag ?? null, pc: state.resources?.pc_items ?? null });
    if (progress !== this.progress) {
      this.mapMoves.length = 0;
      this.progress = progress;
    }
    // Map changes made by a script, inside a message or menu, or with unknown lock state are not the player's
    // bounce: they restart the count instead of adding to it.
    if (!this.passable(state) || (call.beforeState !== undefined && !this.passable(call.beforeState))) {
      this.mapMoves.length = 0;
      // Where a script left the player is not known until the next settled state; no bridge from here.
      this.lastMap = null;
      return false;
    }
    // A result can still show the old map mid-door; the change then first appears in the next call's before state.
    const before = mapOf(call.beforeState);
    const stops = [this.lastMap, before, to].filter((map): map is string => map !== null);
    this.lastMap = to;
    let moved = false;
    for (let i = 1; i < stops.length; i++) {
      if (stops[i] === stops[i - 1]) continue;
      this.mapMoves.push(`${stops[i - 1] ?? ""}>${stops[i] ?? ""}`);
      if (this.mapMoves.length > 12) this.mapMoves.shift();
      moved = true;
    }
    return moved && repeating(this.mapMoves, this.policy.cycleRepeats);
  }
  private noticeMessage(phase: "warning" | "recovered" | "stop" | "supervisor", episode: NonNullable<LoopDetector["episode"]>): string {
    const base = phase === "stop"
      ? `${episode.message} Bounded recovery ended without verified recovery; unknown readouts do not prove progress.`
      : phase === "supervisor" && episode.briefing !== null
        ? episode.briefing
        : episode.message;
    return episode.menu && phase === "supervisor" && !base.includes(BATTLE_MENU_LOOP_MESSAGE)
      ? `${base}\n${BATTLE_MENU_LOOP_MESSAGE}`
      : base;
  }

  private resetMenu(): void {
    this.menuAnchor = null;
    this.menuDetour = false;
    this.menuReturns.length = 0;
    this.menuStamp = null;
  }

  // A state during a call can open the POKéMON or BAG screen and the call can still end on the battle menu.
  // A state that has left the battle clears the count. complete() also sees the end state; this covers a
  // state event that is not that end state.
  private noteMenuScreen(state: GameStateSnapshot, seq: number): void {
    if (!state.in_battle) {
      const stuck = this.episode?.menu === true;
      this.resetMenu();
      if (stuck) this.recover(seq, false);
      return;
    }
    if (menuDetourScreen(state)) this.menuDetour = true;
  }

  // The seqs of the returns once the same battle-menu choice has been come back to BATTLE_MENU_RETURNS times
  // after the POKéMON or BAG screen. Null when this call is not that return. HP, the battle turn, a different
  // cursor or leaving the battle clears the count; an open episode of this kind ends.
  private menuReturn(call: CompletedCall, seq: number): number[] | null {
    const state = call.state;
    if (state === undefined || !state.in_battle) {
      this.resetMenu();
      if (this.episode?.menu === true) this.recover(seq, false);
      return null;
    }
    const stamp = battleStamp(state);
    if (stamp !== null && this.menuStamp !== null && stamp !== this.menuStamp) {
      this.resetMenu();
      this.menuStamp = stamp;
      if (this.episode?.menu === true) this.recover(seq, false);
      return null;
    }
    if (stamp !== null) this.menuStamp = stamp;
    if (menuDetourScreen(state)) {
      this.menuDetour = true;
      return null;
    }
    const key = actionMenuKey(state);
    if (key === null) return null;
    if (this.menuAnchor !== null && this.menuAnchor !== key) {
      const stuck = this.episode?.menu === true;
      this.menuAnchor = key;
      this.menuDetour = false;
      this.menuReturns.length = 0;
      if (stuck) this.recover(seq, false);
      return null;
    }
    this.menuAnchor = key;
    if (!this.menuDetour) return null;
    this.menuDetour = false;
    this.menuReturns.push({ key, seq });
    if (this.menuReturns.length > 12) this.menuReturns.shift();
    const same = this.menuReturns.filter((row) => row.key === key);
    return same.length >= BATTLE_MENU_RETURNS ? same.map((row) => row.seq) : null;
  }

  private recover(seq: number, novel: boolean): void {
    if (this.episode !== null) this.notice("recovered", seq);
    this.episode = null;
    if (novel) {
      this.rejections.clear();
      this.ineffective = { key: "", count: 0 };
    }
  }
  private notice(phase: "warning" | "recovered" | "stop" | "supervisor", seq: number): void {
    const episode = this.episode;
    if (episode === null) return;
    const fields = {
      kind: episode.kind,
      message: this.noticeMessage(phase, episode),
      calls: this.completed,
      evidence: [...episode.evidence, seq].filter(
        (value, index, all) => all.indexOf(value) === index,
      ),
    };
    if (this.mode === "diagnostic")
      this.notify({
        ...fields,
        mode: "diagnostic",
        phase:
          phase === "warning"
            ? "would_warn"
            : phase === "stop"
              ? "would_stop"
              : "would_recover",
      });
    else this.notify({ ...fields, mode: "enforced", phase });
  }
}
