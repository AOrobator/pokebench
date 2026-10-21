import type { CompletedCall, LoopHit, LoopKind, LoopPolicy, LoopRule, LoopRuleId, RuleContext } from "../types.js";
import { battleState, menuRefusalState, semanticState, waitingState } from "../fingerprints.js";

export const BASIC_MESSAGES = {
  planning: "Repeated objective calls without game interaction. Writing a next_decision does not execute buttons. Observe if uncertain, then use press when ready.",
  observation: "Repeated observations contain no new reliable game information. Reassess whether an interaction is needed; unchanged observations are not recovery.",
  ineffective: "Repeated equivalent single-button attempts produced equivalent states. Reassess the observed interface and try an evidence-supported alternative.",
  cycle: "A short state/action pattern is repeating without new game information. Reassess the objective and change the approach using observed evidence.",
  rejection: "The same tool rejection recurred after correction. Fix the reported argument or evidence problem before trying again.",
  trigger_script: "The same condition-matching coordinate trigger has run the same dialogue again without new story progress.",
} as const;

const PLANNING = new Set(["get_objectives", "set_objective", "update_objective"]);

const repeating = (items: readonly string[], repeats: number): boolean => {
  for (let size = 2; size <= 4; size++) {
    const length = size * repeats;
    if (items.length < length) continue;
    const tail = items.slice(-length);
    if (new Set(tail.slice(0, size)).size < 2) continue;
    if (tail.every((item, index) => item === tail[index % size])) return true;
  }
  return false;
};

const rejectionKey = (call: CompletedCall): string | null => {
  if (!call.isError || /HTTP\s+\d|fetch failed|ECONN|timed? ?out|queue|aborted|network|malformed \/pokebench|observation frame|Game tool did not return|POST .+ failed/i.test(call.text)) return null;
  return `${call.name}:${call.text.replace(/(?:state\s*)?#\d+|state(?: sequence)?\s+\d+/gi, "state#").slice(0, 2000)}`;
};

export interface BasicEvaluation {
  readonly fingerprint: string | null;
  readonly game: boolean;
  readonly changed: boolean;
  readonly battle: string | null;
  readonly waiting: string | null;
  readonly novel: boolean;
}

export interface ActionCandidates {
  readonly interactionMessage: boolean;
  readonly restartedDialogue: boolean;
  readonly ineffectiveAction: boolean;
  readonly stateCycle: boolean;
  readonly reopened: boolean;
}

export class BasicRules {
  private planning = 0;
  private observations = 0;
  private ineffective = { key: "", count: 0 };
  private readonly rejections = new Map<string, number>();
  private lastRefusalSnapshot: string | null = null;
  private readonly refusalEvidence = new Map<string, number[]>();
  private previous: string | null = null;
  private previousBattle: string | null = null;
  private previousWaiting: string | null = null;
  private readonly history: string[] = [];
  private readonly messageVisits: string[] = [];
  private readonly visited: string[] = [];
  private readonly battlesSeen: string[] = [];
  private readonly waitingSeen: string[] = [];
  private readonly conversation = { text: "", place: "", cursor: null as number | null, open: false, restarts: 0 };

  constructor(
    private readonly policy: LoopPolicy,
    private readonly interactions: boolean,
    private readonly battles: boolean,
    private readonly ineffectiveLoops: boolean,
    private readonly transitions: boolean,
  ) {}

  prepare(call: CompletedCall): BasicEvaluation {
    const fingerprint = call.state === undefined ? null : semanticState(call.state, this.interactions);
    const game = !call.isError && (call.name === "press" || call.name === "navigate_to" || call.name === "navigate_to_target" || call.name === "explore_map" || call.name === "observe");
    const changed = game && fingerprint !== null && fingerprint !== this.previous;
    const battle = this.battles && game && call.state !== undefined ? battleState(call.state) : null;
    const waiting = this.ineffectiveLoops && game && call.state !== undefined ? waitingState(call.state) : null;
    const novel = (changed && !this.visited.includes(fingerprint)) ||
      (battle !== null && battle !== this.previousBattle && !this.battlesSeen.includes(battle)) ||
      (waiting !== null && waiting !== this.previousWaiting && !this.waitingSeen.includes(waiting));
    return { fingerprint, game, changed, battle, waiting, novel };
  }

  accepts(call: CompletedCall): boolean {
    return !call.isError || rejectionKey(call) !== null;
  }

