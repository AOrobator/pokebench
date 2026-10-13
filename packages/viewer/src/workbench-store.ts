import type { WorkbenchData } from "./workbench-data.js";
import type { HealthProbe, QueueStatus } from "./next-run.js";
export async function workbenchSnapshot(_root: string, _healthy: HealthProbe, _queue: QueueStatus, now: number): Promise<WorkbenchData> {
  return { version: 1, at: now, milestones: [], runs: [], queue: [], problems: [] };
}
