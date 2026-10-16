import type { FixedStatusView } from "./fixed-status.js";
import { FRONTIER_MILESTONES, preciseTime } from "./frontier.js";
import { esc, hms, num } from "./format.js";
import type { WorkbenchRun, WorkbenchSplit } from "./workbench-data.js";
export function viewerUrl(run: string | null): string { return run === null ? "/" : `/#run=${encodeURIComponent(run)}`; }

// Lane, GPU and arm of a run a fixed-run runner is driving, from /api/experiments fixedRuns[].lanes[].
export interface RunLane { readonly lane: string; readonly gpu: string; readonly arm: string | null }
export type RunLanes = ReadonlyMap<string, RunLane>;
export function runLanes(fixedRuns: readonly FixedStatusView[]): RunLanes {
  const lanes = new Map<string, RunLane>();
  for (const status of fixedRuns) for (const lane of status.lanes) if (lane.run !== null) lanes.set(lane.run, { lane: lane.id, gpu: lane.gpu, arm: lane.arm });
  return lanes;
}
const ARM_COLORS: Readonly<Record<string, string>> = { control: "#2f6fb0", bundle: "#7a3fb8" };
// Any other arm gets a colour hashed from its own text, so a new arm needs no code change.
export function armColor(arm: string | null): string {
  if (arm === null) return "#a08020";
  const known = ARM_COLORS[arm];
  if (known !== undefined) return known;
  const hue = Array.from(arm).reduce((sum, ch, i) => sum + (ch.codePointAt(0) ?? 0) * (i + 7), 0) % 360;
  return `hsl(${String(hue)} 45% 36%)`;
}
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
// A plate stays gold while its latest milestone is younger than this on the run's live clock.
export const NEW_MILESTONE_MS = 30_000;
const pct = (part: number, whole: number): string => `${(whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0).toFixed(1)}%`;
// Lane data the page has not verified yet ("loading") or could not load ("unavailable"); never shown as a hand run.
export type LaneUnknown = "loading" | "unavailable";
function laneParts(run: WorkbenchRun, lanes: RunLanes | LaneUnknown): { where: string; type: string } {
  if (lanes === "loading") return { where: "LANE …", type: '<small class="wb-ty-unknown">…</small>' };
  if (lanes === "unavailable") return { where: "LANE ?", type: '<small class="wb-ty-unknown">lane data unavailable</small>' };
  const lane = lanes.get(run.id), arm = lane?.arm ?? null;
  return { where: lane === undefined ? "HAND RUN" : `LANE ${esc(lane.lane)} · ${esc(lane.gpu)}`, type: `<em style="--tyc:${armColor(arm)}">${arm === null ? "none" : esc(arm)}</em>` };
}
// What a run's name plate and trainer card both show: its clock, furthest milestone, and whether that milestone is new.
export interface PlateFacts { readonly live: boolean; readonly elapsed: number; readonly reached: ReachedMilestone | null; readonly level: number; readonly total: number; readonly recovered: boolean; readonly fresh: boolean; readonly cap: number | null }
export function plateFacts(run: WorkbenchRun, at: number, now: number): PlateFacts {
  const live = run.status === "live", elapsed = (run.elapsedMs ?? 0) + (live ? Math.max(0, now - at) : 0);
  const reached = furthestMilestone(run), level = reached === null ? 0 : reached.index + 1, total = FRONTIER_MILESTONES.length;
  const recovered = reached?.split.derived === true, age = reached === null ? -1 : elapsed - reached.split.elapsedMs;
  // A recovered split is a first-observation upper bound, not the moment it happened, so it never reads as new.
  const fresh = live && !recovered && age >= 0 && age < NEW_MILESTONE_MS;
  return { live, elapsed, reached, level, total, recovered, fresh, cap: run.config?.maxWallMs ?? null };
}
function plateHtml(run: WorkbenchRun, at: number, now: number, lanes: RunLanes | LaneUnknown): string {
  const { elapsed, reached, level, total, recovered, fresh, cap } = plateFacts(run, at, now), parts = laneParts(run, lanes), where = `${parts.where}${run.status === "paused" ? " · PAUSED" : ""}`;
  const when = reached === null ? "" : recovered ? `≤ ${clockText(reached.split.elapsedMs)} · ≤ turn ${String(reached.split.turn)} · recovered` : `${clockText(reached.split.elapsedMs)} · turn ${String(reached.split.turn)}`;
  const milestone = reached === null ? '<b class="none">No milestone yet</b><small>waiting for New game</small>' : `<b>${esc(reached.label)}</b>${fresh ? '<span class="wb-new-chip">NEW MILESTONE!</span>' : ""}<small>${when}</small>`;
  const resumed = (run.config?.resume === "CLOCK_SET" ? '<small class="wb-plate-note" data-current-field="note">NOT FROM ZERO · Clock set save</small>' : "")
    + (run.problem === null ? "" : `<small class="wb-plate-note wb-plate-problem" role="alert" data-current-field="problem">⚠ ${esc(run.problem)}</small>`);
  return `<a class="wb-plate${fresh ? " new" : ""}" href="${viewerUrl(run.id)}" aria-label="Watch run ${esc(run.id)}"><span class="wb-plate-l1"><span data-current-field="where">${where}</span><span data-current-field="level">Lv${String(level)}</span></span>`
    + `<span class="wb-ty" data-current-field="type"><i>TYPE/</i>${parts.type}</span>`
    + `<span class="wb-br"><span class="wb-lab"><span class="lf">MILESTONE</span><span class="ls">MI</span></span><span class="wb-hp"><span><i data-current-field="milestone-bar" style="width:${pct(level, total)}"></i></span></span><span class="wb-n" data-current-field="milestone-count">${String(level)}/ ${String(total)}</span></span>`
    + `<span class="wb-ms" data-current-field="milestone">${milestone}</span>`
    + `<span class="wb-br"><span class="wb-lab">TIME</span><span class="wb-tb"><span><i data-current-field="time-bar" style="width:${pct(cap === null ? 0 : elapsed, cap ?? 0)}"></i></span></span><span class="wb-n" data-current-field="time">${clockText(elapsed)}/ ${cap === null ? "no cap" : clockText(cap)}</span></span>${resumed}</a>`;
}
// One party card holding a name plate per live or paused run (design: current-run-milestone variant 36).
export function currentRunHtml(runs: readonly WorkbenchRun[], at: number, now: number, back: string | null, lanes: RunLanes | LaneUnknown = new Map()): string {
  const live = runs.filter(r => r.status === "live" || r.status === "paused");
  if (live.length === 0) return `<a class="wb-button" href="${viewerUrl(back)}">← BACK TO VIEWER</a>`;
  const models = Array.from(new Set(live.map(r => r.model ?? "Model not recorded"))).map(esc).join(" · ");
  return `<div class="wb-party"><div class="wb-party-head"><span class="wb-kicker" data-current-field="summary">● ${String(live.length)} CURRENT RUN${live.length === 1 ? "" : "S"} · ${models}</span><span class="wb-kicker">CHOOSE A RUN</span></div>`
    + `<div class="wb-plates">${live.map(run => plateHtml(run, at, now, lanes)).join("")}</div></div>`;
}
function pairs(rows: readonly (readonly [string, string])[]): string { return `<dl class="wb-pairs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`; }
export function runDetails(run: WorkbenchRun, selectedSplit: string | null): string {
  const c = run.config, split = run.splits.find(s => s.name === selectedSplit);
  const raw = run.measurement?.rawSplits.find(s => s.name === selectedSplit);
  const native = run.measurement === undefined ? "" : `<h3>TIMING & SOURCE EVIDENCE</h3>${pairs([[run.measurement.logBytes === undefined ? "Log SHA-256" : `Log snapshot SHA-256 (${String(run.measurement.logBytes)} bytes)`, run.measurement.logSha256], ["Applied pauses", `${String(run.measurement.pausedMs / 1000)} seconds`], ...(split === undefined ? [] : [["Active elapsed", `${split.derived === true ? "≤ " : ""}${preciseTime(split.elapsedMs)}`] as const, ["Timing basis", split.screenshotEvidence !== undefined ? "Visually reviewed, logged victory screenshots; observation upper bound, not a native trainer-flag timestamp." : split.derived === true ? `Recovered from recorded native state; first-observation upper bound.${split.name === "ROXANNE_DEFEATED" ? " Gym completion and Stone Badge prove Roxanne was defeated by this observation; the exact defeat time was not recorded." : ""}` : "Recorded native milestone"] as const]), ...(raw === undefined ? [] : [["Raw wall elapsed", preciseTime(raw.elapsedMs)] as const, [split?.screenshotEvidence === undefined ? "Native evidence" : "Reviewed screenshot events", raw.evidence.map(seq => `#${String(seq)}`).join(", ")] as const]), ...(run.measurement.artifact === undefined ? [] : [["Retained serving artifact", run.measurement.artifact.id] as const, ["Artifact receipt", `${run.measurement.artifact.receipt} · SHA256 ${run.measurement.artifact.sha256}`] as const]), ...(run.measurement.receipts ?? []).map(r => ["Launch receipt", `${r.path} · SHA256 ${r.sha256}`] as const)])}`;
  const screenshots = split?.screenshotEvidence?.map(frame => `<figure class="wb-proof-frame"><img src="/api/runs/${encodeURIComponent(run.id)}/${esc(frame.path)}" alt="Reviewed victory evidence, recorded screenshot #${String(frame.seq)}"/><figcaption>Recorded screenshot #${String(frame.seq)} · SHA1 ${esc(frame.sha1)}</figcaption></figure>`).join("") ?? "";
  const resumed = c?.resume === "CLOCK_SET" ? '<p class="wb-notice">This run loaded a Clock set save. It did not start from New game. Times count from when that save loaded.</p>' : "";
  return `<div class="wb-detail-head"><h2>RUN DETAILS</h2><button type="button" class="wb-button" data-close-detail aria-label="Close run details">× CLOSE</button></div><h3>${esc(run.model ?? "Model not recorded")}</h3><p class="wb-run-id">${esc(run.id)}</p><p>${esc(run.status)} · ${esc(run.reason ?? "no terminal outcome")}</p>${resumed}${run.problem === null && run.excluded === null ? "" : `<p class="wb-notice">${esc(run.problem ?? run.excluded ?? "")}</p>`}${native}${screenshots}<h3>MODEL & SAMPLING</h3>${c === null ? '<p>Model configuration was not recorded.</p>' : pairs([["Model", run.model ?? "not recorded"], ["Context", num(c.context)], ["Vision", c.vision ? "supported" : "not supported"], ["Thinking", c.thinking], ["Max output tokens", num(c.maxTokens)], ["Artifact / serving", "not recorded in run_start; no settings inferred from the model name"]])}<h3>HARNESS CONFIGURATION</h3>${c === null ? '<p>Harness configuration was not recorded.</p>' : pairs([["Source", `${c.source}${c.dirty ? " (dirty)" : ""}`], ["Preset", c.preset ?? "not recorded"], ["Fixed target", c.target ?? "not recorded / play to budget"], ["Start", c.resume === "CLOCK_SET" ? "Clock set save · not from New game" : c.start], ["Time cap", c.maxWallMs === null ? "not recorded" : hms(c.maxWallMs / 1000)], ["Turn cap", c.maxTurns === null ? "not recorded" : String(c.maxTurns)], ["Failure limit", c.failureLimit === null ? "not recorded" : String(c.failureLimit)], ["Vendor pin", c.vendor], ["pi version", c.pi], ["Tools", c.tools.join(", ")]])}<h3>FEATURES · RECORDED ON / OFF</h3>${c === null ? '<p>Feature settings were not recorded.</p>' : `<div class="wb-feature-list">${c.features.map(f => `<div><span>${esc(f.label)}<small>${esc(f.id)}</small></span><b class="${f.on === true ? "on" : f.on === false ? "off" : "unknown"}">${f.on === null ? "UNKNOWN" : f.on ? "ON" : "OFF"}</b></div>`).join("")}</div>`}<h3>${split === undefined ? "VERIFIED CHECKPOINTS" : "SELECTED CHECKPOINT"}</h3>${pairs((split === undefined ? run.splits : [split]).map(s => [s.name.replace(/_/g, " "), `${hms(s.elapsedMs / 1000)} · turn ${String(s.turn)} · ${s.derived === true ? (s.screenshotEvidence === undefined ? "recovered state (upper bound)" : "reviewed screenshot (upper bound)") : "milestone"} #${String(s.seq)} · ${num(s.outputTokens)} output tokens`]))}<a class="wb-button wb-primary" href="${viewerUrl(run.id)}">WATCH / REPLAY THIS RUN →</a>`;
}
