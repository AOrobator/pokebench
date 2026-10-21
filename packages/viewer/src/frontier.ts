import { esc } from "./format.js";
import { harnessVersions, type VersionIndex } from "./frontier-versions.js";
import type { Baseline } from "./panels.js";
import type { WorkbenchRun } from "./workbench-data.js";
export const HUMAN_REFERENCE = "2026-10-13T23-50-13_human_1848";
export const ROUTE103_RIVAL_SPLITS: ReadonlySet<string> = new Set(["RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_OLDALE_SEND_OFF", "ROUTE_101_AFTER_RIVAL_BATTLE", "LITTLEROOT_AFTER_RIVAL_BATTLE"]);
export const FRONTIER_MILESTONES = [
  { id: "NEW_GAME_CREATED", label: "New game" }, { id: "PLAYER_NAME_CONFIRMED", label: "Name" },
  { id: "FIRST_TRUCK_EXIT", label: "Truck exit" }, { id: "LITTLEROOT_TOWN", label: "Littleroot" },
  { id: "PLAYER_HOUSE_ENTERED", label: "Enter home" }, { id: "MOM_CLOCK_INSTRUCTION", label: "Clock instruction" },
  { id: "PLAYER_BEDROOM", label: "Your bedroom" }, { id: "CLOCK_SET", label: "Clock set" },
  { id: "PLAYER_BEDROOM_EXITED_AFTER_CLOCK", label: "Leave bedroom" }, { id: "MOM_RIVAL_INSTRUCTION", label: "Rival instruction" },
  { id: "PLAYER_HOUSE_EXITED_AFTER_CLOCK", label: "Leave home" }, { id: "RIVAL_HOUSE_ENTERED", label: "Rival house" },
  { id: "RIVAL_BEDROOM_REACHED", label: "Rival bedroom" }, { id: "RIVAL_MET", label: "Rival met" },
  { id: "RIVAL_HOUSE_EXITED", label: "Left rival house" }, { id: "BIRCH_RESCUE_REQUESTED", label: "Sent to Birch" },
  { id: "ROUTE_101", label: "Route 101" }, { id: "STARTER_CHOSEN", label: "Starter" },
  { id: "BIRCH_RESCUE_COMPLETE", label: "Birch rescue" }, { id: "BIRCH_STARTER_HANDOFF_COMPLETE", label: "Birch handoff" },
  { id: "ROUTE_101_AFTER_HANDOFF", label: "Back on Route 101" }, { id: "OLDALE_TOWN", label: "Oldale" },
  { id: "ROUTE_103", label: "Route 103" }, { id: "RIVAL_BATTLE_STARTED", label: "Rival battle starts" },
  { id: "RIVAL_BATTLE_DEFEATED", label: "Rival beaten" }, { id: "RIVAL_BATTLE_WON", label: "Rival sends you back" },
  { id: "RIVAL_OLDALE_SEND_OFF", label: "Rival waits in Oldale" }, { id: "ROUTE_101_AFTER_RIVAL_BATTLE", label: "Route 101, heading back" },
  { id: "LITTLEROOT_AFTER_RIVAL_BATTLE", label: "Back in Littleroot" }, { id: "RECEIVED_POKEDEX", label: "Pokédex" },
  { id: "STARTER_TUTORIAL_COMPLETE", label: "Starter tutorial" }, { id: "RUNNING_SHOES_RECEIVED", label: "Running shoes" },
  { id: "ROUTE_102", label: "Route 102" }, { id: "PETALBURG_CITY", label: "Petalburg" },
  { id: "DAD_FIRST_MEETING", label: "Meet Dad" }, { id: "WALLY_TUTORIAL_COMPLETE", label: "Wally tutorial" },
  { id: "ROUTE_104", label: "Route 104" }, { id: "PETALBURG_WOODS", label: "Petalburg Woods" },
  { id: "TEAM_AQUA_WOODS_EVENT_COMPLETE", label: "Aqua woods event" }, { id: "RUSTBORO_CITY", label: "Rustboro" },
  { id: "RUSTBORO_CITY_GYM", label: "Gym entry" },
  // Operator decision 2026-10-20: count the three native pre-clear gym trainer wins in the frontier.
  { id: "RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", label: "Gym Josh" },
  { id: "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED", label: "Gym Tommy" },
  { id: "RUSTBORO_GYM_TRAINER_MARC_DEFEATED", label: "Gym Marc" },
  { id: "ROXANNE_DEFEATED", label: "Roxanne defeated" },
  { id: "RUSTBORO_GYM_COMPLETE", label: "Gym complete" }, { id: "STONE_BADGE", label: "Badge" },
  { id: "ROCK_TOMB_RECEIVED", label: "Rock Tomb" },
] as const;
const RECORD_ORDER: readonly string[] = FRONTIER_MILESTONES.map(m => m.id);
export interface ReferencePair { human: WorkbenchRun | null; best: WorkbenchRun | null }
// The agent frontier's live state as verified by the latest successful poll; null when it is finished or polling is unverified.
export type FrontierStatus = "live" | "paused" | null;
const modelName = (run: WorkbenchRun): string => run.model ?? "Model not recorded";
// A main-menu save (options set, before NEW GAME) starts the game from New game: it plots with boot runs, tagged.
const plottedAgent = (run: WorkbenchRun): boolean => run.excluded === null && run.problem === null && run.measurement?.controller === "agent" && (run.config?.start === "boot" || run.config?.resume === "MAIN_MENU");
// Only exact known story-checkpoint identities are admitted; arbitrary save files remain unclassified.
export function resumeMilestone(run: WorkbenchRun): (typeof FRONTIER_MILESTONES)[number] | null {
  return FRONTIER_MILESTONES.find(m => m.id === run.config?.resume) ?? null;
}
export const checkpointResume = (run: WorkbenchRun): boolean => run.excluded === null && run.problem === null && run.measurement?.controller === "agent" && resumeMilestone(run) !== null;
// Stopped/failed recordings keep trustworthy progress as dotted overlays, never frontier candidates.
const INVALID_TRIAL = "Invalid fixed-run trial: ";
export function invalidTrial(run: WorkbenchRun): string | null {
  if (run.problem !== null || run.excluded === null || run.measurement?.controller !== "agent") return null;
  const reason = run.excluded.startsWith(INVALID_TRIAL) ? run.excluded.slice(INVALID_TRIAL.length)
    : run.excluded === "Excluded operator-aborted run" || run.excluded.startsWith("Infrastructure outcome: ") || run.excluded.startsWith("Launcher outcome: ") ? run.excluded : null;
  return run.config?.start === "boot" || run.config?.resume === "MAIN_MENU" || resumeMilestone(run) !== null ? reason : null;
}
export const shownAgent = (run: WorkbenchRun): boolean => plottedAgent(run) || checkpointResume(run) || invalidTrial(run) !== null;
const resumedRun = (run: WorkbenchRun): boolean => checkpointResume(run) || (invalidTrial(run) !== null && resumeMilestone(run) !== null);
// Harness versions of every run the frontier can draw; previous keeps colors already given out (version key → color).
export function frontierVersions(runs: readonly WorkbenchRun[], previous: ReadonlyMap<string, string> = new Map()): VersionIndex {
  return harnessVersions(runs.filter(shownAgent), previous);
}
const OTHER_COLOR = "#536d85";
const versionLabel = (run: WorkbenchRun, versions: VersionIndex): string => versions.byRun.get(run.id)?.name ?? modelName(run);
export function preciseTime(ms: number): string {
  const whole = Math.floor(ms / 1000), fraction = String(Math.round(ms % 1000)).padStart(3, "0");
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}.${fraction}`;
}
const recordedRun = (r: WorkbenchRun): boolean => r.excluded === null && r.problem === null && r.measurement !== undefined && !r.measurement.features.some(f => /probe|synthetic|replay/.test(f));
// The agent frontier is the best New Game start (power-on or the main-menu save), live or finished; a checkpoint resume starts its clock mid-game, so it never competes.
const frontierCandidate = (r: WorkbenchRun): boolean => recordedRun(r) && r.measurement?.controller === "agent" && (r.config?.start === "boot" || r.config?.resume === "MAIN_MENU") && (r.status === "ended" || r.status === "live" || r.status === "paused");
export function frontierReferences(runs: readonly WorkbenchRun[]): ReferencePair {
  const rank = (r: WorkbenchRun): number => RECORD_ORDER.findLastIndex(name => r.splits.some(s => s.name === name && s.screenshotEvidence === undefined));
  const time = (r: WorkbenchRun): number => r.splits.find(s => s.name === RECORD_ORDER[rank(r)] && s.screenshotEvidence === undefined)?.elapsedMs ?? Infinity;
  const agents = runs.filter(r => frontierCandidate(r) && rank(r) >= 0);
  agents.sort((a, b) => rank(b) - rank(a) || time(a) - time(b) || a.id.localeCompare(b.id));
  return { human: runs.find(r => r.id === HUMAN_REFERENCE && recordedRun(r) && r.status === "ended" && r.config?.start === "boot" && r.measurement?.controller === "human") ?? null, best: agents[0] ?? null };
}
// The frontier a run's splits race: the frontier graph's agent frontier among the other runs (a frontier run races
// the next one, not itself), with its native splits; a checkpoint resume's clock starts mid-game, so it has none.
export function frontierSplits(runs: readonly WorkbenchRun[], current: string): Baseline | null {
  const self = runs.find(r => r.id === current);
  if (self !== undefined && resumeMilestone(self) !== null) return null;
  const best = frontierReferences(runs.filter(r => r.id !== current)).best;
  if (best === null) return null;
  return { run: best.id, milestones: best.splits.filter(s => s.screenshotEvidence === undefined).map(s => ({ name: s.name, offsetMs: s.elapsedMs, ...(s.derived === true ? { derived: true } : {}) })) };
}
export function milestoneStatus(run: WorkbenchRun, name: string): "reached" | "unsupported" | "pending" | "censored" | "not reached" | "excluded" {
  if (run.excluded !== null || run.problem !== null) return "excluded";
  if (run.splits.some(s => s.name === name)) return "reached";
  const features = run.measurement?.features;
  const required = name === "BIRCH_RESCUE_REQUESTED" ? "birch-rescue-requested-v1" : name === "RIVAL_HOUSE_EXITED" ? "rival-house-exit-v1" : name === "ROUTE_101_AFTER_HANDOFF" ? "route-101-after-handoff-v1" : name === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK" ? "bedroom-exit-v1" : ROUTE103_RIVAL_SPLITS.has(name) ? "route103-rival-splits-v1" : name.startsWith("RUSTBORO_GYM_TRAINER_") ? "rustboro-gym-trainer-milestones-v1" : name === "NEW_GAME_CREATED" ? "new-game-created-v1" : name === "ROXANNE_DEFEATED" ? "native-progress-activity-v1" : ["PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED"].includes(name) ? "post-clock-navigation-milestones-v1" : name === "CLOCK_SET" ? "clock-milestone-v1" : ["LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "PLAYER_BEDROOM", "ROUTE_101", "OLDALE_TOWN", "ROUTE_103", "ROUTE_102", "PETALBURG_CITY", "ROUTE_104", "PETALBURG_WOODS", "RUSTBORO_CITY", "RUSTBORO_CITY_GYM", "STONE_BADGE"].includes(name) ? "ram-state-v1" : "story-milestones-v2";
  if (features === undefined || !features.includes(required)) return "unsupported";
  return run.status === "ended" ? "not reached" : run.status === "live" || run.status === "paused" ? "pending" : "censored";
}
export function markerShape(shape: "human" | "best" | "overlay" | "resumed", x: number, y: number, color = "currentColor"): string {
  return shape === "best" ? `<path d="M ${String(x)} ${String(y - 6)} l 6 6 -6 6 -6 -6 Z"/>` : shape === "human" ? `<path d="M ${String(x)} ${String(y - 7)} l 2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0 Z"/>` : shape === "resumed" ? `<circle cx="${String(x)}" cy="${String(y)}" r="5" fill="#fff" stroke="${color}" stroke-width="2"/>` : `<circle cx="${String(x)}" cy="${String(y)}" r="4"/>`;
}
function mark(run: WorkbenchRun, name: string, x: number, y: number, color: string, shape: "human" | "best" | "overlay" | "resumed"): string {
  const split = run.splits.find(s => s.name === name); if (split === undefined) return "";
  const invalid = invalidTrial(run), why = invalid === null ? "" : ` · invalid trial: ${invalid}`;
  const sinceSave = resumeMilestone(run) !== null ? ` · resumed at ${resumeMilestone(run)?.label ?? ""}, not from New game; minutes since the save loaded` : run.config?.resume === "MAIN_MENU" ? " · started from the main-menu save (text speed FAST), not power-on; minutes since the save loaded" : "";
  const title = `${run.id} · ${name} · active ${split.derived === true ? "≤ " : ""}${preciseTime(split.elapsedMs)} · ${split.derived === true ? (split.screenshotEvidence === undefined ? "recovered native state (first observation upper bound)" : "reviewed screenshot (observation upper bound)") : "native milestone"} #${String(split.seq)}${sinceSave}${why}`;
  const body = markerShape(shape, x, y, color);
  return `<g class="wb-mark" role="button" tabindex="0" data-run="${esc(run.id)}" data-split="${esc(name)}" aria-label="${esc(title)}" fill="${color}" stroke="${color}" stroke-width="${shape === "best" ? "2" : "1"}"><title>${esc(title)}</title>${body}</g>`;
}
export function frontierLabel(run: WorkbenchRun, status: FrontierStatus, versions: VersionIndex): string {
  const state = status === "live" ? " · LIVE" : status === "paused" ? " · PAUSED" : "";
  const start = run.config?.resume === "MAIN_MENU" ? " · from main-menu save" : "";
  return `Agent frontier${state} · ${esc(versionLabel(run, versions))} · ${esc(run.id)}${start}`;
}
function zoomEnd(agents: readonly WorkbenchRun[], human: WorkbenchRun | null): number {
  const reached = (run: WorkbenchRun, i: number): boolean => run.splits.some(s => s.name === RECORD_ORDER[i]);
  const farthest = Math.max(-1, ...agents.map(run => Math.max(RECORD_ORDER.indexOf(run.config?.resume ?? ""), RECORD_ORDER.findLastIndex((_, i) => reached(run, i)))));
  const next = human === null ? -1 : RECORD_ORDER.findIndex((_, i) => i > farthest && reached(human, i));
  return Math.min(RECORD_ORDER.length - 1, Math.max(1, next === -1 ? farthest + 1 : next));
}
export function frontierPlot(refs: ReferencePair, overlays: readonly WorkbenchRun[], requestedWidth: number, given: VersionIndex | null = null, currentRuns: readonly WorkbenchRun[] = [], zoom = false, frontierStatus: FrontierStatus = null, focus: string | null = null, hideTimeOutliers = false, outlierRuns: readonly WorkbenchRun[] | null = null): string {
  const versions = given ?? frontierVersions([...overlays, ...currentRuns, ...(refs.best === null ? [] : [refs.best])]);
  const width = Number.isFinite(requestedWidth) ? Math.max(240, Math.round(requestedWidth)) : 640;
  const series: { run: WorkbenchRun; color: string; kind: "human" | "best" | "overlay" | "live" | "paused" | "resumed"; resumed: boolean }[] = [];
  const current = currentRuns.filter(r => shownAgent(r) && (r.status === "live" || r.status === "paused") && r.id !== refs.best?.id);
  const currentIds = new Set(current.map(r => r.id));
  if (refs.human !== null) series.push({ run: refs.human, color: "#304f7a", kind: "human", resumed: false });
  if (refs.best !== null) series.push({ run: refs.best, color: "#af8915", kind: "best", resumed: false });
  for (const run of overlays) if (!currentIds.has(run.id) && run.id !== refs.human?.id && run.id !== refs.best?.id && shownAgent(run)) series.push({ run, color: versions.byRun.get(run.id)?.color ?? OTHER_COLOR, kind: resumedRun(run) ? "resumed" : "overlay", resumed: resumedRun(run) });
  for (const run of current) series.push({ run, color: versions.byRun.get(run.id)?.color ?? OTHER_COLOR, kind: run.status === "live" ? "live" : "paused", resumed: checkpointResume(run) });
  const milestones = zoom ? FRONTIER_MILESTONES.slice(0, zoomEnd(series.filter(s => s.kind !== "human").map(s => s.run), refs.human) + 1) : FRONTIER_MILESTONES;
  const hidden = FRONTIER_MILESTONES.length - milestones.length, last = milestones[milestones.length - 1]?.label ?? "";
  const left = 43, right = width - 15, top = 20, bottom = 490, height = 635;
  const onChart = (run: WorkbenchRun, name: string): boolean => resumeMilestone(run) === null || RECORD_ORDER.indexOf(name) >= RECORD_ORDER.indexOf(run.config?.resume ?? "");
  const times = (run: WorkbenchRun, range: readonly { readonly id: string }[] = milestones): number[] => range.flatMap(m => onChart(run, m.id) ? run.splits.filter(p => p.name === m.id).map(p => p.elapsedMs / 60000) : []);
  // The workbench supplies all eligible recordings before its filters; a narrow selection cannot
  // turn an outlier into its own reference population. Story split maxima also survive range toggles.
  const population = outlierRuns === null ? series.filter(s => s.kind !== "human").map(s => s.run) : outlierRuns.filter(shownAgent);
  const outlierPeak = (run: WorkbenchRun): number => Math.max(0, ...times(run, outlierRuns === null ? milestones : FRONTIER_MILESTONES));
  const peaks = population.map(outlierPeak).filter(t => t > 0).sort((a, b) => a - b);
  const cutoff = peaks.length < 10 ? Infinity : 3 * (peaks[Math.ceil(peaks.length * 0.9) - 1] ?? Infinity);
  const removed = hideTimeOutliers ? series.filter(s => (s.kind === "overlay" || s.kind === "resumed") && s.run.status === "ended" && outlierPeak(s.run) > cutoff) : [];
  for (const entry of removed) series.splice(series.indexOf(entry), 1);
  const outlierSummary = removed.length === 0 ? "" : `${String(removed.length)} time outlier${removed.length === 1 ? "" : "s"} hidden: ${removed.map(s => s.run.id).join(", ")}. Turn off HIDE TIME OUTLIERS to restore every point.`;
  const values = series.flatMap(s => times(s.run));
  const peak = Math.max(0, ...values) * 1.08, step = peak > 60 ? 20 : peak > 20 ? 5 : peak > 10 ? 2 : 1;
  const max = Math.max(1, Math.ceil(peak / step) * step);
  const x = (i: number): number => left + (right - left) * i / (milestones.length - 1);
  const y = (minutes: number): number => bottom - (bottom - top) * minutes / max;
  let body = '<text x="0" y="10" class="wb-axis">Active minutes from that run\'s start · lower is faster</text>';
  for (let i = 0; i <= 4; i++) { const value = max * i / 4, at = y(value); body += `<line class="wb-gridline" x1="${String(left)}" x2="${String(right)}" y1="${String(at)}" y2="${String(at)}"/><text class="wb-axis" x="${String(left - 7)}" y="${String(at + 4)}" text-anchor="end">${String(Number(value.toFixed(1)))}</text>`; }
  const labelEvery = Math.ceil(milestones.length / Math.max(2, Math.floor((right - left) / 28)));
  const mustLabel = new Set<number>([milestones.length - 1]);
  for (const { run } of series) {
    let previous = false;
    milestones.forEach((m, i) => {
      const present = onChart(run, m.id) && run.splits.some(s => s.name === m.id);
      if (present && !previous) mustLabel.add(i);
      if (!present && previous) mustLabel.add(i - 1);
      previous = present;
    });
  }
  const origins = [...new Set(series.filter(s => s.resumed).map(s => s.run.config?.resume))];
  for (const id of origins) { const origin = milestones.findIndex(m => m.id === id); if (origin >= 0) mustLabel.add(origin); }
  milestones.forEach((m, i) => { if (i % labelEvery !== 0 && !mustLabel.has(i)) return; const at = x(i); body += `<text class="wb-axis" transform="translate(${String(at)},${String(bottom + 23)}) rotate(-60)" text-anchor="end">${m.label}</text>`; });
  for (const id of origins) {
    const origin = milestones.findIndex(m => m.id === id);
    if (origin >= 0) {
      const at = x(origin);
      body += `<line data-resume-origin="${esc(id ?? "")}" x1="${String(at)}" x2="${String(at)}" y1="${String(top)}" y2="${String(bottom)}" stroke="#b36b00" stroke-width="1.5" stroke-dasharray="3 4" pointer-events="none"/><text class="wb-resume-tag" data-resume-origin="${esc(id ?? "")}" x="${String(at)}" text-anchor="${origin > milestones.length / 2 ? "end" : "start"}" y="${String(top + 14)}">not from zero</text>`;
    }
  }
  for (const { run, color, kind, resumed } of series) {
    const active = kind === "live" || (kind === "best" && frontierStatus === "live"), isCurrent = active || kind === "paused" || (kind === "best" && frontierStatus !== null);
    const group = kind === "human" ? "__human" : kind === "best" ? "__best" : versions.byRun.get(run.id)?.id ?? "__other", member = kind === "best" ? versions.byRun.get(run.id)?.id : undefined;
    const on = focus !== null && (group === focus || member === focus), invalid = invalidTrial(run);
    body += `<g class="${["wb-series", on ? "wb-on" : "", active ? "wb-live-run" : "", isCurrent && !active ? "wb-paused-run" : "", resumed ? "wb-resumed-run" : "", invalid === null ? "" : "wb-invalid-run"].filter(c => c !== "").join(" ")}" data-version="${group}"${member === undefined ? "" : ` data-member="${member}"`}${isCurrent ? ` data-current-run="${esc(run.id)}"` : ""}${active ? ` data-live-run="${esc(run.id)}"` : ""}${resumed ? ` data-resume="${esc(run.config?.resume ?? "")}"` : ""}${invalid === null ? "" : ` data-invalid="${esc(invalid)}"`} style="--wb-run-color:${color}">`;
    let points: string[] = [];
    const flush = (): void => { if (points.length > 1) body += `<polyline data-series="${esc(run.id)}" fill="none" stroke="${color}" stroke-width="${kind === "overlay" || kind === "resumed" ? "1.5" : "2.5"}"${kind === "overlay" ? ' opacity=".8"' : ""}${invalid !== null ? ' stroke-dasharray="2 4"' : resumed ? ' stroke-dasharray="8 5"' : ""} points="${points.join(" ")}"/>`; points = []; };
    milestones.forEach((m, i) => { if (!onChart(run, m.id)) { flush(); return; } const split = run.splits.find(s => s.name === m.id); if (split === undefined) { if (milestoneStatus(invalid === null ? run : { ...run, excluded: null }, m.id) !== "unsupported") flush(); return; } const atX = x(i), atY = y(split.elapsedMs / 60000); points.push(`${String(atX)},${String(atY)}`); }); flush();
    milestones.forEach((m, i) => { if (!onChart(run, m.id)) return; const split = run.splits.find(s => s.name === m.id); if (split !== undefined) body += mark(run, m.id, x(i), y(split.elapsedMs / 60000), color, kind === "human" || kind === "best" ? kind : resumed ? "resumed" : "overlay"); });
    if (active) {
      const latest = milestones.findLastIndex(m => onChart(run, m.id) && run.splits.some(s => s.name === m.id));
      const split = run.splits.find(s => s.name === milestones[latest]?.id);
      if (split !== undefined) body += `<circle class="wb-live-head" cx="${String(x(latest))}" cy="${String(y(split.elapsedMs / 60000))}" r="10" fill="none" stroke="${color}" pointer-events="none"/>`;
    }
    body += "</g>";
  }
  // Account for selected recordings even when validation, start provenance or missing checkpoints prevent a trace.
  const selected = [...new Map([...overlays, ...currentRuns].map(run => [run.id, run])).values()];
  const visible = new Set(series.filter(s => times(s.run).length > 0).map(s => s.run.id));
  const hiddenIds = new Set(removed.map(s => s.run.id));
  const missing = selected.filter(run => !visible.has(run.id) && !hiddenIds.has(run.id));
  const reason = (run: WorkbenchRun): string => run.problem ?? (run.excluded !== null && invalidTrial(run) === null ? run.excluded : !shownAgent(run) ? "Unrecognized start provenance or controller; no trace graded" : "No recorded story checkpoints at or after this run's start");
  const loading = missing.filter(run => run.problem?.startsWith("Recording is still loading;") === true).length;
  const count = `${String(selected.length)} selected recordings · ${String(selected.filter(run => visible.has(run.id)).length)} plotted${hiddenIds.size === 0 ? "" : ` · ${String(hiddenIds.size)} time outliers hidden`}${loading === 0 ? "" : ` · ${String(loading)} loading`}${missing.length === loading ? "" : ` · ${String(missing.length - loading)} unavailable`}`;
  const coverage = `<details data-frontier-coverage class="wb-muted"><summary>${count}</summary><ul>${selected.map(run => {
    const last = milestones.findLast(m => onChart(run, m.id) && run.splits.some(s => s.name === m.id));
    const split = run.splits.find(s => s.name === last?.id);
    const progress = visible.has(run.id) ? `${run.status} · furthest recorded: ${last?.label ?? ""} at ${preciseTime(split?.elapsedMs ?? 0)}${invalidTrial(run) === null ? "" : ` · excluded: ${invalidTrial(run) ?? ""}`}` : hiddenIds.has(run.id) ? "Time outlier hidden; turn off HIDE TIME OUTLIERS to restore" : reason(run);
    return `<li><a href="/#replay=${encodeURIComponent(run.id)}">${esc(run.id)}</a> · ${esc(progress)}</li>`;
  }).join("")}</ul></details>`;
  const unavailable = `${refs.human === null ? '<p class="wb-muted">Human reference unavailable: recorded baseline is missing or invalid.</p>' : ""}${refs.best === null ? '<p class="wb-muted">Agent frontier unavailable: no valid New Game-start agent run has reached a story checkpoint yet.</p>' : ""}`;
  const currentKeys = current.map(run => { const color = versions.byRun.get(run.id)?.color ?? OTHER_COLOR; return `<span class="wb-current-key ${run.status === "live" ? "wb-live-key" : ""}" style="--wb-run-color:${color}" title="${esc(run.id)}"><i style="background:${color}"></i>${run.status === "live" ? "LIVE" : "PAUSED"}${checkpointResume(run) ? " · NOT FROM ZERO" : ""} · ${esc(versionLabel(run, versions))} · ${esc(run.id.slice(-4))}${run.splits.some(s => onChart(run, s.name) && milestones.some(m => m.id === s.name)) ? "" : " · waiting for first story checkpoint"}</span>`; }).join("");
  const legend = currentKeys === "" ? "" : `<div class="wb-model-legend wb-current-keys" aria-label="Runs in progress">${currentKeys}</div>`;
  return `${coverage}${unavailable}${legend}<svg data-hidden-outliers="${String(removed.length)}" data-outlier-summary="${esc(outlierSummary)}" class="wb-chart wb-frontier-chart${focus === null ? "" : " wb-dim"}" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="${hidden === 0 ? "Story and gym trainer frontier through badge" : `Story frontier zoomed to ${FRONTIER_MILESTONES[0].label} through ${last}`}">${body}</svg><p class="wb-muted">${hidden === 0 ? `${String(milestones.length)} progress checkpoints, including optional gym trainers.` : `Zoomed to the frontier: ${FRONTIER_MILESTONES[0].label} → ${last}, ${String(milestones.length)} of ${String(FRONTIER_MILESTONES.length)} checkpoints. ${String(hidden)} later checkpoints hidden; choose FULL BASELINE for the whole human run.`}${labelEvery === 1 ? "" : ` Some axis labels are hidden to fit this width; all ${hidden === 0 ? "recorded" : "visible"} points remain plotted.`} Recovered first-observation times are upper bounds (≤ in point details). A checkpoint the run recorded but missed breaks the line; one its build never recorded is skipped.</p>`;
}
