import type { RunEvent } from "../events.js";
import { MEASUREMENT_ONLY_MILESTONES, MILESTONES } from "../milestones.js";
import type { GameStateSnapshot } from "../game-state.js";
import {
  LOOP_POLICY,
  type CompletedCall,
  type LoopKind,
  type LoopCoordinatorOptions,
  type LoopMode,
  type LoopNotice,
  type LoopPolicy,
  type LoopHit,
  type LoopRule,
  type LoopRuleId,
  type StallKind,
} from "./types.js";
import { semanticState } from "./fingerprints.js";
import { CallTracker } from "./call-tracker.js";
import { BASIC_MESSAGES, BasicRules } from "./rules/basic.js";
import {
  FieldRules,
  PUSHBACK_MESSAGE,
  REVISIT_MESSAGE,
  TRANSITION_MESSAGE,
  TRIGGER_SCRIPT_MESSAGE,
} from "./rules/field.js";
export { PUSHBACK_MESSAGE, REVISIT_MESSAGE, TRIGGER_SCRIPT_MESSAGE } from "./rules/field.js";
import { buildLoopRules, firstLoopHit } from "./rules/index.js";
import {
  BATTLE_MENU_LOOP_MESSAGE,
  InterfaceRules,
} from "./rules/interfaces.js";

export { BATTLE_MENU_LOOP_MESSAGE, BATTLE_MENU_RETURNS } from "./rules/interfaces.js";

export { battleState, scriptHeld, semanticState, transientLock, waitingState } from "./fingerprints.js";

export {
  LOOP_POLICY,
  type CompletedCall,
  type LoopKind,
  type LoopCoordinatorOptions,
  type LoopMode,
  type LoopNotice,
  type LoopPolicy,
  type StallKind,
} from "./types.js";

// Story progress that resets the guard; measurement-only splits never change guard behavior.
export const NATIVE_PROGRESS_MILESTONES = MILESTONES.filter((m) => m.kind === "story" && !MEASUREMENT_ONLY_MILESTONES.has(m.name));

// stall-briefing-v1: stalls the loop checks above do not see.
export function readLoopMode(env: NodeJS.ProcessEnv = process.env): LoopMode {
  const flag = env["POKEBENCH_LOOP_GUARD"];
  if (flag !== undefined && flag !== "0" && flag !== "1")
    throw new Error("POKEBENCH_LOOP_GUARD must be 0 or 1");
  return flag === "0" ? "diagnostic" : "enforced";
}
export const WAITING_MESSAGE =
  "Repeated observations show the same open menu, prompt or message waiting for your input: observing again does not change it. Decide from what the game shows which input it needs, or choose a different approach using observed evidence.";