  planningHit(call: CompletedCall, evaluation: BasicEvaluation): boolean {
    if (!call.isError && PLANNING.has(call.name)) {
      this.planning++;
      return this.planning >= this.policy.planning;
    }
    if (evaluation.game && (call.name === "press" || evaluation.changed)) this.planning = 0;
    return false;
  }

  observationHit(call: CompletedCall, evaluation: BasicEvaluation): { hit: boolean; waited: boolean } {
    if (!evaluation.game) return { hit: false, waited: false };
    if (call.name !== "observe") {
      this.observations = 0;
      return { hit: false, waited: false };
    }
    const unchanged = (evaluation.fingerprint !== null && evaluation.fingerprint === this.previous) ||
      (evaluation.battle !== null && evaluation.battle === this.previousBattle);
    const waited = evaluation.waiting !== null && evaluation.waiting === this.previousWaiting;
    this.observations = unchanged || waited ? this.observations + 1 : 0;
    return { hit: this.observations >= this.policy.observation, waited };
  }

  actionCandidates(call: CompletedCall, evaluation: BasicEvaluation, passable: (call: CompletedCall) => boolean): ActionCandidates {
    if (!evaluation.game || call.name === "observe") return {
      interactionMessage: false,
      restartedDialogue: false,
      ineffectiveAction: false,
      stateCycle: false,
      reopened: false,
    };
    const buttons = call.args["buttons"];
    const navigation = call.name === "navigate_to" || call.name === "navigate_to_target" || call.name === "explore_map";
    const single = Array.isArray(buttons) && buttons.length === 1 && typeof buttons[0] === "string";
    const batch = this.interactions && Array.isArray(buttons) && buttons.length >= 1 && buttons.length <= 8 &&
      buttons.every((button: unknown) => typeof button === "string" && ["A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT"].includes(button));
    const eligible = single || batch || navigation;
    const action: unknown = call.name === "navigate_to" ? [call.args["map_id"], call.args["x"], call.args["y"]]
      : navigation ? [call.name, call.requested ?? call.args]
      : batch ? buttons : Array.isArray(buttons) ? buttons[0] : null;
    const before = call.beforeState === undefined ? null : semanticState(call.beforeState, this.interactions);
    const key = eligible && evaluation.fingerprint !== null && evaluation.fingerprint === before
      ? `${evaluation.fingerprint}:${JSON.stringify(action)}` : "";
    this.ineffective = key !== "" && key === this.ineffective.key
      ? { key, count: this.ineffective.count + 1 }
      : { key, count: key === "" ? 0 : 1 };
    const messageKey = this.interactions && batch && evaluation.fingerprint !== null &&
      call.state?.world_context?.message?.ready === true ? `${evaluation.fingerprint}:${JSON.stringify(action)}` : "";
    if (messageKey !== "") {
      this.messageVisits.push(messageKey);
      if (this.messageVisits.length > 12) this.messageVisits.shift();
    }
    const interactionMessage = messageKey !== "" &&
      this.messageVisits.filter((item) => item === messageKey).length >= this.policy.ineffective;
    const restartedDialogue = this.interactions && this.restartedConversation(call);
    const ineffectiveAction = this.ineffective.count >= this.policy.ineffective;
    let stateCycle = false;
    if (eligible && evaluation.fingerprint !== null && before !== null) {
      this.history.push(JSON.stringify([before, action, evaluation.fingerprint]));
      if (this.history.length > 12) this.history.shift();
      stateCycle = repeating(this.history, this.policy.cycleRepeats);
    } else if (!(this.transitions && eligible && passable(call))) this.history.length = 0;
    return {
      interactionMessage,
      restartedDialogue,
      ineffectiveAction,
      stateCycle,
      reopened: call.state?.world_context?.message?.ready === true || restartedDialogue,
    };
  }

  refusal(call: CompletedCall, enabled: boolean, menus=false): {native: string | null; status: string | null; menu:boolean} {
    const menu = menus && call.state?.active_ui?.phase === "shop_action_menu";
    const field = enabled && call.state?.in_battle === false && call.state.battle === null
      ? semanticState(call.state, true) : null;
    const native = menu ? menuRefusalState(call.state) : enabled && call.state?.battle?.initialized === true ? battleState(call.state) : field;
    if (native !== null && native !== this.lastRefusalSnapshot) {
      for (const key of this.refusalEvidence.keys()) this.rejections.delete(key);
      this.refusalEvidence.clear();
      this.lastRefusalSnapshot = native;
    }
    const status = (enabled || menu) && call.name === "battle_action" && !call.isError && call.acted === false && native !== null &&
      (field === null || call.text.split("\n").includes("Battle action: nothing pressed: no battle is in progress."))
      ? call.text.split("\n").find(line => line.startsWith("Battle action: nothing pressed: "))?.slice(0, 2000) ?? null : null;
    return {native, status, menu:menu && status !== null};
  }

