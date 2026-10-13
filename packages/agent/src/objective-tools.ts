import type { AgentMessage, AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { ButtonSchema } from "./events.js";
import { CompletionInputSchema, CompletionSchema, EvidenceSchema, ObjectiveStatusSchema, validateCompletionType } from "./objective-schema.js";
import { ObjectiveTracker } from "./objectives.js";
import { observeTool, pressTool } from "./game-tools.js";
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
export const OBJECTIVE_PROMPT = `You also have get_objectives, set_objective and update_objective tools. The harness supplies the current objective, fixed overall goal, recent attempts and evidence sequence IDs before every turn. Set or revise objectives only from observed game evidence, explaining their alignment with the overall goal. Record obstacles and next decisions. Failed interaction attempts do not make a required task optional; reconsider the approach instead. Before pressing, have an active objective and next decision. Two matching failures warn; before a third matching attempt update the objective with a concrete retry_reason and evidence from the failed attempt or later. Never erase or ignore failed attempts. State-backed completion must match the latest observed state; screenshot/dialogue-only completion is reported_complete, not verified progress. Recheck the current objective against the overall goal whenever new game information arrives. Model memory is a hypothesis, not evidence.`;

function prepareObjective(args: unknown) {
  if (!Value.Check(SetArgs, args)) throw new Error("Invalid objective parameters");
  validateCompletionType(args.completion);
  return args;
}

export function objectiveTools(tracker: ObjectiveTracker, refreshCompletion?: (signal?: AbortSignal) => Promise<number>): AgentTool[] {
  return [
    { name: "get_objectives", label: "Read objectives", description: "Read the current objective, goal and full attempt history.", parameters: Type.Object({}, closed), execute: async (_id, _params, signal) => { await Promise.resolve(); signal?.throwIfAborted(); return reply({ goal: tracker.goal, objective: tracker.snapshot(), attempts: tracker.attempts }); } },
    { name: "set_objective", label: "Set objective", description: "Create or revise an objective using actual observation/state sequence IDs; retain attempt history.", parameters: SetGrammarArgs, prepareArguments: prepareObjective, execute: async (_id, params, signal) => { await Promise.resolve(); signal?.throwIfAborted(); return reply(tracker.set(prepareObjective(params))); } },
    { name: "update_objective", label: "Update objective", description: "Update obstacle, next decision or status with observed evidence. Completion is checked; retry_reason grants one reassessed attempt.", parameters: UpdateArgs, execute: async (_id, params, signal) => { await Promise.resolve(); signal?.throwIfAborted(); if (!Value.Check(UpdateArgs, params)) throw new Error("Invalid objective update");
      tracker.validateEvidence(params.evidence);
      if (params.status === "completed" && refreshCompletion !== undefined) {
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
export function objectiveGameTools(tracker: ObjectiveTracker, recorder: Pick<RunRecorder, "recordState" | "buttonPress" | "afterPress">, url: string, fetchFn: typeof fetch = fetch): AgentTool[] {
  const observe = observeTool(url, fetchFn);
  const submissions = { count: 0 };
  const press = pressTool(url, { beforePress: (id, buttons, timing, before) => { submissions.count += 1; recorder.buttonPress(id, buttons, timing, before); }, afterPress: () => recorder.afterPress() }, fetchFn);
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

export function objectiveHarness(goal: string, recorder: ObjectiveRecorder, url: string, fetchFn: typeof fetch = fetch) {
  const tracker = new ObjectiveTracker(goal, (body) => { recorder.recordObjective(body); });
  recorder.subscribe((event) => { tracker.observe(event); });
  return {
    tools: [...objectiveGameTools(tracker, recorder, url, fetchFn), ...objectiveTools(tracker, async (signal) => recorder.recordState(await readState(url, fetchFn, signal)).seq)],
    transformContext: (messages: AgentMessage[]) => recorder.transformContext(tracker.context(messages)),
  };
}
