import type { RunEvent } from "./events.js";
import { MEASUREMENT_ONLY_MILESTONES, MILESTONES } from "./milestones.js";
import type { GameStateSnapshot } from "./game-state.js";

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
  | "rejection";
// stall-briefing-v1: stalls the loop checks above do not see.
export type StallKind = "map_cycle" | "milestone_drought";
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
}
export type LoopPolicy = { readonly [K in keyof typeof LOOP_POLICY]: number };
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

export const PUSHBACK_MESSAGE =
  "A game script keeps returning the player to the same place after the same input: each attempt ends back where it started, so repeating it will not get past the script. Read what the script's dialogue says, then choose a different target or approach using observed evidence.";
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

export class LoopDetector {
  stopped = false;
  private planning = 0;
  private observations = 0;
  private ineffective = { key: "", count: 0 };
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
  private trip: { anchor: string; place: string | null; actions: string[]; calls: number; left: boolean; scripted: boolean } | null = null;
  private readonly pushbacks: { key: string; seq: number }[] = [];
  // battle-observation-loop-v1: the previous game call's battle readout and the recent ones.
  private previousBattle: string | null = null;
  private readonly battlesSeen: string[] = [];
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
  } | null = null;
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
    if (this.episode.briefing !== null) return this.episode.briefing;
    return `LOOP GUARD (${this.episode.kind}): ${this.episode.message} Recovery is bounded; objective wording and new evidence IDs alone do not establish progress.`;
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
    const novel = (changed && !this.visited.includes(fingerprint)) || (battle !== null && battle !== this.previousBattle && !this.battlesSeen.includes(battle));
    if (novel) {
      this.messageVisits.length = 0;
      this.pushbacks.length = 0;
    }
    if (
      novel ||
      (game && (call.name === "press" || (call.name === "navigate_to" && call.acted===true)) && this.episode?.kind === "planning")
    )
      this.recover(seq, novel);
    let hit: LoopKind | null = null;
    let pingPong = false;
    let pushed: number[] | null = null;
    if (!call.isError && PLANNING.has(call.name)) {
      this.planning++;
      if (this.planning >= this.policy.planning) hit = "planning";
    }
    if (game) {
      if (call.name === "press" || changed) this.planning = 0;
      if (call.name === "observe") {
        this.observations =
          (fingerprint !== null && fingerprint === this.previous) || (battle !== null && battle === this.previousBattle)
            ? this.observations + 1
            : 0;
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
        if (this.interactions && this.restartedConversation(call.state, call.beforeState)) hit ??= "cycle";
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
      if (this.transitions && this.mapMove(call) && hit === null) {
        hit = "cycle";
        pingPong = true;
      }
      this.previous = fingerprint;
      if (this.battles) {
        this.previousBattle = battle;
        if (battle !== null) {
          this.battlesSeen.push(battle);
          if (this.battlesSeen.length > 16) this.battlesSeen.shift();
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
        message: pushed !== null ? PUSHBACK_MESSAGE : pingPong ? TRANSITION_MESSAGE : hit === "ineffective" && call.name === "navigate_to" ? "Repeated navigation attempts to the same target produced equivalent states. Inspect the destination and obstacle before trying again." : this.interactions && (hit === "ineffective" || hit === "cycle") ? "The same interaction or input pattern is repeating without new game information. Use a single input, inspect the resulting interface, and choose an evidence-supported different approach. Reopening the same message is not story progress." : MESSAGES[hit],
        exposed: false,
        recovery: 0,
        threshold: false,
        // The first push-back of the repeated input; the notice adds the call that completed the count.
        evidence: pushed === null ? [seq] : pushed.slice(0, 1),
        window: this.policy.recovery,
        briefing: null,
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
    for (const milestone of MILESTONES) {
      if (milestone.kind !== "story") continue;
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
  }

  // pushback-loop-detection-v1: what a state since the last settled result says about the trip away from it.
  private tripState(state: GameStateSnapshot): void {
    const trip = this.trip;
    if (trip === null) return;
    if (scriptHeld(state)) trip.scripted = true;
    const place = placeOf(state);
    if (place !== null && place !== trip.place) trip.left = true;
  }

  // Where the player stands with field controls free and no message: its fingerprint, else null.
  private settled(state: GameStateSnapshot | undefined): string | null {
    return state !== undefined && state.field_controls_locked === false && (state.world_context?.dialogue ?? "") === "" &&
      state.world_context?.message == null ? semanticState(state, this.interactions) : null;
  }

  // A settled state starts a trip (a call's settled result, or the state a call's first input started from).
  private seed(state: GameStateSnapshot): void {
    const anchor = this.settled(state);
    if (anchor !== null) this.trip = { anchor, place: placeOf(state), actions: [], calls: 0, left: false, scripted: false };
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
      trip.calls++;
      if (call.beforeState !== undefined) this.tripState(call.beforeState);
    }
    if (state === undefined || settled === null) {
      if (trip !== null && trip.calls > 8) this.trip = null;
      return null;
    }
    this.seed(state);
    if (trip === null || trip.anchor !== settled || !trip.left || !trip.scripted) return null;
    const key = `${settled}:${trip.actions.join(",")}`;
    this.pushbacks.push({ key, seq });
    if (this.pushbacks.length > 12) this.pushbacks.shift();
    const same = this.pushbacks.filter((p) => p.key === key);
    return same.length >= this.policy.cycleRepeats ? same.map((p) => p.seq) : null;
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
      message:
        phase === "stop"
          ? `${episode.message} Bounded recovery ended without verified recovery; unknown readouts do not prove progress.`
          : phase === "supervisor" && episode.briefing !== null
            ? episode.briefing
            : episode.message,
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
