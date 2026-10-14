import type { RunEvent } from "./events.js";
import { MILESTONES } from "./milestones.js";
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
export type LoopMode = "enforced" | "diagnostic";
export function readLoopMode(env: NodeJS.ProcessEnv = process.env): LoopMode {
  const flag = env["POKEBENCH_LOOP_GUARD"];
  if (flag !== undefined && flag !== "0" && flag !== "1")
    throw new Error("POKEBENCH_LOOP_GUARD must be 0 or 1");
  return flag === "0" ? "diagnostic" : "enforced";
}
interface NoticeFields {
  readonly kind: LoopKind;
  readonly message: string;
  readonly calls: number;
  readonly evidence: readonly number[];
}
export type LoopNotice = NoticeFields &
  (
    | {
        readonly mode: "enforced";
        readonly phase: "warning" | "recovered" | "stop";
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
  if (state.screen === "naming" && state.naming?.ready === true)
    return stable({ screen: state.screen, naming: state.naming });
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
  private readonly messageVisits: string[] = [];
  private readonly visited: string[] = [];
  private completed = 0;
  private episode: {
    kind: LoopKind;
    message: string;
    exposed: boolean;
    recovery: number;
    threshold: boolean;
    evidence: number[];
  } | null = null;
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
  ) {}

  observe(event: RunEvent): void {
    this.run ??= event.run;
    if (event.run !== this.run || event.seq <= this.eventSeq) return;
    this.eventSeq = event.seq;
    if (event.type === "turn_start" && this.episode !== null)
      this.episode.exposed = true;
    if (event.type === "state") {
      this.latestSeq = event.seq;
      if ("started" in event) {
        this.nativeProgress(event, event.seq);
        this.latest = event;
      } else {
        this.latest = undefined;
        this.nativeValues.clear();
        this.nativeState = undefined;
      }
    } else if (event.type === "telemetry_error" && event.source === "state")
      this.latest = undefined;
    else if (event.type === "tool_call")
      this.calls.set(event.id, { args: typeof event.args==="object"&&event.args!==null&&!Array.isArray(event.args)?event.args as Record<string,unknown>:{}, seq: event.seq, ...(event.name === "navigate_to" ? {navigation:true,before:this.latest,beforeSeq:this.latestSeq} : {}) });
    else if (event.type === "button_press") {
      const pending = this.calls.get(event.tool_call_id);
      if (pending !== undefined && (!pending.navigation || !pending.pressed)) {
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
    if (this.mode === "diagnostic" || this.episode === null) return null;
    this.episode.exposed = true;
    return `LOOP GUARD (${this.episode.kind}): ${this.episode.message} Recovery is bounded; objective wording and new evidence IDs alone do not establish progress.`;
  }

  complete(call: CompletedCall): void {
    if (this.stopped) return;
    this.completed++;
    const seq = call.seq ?? this.completed;
    const rejection = rejectionKey(call);
    if (call.isError && rejection === null) return;
    if (this.episode?.exposed) this.episode.recovery++;
    const fingerprint =
      call.state === undefined ? null : semanticState(call.state, this.interactions);
    const game =
      !call.isError && (call.name === "press" || call.name === "navigate_to" || call.name === "observe");
    const changed =
      game && fingerprint !== null && fingerprint !== this.previous;
    const novel = changed && !this.visited.includes(fingerprint);
    if (novel) this.messageVisits.length = 0;
    if (
      novel ||
      (game && (call.name === "press" || (call.name === "navigate_to" && call.acted===true)) && this.episode?.kind === "planning")
    )
      this.recover(seq, novel);
    let hit: LoopKind | null = null;
    if (!call.isError && PLANNING.has(call.name)) {
      this.planning++;
      if (this.planning >= this.policy.planning) hit = "planning";
    }
    if (game) {
      if (call.name === "press" || changed) this.planning = 0;
      if (call.name === "observe") {
        this.observations =
          fingerprint !== null && fingerprint === this.previous
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
        if (this.ineffective.count >= this.policy.ineffective)
          hit ??= "ineffective";
        if (eligible && fingerprint !== null && before !== null) {
          this.history.push(JSON.stringify([before, action, fingerprint]));
          if (this.history.length > 12) this.history.shift();
          if (this.cycle()) hit ??= "cycle";
        } else this.history.length = 0;
      }
      this.previous = fingerprint;
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
      this.episode.recovery >= this.policy.recovery &&
      !this.episode.threshold
    ) {
      this.stopped = this.mode === "enforced";
      this.episode.threshold = true;
      this.notice("stop", seq);
      return;
    }
    if (hit === null) return;
    if (this.episode === null) {
      this.episode = {
        kind: hit,
        message: hit === "ineffective" && call.name === "navigate_to" ? "Repeated navigation attempts to the same target produced equivalent states. Inspect the destination and obstacle before trying again." : this.interactions && (hit === "ineffective" || hit === "cycle") ? "The same interaction or input pattern is repeating without new game information. Use a single input, inspect the resulting interface, and choose an evidence-supported different approach. Reopening the same message is not story progress." : MESSAGES[hit],
        exposed: false,
        recovery: 0,
        threshold: false,
        evidence: [seq],
      };
      this.notice("warning", seq);
    }
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
  }

  private cycle(): boolean {
    for (let size = 2; size <= 4; size++) {
      const length = size * this.policy.cycleRepeats;
      if (this.history.length < length) continue;
      const tail = this.history.slice(-length);
      if (new Set(tail.slice(0, size)).size < 2) continue;
      if (tail.every((item, i) => item === tail[i % size])) return true;
    }
    return false;
  }
  private recover(seq: number, novel: boolean): void {
    if (this.episode !== null) this.notice("recovered", seq);
    this.episode = null;
    if (novel) {
      this.rejections.clear();
      this.ineffective = { key: "", count: 0 };
    }
  }
  private notice(phase: "warning" | "recovered" | "stop", seq: number): void {
    const episode = this.episode;
    if (episode === null) return;
    const fields = {
      kind: episode.kind,
      message:
        phase === "stop"
          ? `${episode.message} Bounded recovery ended without verified recovery; unknown readouts do not prove progress.`
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
