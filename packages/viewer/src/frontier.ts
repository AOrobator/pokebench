import {PROGRESS_CATALOG, EXTENDED_PROGRESS_NAMES, OPTIONAL_PROGRESS_NAMES, CAMPAIGN_ADDITION_NAMES, CAMPAIGN_PROGRESS_FEATURE, STORY_PROGRESS_FEATURE} from "./story-progress.js";
import { customLane } from "./custom-lane.js";
import { esc } from "./format.js";
import { harnessVersions, type VersionIndex } from "./frontier-versions.js";
import type { Baseline } from "./panels.js";
import { PROBE_SESSION, type WorkbenchRun } from "./workbench-data.js";
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
  { id: "ROXANNE_FIRST_INTERACTION", label: "First Roxanne interaction" },
  { id: "ROXANNE_DEFEATED", label: "Roxanne defeated" },
  { id: "RUSTBORO_GYM_COMPLETE", label: "Gym complete" }, { id: "STONE_BADGE", label: "Badge" },
  { id: "ROCK_TOMB_RECEIVED", label: "Rock Tomb" },
  ...PROGRESS_CATALOG.filter(m=>EXTENDED_PROGRESS_NAMES.has(m.name)&&!OPTIONAL_PROGRESS_NAMES.has(m.name)).map(m=>({id:m.name,label:m.label})),
] as const;
const RECORD_ORDER: readonly string[] = FRONTIER_MILESTONES.map(m => m.id);
// best is the agent frontier, which never includes a custom lane: the best unhelped run. overall is the best run of all, which may be assisted.
export interface ReferencePair { human: WorkbenchRun | null; best: WorkbenchRun | null; overall?: WorkbenchRun | null }
// The agent frontier's live state as verified by the latest successful poll; null when it is finished or polling is unverified.
export type FrontierStatus = "live" | "paused" | null;
const modelName = (run: WorkbenchRun): string => run.model ?? "Model not recorded";
// Exact known story-checkpoint identities only. Trainer cards and run details read this one; the graph reads startMilestone.
export function resumeMilestone(run: WorkbenchRun): (typeof FRONTIER_MILESTONES)[number] | null {
  return FRONTIER_MILESTONES.find(m => m.id === run.config?.resume) ?? null;
}
// The frontier fails open (the operator 2026-11-05): only an operator exclusion takes a run off the graph. Everything else draws, tagged.
export const operatorExcluded = (run: WorkbenchRun): boolean => run.excluded !== null && run.excluded !== PROBE_SESSION;
export const drawnRun = (run: WorkbenchRun): boolean => !operatorExcluded(run);
const probeRun = (run: WorkbenchRun): boolean => run.excluded === PROBE_SESSION || run.measurement?.features.some(f => /probe|synthetic|replay/.test(f)) === true;
const newGameStart = (run: WorkbenchRun): boolean => run.config?.start === "boot" || run.config?.resume === "MAIN_MENU";
// Where a save start sits on the story axis: its checkpoint name, else the origin its provenance gives.
export function startMilestone(run: WorkbenchRun): (typeof FRONTIER_MILESTONES)[number] | null {
  return resumeMilestone(run) ?? FRONTIER_MILESTONES.find(m => m.id === run.origin?.milestone) ?? null;
}
// Any run that did not begin at New game, wherever it began.
export const checkpointResume = (run: WorkbenchRun): boolean => drawnRun(run) && !newGameStart(run);
export function frontierTags(run: WorkbenchRun): string[] {
  const controller = run.measurement?.controller as string | undefined;
  return [
    ...(probeRun(run) ? ["probe session"] : []),
    ...(controller === "agent" ? [] : [controller === undefined ? "controller not recorded" : `${controller} controller`]),
    ...(!newGameStart(run) && startMilestone(run) === null ? ["start unknown"] : []),
  ];
}
// Flagged recordings (a ledger's infrastructure or invalid-trial note) are drawn dotted for attention but
// still count, frontier included: how a run ended never decides inclusion (the operator 2026-10-27).
const INVALID_TRIAL = "Invalid fixed-run trial: ";
export function invalidTrial(run: WorkbenchRun): string | null {
  if (run.excluded !== null) return null;
  if (run.problem !== null) return run.problem;
  if (run.flag === undefined) return null;
  return run.flag.startsWith(INVALID_TRIAL) ? run.flag.slice(INVALID_TRIAL.length) : run.flag;
}
// The explicit marker for a run the operator ended: it stays in results.
export function endedByOperator(reason: string | null): string | null {
  const kind = reason === "operator_abort" ? "abort" : reason === "operator_stop" ? "stop" : null;
  return kind === null ? null : `Ended by operator ${kind} (${reason ?? ""}): progress before the ${kind} counts; later milestones are censored, not failures`;
}
// Harness versions of every benchmark run the frontier draws; previous keeps colors already given out (version key → color).
// Custom lanes, probes, broken logs and other controllers stay out, so they never renumber, recolor or become the "previous version" of a benchmark configuration.
export function frontierVersions(runs: readonly WorkbenchRun[], previous: ReadonlyMap<string, string> = new Map()): VersionIndex {
  return harnessVersions(runs.filter(run => drawnRun(run) && run.problem === null && run.config !== null && run.measurement?.controller === "agent" && !probeRun(run) && customLane(run) === null), previous);
}
const OTHER_COLOR = "#536d85", HIDDEN_OPEN_LIMIT = 20, RESUME_TAG_WIDTH = 78;
export const ASSISTED_COLOR = "#5a2fc2";
const runColor = (run: WorkbenchRun, versions: VersionIndex): string => customLane(run) !== null ? ASSISTED_COLOR : versions.byRun.get(run.id)?.color ?? OTHER_COLOR;
const versionLabel = (run: WorkbenchRun, versions: VersionIndex): string => versions.byRun.get(run.id)?.name ?? modelName(run);
export function preciseTime(ms: number): string {
  if (ms < 0) return `-${preciseTime(-ms)}`;
  const whole = Math.floor(ms / 1000), fraction = String(Math.round(ms % 1000)).padStart(3, "0");
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}.${fraction}`;
}
const recordedRun = (r: WorkbenchRun): boolean => r.excluded === null && r.problem === null && r.measurement !== undefined && !probeRun(r);
// The frontier's competitors are New Game starts (power-on or the main-menu save), live or finished; a checkpoint resume starts its clock mid-game, so it never competes.
const frontierCandidate = (r: WorkbenchRun): boolean => recordedRun(r) && r.measurement?.controller === "agent" && (r.config?.start === "boot" || r.config?.resume === "MAIN_MENU") && (r.status === "ended" || r.status === "live" || r.status === "paused" || r.status === "unresponsive");
const checkpointRank = (r: WorkbenchRun): number => RECORD_ORDER.findLastIndex(name => r.splits.some(s => s.name === name && s.screenshotEvidence === undefined));
const checkpointTime = (r: WorkbenchRun): number => r.splits.find(s => s.name === RECORD_ORDER[checkpointRank(r)] && s.screenshotEvidence === undefined)?.elapsedMs ?? Infinity;
const furthestFirst = (a: WorkbenchRun, b: WorkbenchRun): number => checkpointRank(b) - checkpointRank(a) || checkpointTime(a) - checkpointTime(b) || a.id.localeCompare(b.id);
// The furthest native checkpoint a run reached, the one that ranks it.
export function furthestCheckpoint(run: WorkbenchRun): { readonly index: number; readonly label: string; readonly elapsedMs: number } | null {
  const index = checkpointRank(run), milestone = FRONTIER_MILESTONES[index];
  return milestone === undefined ? null : { index, label: milestone.label, elapsedMs: checkpointTime(run) };
}
const rankedRuns = (runs: readonly WorkbenchRun[]): WorkbenchRun[] => runs.filter(r => frontierCandidate(r) && checkpointRank(r) >= 0).sort(furthestFirst);
// The agent frontier ranks benchmark runs only, so a custom lane never changes what a run races.
const rankedAgents = (runs: readonly WorkbenchRun[]): WorkbenchRun[] => rankedRuns(runs).filter(r => customLane(r) === null);
export function frontierReferences(runs: readonly WorkbenchRun[]): ReferencePair {
  const ranked = rankedRuns(runs);
  return { human: runs.find(r => r.id === HUMAN_REFERENCE && recordedRun(r) && r.status === "ended" && r.config?.start === "boot" && r.measurement?.controller === "human") ?? null, best: ranked.find(r => customLane(r) === null) ?? null, overall: ranked[0] ?? null };
}
// The frontier and the runner-up are enough to answer every run: excluding a run from the ranking only matters when it is the frontier.
export interface FrontierPair { readonly best: Baseline | null; readonly runnerUp: Baseline | null }
const nativeSplits = (run: WorkbenchRun | undefined): Baseline | null => run === undefined ? null : { run: run.id, milestones: run.splits.filter(s => s.screenshotEvidence === undefined).map(s => ({ name: s.name, offsetMs: s.elapsedMs, ...(s.derived === true ? { derived: true } : {}) })) };
export function frontierPair(runs: readonly WorkbenchRun[]): FrontierPair {
  const [best, runnerUp] = rankedAgents(runs);
  return { best: nativeSplits(best), runnerUp: nativeSplits(runnerUp) };
}
// The frontier a run's splits race: the frontier graph's agent frontier among the other runs (a frontier run races
// the next one, not itself), with its native splits; a checkpoint resume's clock starts mid-game, so it has none.
export function pairFrontier(pair: FrontierPair, current: string, resumed: boolean): Baseline | null {
  if (resumed) return null;
  return pair.best?.run === current ? pair.runnerUp : pair.best;
}
export const resumedCheckpoint = (resume: string | null | undefined): boolean => FRONTIER_MILESTONES.some(m => m.id === resume);
export function frontierSplits(runs: readonly WorkbenchRun[], current: string): Baseline | null {
  return pairFrontier(frontierPair(runs), current, resumedCheckpoint(runs.find(r => r.id === current)?.config?.resume));
}
export function milestoneStatus(run: WorkbenchRun, name: string): "reached" | "unsupported" | "pending" | "censored" | "not reached" | "excluded" {
  if (run.excluded !== null || run.problem !== null) return "excluded";
  if (run.splits.some(s => s.name === name)) return "reached";
  const features = run.measurement?.features;
  const required = EXTENDED_PROGRESS_NAMES.has(name) ? CAMPAIGN_ADDITION_NAMES.has(name)?CAMPAIGN_PROGRESS_FEATURE:STORY_PROGRESS_FEATURE : name === "ROXANNE_FIRST_INTERACTION" ? "roxanne-first-interaction-v1" : name === "BIRCH_RESCUE_REQUESTED" ? "birch-rescue-requested-v1" : name === "RIVAL_HOUSE_EXITED" ? "rival-house-exit-v1" : name === "ROUTE_101_AFTER_HANDOFF" ? "route-101-after-handoff-v1" : name === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK" ? "bedroom-exit-v1" : ROUTE103_RIVAL_SPLITS.has(name) ? "route103-rival-splits-v1" : name.startsWith("RUSTBORO_GYM_TRAINER_") ? "rustboro-gym-trainer-milestones-v1" : name === "NEW_GAME_CREATED" ? "new-game-created-v1" : name === "ROXANNE_DEFEATED" ? "native-progress-activity-v1" : ["PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED"].includes(name) ? "post-clock-navigation-milestones-v1" : name === "CLOCK_SET" ? "clock-milestone-v1" : ["LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "PLAYER_BEDROOM", "ROUTE_101", "OLDALE_TOWN", "ROUTE_103", "ROUTE_102", "PETALBURG_CITY", "ROUTE_104", "PETALBURG_WOODS", "RUSTBORO_CITY", "RUSTBORO_CITY_GYM", "STONE_BADGE"].includes(name) ? "ram-state-v1" : "story-milestones-v2";
  if (features === undefined || (!features.includes(required)&&!run.measurement?.recoveredFeatures?.includes(required))) return "unsupported";
  if (run.reason === "operator_abort" || run.reason === "operator_stop") return "censored";
  return run.status === "ended" ? "not reached" : run.status === "live" || run.status === "paused" ? "pending" : "censored";
}
export function markerShape(shape: "human" | "best" | "overlay" | "resumed" | "assisted", x: number, y: number, color = "currentColor"): string {
  return shape === "assisted" ? `<path d="M ${String(x)} ${String(y - 5)} l 5 5 -5 5 -5 -5 Z" fill="#fff" stroke="${color}" stroke-width="2"/>` : shape === "best" ? `<path d="M ${String(x)} ${String(y - 6)} l 6 6 -6 6 -6 -6 Z"/>` : shape === "human" ? `<path d="M ${String(x)} ${String(y - 7)} l 2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0 Z"/>` : shape === "resumed" ? `<circle cx="${String(x)}" cy="${String(y)}" r="5" fill="#fff" stroke="${color}" stroke-width="2"/>` : `<circle cx="${String(x)}" cy="${String(y)}" r="4"/>`;
}
function mark(run: WorkbenchRun, name: string, x: number, y: number, color: string, shape: "human" | "best" | "overlay" | "resumed" | "assisted"): string {
  const split = run.splits.find(s => s.name === name); if (split === undefined) return "";
  const invalid = invalidTrial(run), lane = customLane(run), tags = frontierTags(run).filter(tag => tag !== "start unknown"), why = `${tags.map(tag => ` · ${tag}`).join("")}${lane === null ? "" : ` · heavily assisted: ${lane}`}${invalid === null ? "" : ` · flagged: ${invalid}`}`;
  const start = startMilestone(run), from = run.origin?.sourceRun == null ? "" : ` from ${run.origin.sourceRun.slice(-4)}${run.origin.sourceTurn === null ? "" : ` turn ${String(run.origin.sourceTurn)}`}`;
  const sinceSave = start !== null ? ` · resumed at ${start.label}${from}, not from New game; minutes since the save loaded` : run.config?.resume === "MAIN_MENU" ? " · started from the main-menu save (text speed FAST), not power-on; minutes since the save loaded" : checkpointResume(run) ? ` · start unknown${run.origin === undefined || run.origin === null ? "" : ` (${run.origin.save}${from})`}, not from New game; minutes since that start` : "";
  const title = `${run.id} · ${name} · active ${split.derived === true ? "≤ " : ""}${preciseTime(split.elapsedMs)} · ${split.derived === true ? (split.screenshotEvidence === undefined ? "recovered native state (first observation upper bound)" : "reviewed screenshot (observation upper bound)") : "native milestone"} #${String(split.seq)}${sinceSave}${why}${run.clockWarning === undefined ? "" : ` · ${run.clockWarning}`}`;
  const body = markerShape(shape, x, y, color);
  return `<g class="wb-mark" role="button" tabindex="0" data-run="${esc(run.id)}" data-split="${esc(name)}" aria-label="${esc(title)}" fill="${color}" stroke="${color}" stroke-width="${shape === "best" || shape === "assisted" ? "2" : "1"}"><title>${esc(title)}</title>${body}</g>`;
}
export function frontierLabel(run: WorkbenchRun, status: FrontierStatus, versions: VersionIndex): string {
  const state = status === "live" ? " · LIVE" : status === "paused" ? " · PAUSED" : "";
  const start = run.config?.resume === "MAIN_MENU" ? " · from main-menu save" : "";
  const stopped = run.reason === "operator_abort" ? " · ended by operator abort" : run.reason === "operator_stop" ? " · ended by operator stop" : "";
  return `Agent frontier${state}${stopped} · ${esc(versionLabel(run, versions))} · ${esc(run.id)}${start}`;
}
// The one flag on the chart, hung from the furthest assisted run's head; it turns upward when the head sits too low to hang.
function assistedFlag(run: WorkbenchRun, x: number, y: number, bottom: number): string {
  const width = 124, height = 17, stem = 48, gap = 6, down = y + gap + stem + height <= bottom;
  const end = down ? y + gap + stem : y - gap - stem, top = down ? end : end - height, left = Math.max(0, x + gap - width);
  return `<g data-assisted-flag="${esc(run.id)}" pointer-events="none"><line x1="${String(x)}" x2="${String(x)}" y1="${String(down ? y + gap : y - gap)}" y2="${String(end)}" stroke="#283038" stroke-width="2"/><rect x="${String(left)}" y="${String(top)}" width="${String(width)}" height="${String(height)}" rx="3" fill="${ASSISTED_COLOR}" stroke="#283038" stroke-width="2"/><text class="wb-assist-flag" x="${String(left + gap)}" y="${String(top + 11.5)}">HEAVILY ASSISTED</text></g>`;
}
function zoomEnd(agents: readonly WorkbenchRun[], human: WorkbenchRun | null): number {
  const reached = (run: WorkbenchRun, i: number): boolean => run.splits.some(s => s.name === RECORD_ORDER[i]);
  const farthest = Math.max(-1, ...agents.map(run => Math.max(RECORD_ORDER.indexOf(startMilestone(run)?.id ?? ""), RECORD_ORDER.findLastIndex((_, i) => reached(run, i)))));
  const next = human === null ? -1 : RECORD_ORDER.findIndex((_, i) => i > farthest && reached(human, i));
  return Math.min(RECORD_ORDER.length - 1, Math.max(1, next === -1 ? farthest + 1 : next));
}
// The frontier story graph for one run against the agent frontier: the same drawing, two lines, no legend.
export function racePlot(frontier: Baseline, run: WorkbenchRun, width: number): string {
  if (run.config === null) return "";
  const agent = (source: WorkbenchRun): WorkbenchRun => ({ ...source, excluded: null, problem: null, measurement: source.measurement ?? { controller: "agent", features: [], logSha256: "", pausedMs: 0, rawSplits: [] } });
  const plain: WorkbenchRun = { ...run, origin: null, id: frontier.run, status: "ended", reason: null, elapsedMs: null, turn: 0, card: null, config: { ...run.config, start: "boot", resume: null }, splits: frontier.milestones.map(m => ({ name: m.name, elapsedMs: m.offsetMs, segmentMs: 0, seq: 0, turn: 0, inputTokens: 0, outputTokens: 0, ...(m.derived === true ? { derived: true as const } : {}) })) };
  const live = run.status === "live" || run.status === "paused";
  const html = frontierPlot({ human: null, best: agent(plain) }, live ? [] : [agent(run)], width, null, live ? [agent(run)] : [], true);
  return html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6).replaceAll(" · native milestone #0", "");
}
export function frontierPlot(refs: ReferencePair, overlays: readonly WorkbenchRun[], requestedWidth: number, given: VersionIndex | null = null, currentRuns: readonly WorkbenchRun[] = [], zoom = false, frontierStatus: FrontierStatus = null, focus: string | null = null): string {
  const versions = given ?? frontierVersions([...overlays, ...currentRuns, ...(refs.best === null ? [] : [refs.best])]);
  const width = Number.isFinite(requestedWidth) ? Math.max(240, Math.round(requestedWidth)) : 640;
  const series: { run: WorkbenchRun; color: string; kind: "human" | "best" | "overlay" | "live" | "paused" | "resumed"; resumed: boolean; assisted: string | null }[] = [];
  const current = currentRuns.filter(r => drawnRun(r) && (r.status === "live" || r.status === "paused") && r.id !== refs.best?.id);
  const currentIds = new Set(current.map(r => r.id));
  if (refs.human !== null) series.push({ run: refs.human, color: "#304f7a", kind: "human", resumed: false, assisted: null });
  if (refs.best !== null) series.push({ run: refs.best, color: "#af8915", kind: "best", resumed: false, assisted: null });
  for (const run of overlays) if (!currentIds.has(run.id) && run.id !== refs.human?.id && run.id !== refs.best?.id && drawnRun(run)) series.push({ run, color: runColor(run, versions), kind: checkpointResume(run) ? "resumed" : "overlay", resumed: checkpointResume(run), assisted: customLane(run) });
  for (const run of current) series.push({ run, color: runColor(run, versions), kind: run.status === "live" ? "live" : "paused", resumed: checkpointResume(run), assisted: customLane(run) });
  // The headline names the best overall run, so the chart shows it whatever the filters select.
  if (refs.overall != null && refs.overall.id !== refs.best?.id && !series.some(s => s.run.id === refs.overall?.id)) series.push({ run: refs.overall, color: ASSISTED_COLOR, kind: "overlay", resumed: false, assisted: customLane(refs.overall) });
  const flagged = series.filter(s => s.assisted !== null).map(s => s.run).sort(furthestFirst)[0];
  const milestones = zoom ? FRONTIER_MILESTONES.slice(0, zoomEnd(series.filter(s => s.kind !== "human").map(s => s.run), refs.human) + 1) : FRONTIER_MILESTONES;
  const hidden = FRONTIER_MILESTONES.length - milestones.length, last = milestones[milestones.length - 1]?.label ?? "";
  const left = 43, right = width - 15, top = 20, bottom = 490, height = 635;
  const onChart = (run: WorkbenchRun, name: string): boolean => { const start = startMilestone(run); return start === null || RECORD_ORDER.indexOf(name) >= RECORD_ORDER.indexOf(start.id); };
  const times = (run: WorkbenchRun, range: readonly { readonly id: string }[] = milestones): number[] => range.flatMap(m => onChart(run, m.id) ? run.splits.filter(p => p.name === m.id).map(p => p.elapsedMs / 60000) : []);
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
  const origins = [...new Set(series.filter(s => s.resumed).flatMap(s => startMilestone(s.run)?.id ?? []))];
  for (const id of origins) { const origin = milestones.findIndex(m => m.id === id); if (origin >= 0) mustLabel.add(origin); }
  const labels=new Set<number>([0,milestones.length-1]);
  const labelSpacing=width<600?26:18;let previousLabel=0;
  for(let i=1;i<milestones.length-1;i++)if((i%labelEvery===0||mustLabel.has(i))&&x(i)-x(previousLabel)>=labelSpacing&&x(milestones.length-1)-x(i)>=labelSpacing){labels.add(i);previousLabel=i;}
  milestones.forEach((m, i) => { if (!labels.has(i)) return; const at = x(i); body += `<text class="wb-axis" transform="translate(${String(at)},${String(bottom + 23)}) rotate(-60)" text-anchor="end">${m.label}</text>`; });
  let tagEnd = -Infinity;
  for (const origin of origins.map(id => milestones.findIndex(m => m.id === id)).filter(i => i >= 0).sort((a, b) => a - b)) {
    const id = milestones[origin]?.id ?? "", at = x(origin), end = origin > milestones.length / 2, tagStart = end ? at - RESUME_TAG_WIDTH : at;
    body += `<line data-resume-origin="${esc(id)}" x1="${String(at)}" x2="${String(at)}" y1="${String(top)}" y2="${String(bottom)}" stroke="#b36b00" stroke-width="1.5" stroke-dasharray="3 4" pointer-events="none"/>`;
    // Every origin keeps its rule; a label that would land on the one before it is left off.
    if (tagStart < tagEnd) continue;
    tagEnd = tagStart + RESUME_TAG_WIDTH;
    body += `<text class="wb-resume-tag" data-resume-origin="${esc(id)}" x="${String(at)}" text-anchor="${origin > milestones.length / 2 ? "end" : "start"}" y="${String(top + 14)}">not from zero</text>`;
  }
  for (const { run, color, kind, resumed, assisted } of series) {
    const active = kind === "live" || (kind === "best" && frontierStatus === "live"), isCurrent = active || kind === "paused" || (kind === "best" && frontierStatus !== null);
    const group = kind === "human" ? "__human" : kind === "best" ? "__best" : versions.byRun.get(run.id)?.id ?? "__other", member = kind === "best" ? versions.byRun.get(run.id)?.id : undefined;
    const on = focus !== null && (group === focus || member === focus), invalid = invalidTrial(run);
    body += `<g class="${["wb-series", on ? "wb-on" : "", active ? "wb-live-run" : "", isCurrent && !active ? "wb-paused-run" : "", resumed ? "wb-resumed-run" : "", probeRun(run) ? "wb-probe-run" : "", invalid === null ? "" : "wb-invalid-run", assisted === null ? "" : "wb-assisted-run"].filter(c => c !== "").join(" ")}" data-version="${group}"${member === undefined ? "" : ` data-member="${member}"`}${isCurrent ? ` data-current-run="${esc(run.id)}"` : ""}${active ? ` data-live-run="${esc(run.id)}"` : ""}${resumed ? ` data-resume="${esc(startMilestone(run)?.id ?? "")}"` : ""}${invalid === null ? "" : ` data-invalid="${esc(invalid)}"`}${assisted === null ? "" : ` data-assisted="${esc(assisted)}"`} style="--wb-run-color:${color}">`;
    let points: string[] = [];
    const flush = (): void => { if (points.length > 1) body += `<polyline data-series="${esc(run.id)}" fill="none" stroke="${color}" stroke-width="${assisted !== null ? "3" : kind === "overlay" || kind === "resumed" ? "1.5" : "2.5"}"${assisted === null && kind === "overlay" ? ' opacity=".8"' : ""}${assisted === null ? "" : ' stroke-linejoin="round"'}${invalid !== null ? ' stroke-dasharray="2 4"' : resumed ? ' stroke-dasharray="8 5"' : ""} points="${points.join(" ")}"/>`; points = []; };
    milestones.forEach((m, i) => { if (!onChart(run, m.id)) { flush(); return; } const split = run.splits.find(s => s.name === m.id); if (split === undefined) { if (milestoneStatus({ ...run, excluded: null, problem: null }, m.id) !== "unsupported") flush(); return; } const atX = x(i), atY = y(split.elapsedMs / 60000); points.push(`${String(atX)},${String(atY)}`); }); flush();
    milestones.forEach((m, i) => { if (!onChart(run, m.id)) return; const split = run.splits.find(s => s.name === m.id); if (split !== undefined) body += mark(run, m.id, x(i), y(split.elapsedMs / 60000), color, assisted !== null ? "assisted" : kind === "human" || kind === "best" ? kind : resumed ? "resumed" : "overlay"); });
    const latest = milestones.findLastIndex(m => onChart(run, m.id) && run.splits.some(s => s.name === m.id));
    const head = run.splits.find(s => s.name === milestones[latest]?.id);
    if (active && head !== undefined) body += `<circle class="wb-live-head" cx="${String(x(latest))}" cy="${String(y(head.elapsedMs / 60000))}" r="10" fill="none" stroke="${color}" pointer-events="none"/>`;
    if (run === flagged && head !== undefined) body += assistedFlag(run, x(latest), y(head.elapsedMs / 60000), bottom);
    body += "</g>";
  }
  // Every selected recording is a series or a Hidden row with its reason.
  const selected = [...new Map([...overlays, ...currentRuns].map(run => [run.id, run])).values()];
  const visible = new Set(series.filter(s => times(s.run).length > 0).map(s => s.run.id));
  const missing = selected.filter(run => !visible.has(run.id));
  const reason = (run: WorkbenchRun): string => (operatorExcluded(run) ? run.excluded : run.problem) ?? "No recorded story checkpoints at or after this run's start";
  const helped = selected.filter(run => customLane(run) !== null).length;
  const loading = missing.filter(run => run.problem?.startsWith("Recording is still loading;") === true).length;
  const count = `${String(selected.length)} selected recordings · ${String(selected.filter(run => visible.has(run.id)).length)} plotted${loading === 0 ? "" : ` · ${String(loading)} loading`}${missing.length === loading ? "" : ` · ${String(missing.length - loading)} unavailable`}${helped === 0 ? "" : ` · ${String(helped)} assisted`}`;
  const coverage = `<details data-frontier-coverage class="wb-muted"><summary>${count}</summary><ul>${selected.map(run => {
    const last = milestones.findLast(m => onChart(run, m.id) && run.splits.some(s => s.name === m.id));
    const split = run.splits.find(s => s.name === last?.id);
    const progress = visible.has(run.id) ? `${run.status} · furthest recorded: ${last?.label ?? ""} at ${preciseTime(split?.elapsedMs ?? 0)}${invalidTrial(run) === null ? "" : ` · flagged: ${invalidTrial(run) ?? ""}`}${endedByOperator(run.reason) === null ? "" : ` · ${endedByOperator(run.reason) ?? ""}`}` : reason(run);
    const lane = customLane(run);
    return `<li><a href="/#replay=${encodeURIComponent(run.id)}">${esc(run.id)}</a> · ${esc(progress)}${frontierTags(run).map(tag => ` · ${esc(tag)}`).join("")}${lane === null ? "" : ` · heavily assisted: ${esc(lane)}`}</li>`;
  }).join("")}</ul></details>`;
  const hiddenRows = missing.map(run => `<li><a href="/#replay=${encodeURIComponent(run.id)}">${esc(run.id)}</a> · ${esc(reason(run))}</li>`).join("");
  const hiddenList = missing.length === 0 ? '<p data-frontier-hidden class="wb-muted">Hidden: 0</p>' : `<details data-frontier-hidden class="wb-muted"${missing.length > HIDDEN_OPEN_LIMIT ? "" : " open"}><summary>Hidden: ${String(missing.length)}</summary><ul>${hiddenRows}</ul></details>`;
  const unavailable = `${refs.human === null ? '<p class="wb-muted">Human reference unavailable: recorded baseline is missing or invalid.</p>' : ""}${refs.best === null ? '<p class="wb-muted">Agent frontier unavailable: no valid New Game-start agent run has reached a story checkpoint yet.</p>' : ""}`;
  const currentKeys = current.map(run => { const color = runColor(run, versions); return `<span class="wb-current-key ${run.status === "live" ? "wb-live-key" : ""}" style="--wb-run-color:${color}" title="${esc(run.id)}"><i style="background:${color}"></i>${run.status === "live" ? "LIVE" : "PAUSED"}${checkpointResume(run) ? " · NOT FROM ZERO" : ""}${customLane(run) === null ? "" : " · HEAVILY ASSISTED"} · ${esc(versionLabel(run, versions))} · ${esc(run.id.slice(-4))}${run.splits.some(s => onChart(run, s.name) && milestones.some(m => m.id === s.name)) ? "" : " · waiting for first story checkpoint"}</span>`; }).join("");
  const legend = currentKeys === "" ? "" : `<div class="wb-model-legend wb-current-keys" aria-label="Runs in progress">${currentKeys}</div>`;
  return `${coverage}${unavailable}${legend}<svg class="wb-chart wb-frontier-chart${focus === null ? "" : " wb-dim"}" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="${hidden === 0 ? "Story and gym trainer frontier through badge" : `Story frontier zoomed to ${FRONTIER_MILESTONES[0].label} through ${last}`}">${body}</svg>${hiddenList}<p class="wb-muted">${hidden === 0 ? `${String(milestones.length)} progress checkpoints, including optional gym trainers.` : `Zoomed to the frontier: ${FRONTIER_MILESTONES[0].label} → ${last}, ${String(milestones.length)} of ${String(FRONTIER_MILESTONES.length)} checkpoints. ${String(hidden)} later checkpoints hidden; choose FULL BASELINE for the whole human run.`}${labelEvery === 1 ? "" : ` Some axis labels are hidden to fit this width; all ${hidden === 0 ? "recorded" : "visible"} points remain plotted.`} Recovered first-observation times are upper bounds (≤ in point details). A checkpoint the run recorded but missed breaks the line; one its build never recorded is skipped.${series.some(s => s.assisted !== null) ? " Heavily assisted runs are drawn with the frontier but are never pooled with experiment cohorts." : ""}</p>`;
}
