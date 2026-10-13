import { NATIVE_OBJECTIVES, validateCompletionType } from "./objective-schema.js";
import { qualifiedNativeMilestone } from "./milestones.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { BodyOf, Button, RunEvent } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";
import type { Completion, ObjectiveAttempt, ObjectiveRecord } from "./objective-schema.js";

type StateEvent = Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }>;
type Write = (body: BodyOf<"objective_update"> | BodyOf<"objective_attempt">) => void;
export interface SetObjective {
  title: string; supports_goal: string; evidence: number[]; completion: Completion; obstacle: string; next_decision: string;
}
export interface UpdateObjective {
  status: ObjectiveRecord["status"]; evidence: number[]; obstacle: string; next_decision: string; retry_reason: string;
}
function stateOf(event: StateEvent): GameStateSnapshot { return event; }
function fingerprint(state: GameStateSnapshot): string {
  return JSON.stringify({ screen: state.screen, started: state.started, map_id: state.map_id, position: state.position, facing: state.facing, in_battle: state.in_battle, field_controls_locked: state.field_controls_locked ?? null, naming: state.naming ?? null, local_map: state.local_map ?? null, party: state.party, money: state.money, badges: state.badges });
}
function signature(buttons: readonly Button[], state: GameStateSnapshot): string {
  return JSON.stringify(buttons) + fingerprint(state);
}
function outcome(before: GameStateSnapshot, after: GameStateSnapshot): ObjectiveAttempt["outcome"] {
  if (before.map_id !== null && after.map_id !== null && (String(before.map_id) !== String(after.map_id) || before.position?.x !== after.position?.x || before.position?.y !== after.position?.y)) return "moved";
  if (before.facing !== null && after.facing !== null && before.facing !== after.facing) return "turned";
  if (fingerprint(before) !== fingerprint(after)) return "progress";
  if (before.screen !== "overworld" || before.position === null || before.field_controls_locked !== false) return "unavailable";
  return "no_change";
}
// State facts the objective record repeats to the model; an observation switch
// that is off hides its facts here too.
export const HIDEABLE_FACTS = ["position", "facing", "naming", "field_controls_locked"] as const;
export type HideableFact = (typeof HIDEABLE_FACTS)[number];
export interface ObjectiveSwitches { readonly repeatGuard: boolean; readonly nativeCompletion: boolean; readonly hiddenFacts?: readonly HideableFact[] }
export const ALL_OBJECTIVE_SWITCHES: ObjectiveSwitches = { repeatGuard: true, nativeCompletion: true };
export class ObjectiveTracker {
  private current: ObjectiveRecord | null = null;
  private readonly evidence = new Map<number, RunEvent>();
  private latest: StateEvent | null = null;
  private run: string | null = null;
  private readonly native = new Map<string, Extract<RunEvent, { type: "milestone" }>>();
  private readonly failures = new Map<string, number>();
  private retry: { reason: string } | null = null;
  private objectiveCount = 0;
  readonly attempts: ObjectiveAttempt[] = [];
  private readonly positions: string[] = [];
  constructor(readonly goal: string, private readonly write: Write, private readonly switches: ObjectiveSwitches = ALL_OBJECTIVE_SWITCHES) {}
  observe(event: RunEvent): void {
    this.run ??= event.run;
    if (event.run !== this.run) return;
    if (event.type === "state" && "started" in event) { this.latest = event; this.evidence.set(event.seq, event); }
    else if (event.type === "tool_result" && !event.is_error && (event.name === "observe" || event.name === "press")) this.evidence.set(event.seq, event);
    else if (event.type === "milestone") {
      const refs = event.evidence ?? [];
      const states = refs.map(seq => this.evidence.get(seq));
      if (this.switches.nativeCompletion && qualifiedNativeMilestone(event, states)) {
        if (!this.native.has(event.name)) this.native.set(event.name, event);
        this.evidence.set(event.seq, event);
        this.completeNative();
      }
    }
  }
  snapshot(): ObjectiveRecord | null { return this.current; }
  validateEvidence(refs: number[]): void {
    if (refs.length === 0 || refs.some((seq) => !this.evidence.has(seq))) throw new Error("Cite actual state/observation evidence sequence IDs from this run.");
  }
  set(request: SetObjective): ObjectiveRecord {
    validateCompletionType(request.completion);
    this.validateEvidence(request.evidence);
    const revise = this.current !== null && (this.current.status === "active" || this.current.status === "blocked");
    this.current = { ...request, id: revise ? this.current?.id ?? "" : `objective-${String(++this.objectiveCount)}`, revision: revise ? (this.current?.revision ?? 0) + 1 : 1, goal: this.goal, status: "active", completion_evidence: [] };
    if (request.completion.kind === "milestone") {
      this.current.title = NATIVE_OBJECTIVES[request.completion.name];
      this.current.supports_goal = this.switches.nativeCompletion ? "Harness-owned game milestone; completion requires recorded game evidence." : "Harness-catalog game milestone; report completion with evidence.";
    }
    this.retry = null;
    this.write({ type: "objective_update", turn: 0, objective: this.current });
    this.completeNative();
    return this.current;
  }
  private completeNative(): void {
    if (this.current?.completion.kind !== "milestone" || this.current.status === "completed") return;
    const proof = this.native.get(this.current.completion.name);
    if (proof === undefined || proof.origin === undefined || proof.evidence === undefined) return;
    this.current = { ...this.current, revision: this.current.revision + 1, status: "completed", completion_evidence: [proof.seq, ...proof.evidence], verification: { origin: proof.origin, milestone_seq: proof.seq, state_evidence: [...proof.evidence] } };
    this.write({ type: "objective_update", turn: proof.turn, objective: this.current });
  }
  update(request: UpdateObjective): ObjectiveRecord {
    if (this.current === null) throw new Error("Set an objective first.");
    this.validateEvidence(request.evidence);
    if (this.current.completion.kind === "milestone") {
      if (request.status === "reported_complete" && this.switches.nativeCompletion) throw new Error("Native milestones cannot be reported around the game check; observe until native evidence is recorded.");
      if (request.status === "completed" && this.current.status !== "completed") throw new Error(`Completion is not verified: native milestone ${this.current.completion.name} has not been recorded. ${this.switches.nativeCompletion ? "Observe; the harness completes it automatically." : "Report it with reported_complete and evidence."}`);
      if (this.current.status === "completed") return this.current;
    } else if (request.status === "completed") throw new Error("Completion is not verified: only a native milestone can use completed. Local state or visual plans use provisional reported_complete.");
    if (request.status === "reported_complete" && this.current.completion.kind === "state") {
      const completion = this.current.completion;
      if (this.latest === null) throw new Error("Completion is not verified: no current game state is available. Use observe, then cite its state evidence.");
      if (!request.evidence.includes(this.latest.seq)) throw new Error(`Completion is not verified: cite latest state #${String(this.latest.seq)}; supplied evidence is ${JSON.stringify(request.evidence)}. Use observe and cite the current state.`);
      if (!this.matches(completion, this.latest)) {
        const observed = completion.field === "party_count" ? this.latest.party.length : completion.field === "badge" ? this.latest.badges : this.latest[completion.field];
        throw new Error(`Completion is not verified: field "${completion.field}" expected ${JSON.stringify(completion.value)} (${typeof completion.value}), observed ${JSON.stringify(observed)} (${observed === null ? "null" : Array.isArray(observed) ? "array" : typeof observed}) at state #${String(this.latest.seq)}. Observe until it matches, or revise the condition with set_objective; a matching local condition is provisional reported_complete, never verified story progress.`);
      }
    }
    if (request.retry_reason.trim() !== "") {
      const last = this.attempts.at(-1);
      if (last === undefined || !request.evidence.some((seq) => seq >= (last.after_seq ?? last.before_seq))) throw new Error("Reassess using evidence from the failed attempt or later.");
      this.retry = { reason: request.retry_reason };
    }
    this.current = { ...this.current, revision: this.current.revision + 1, status: request.status, obstacle: request.obstacle, next_decision: request.next_decision, evidence: request.evidence, completion_evidence: request.status === "completed" || request.status === "reported_complete" ? request.evidence : [] };
    this.write({ type: "objective_update", turn: 0, objective: this.current });
    return this.current;
  }
  private matches(rule: Extract<Completion, { kind: "state" }>, state: GameStateSnapshot): boolean {
    if (rule.field === "party_count") return state.party.length === rule.value;
    if (rule.field === "badge") return typeof rule.value === "string" && state.badges.includes(rule.value);
    return state[rule.field] === rule.value;
  }
  checkPress(buttons: readonly Button[], state: GameStateSnapshot): void {
    if (this.current === null || this.current.status !== "active" || this.current.next_decision.trim() === "") throw new Error("Set an active objective and next decision before pressing.");
    if (this.switches.repeatGuard && (this.failures.get(signature(buttons, state)) ?? 0) >= 2 && this.retry === null) throw new Error("Two matching attempts made no observed progress. Reassess with update_objective and cited evidence before a third matching attempt.");
  }
  attempt(id: string, buttons: readonly Button[], before: StateEvent, after: StateEvent | null): ObjectiveAttempt {
    if (this.current === null) throw new Error("No objective for this attempt.");
    this.observe(before); if (after !== null) this.observe(after);
    const result = after === null ? "unavailable" : outcome(stateOf(before), stateOf(after));
    const key = signature(buttons, stateOf(before));
    const count = result === "no_change" ? (this.failures.get(key) ?? 0) + 1 : 0;
    if (result === "no_change") this.failures.set(key, count);
    let warning: string | null = this.switches.repeatGuard && count >= 2 ? "Two or more matching failures; reassessment required before repeating." : null;
    if (this.switches.repeatGuard && result === "moved" && after !== null && after.position !== null) {
      const position = `${String(after.map_id)}:${String(after.position.x)},${String(after.position.y)}`;
      this.positions.push(position);
      if (this.positions.slice(-8).filter((p) => p === position).length >= 3) warning = "Repeated return to the same position: possible navigation cycle; reassess the objective and approach.";
    }
    const record: ObjectiveAttempt = { id, objective_id: this.current.id, buttons: [...buttons], before_seq: before.seq, after_seq: after?.seq ?? null, outcome: result, failure_count: count, warning, retry_justification: this.retry?.reason ?? null };
    this.retry = null; this.attempts.push(record);
    this.write({ type: "objective_attempt", turn: 0, attempt: record });
    return record;
  }
  private visible<T extends Record<HideableFact, unknown>>(facts: T): Partial<T> {
    const hidden = this.switches.hiddenFacts ?? [];
    return Object.fromEntries(Object.entries(facts).filter(([key]) => !hidden.includes(key as HideableFact))) as Partial<T>;
  }
  context(messages: AgentMessage[], now = Date.now()): AgentMessage[] {
    const recent = [...this.evidence.values()].slice(-6).map((e) => ({ seq: e.seq, type: e.type, facts: e.type === "state" && "started" in e ? this.visible({ screen: e.screen, started: e.started, in_battle: e.in_battle, party_count: e.party.length, name: e.name, location: e.location, position: e.position, facing: e.facing, field_controls_locked: e.field_controls_locked, party: e.party, money: e.money, badges: e.badges, naming: e.naming }) : e.type === "tool_result" ? e.text.slice(0, 1500) : "" }));
    const content = `HARNESS OBJECTIVE RECORD\n${JSON.stringify({ goal: this.goal, objective: this.current, native_catalog: NATIVE_OBJECTIVES, ...(this.switches.nativeCompletion ? { recorded_native_milestones: [...this.native.values()].map(e => ({ name: e.name, seq: e.seq, origin: e.origin, evidence: e.evidence })) } : {}), recent_attempts: this.attempts.slice(-8), available_evidence: recent })}\n${this.switches.nativeCompletion ? "Only native milestone objectives are verified complete; local reported_complete plans are provisional and do not grade the run. Native tasks complete automatically; choose the next grounded task." : "Objectives are never completed automatically; report completion with evidence and choose the next grounded task."} Game evidence outranks remembered walkthroughs. Failure changes the approach, not whether an objective is required. Check the objective against the goal before acting. Use objective tools when evidence, obstacles, or decisions change.`;
    return [...messages, { role: "user", content, timestamp: now }];
  }
}
