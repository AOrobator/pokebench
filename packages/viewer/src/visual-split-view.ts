import { RunView } from "./model.js";
import type { WorkbenchRun } from "./workbench-data.js";
// Enrich a display projection, never its original events or the replay reducer.
// Apply only after the reviewed screenshot time; rewind hides it again.
export function visualSplitView(view: RunView, run: WorkbenchRun | undefined, nowMs: number): RunView {
  if (view.start === null || run?.id !== view.start.run || view.startMs === null) return view;
  const marks: RunView["milestones"] = [];
  for (const split of run.splits) {
    if (split.name !== "ROXANNE_FIRST_INTERACTION" || split.screenshotEvidence === undefined || view.milestones.some(m => m.name === split.name)) continue;
    const raw = run.measurement?.rawSplits.find(s => s.name === split.name);
    const ms=split.observedMs ?? (raw === undefined ? undefined : view.startMs+raw.elapsedMs);
    if (ms === undefined || ms > nowMs) continue;
    marks.push({name:split.name,ms,seq:split.seq,kind:"story",origin:"observed",derived:true,evidence:raw?.evidence ?? split.screenshotEvidence.map(frame=>frame.seq),screenshotEvidence:split.screenshotEvidence});
  }
  return marks.length === 0 ? view : Object.assign(new RunView(), view, {milestones:[...view.milestones,...marks].sort((a,b)=>a.ms-b.ms)});
}
