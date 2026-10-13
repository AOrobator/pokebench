import type { AgentMessage, AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { ButtonSchema } from "./events.js";
import { CompletionInputSchema, CompletionSchema, NATIVE_OBJECTIVES, EvidenceSchema, ObjectiveStatusSchema, validateCompletionType } from "./objective-schema.js";
import { ALL_OBJECTIVE_SWITCHES, ObjectiveTracker, type ObjectiveSwitches } from "./objectives.js";
export { ALL_OBJECTIVE_SWITCHES, type ObjectiveSwitches };
import { ALL_TOOL_SWITCHES, observeTool, pressTool, type ToolSwitches } from "./game-tools.js";
import { parseGameState, StateWatcher } from "./game-state.js";
import type { RunRecorder } from "./recorder.js";

const PressArgs = Type.Object({ buttons: Type.Array(ButtonSchema, { minItems: 1, maxItems: 8 }) }, { additionalProperties: false });
const closed = { additionalProperties: false } as const;
const text = Type.String({ maxLength: 2000 });
const SetArgs = Type.Object({ title: Type.String({ minLength: 1, maxLength: 2000 }), supports_goal: Type.String({ minLength: 1, maxLength: 2000 }), evidence: EvidenceSchema, completion: CompletionSchema, obstacle: text, next_decision: Type.String({ minLength: 1, maxLength: 2000 }) }, closed);
// The deployed tool-grammar compiler rejects maxLength inside this union.
// Keep the original SetArgs authoritative for execution; only advertise a
// grammar-compatible copy, with the same limits explained to the model.
const SetGrammarArgs = structuredClone(Type.Object({ ...SetArgs.properties, completion: CompletionInputSchema }, closed));
type GrammarText = typeof text & { maxLength?: number; description?: string };
const stateText: GrammarText = SetGrammarArgs.properties.completion.anyOf[0].properties.value;
const visualText: GrammarText = SetGrammarArgs.properties.completion.anyOf[3].properties.description;
stateText.description = `At most ${String(stateText.maxLength)} characters; validated by the harness.`;
visualText.description = `At most ${String(visualText.maxLength)} characters; validated by the harness.`;
delete stateText.maxLength;
delete visualText.maxLength;
const UpdateArgs = Type.Object({ status: ObjectiveStatusSchema, evidence: EvidenceSchema, obstacle: text, next_decision: Type.String({ minLength: 1, maxLength: 2000 }), retry_reason: text }, closed);
const reply = (value: unknown): AgentToolResult<unknown> => ({ content: [{ type: "text", text: JSON.stringify(value) }], details: undefined });
const OBJECTIVE_PROMPT_TEXT = `You also have get_objectives, set_objective and update_objective tools. The harness supplies the current objective, fixed overall goal, recent attempts and evidence sequence IDs before every turn. Set or revise objectives only from observed game evidence, explaining their alignment with the overall goal. Record obstacles and next decisions. Failed interaction attempts do not make a required task optional; reconsider the approach instead. Before pressing, have an active objective and next decision. Two matching failures warn; before a third matching attempt update the objective with a concrete retry_reason and evidence from the failed attempt or later. Never erase or ignore failed attempts. For story/navigation tasks select completion kind milestone and a name from the harness catalog. The harness fixes the task meaning and automatically completes it from native game evidence; completed is reserved for those milestones. Scalar state and visual conditions are local provisional plans, using reported_complete; neither grades story progress. Matching a room location cannot complete setting its clock. Native completion does not end the benchmark or replace its fixed overall goal. Recheck the current objective against the overall goal whenever new game information arrives. Model memory is a hypothesis, not evidence.`;

const REPEAT_RULE = " Two matching failures warn; before a third matching attempt update the objective with a concrete retry_reason and evidence from the failed attempt or later.";
const NATIVE_RULE = " For story/navigation tasks select completion kind milestone and a name from the harness catalog. The harness fixes the task meaning and automatically completes it from native game evidence; completed is reserved for those milestones.";
const NATIVE_GOAL_RULE = " Native completion does not end the benchmark or replace its fixed overall goal.";
const NO_NATIVE_RULE = " Nothing completes automatically: when an objective is done, update it with status reported_complete and the evidence.";
export function objectivePrompt(switches: ObjectiveSwitches): string {
  let prompt = OBJECTIVE_PROMPT_TEXT;
  if (!switches.repeatGuard) prompt = prompt.replace(REPEAT_RULE, "");
  if (!switches.nativeCompletion) prompt = prompt.replace(NATIVE_RULE, NO_NATIVE_RULE).replace(NATIVE_GOAL_RULE, "");
  return prompt;
}
export const OBJECTIVE_PROMPT = objectivePrompt(ALL_OBJECTIVE_SWITCHES);

function prepareObjective(args: unknown) {
  if (!Value.Check(SetArgs, args)) throw new Error("Invalid objective parameters");
  validateCompletionType(args.completion);
  return args;
}

export function objectiveTools(tracker: ObjectiveTracker, refreshCompletion?: (signal?: AbortSignal) => Promise<number>, nativeCompletion = true): AgentTool[] {
  return [
    { name: "get_objectives", label: "Read objectives", description: "Read the current objective, goal and full attempt history.", parameters: Type.Object({}, closed), execute: async (_id, _params, signal) => { await Promise.resolve(); signal?.throwIfAborted(); return reply({ goal: tracker.goal, native_catalog: NATIVE_OBJECTIVES, objective: tracker.snapshot(), attempts: tracker.attempts }); } },
    { name: "set_objective", label: "Set objective", description: nativeCompletion ? "Select a harness-owned native milestone task or propose a provisional local plan using actual evidence sequence IDs. Native titles and verification are fixed by the harness; retain attempt history." : "Select a native milestone task from the harness catalog or propose a provisional local plan using actual evidence sequence IDs. Report completion yourself; retain attempt history.", parameters: SetGrammarArgs, prepareArguments: prepareObjective, execute: async (_id, params, signal) => { await Promise.resolve(); signal?.throwIfAborted(); return reply(tracker.set(prepareObjective(params))); } },
    { name: "update_objective", label: "Update objective", description: nativeCompletion ? "Update obstacle, next decision or local provisional status with observed evidence. Native milestone completion is automatic; completed cannot be claimed for local plans. retry_reason grants one reassessed attempt." : "Update obstacle, next decision or provisional status with observed evidence; use reported_complete when an objective is done. retry_reason grants one reassessed attempt.", parameters: UpdateArgs, execute: async (_id, params, signal) => { await Promise.resolve(); signal?.throwIfAborted(); if (!Value.Check(UpdateArgs, params)) throw new Error("Invalid objective update");
      tracker.validateEvidence(params.evidence);
      if ((params.status === "completed" || params.status === "reported_complete") && refreshCompletion !== undefined) {
        const seq = await refreshCompletion(signal);
        signal?.throwIfAborted();
        return reply(tracker.update({ ...params, evidence: [...params.evidence.slice(-15), seq] }));
      }
      return reply(tracker.update(params)); } },
  ];
}
async function readState(url: string, fetchFn: typeof fetch, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new StateWatcher(url, (input, options) => {
    const signals = [options?.signal, signal].filter((item): item is AbortSignal => item !== undefined && item !== null);
    return fetchFn(input, { ...options, signal: AbortSignal.any(signals) });
  }).read();
}
function resultState(result: AgentToolResult<unknown>) {
  const details: unknown = result.details;
  if (typeof details !== "object" || details === null || !("state" in details)) throw new Error("Game tool did not return coherent state details");
  return parseGameState(details.state);
}
export function objectiveGameTools(tracker: ObjectiveTracker, recorder: Pick<RunRecorder, "recordState" | "buttonPress" | "afterPress">, url: string, fetchFn: typeof fetch = fetch, switches: ToolSwitches = ALL_TOOL_SWITCHES): AgentTool[] {
  const observe = observeTool(url, fetchFn, switches);
  const submissions = { count: 0 };
  const press = pressTool(url, { beforePress: (id, buttons, timing, before) => { submissions.count += 1; recorder.buttonPress(id, buttons, timing, before); }, afterPress: () => recorder.afterPress() }, fetchFn, undefined, switches);
  return [
    { ...observe, execute: async (id, params, signal, update) => {
      const result = await observe.execute(id, params, signal, update);
      recorder.recordState(resultState(result));
      return result;
    } },
    { ...press, execute: async (id, params, signal, update) => {
      signal?.throwIfAborted();
      if (!Value.Check(PressArgs, params)) throw new Error("Invalid press parameters");
      const before = recorder.recordState(await readState(url, fetchFn, signal));
      tracker.checkPress(params.buttons, before);
      const submittedBefore = submissions.count;
      try {
        const result = await press.execute(id, params, signal, update);
        const after = recorder.recordState(resultState(result));
        const attempt = tracker.attempt(id, params.buttons, before, after);
        if (attempt.warning !== null) result.content.push({ type: "text", text: attempt.warning });
        return result;
      } catch (error) {
        if (submissions.count > submittedBefore) tracker.attempt(id, params.buttons, before, null);
        throw error;
      }
    } },
  ];
}

type ObjectiveRecorder = Pick<RunRecorder, "recordState" | "buttonPress" | "afterPress" | "subscribe" | "recordObjective" | "transformContext">;

export interface ObjectiveHarnessSwitches extends ObjectiveSwitches, ToolSwitches {}
export function objectiveHarness(goal: string, recorder: ObjectiveRecorder, url: string, fetchFn: typeof fetch = fetch, switches: ObjectiveHarnessSwitches = { ...ALL_OBJECTIVE_SWITCHES, ...ALL_TOOL_SWITCHES }) {
  const tracker = new ObjectiveTracker(goal, (body) => { recorder.recordObjective(body); }, switches);
  recorder.subscribe((event) => { tracker.observe(event); });
  return {
    tools: [...objectiveGameTools(tracker, recorder, url, fetchFn, switches), ...objectiveTools(tracker, async (signal) => recorder.recordState(await readState(url, fetchFn, signal)).seq, switches.nativeCompletion)],
    transformContext: (messages: AgentMessage[]) => recorder.transformContext(tracker.context(messages)),
  };
}