export class LoopCoordinator {
  stopped = false;
  readonly mode: LoopMode;
  private readonly notify: (notice: LoopNotice) => void;
  private readonly policy: LoopPolicy;
  private readonly interactions: boolean;
  private readonly supervisor: ((kind: LoopKind, calls: number) => string) | undefined;
  private readonly transitions: boolean;
  private readonly pushback: boolean;
  private readonly messageTruth: boolean;
  private readonly ineffectiveLoops: boolean;
  private readonly menuLoop: boolean;
  private readonly closedDialogue: boolean;
  private readonly triggerScriptLoops: boolean;
  private readonly battleRefusals: boolean;
  private readonly basic: BasicRules;
  private readonly rules: readonly LoopRule[];
  private readonly interfaces: InterfaceRules;
  private readonly field: FieldRules;
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
    refusalAnchor: string | null;
  } | null = null;
  private stallNote: { text: string; exposed: boolean } | null = null;
  private run: string | null = null;
  private eventSeq = -1;
  private nativeState: GameStateSnapshot | undefined;
  private readonly nativeValues = new Map<string, boolean | null>();
  private readonly achieved = new Set<string>();
  private readonly callTracker = new CallTracker();

  constructor(notify: (notice: LoopNotice) => void, options: LoopCoordinatorOptions = {}) {
    const {
      policy = LOOP_POLICY,
      mode = "enforced",
      interactions = false,
      supervisor,
      transitions = false,
      pushback = false,
      battles = false,
      messageTruth = false,
      ineffectiveLoops = false,
      menuLoop = false,
      clockViews = false,
      closedDialogue = false,
      triggerScriptLoops = false,
      battleRefusals = false,
    } = options;
    this.notify = notify;
    this.policy = policy;
    this.mode = mode;
    this.interactions = interactions;
    this.supervisor = supervisor;
    this.transitions = transitions;
    this.pushback = pushback;
    this.messageTruth = messageTruth;
    this.ineffectiveLoops = ineffectiveLoops;
    this.menuLoop = menuLoop;
    this.closedDialogue = closedDialogue;
    this.triggerScriptLoops = triggerScriptLoops;
    this.battleRefusals = battleRefusals;
    this.basic = new BasicRules(policy, interactions, battles, ineffectiveLoops, transitions);
    this.interfaces = new InterfaceRules(policy.ineffective, clockViews, closedDialogue, menuLoop);
    this.field = new FieldRules(policy, interactions, transitions, pushback, ineffectiveLoops, triggerScriptLoops);
    this.rules = buildLoopRules({
      interactions,
      transitions,
      pushback,
      battles,
      messageTruth,
      ineffectiveLoops,
      menuLoop,
      clockViews,
      closedDialogue,
      triggerScriptLoops,
    });
  }

  observe(event: RunEvent): void {
    this.run ??= event.run;
    if (event.run !== this.run || event.seq <= this.eventSeq) return;
    this.eventSeq = event.seq;
    if (event.type === "turn_start" && this.episode !== null)
      this.episode.exposed = true;
    if (this.transitions && event.type === "milestone" && event.origin !== "present_at_start" && event.name !== "GAME_RUNNING" && !MEASUREMENT_ONLY_MILESTONES.has(event.name))
      this.field.milestone();
    if (event.type === "state") {
      if ("started" in event) {
        this.field.observeState(event, event.seq, [...this.callTracker.pending()]);
        const menuStateReset = this.interfaces.observeState(event);
        if (menuStateReset && this.episode?.menu === true) this.recover(event.seq, false);
        if (this.ineffectiveLoops) {
          const said = (event.world_context?.dialogue || event.world_context?.message?.identity) ?? "";
          if (said !== "")
            for (const pending of this.callTracker.pending()) if (!(pending.dialogue ??= []).includes(said)) pending.dialogue.push(said);
        }
        if (this.closedDialogue||this.triggerScriptLoops) {
          const line = event.world_context?.dialogue ?? "";
          for (const pending of this.callTracker.pending()) {
            pending.spoken ??= [];
            if (line !== "" && !pending.spoken.includes(line)) pending.spoken.push(line);
          }
        }
        this.nativeProgress(event, event.seq);
        this.callTracker.state(event);
      } else {
        this.callTracker.state(event);
        this.nativeValues.clear();
        this.nativeState = undefined;
      }
    } else if (event.type === "telemetry_error" && event.source === "state")
      this.callTracker.stateError();
    else if (event.type === "tool_call") {
      this.callTracker.start(event);
      this.field.startCall(event.name, this.callTracker.latest);
    } else if (event.type === "button_press") {
      const tracked = this.callTracker.button(event, this.interactions);
      if (tracked !== undefined) {
        this.field.button(event.buttons, tracked.pending, tracked.started);
      }
    } else if (event.type === "tool_result") {
      this.complete(this.callTracker.finish(event,this.battleRefusals));
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

  complete(call: CompletedCall): void {
    if (this.stopped) return;
    this.completed++;
    if (this.stallNote?.exposed === true) this.stallNote = null;
    const seq = call.seq ?? this.completed;
    const refusal = this.basic.refusal(call,this.battleRefusals);
    if (this.episode?.refusalAnchor != null && !call.isError && call.state !== undefined) {
      const snapshot = refusal.native ?? semanticState(call.state,this.interactions);
      if (snapshot !== null && snapshot !== this.episode.refusalAnchor) this.recover(seq,true);
    }
    this.field.error(call);
    if (!this.basic.accepts(call)) return;
    if (this.episode?.exposed) this.episode.recovery++;
    const evaluation = this.basic.prepare(call);
    const recovery = this.field.recovery(call, evaluation.game,
      this.episode?.pushback === true ? "pushback" : this.episode?.revisit === true ? "revisit" : null);
    if (evaluation.novel) {
      this.basic.noteNovel();
      this.field.novel(recovery.newPlace);
    }
    if (
      this.episode?.refusalAnchor == null && (
        (evaluation.novel && !recovery.held) || recovery.escaped ||
        (evaluation.game && (call.name === "press" || (call.name === "navigate_to" && call.acted===true)) && this.episode?.kind === "planning")
      )
    )
      this.recover(seq, (evaluation.novel && !recovery.held) || recovery.escaped);
    const candidateIds = new Set<LoopRuleId>();
    let pushed: number[] | null = null;
    let revisited: number[] | null = null;
    let menuLooped: number[] | null = null;
    let triggerLooped:{readonly evidence:number[];readonly dialogue:string}|null=null;
    if (this.basic.planningHit(call, evaluation)) candidateIds.add("planning");
    const observation = this.basic.observationHit(call, evaluation);
    const waited = observation.waited;
    if (observation.hit) candidateIds.add("observation");
    const action = this.basic.actionCandidates(call, evaluation, (candidate) =>
      this.field.passableCall(candidate));
    if (action.interactionMessage) candidateIds.add("interaction-message");
    if (action.restartedDialogue) candidateIds.add("restarted-dialogue");
    const clockLoop = this.interfaces.clockHit(evaluation.game, call);
    if (clockLoop) candidateIds.add("clock-view");
    const closedLoop = this.interfaces.closedDialogueHit(evaluation.game, call);
    if (closedLoop) candidateIds.add("closed-dialogue");
    const reopened = action.reopened || closedLoop;
    if (action.ineffectiveAction) candidateIds.add("ineffective-action");
    if (action.stateCycle) candidateIds.add("state-cycle");
    if (evaluation.game) {
      const pushedBack = this.field.pushbackHit(call, seq);
      if (pushedBack !== null) {
        candidateIds.add("pushback");
        pushed = pushedBack;
      }
      const revisitedPlace = this.field.revisitHit(call, seq);
      if (revisitedPlace !== null) {
        candidateIds.add("revisit");
        revisited = revisitedPlace;
      }
      if (this.field.transitionHit(call)) {
        candidateIds.add("transition");
      }
      if (this.menuLoop) {
        const menu = this.interfaces.menuReturn(call, seq);
        if (menu.stateReset && this.episode?.menu === true) this.recover(seq, false);
        if (menu.evidence !== null) {
          candidateIds.add("battle-menu");
          menuLooped = menu.evidence;
        }
      }
      triggerLooped=this.field.triggerHit(call,seq);
      if(triggerLooped!==null)candidateIds.add("trigger-script");
      this.basic.finish(evaluation);
    }
    if (this.basic.rejectionHit(call,refusal.status,seq)) candidateIds.add("rejection");
    const candidates = new Map<LoopRuleId, LoopHit>();
    // Candidate collection order is intentionally not priority order. The static
    // registry below is the sole priority owner, and the production collision
    // test fails if this path is replaced with Map insertion-order selection.
    for (const id of [...candidateIds].reverse()) {
      const kind: LoopKind = id === "planning" ? "planning"
        : id === "observation" ? "observation"
          : id === "ineffective-action" ? "ineffective"
            : id === "rejection" ? "rejection"
              : id === "trigger-script" ? "trigger_script" : "cycle";
      const message = id === "trigger-script" && triggerLooped !== null ? TRIGGER_SCRIPT_MESSAGE(triggerLooped.dialogue)
        : id === "battle-menu" ? BATTLE_MENU_LOOP_MESSAGE
          : id === "pushback" ? PUSHBACK_MESSAGE
            : id === "revisit" ? REVISIT_MESSAGE
              : id === "observation" && waited ? WAITING_MESSAGE
                : id === "transition" ? TRANSITION_MESSAGE
                  : id === "ineffective-action" && call.name === "navigate_to"
                    ? "Repeated navigation attempts to the same target produced equivalent states. Inspect the destination and obstacle before trying again."
                    : this.interactions && (kind === "ineffective" || kind === "cycle")
                      ? `The same interaction or input pattern is repeating without new game information. Use a single input, inspect the resulting interface, and choose an evidence-supported different approach.${this.messageTruth && !reopened ? "" : " Reopening the same message is not story progress."}`
                      : BASIC_MESSAGES[kind];
      const evidenceSeqs = id === "trigger-script" ? triggerLooped?.evidence.slice(0, 1) ?? [seq]
        : id === "pushback" ? pushed?.slice(0, 1) ?? [seq]
          : id === "revisit" ? revisited?.slice(0, 1) ?? [seq]
            : id === "battle-menu" ? menuLooped?.slice(0, 1) ?? [seq] : [seq];
      candidates.set(id, {
        kind,
        message,
        evidenceSeqs,
        recovery: id === "pushback" || id === "revisit" ? "new-place"
          : id === "battle-menu" ? "interface-closed" : "novel-state",
      });
    }
    const selected = firstLoopHit(this.rules, call, { seq, policy: this.policy, candidates });
    const hit = selected?.hit.kind ?? null;
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
    if (selected === null || hit === null) return;
    if (this.episode === null) {
      this.episode = {
        kind: hit,
        // Trigger execution is observed after the other checks. The legacy detector
        // always attached that evidence/message when it coincided with an earlier hit.
        message: refusal.status !== null ? `Repeated battle action refusals pressed no buttons. ${refusal.status}` : triggerLooped !== null ? TRIGGER_SCRIPT_MESSAGE(triggerLooped.dialogue) : selected.hit.message,
        exposed: false,
        recovery: 0,
        threshold: false,
        // The first push-back of the repeated input, or the first of the moves ending on the loop's tile; the notice
        // adds the call that completed the count.
        evidence: (refusal.status === null ? undefined : this.basic.refusalSequences(refusal.status)) ?? triggerLooped?.evidence ?? [...selected.hit.evidenceSeqs],
        window: this.policy.recovery,
        briefing: null,
        pushback: selected.rule.id === "pushback",
        revisit: selected.rule.id === "revisit",
        menu: selected.rule.id === "battle-menu",
        refusalAnchor: refusal.status === null ? null : refusal.native,
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
    this.basic.resetNativeProgress();
    this.interfaces.resetNativeProgress();
    this.field.resetNativeProgress(this.callTracker.pending());
  }

  private noticeMessage(phase: "warning" | "recovered" | "stop" | "supervisor", episode: NonNullable<LoopCoordinator["episode"]>): string {
    const base = phase === "stop"
      ? `${episode.message} Bounded recovery ended without verified recovery; unknown readouts do not prove progress.`
      : phase === "supervisor" && episode.briefing !== null
        ? episode.briefing
        : episode.message;
    return episode.menu && phase === "supervisor" && !base.includes(BATTLE_MENU_LOOP_MESSAGE)
      ? `${base}\n${BATTLE_MENU_LOOP_MESSAGE}`
      : base;
  }

  private recover(seq: number, novel: boolean): void {
    if (this.episode !== null) this.notice("recovered", seq);
    this.episode = null;
    if (novel) {
      this.basic.resetNovel();
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
      ).slice(-2),
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
