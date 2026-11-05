import type { WorkbenchRun } from "./workbench-data.js";
// Switches that hand the model the route or its next story step, which the benchmark asks it to find for itself.
export const KNOWLEDGE_SWITCHES: ReadonlySet<string> = new Set(["next-milestone-hint-v1", "objective-graph-supervisor-v1", "story-route-plan-v1"]);
export const CUSTOM_EXPERIMENT_PREFIX = "custom-";
// Pinned builds can record neither a lane field nor a weight hash, so the launcher's model id is the marker.
const WEIGHT_EDIT = /-edit-/i;
// Why a run stays off the benchmark frontier, or null for a benchmark run. Its recording, cards and replay are unaffected.
export function customLane(run: Pick<WorkbenchRun, "model" | "experiment" | "config">): string | null {
  const off = "Custom lane, kept off the benchmark frontier";
  if (run.model !== null && WEIGHT_EDIT.test(run.model)) return `${off}: weight-edited model`;
  if (run.experiment?.id.startsWith(CUSTOM_EXPERIMENT_PREFIX) === true) return `${off}: custom experiment`;
  const knowledge = run.config?.features.find(f => f.on === true && KNOWLEDGE_SWITCHES.has(f.id));
  return knowledge === undefined ? null : `${off}: ${knowledge.id} is on`;
}
