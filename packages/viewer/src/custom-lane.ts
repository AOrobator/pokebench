import type { WorkbenchRun } from "./workbench-data.js";
// Switches that hand the model the route or its next story step, which the benchmark asks it to find for itself.
export const KNOWLEDGE_SWITCHES: ReadonlySet<string> = new Set(["next-milestone-hint-v1", "objective-graph-supervisor-v1", "story-route-plan-v1"]);
export const CUSTOM_EXPERIMENT_PREFIX = "custom-";
// Pinned builds can record neither a lane field nor a weight hash, so the launcher's model id is the marker.
const WEIGHT_EDIT = /-edit-/i;
const WEIGHT_EDITED = "weight-edited model", CUSTOM_EXPERIMENT = "custom experiment";
const knowledgeOn = (id: string): string => `${id} is on`;
// How a run was helped, or null for a benchmark run. A custom lane shows on the frontier marked heavily assisted:
// it can take best overall, never best unhelped, and is never pooled with arm cohorts.
export function customLane(run: Pick<WorkbenchRun, "model" | "experiment" | "config">): string | null {
  if (run.model !== null && WEIGHT_EDIT.test(run.model)) return WEIGHT_EDITED;
  if (run.experiment?.id.startsWith(CUSTOM_EXPERIMENT_PREFIX) === true) return CUSTOM_EXPERIMENT;
  const knowledge = run.config?.features.find(f => f.on === true && KNOWLEDGE_SWITCHES.has(f.id));
  return knowledge === undefined ? null : knowledgeOn(knowledge.id);
}
export interface LaneStart { readonly model: { readonly id: string }; readonly harness_features: readonly string[]; readonly evaluation?: { readonly experiment?: { readonly id: string } } }
// The same answer from a recorded run_start, for the statistics that read logs rather than workbench runs.
export function customLaneOfStart(start: LaneStart): string | null {
  if (WEIGHT_EDIT.test(start.model.id)) return WEIGHT_EDITED;
  if (start.evaluation?.experiment?.id.startsWith(CUSTOM_EXPERIMENT_PREFIX) === true) return CUSTOM_EXPERIMENT;
  const knowledge = start.harness_features.find(id => KNOWLEDGE_SWITCHES.has(id));
  return knowledge === undefined ? null : knowledgeOn(knowledge);
}
