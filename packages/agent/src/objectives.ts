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
  if (before.screen !== "overworld" || before.position === null || before.field_controls_locked !== false || after.field_controls_locked !== false) return "unavailable";
  return "no_change";
}
export class ObjectiveTracker {
  private current: ObjectiveRecord | null = null;
  private readonly evidence = new Map<number, RunEvent>();
  private latest: StateEvent | null = null;
  private readonly failures = new Map<string, number>();
  private retry: { reason: string } | null = null;
  private objectiveCount = 0;
  readonly attempts: ObjectiveAttempt[] = [];
  private readonly positions: string[] = [];
  constructor(readonly goal: string, private readonly write: Write) {}
  observe(event: RunEvent): void {
    if (event.type === "state" && "started" in event) { this.latest = event; this.evidence.set(event.seq, event); }
    else if (event.type === "tool_result" && !event.is_error && (event.name === "observe" || event.name === "press")) this.evidence.set(event.seq, event);
  }
  snapshot(): ObjectiveRecord | null { return this.current; }
  validateEvidence(refs: number[]): void {
    if (refs.length === 0 || refs.some((seq) => !this.evidence.has(seq))) throw new Error("Cite actual state/observation evidence sequence IDs from this run.");
  }
  set(request: SetObjective): ObjectiveRecord {
    this.validateEvidence(request.evidence);
    const revise = this.current !== null && (this.current.status === "active" || this.current.status === "blocked");
    this.current = { ...request, id: revise ? this.current?.id ?? "" : `objective-${String(++this.objectiveCount)}`, revision: revise ? (this.current?.revision ?? 0) + 1 : 1, goal: this.goal, status: "active", completion_evidence: [] };
    this.retry = null;
    this.write({ type: "objective_update", turn: 0, objective: this.current });
    return this.current;
  }
  update(request: UpdateObjective): ObjectiveRecord {
    if (this.current === null) throw new Error("Set an objective first.");
    this.validateEvidence(request.evidence);
    if (request.status === "completed") {
      const completion = this.current.completion;
      if (completion.kind !== "state" || this.latest === null || !request.evidence.includes(this.latest.seq) || !this.matches(completion, this.latest)) throw new Error("Completion is not verified by the latest game state. Cite matching state evidence or use reported_complete for visual evidence.");
    }
    if (request.status === "reported_complete" && this.current.completion.kind !== "visual") throw new Error("State-backed completion must be checked, not reported around the check.");
    if (request.retry_reason !== "") {
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
    if ((this.failures.get(signature(buttons, state)) ?? 0) >= 2 && this.retry === null) throw new Error("Two matching attempts made no observed progress. Reassess with update_objective and cited evidence before a third matching attempt.");
  }
  attempt(id: string, buttons: readonly Button[], before: StateEvent, after: StateEvent | null): ObjectiveAttempt {
    if (this.current === null) throw new Error("No objective for this attempt.");
    this.observe(before); if (after !== null) this.observe(after);
    const result = after === null ? "unavailable" : outcome(stateOf(before), stateOf(after));
    const key = signature(buttons, stateOf(before));
    const count = result === "no_change" ? (this.failures.get(key) ?? 0) + 1 : 0;
    if (result === "no_change") this.failures.set(key, count);
    let warning: string | null = count >= 2 ? "Two or more matching failures; reassessment required before repeating." : null;
    if (result === "moved" && after !== null && after.position !== null) {
      const position = `${String(after.map_id)}:${String(after.position.x)},${String(after.position.y)}`;
      this.positions.push(position);
      if (this.positions.slice(-8).filter((p) => p === position).length >= 3) warning = "Repeated return to the same position: possible navigation cycle; reassess the objective and approach.";
    }
    const record: ObjectiveAttempt = { id, objective_id: this.current.id, buttons: [...buttons], before_seq: before.seq, after_seq: after?.seq ?? null, outcome: result, failure_count: count, warning, retry_justification: this.retry?.reason ?? null };
    this.retry = null; this.attempts.push(record);
    this.write({ type: "objective_attempt", turn: 0, attempt: record });
    return record;
  }
  context(messages: AgentMessage[], now = Date.now()): AgentMessage[] {
    const recent = [...this.evidence.values()].slice(-6).map((e) => ({ seq: e.seq, type: e.type, facts: e.type === "state" && "started" in e ? { screen: e.screen, name: e.name, location: e.location, position: e.position, facing: e.facing, field_controls_locked: e.field_controls_locked, party: e.party, money: e.money, badges: e.badges, naming: e.naming } : e.type === "tool_result" ? e.text.slice(0, 1500) : "" }));
    const content = `HARNESS OBJECTIVE RECORD\n${JSON.stringify({ goal: this.goal, objective: this.current, recent_attempts: this.attempts.slice(-8), available_evidence: recent })}\nGame evidence outranks remembered walkthroughs. Failure changes the approach, not whether an objective is required. Check the objective against the goal before acting. Use objective tools when evidence, obstacles, or decisions change.`;
    return [...messages, { role: "user", content, timestamp: now }];
  }
}