  refusalSequences(status: string): number[] | undefined {
    return this.refusalEvidence.get(`battle_action:${status}`);
  }

  rejectionHit(call: CompletedCall, refusal: string | null = null, seq=0): boolean {
    const rejection = refusal === null ? rejectionKey(call) : `battle_action:${refusal}`;
    if (rejection !== null) {
      const count = (this.rejections.get(rejection) ?? 0) + 1;
      this.rejections.set(rejection, count);
      if (refusal !== null) {
        const evidence = this.refusalEvidence.get(rejection) ?? [];
        evidence.push(seq);
        this.refusalEvidence.set(rejection,evidence.slice(-2));
        if (this.refusalEvidence.size > 16) this.refusalEvidence.delete(this.refusalEvidence.keys().next().value ?? "");
      }
      if (this.rejections.size > 16) this.rejections.delete(this.rejections.keys().next().value ?? "");
      return count >= this.policy.rejection;
    }
    if (!call.isError && !PLANNING.has(call.name)) {
      this.rejections.clear();
      this.refusalEvidence.clear();
    }
    return false;
  }

  finish(evaluation: BasicEvaluation): void {
    if (!evaluation.game) return;
    this.previous = evaluation.fingerprint;
    if (this.battles) {
      this.previousBattle = evaluation.battle;
      if (evaluation.battle !== null) {
        this.battlesSeen.push(evaluation.battle);
        if (this.battlesSeen.length > 16) this.battlesSeen.shift();
      }
    }
    if (this.ineffectiveLoops) {
      this.previousWaiting = evaluation.waiting;
      if (evaluation.waiting !== null) {
        this.waitingSeen.push(evaluation.waiting);
        if (this.waitingSeen.length > 16) this.waitingSeen.shift();
      }
    }
    if (evaluation.fingerprint !== null) {
      this.visited.push(evaluation.fingerprint);
      if (this.visited.length > 16) this.visited.shift();
    }
  }

  noteNovel(): void {
    this.messageVisits.length = 0;
  }

  resetCycles():void {this.history.length=0;}

  resetNativeProgress(): void {
    this.planning = 0;
    this.observations = 0;
    this.previous = null;
    this.history.length = 0;
    this.messageVisits.length = 0;
    this.visited.length = 0;
  }

  resetNovel(): void {
    this.rejections.clear();
    this.refusalEvidence.clear();
    this.ineffective = { key: "", count: 0 };
  }

  private restartedConversation(call: CompletedCall): boolean {
    const state = call.state;
    const before = call.beforeState;
    if (state === undefined || state.screen !== "overworld") return false;
    const current = this.conversation;
    const placeOf = (snapshot: typeof state): string => JSON.stringify([snapshot.location, snapshot.map_id, snapshot.position]);
    const place = placeOf(state);
    const text = state.world_context?.dialogue ?? null;
    const cursor = state.world_context?.message?.cursor ?? null;
    if (text === null || text === "") {
      current.open = false;
      current.cursor = null;
      if (place !== current.place) Object.assign(current, { text: "", place, restarts: 0 });
      return false;
    }
    const was = before?.world_context?.message?.cursor ?? null;
    const reprinted = before !== undefined && before.world_context?.dialogue === text &&
      placeOf(before) === place && cursor !== null && was !== null && cursor < was;
    if (text === current.text && place === current.place) {
      if (!current.open || (cursor !== null && current.cursor !== null && cursor < current.cursor) || reprinted) current.restarts++;
    } else Object.assign(current, { text, place, restarts: 0 });
    current.open = true;
    current.cursor = cursor;
    return current.restarts >= this.policy.ineffective;
  }
}

export const basicRule = (id: LoopRuleId, kind: LoopKind, enabled = true): LoopRule => ({
  id,
  kind,
  check: (_call: CompletedCall, context: RuleContext): LoopHit | null => enabled ? context.candidates?.get(id) ?? null : null,
  reset: () => undefined,
});
