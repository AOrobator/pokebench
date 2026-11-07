import { customLane } from "./custom-lane.js";
import { FRONTIER_MILESTONES, endedByOperator, preciseTime, resumeMilestone } from "./frontier.js";
import { broadcastUrl, esc, hms, num } from "./format.js";
import { thinkingLabel } from "./served-effort.js";
import { PROBE_SESSION, type WorkbenchRun, type WorkbenchSplit } from "./workbench-data.js";
export function viewerUrl(run: string | null): string { return run === null ? "/" : `/#replay=${encodeURIComponent(run)}`; }

// Hardware location of a currently running fixed-run trial.
export interface RunLane { readonly lane: string; readonly gpu: string; readonly arm: string | null }
export type RunLanes = ReadonlyMap<string, RunLane>;
export interface ReachedMilestone { readonly index: number; readonly label: string; readonly split: WorkbenchSplit }
export function furthestMilestone(run: WorkbenchRun): ReachedMilestone | null {
  for (let index = FRONTIER_MILESTONES.length - 1; index >= 0; index--) {
    const milestone = FRONTIER_MILESTONES[index], split = run.splits.find(s => s.name === milestone?.id);
    if (milestone !== undefined && split !== undefined) return { index, label: milestone.label, split };
  }
  return null;
}
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${String(h)}:${String(m).padStart(2, "0")}:${sec}` : `${String(m)}:${sec}`;
}
// A card highlights while its latest milestone is younger than this on the run's live clock.
export const NEW_MILESTONE_MS = 30_000;
export type LaneUnknown = "loading" | "unavailable";
// Shared trainer card facts: its clock, furthest milestone, and whether that milestone is new.
export interface PlateFacts { readonly live: boolean; readonly elapsed: number; readonly reached: ReachedMilestone | null; readonly level: number; readonly total: number; readonly recovered: boolean; readonly fresh: boolean; readonly cap: number | null }
export function plateFacts(run: WorkbenchRun, at: number, now: number): PlateFacts {
  const live = run.status === "live", elapsed = (run.elapsedMs ?? 0) + (live ? Math.max(0, now - at) : 0);
  const reached = furthestMilestone(run), level = reached === null ? 0 : reached.index + 1, total = FRONTIER_MILESTONES.length;
  const recovered = reached?.split.derived === true, age = reached === null ? -1 : elapsed - reached.split.elapsedMs;
  // A recovered split is a first-observation upper bound, not the moment it happened, so it never reads as new.
  const fresh = live && !recovered && age >= 0 && age < NEW_MILESTONE_MS;
  return { live, elapsed, reached, level, total, recovered, fresh, cap: run.config?.extendedWallMs ?? run.config?.maxWallMs ?? null };
}
export function plateWhere(run: WorkbenchRun, lanes: RunLanes | LaneUnknown): string {
  const lane = typeof lanes === "string" ? undefined : lanes.get(run.id);
  const where = lanes === "loading" ? "Lane loading…" : lanes === "unavailable" ? "Lane data unavailable" : lane === undefined ? "HAND RUN" : `LANE ${esc(lane.lane)} · ${esc(lane.gpu)}`;
  return `${where}${run.status === "paused" ? " · PAUSED" : ""}`;
}
// Warnings a trainer card carries: a run that did not start from zero, and the run's problem.
export function plateNotes(run: WorkbenchRun): string {
  return (resumeMilestone(run) !== null ? `<small class="wb-card-note" data-current-field="note">NOT FROM ZERO · ${esc(resumeMilestone(run)?.label ?? "")} save</small>` : "")
    + (run.problem === null && run.clockWarning === undefined ? "" : `<small class="wb-card-note wb-card-problem" role="alert" data-current-field="problem">⚠ ${esc(run.problem ?? run.clockWarning ?? "")}</small>`);
}
export function partyHead(live: readonly WorkbenchRun[]): string {
  const models = Array.from(new Set(live.map(r => r.model ?? "Model not recorded"))).map(esc).join(" · ");
  return `<div class="wb-party-head"><span class="wb-kicker" data-current-field="summary">● ${String(live.length)} CURRENT RUN${live.length === 1 ? "" : "S"} · ${models}</span><span class="wb-kicker">CHOOSE A RUN</span></div>`;
}
export const isProbeRun = (run: WorkbenchRun): boolean => run.measurement?.features.includes("probe") === true || run.excluded === PROBE_SESSION;
export const liveOrPaused = (runs: readonly WorkbenchRun[]): WorkbenchRun[] => runs.filter(r => (r.status === "live" || r.status === "paused") && !isProbeRun(r));
export function currentRunLinks(runs: readonly WorkbenchRun[], lanes: RunLanes | LaneUnknown): readonly string[] {
  return liveOrPaused(runs).map(run => `<div class="wb-card"><a class="wb-button" data-watch="${esc(run.id)}" href="${viewerUrl(run.id)}" aria-label="Watch run ${esc(run.id)}">WATCH RUN · ${esc(run.id)}</a><small class="wb-card-where">${plateWhere(run, lanes)}</small>${plateNotes(run)}</div>`);
}
export function backToViewer(back: string | null): string { return `<a class="wb-button" href="${viewerUrl(back)}">← BACK TO VIEWER</a>`; }
function pairs(rows: readonly (readonly [string, string])[]): string { return `<dl class="wb-pairs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`; }
export function runDetails(run: WorkbenchRun, selectedSplit: string | null): string {
  const c = run.config, split = run.splits.find(s => s.name === selectedSplit);
  const raw = run.measurement?.rawSplits.find(s => s.name === selectedSplit);
  const native = run.measurement === undefined ? "" : `<h3>TIMING & SOURCE EVIDENCE</h3>${pairs([[run.measurement.logBytes === undefined ? "Log SHA-256" : `Log snapshot SHA-256 (${String(run.measurement.logBytes)} bytes)`, run.measurement.logSha256], ["Applied pauses", `${String(run.measurement.pausedMs / 1000)} seconds`], ...(split === undefined ? [] : [["Active elapsed", `${split.derived === true ? "≤ " : ""}${preciseTime(split.elapsedMs)}`] as const, ["Timing basis", split.screenshotEvidence !== undefined ? "Visually reviewed, logged game screenshots; observation upper bound, not a native milestone timestamp." : split.derived === true ? `Recovered from recorded native state; first-observation upper bound.${split.name === "ROXANNE_DEFEATED" ? " Gym completion and Stone Badge prove Roxanne was defeated by this observation; the exact defeat time was not recorded." : ""}` : "Recorded native milestone"] as const]), ...(raw === undefined ? [] : [["Raw wall elapsed", preciseTime(raw.elapsedMs)] as const, [split?.screenshotEvidence === undefined ? "Native evidence" : "Reviewed screenshot events", raw.evidence.map(seq => `#${String(seq)}`).join(", ")] as const]), ...(run.measurement.artifact === undefined ? [] : [["Retained serving artifact", run.measurement.artifact.id] as const, ["Artifact receipt", `${run.measurement.artifact.receipt} · SHA256 ${run.measurement.artifact.sha256}`] as const]), ...(run.measurement.receipts ?? []).map(r => ["Launch receipt", `${r.path} · SHA256 ${r.sha256}`] as const)])}`;
  const screenshots = split?.screenshotEvidence?.map(frame => `<figure class="wb-proof-frame"><img src="/api/runs/${encodeURIComponent(run.id)}/${esc(frame.path)}" alt="Reviewed game evidence, recorded screenshot #${String(frame.seq)}"/><figcaption>Recorded screenshot #${String(frame.seq)} · SHA1 ${esc(frame.sha1)}</figcaption></figure>`).join("") ?? "";
  const resumed = resumeMilestone(run) !== null ? `<p class="wb-notice">This run loaded a ${esc(resumeMilestone(run)?.label ?? "")} save. It did not start from New game. Times count from when that save loaded.</p>` : "";
  const lane = customLane(run), assisted = lane === null ? "" : `<p class="wb-notice"><b>HEAVILY ASSISTED</b>: ${esc(lane)}. It can take best overall, never best unhelped, and is never pooled with experiment cohorts.</p>`;
  return `<div class="wb-detail-head"><h2>RUN DETAILS</h2><button type="button" class="wb-button" data-close-detail aria-label="Close run details">× CLOSE</button></div><h3>${esc(run.model ?? "Model not recorded")}</h3><p class="wb-run-id">${esc(run.id)}</p><p><a class="wb-button" href="${esc(broadcastUrl(run.id))}" aria-label="Open run ${esc(run.id)} on the broadcast page">BROADCAST ↗</a></p><p>${esc(run.status)} · ${esc(run.reason ?? "no terminal outcome")}</p>${assisted}${resumed}${run.problem === null && run.excluded === null && run.clockWarning === undefined ? "" : `<p class="wb-notice">${esc(run.problem ?? run.excluded ?? run.clockWarning ?? "")}</p>`}${endedByOperator(run.reason) === null ? "" : `<p class="wb-notice">${esc(endedByOperator(run.reason) ?? "")}</p>`}${run.flag === undefined ? "" : `<p class="wb-notice">Flagged, still counted: ${esc(run.flag)}</p>`}${native}${screenshots}<h3>MODEL & SAMPLING</h3>${c === null ? '<p>Model configuration was not recorded.</p>' : pairs([["Model", run.model ?? "not recorded"], ["Context", num(c.context)], ["Vision", c.vision ? "supported" : "not supported"], ["Thinking", thinkingLabel({ thinking_level: c.thinking, reasoning_effort_sent: c.effortSent })], ["Max output tokens", num(c.maxTokens)], ["Artifact / serving", "not recorded in run_start; no settings inferred from the model name"]])}<h3>HARNESS CONFIGURATION</h3>${c === null ? '<p>Harness configuration was not recorded.</p>' : pairs([["Source", `${c.source}${c.dirty ? " (dirty)" : ""}`], ["Preset", c.preset ?? "not recorded"], ["Fixed target", c.target ?? "not recorded / play to budget"], ["Start", resumeMilestone(run) !== null ? `${resumeMilestone(run)?.label ?? ""} save · not from New game` : c.start], ["Time cap", (c.extendedWallMs ?? c.maxWallMs) === null ? "not recorded" : hms((c.extendedWallMs ?? c.maxWallMs ?? 0) / 1000)], ...(c.extendedWallMs === undefined ? [] : [["Original evaluation cap", c.maxWallMs === null ? "not recorded" : hms(c.maxWallMs / 1000)], ["Operator-extended continuation", `${hms(c.extendedWallMs / 1000)} total · original evaluation horizon unchanged`]] as [string, string][]), ["Turn cap", c.maxTurns === null ? "not recorded" : String(c.maxTurns)], ["Failure limit", c.failureLimit === null ? "not recorded" : String(c.failureLimit)], ["Vendor pin", c.vendor], ["pi version", c.pi], ["Tools", c.tools.join(", ")]])}<h3>FEATURES · RECORDED ON / OFF</h3>${c === null ? '<p>Feature settings were not recorded.</p>' : `<div class="wb-feature-list">${c.features.map(f => `<div><span>${esc(f.label)}<small>${esc(f.id)}</small></span><b class="${f.on === true ? "on" : f.on === false ? "off" : "unknown"}">${f.on === null ? "UNKNOWN" : f.on ? "ON" : "OFF"}</b></div>`).join("")}</div>`}<h3>${split === undefined ? "VERIFIED CHECKPOINTS" : "SELECTED CHECKPOINT"}</h3>${pairs((split === undefined ? run.splits : [split]).map(s => [s.name.replace(/_/g, " "), `${hms(s.elapsedMs / 1000)} · turn ${String(s.turn)} · ${s.derived === true ? (s.screenshotEvidence === undefined ? "recovered state (upper bound)" : "reviewed screenshot (upper bound)") : "milestone"} #${String(s.seq)} · ${num(s.outputTokens)} output tokens`]))}<a class="wb-button wb-primary" href="${viewerUrl(run.id)}">WATCH / REPLAY THIS RUN →</a>`;
}

export function parseRunLanes(value: unknown): RunLanes {
  if (!Array.isArray(value)) throw new Error("Invalid run lanes");
  const lanes = new Map<string, RunLane>();
  for (const row of value as unknown[]) {
    if (typeof row !== "object" || row === null || !("run" in row) || typeof row.run !== "string" || !("lane" in row) || typeof row.lane !== "string" || !("gpu" in row) || typeof row.gpu !== "string") throw new Error("Invalid run lane");
    lanes.set(row.run, { lane: row.lane, gpu: row.gpu, arm: null });
  }
  return lanes;
}
