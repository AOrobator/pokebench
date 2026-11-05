import { customLane } from "./custom-lane.js";
import { esc } from "./format.js";
import { FRONTIER_MILESTONES, furthestCheckpoint, type ReferencePair } from "./frontier.js";
import type { WorkbenchRun } from "./workbench-data.js";
import { clockText } from "./workbench-view.js";
// The two answers above the story frontier: best overall, which may be heavily assisted, and best unhelped.
// Pure, and it also runs in the browser. Both tiles stay when no assisted run leads, so the layout never jumps.
export interface HeadlineTile { readonly run: string; readonly assisted: string | null; readonly label: string; readonly level: number; readonly elapsedMs: number; readonly who: string; readonly note: string | null }
export interface HeadlineModel { readonly overall: HeadlineTile | null; readonly unhelped: HeadlineTile | null; readonly gap: number | null; readonly same: boolean }
const note = (run: WorkbenchRun, assisted: string | null): string | null => {
  const state = run.status === "live" ? "live now" : run.status === "paused" ? "paused" : run.reason === "operator_abort" ? "ended by operator abort" : run.reason === "operator_stop" ? "ended by operator stop" : null;
  const parts = [assisted, state].filter(part => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
};
function tile(run: WorkbenchRun | null): HeadlineTile | null {
  const reached = run === null ? null : furthestCheckpoint(run);
  if (run === null || reached === null) return null;
  const assisted = customLane(run);
  return { run: run.id, assisted, label: reached.label, level: reached.index + 1, elapsedMs: reached.elapsedMs, who: `${run.model ?? "Model not recorded"} · ${run.id.slice(-4)}`, note: note(run, assisted) };
}
export function headlineModel(refs: ReferencePair): HeadlineModel {
  const overall = tile(refs.overall ?? null), unhelped = tile(refs.best);
  const same = overall !== null && overall.run === unhelped?.run;
  return { overall, unhelped, same, gap: overall === null || unhelped === null || same ? null : overall.level - unhelped.level };
}
const ICON = '<i class="wb-fh-icon" aria-hidden="true"></i>';
function card(key: string, name: string, chip: string, shown: HeadlineTile): string {
  const total = FRONTIER_MILESTONES.length, level = String(shown.level), of = String(total);
  return `<article class="wb-fh-tile${shown.assisted === null ? "" : " wb-fh-help"}" data-frontier-tile="${key}"><p class="wb-fh-key">${name}</p><p class="wb-fh-chips">${chip}</p><p class="wb-fh-mile">${esc(shown.label)}</p><p class="wb-fh-time">${clockText(shown.elapsedMs)} active</p>`
    + `<p class="wb-fh-story"><span class="wb-fh-word">STORY</span> <span class="wb-fh-bar" role="img" aria-label="${level} of ${of} checkpoints"><i style="width:${(100 * shown.level / total).toFixed(1)}%"></i></span> ${level}/${of}</p>`
    + `<p class="wb-fh-who">${esc(shown.who)}${shown.note === null ? "" : `<br>${esc(shown.note)}`}</p></article>`;
}
const plain = (text: string): string => `<span class="wb-fh-plain">${text}</span>`;
export function frontierHeadline(refs: ReferencePair): string {
  const { overall, unhelped, gap, same } = headlineModel(refs);
  if (overall === null) return "";
  const left = card("overall", "BEST OVERALL", overall.assisted === null ? plain("UNHELPED") : `<span class="wb-fh-badge">${ICON}HEAVILY ASSISTED</span>`, overall);
  const right = unhelped === null ? '<article class="wb-fh-tile" data-frontier-tile="unhelped"><p class="wb-fh-key">BEST UNHELPED</p><p class="wb-fh-who">No unhelped run has reached a checkpoint yet.</p></article>' : card("unhelped", "BEST UNHELPED", plain(same ? "SAME RUN" : "UNHELPED"), unhelped);
  const between = gap === null ? "" : `<p class="wb-fh-gap"><b>+${String(gap)}</b><span>checkpoint${gap === 1 ? "" : "s"}</span></p>`;
  return `<div class="wb-fh-heads${between === "" ? " wb-fh-same" : ""}">${left}${between}${right}</div><p class="wb-fh-rule">Best unhelped uses the Agent frontier rule. Heavily assisted runs are never pooled with experiment cohorts.</p>`;
}
