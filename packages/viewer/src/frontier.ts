import { esc } from "./format.js";
import type { WorkbenchRun } from "./workbench-data.js";
export const HUMAN_REFERENCE = "2026-10-13T23-50-13_human_1848";
export const FRONTIER_MILESTONES = [
  { id: "NEW_GAME_CREATED", label: "New game" },
  { id: "PLAYER_NAME_CONFIRMED", label: "Name" },
  { id: "FIRST_TRUCK_EXIT", label: "Truck exit" },
  { id: "LITTLEROOT_TOWN", label: "Littleroot" },
  { id: "PLAYER_HOUSE_ENTERED", label: "Enter home" },
  { id: "MOM_CLOCK_INSTRUCTION", label: "Clock instruction" },
  { id: "PLAYER_BEDROOM", label: "Your bedroom" },
  { id: "CLOCK_SET", label: "Clock set" },
  { id: "MOM_RIVAL_INSTRUCTION", label: "Rival instruction" },
  { id: "PLAYER_HOUSE_EXITED_AFTER_CLOCK", label: "Leave home" },
  { id: "RIVAL_HOUSE_ENTERED", label: "Rival house" },
  { id: "RIVAL_BEDROOM_REACHED", label: "Rival bedroom" },
  { id: "RIVAL_MET", label: "Rival met" },
  { id: "BIRCH_RESCUE_REQUESTED", label: "Sent to Birch" },
  { id: "ROUTE_101", label: "Route 101" },
  { id: "STARTER_CHOSEN", label: "Starter" },
  { id: "BIRCH_RESCUE_COMPLETE", label: "Birch rescue" },
  { id: "BIRCH_STARTER_HANDOFF_COMPLETE", label: "Birch handoff" },
  { id: "OLDALE_TOWN", label: "Oldale" },
  { id: "ROUTE_103", label: "Route 103" },
  { id: "RIVAL_BATTLE_WON", label: "Rival battle" },
  { id: "RECEIVED_POKEDEX", label: "Pokédex" },
  { id: "STARTER_TUTORIAL_COMPLETE", label: "Starter tutorial" },
  { id: "RUNNING_SHOES_RECEIVED", label: "Running shoes" },
  { id: "ROUTE_102", label: "Route 102" },
  { id: "PETALBURG_CITY", label: "Petalburg" },
  { id: "DAD_FIRST_MEETING", label: "Meet Dad" },
  { id: "WALLY_TUTORIAL_COMPLETE", label: "Wally tutorial" },
  { id: "ROUTE_104", label: "Route 104" },
  { id: "PETALBURG_WOODS", label: "Petalburg Woods" },
  { id: "TEAM_AQUA_WOODS_EVENT_COMPLETE", label: "Aqua woods event" },
  { id: "RUSTBORO_CITY", label: "Rustboro" },
  { id: "RUSTBORO_CITY_GYM", label: "Gym entry" },
  { id: "ROXANNE_DEFEATED", label: "Roxanne defeated" },
  { id: "RUSTBORO_GYM_COMPLETE", label: "Gym complete" },
  { id: "STONE_BADGE", label: "Badge" },
  { id: "ROCK_TOMB_RECEIVED", label: "Rock Tomb" },
] as const;
const RECORD_ORDER: readonly string[] = FRONTIER_MILESTONES.map(m => m.id);
export interface ReferencePair { human: WorkbenchRun | null; best: WorkbenchRun | null }
const MODEL_COLORS = ["#208b71", "#2583bd", "#8856b5", "#c25464", "#c16b27", "#238e9f", "#ae4c96", "#6a7e2f"];
const modelName = (run: WorkbenchRun): string => run.model ?? "Model not recorded";
const plottedAgent = (run: WorkbenchRun): boolean => run.excluded === null && run.problem === null && run.measurement?.controller === "agent" && run.config?.start === "boot";
const clockSetResume = (run: WorkbenchRun): boolean => run.excluded === null && run.problem === null && run.measurement?.controller === "agent" && run.config?.resume === "CLOCK_SET";
const shownAgent = (run: WorkbenchRun): boolean => plottedAgent(run) || clockSetResume(run);
export function frontierModelColors(runs: readonly WorkbenchRun[], previous: ReadonlyMap<string, string> = new Map()): ReadonlyMap<string, string> {
  const colors = new Map(previous);
  for (const model of Array.from(new Set(runs.filter(shownAgent).map(modelName))).sort()) {
    if (!colors.has(model)) colors.set(model, MODEL_COLORS[colors.size] ?? `hsl(${String((colors.size * 137.508) % 360)} 55% 38%)`);
  }
  return colors;
}
export function preciseTime(ms: number): string {
  const whole = Math.floor(ms / 1000), fraction = String(Math.round(ms % 1000)).padStart(3, "0");
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}.${fraction}`;
}
export function frontierReferences(runs: readonly WorkbenchRun[]): ReferencePair {
  const valid = (r: WorkbenchRun): boolean => r.excluded === null && r.problem === null && r.status === "ended" && r.config?.start === "boot" && r.measurement !== undefined && !r.measurement.features.some(f => /probe|synthetic|replay/.test(f));
  const rank = (r: WorkbenchRun): number => RECORD_ORDER.findLastIndex(name => r.splits.some(s => s.name === name && s.screenshotEvidence === undefined));
  const time = (r: WorkbenchRun): number => r.splits.find(s => s.name === RECORD_ORDER[rank(r)])?.elapsedMs ?? Infinity;
  const agents = runs.filter(r => valid(r) && r.measurement?.controller === "agent" && rank(r) >= 0);
  agents.sort((a, b) => rank(b) - rank(a) || time(a) - time(b) || a.id.localeCompare(b.id));
  return { human: runs.find(r => r.id === HUMAN_REFERENCE && valid(r) && r.measurement?.controller === "human") ?? null, best: agents[0] ?? null };
}
export function milestoneStatus(run: WorkbenchRun, name: string): "reached" | "unsupported" | "pending" | "censored" | "not reached" | "excluded" {
  if (run.excluded !== null || run.problem !== null) return "excluded";
  if (run.splits.some(s => s.name === name)) return "reached";
  const features = run.measurement?.features;
  const required = name === "BIRCH_RESCUE_REQUESTED" ? "birch-rescue-requested-v1" : name.startsWith("RUSTBORO_GYM_TRAINER_") ? "rustboro-gym-trainer-milestones-v1" : name === "NEW_GAME_CREATED" ? "new-game-created-v1" : name === "ROXANNE_DEFEATED" ? "native-progress-activity-v1" : ["PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED"].includes(name) ? "post-clock-navigation-milestones-v1" : name === "CLOCK_SET" ? "clock-milestone-v1" : ["LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "PLAYER_BEDROOM", "ROUTE_101", "OLDALE_TOWN", "ROUTE_103", "ROUTE_102", "PETALBURG_CITY", "ROUTE_104", "PETALBURG_WOODS", "RUSTBORO_CITY", "RUSTBORO_CITY_GYM", "STONE_BADGE"].includes(name) ? "ram-state-v1" : "story-milestones-v2";
  if (features === undefined || !features.includes(required)) return "unsupported";
  return run.status === "ended" ? "not reached" : run.status === "live" || run.status === "paused" ? "pending" : "censored";
}
function markerShape(shape: "human" | "best" | "overlay" | "resumed", x: number, y: number, color = "currentColor"): string {
  return shape === "best" ? `<path d="M ${String(x)} ${String(y - 6)} l 6 6 -6 6 -6 -6 Z"/>` : shape === "human" ? `<path d="M ${String(x)} ${String(y - 7)} l 2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0 Z"/>` : shape === "resumed" ? `<circle cx="${String(x)}" cy="${String(y)}" r="5" fill="#fff" stroke="${color}" stroke-width="2"/>` : `<circle cx="${String(x)}" cy="${String(y)}" r="4"/>`;
}
function mark(run: WorkbenchRun, name: string, x: number, y: number, color: string, shape: "human" | "best" | "overlay" | "resumed"): string {
  const split = run.splits.find(s => s.name === name); if (split === undefined) return "";
  const sinceSave = run.config?.resume === "CLOCK_SET" ? " · resumed at Clock set, not from New game; minutes since the save loaded" : "";
  const title = `${run.id} · ${name} · active ${split.derived === true ? "≤ " : ""}${preciseTime(split.elapsedMs)} · ${split.derived === true ? (split.screenshotEvidence === undefined ? "recovered native state (first observation upper bound)" : "reviewed screenshot (observation upper bound)") : "native milestone"} #${String(split.seq)}${sinceSave}`;
  const body = markerShape(shape, x, y, color);
  return `<g class="wb-mark" role="button" tabindex="0" data-run="${esc(run.id)}" data-split="${esc(name)}" aria-label="${esc(title)}" fill="${color}" stroke="${color}" stroke-width="${shape === "best" ? "2" : "1"}"><title>${esc(title)}</title>${body}</g>`;
}
function zoomEnd(agents: readonly WorkbenchRun[], human: WorkbenchRun | null): number {
  const reached = (run: WorkbenchRun, i: number): boolean => run.splits.some(s => s.name === RECORD_ORDER[i]);
  const farthest = Math.max(-1, ...agents.map(run => RECORD_ORDER.findLastIndex((_, i) => reached(run, i))));
  const next = human === null ? -1 : RECORD_ORDER.findIndex((_, i) => i > farthest && reached(human, i));
  return Math.min(RECORD_ORDER.length - 1, Math.max(1, next === -1 ? farthest + 1 : next));
}
export function frontierPlot(refs: ReferencePair, overlays: readonly WorkbenchRun[], requestedWidth: number, colors = frontierModelColors([...overlays, ...(refs.best === null ? [] : [refs.best])]), currentRuns: readonly WorkbenchRun[] = [], zoom = false): string {
  const width = Number.isFinite(requestedWidth) ? Math.max(240, Math.round(requestedWidth)) : 640;
  const series: { run: WorkbenchRun; color: string; kind: "human" | "best" | "overlay" | "live" | "paused" | "resumed"; resumed: boolean }[] = [];
  const current = currentRuns.filter(r => shownAgent(r) && (r.status === "live" || r.status === "paused"));
  const currentIds = new Set(current.map(r => r.id));
  for (const run of overlays) if (!currentIds.has(run.id) && run.id !== refs.human?.id && run.id !== refs.best?.id && shownAgent(run)) series.push({ run, color: colors.get(modelName(run)) ?? "#536d85", kind: clockSetResume(run) ? "resumed" : "overlay", resumed: clockSetResume(run) });
  if (refs.human !== null) series.push({ run: refs.human, color: "#304f7a", kind: "human", resumed: false });
  if (refs.best !== null) series.push({ run: refs.best, color: "#af8915", kind: "best", resumed: false });
  for (const run of current) series.push({ run, color: colors.get(modelName(run)) ?? "#536d85", kind: run.status === "live" ? "live" : "paused", resumed: clockSetResume(run) });
  const milestones = zoom ? FRONTIER_MILESTONES.slice(0, zoomEnd(series.filter(s => s.kind !== "human").map(s => s.run), refs.human) + 1) : FRONTIER_MILESTONES;
  const hidden = FRONTIER_MILESTONES.length - milestones.length, last = milestones[milestones.length - 1]?.label ?? "";
  const left = 43, right = width - 15, top = 20, bottom = 490, height = 635;
  const clockAt = FRONTIER_MILESTONES.findIndex(m => m.id === "CLOCK_SET");
  const onChart = (resumed: boolean, name: string): boolean => !resumed || FRONTIER_MILESTONES.findIndex(m => m.id === name) >= clockAt;
  const values = series.flatMap(s => milestones.flatMap(m => onChart(s.resumed, m.id) ? s.run.splits.filter(p => p.name === m.id).map(p => p.elapsedMs / 60000) : []));
  const peak = Math.max(0, ...values) * 1.08, step = peak > 60 ? 20 : peak > 20 ? 5 : peak > 10 ? 2 : 1;
  const max = Math.max(1, Math.ceil(peak / step) * step);
  const x = (i: number): number => left + (right - left) * i / (milestones.length - 1);
  const y = (minutes: number): number => bottom - (bottom - top) * minutes / max;
  let body = '<text x="0" y="10" class="wb-axis">Active minutes from that run\'s start · lower is faster</text>';
  for (let i = 0; i <= 4; i++) { const value = max * i / 4, at = y(value); body += `<line class="wb-gridline" x1="${String(left)}" x2="${String(right)}" y1="${String(at)}" y2="${String(at)}"/><text class="wb-axis" x="${String(left - 7)}" y="${String(at + 4)}" text-anchor="end">${String(Number(value.toFixed(1)))}</text>`; }
  const labelEvery = Math.ceil(milestones.length / Math.max(2, Math.floor((right - left) / 28)));
  const mustLabel = new Set<number>([milestones.length - 1]);
  for (const { run, resumed } of series) {
    let previous = false;
    milestones.forEach((m, i) => {
      const present = onChart(resumed, m.id) && run.splits.some(s => s.name === m.id);
      if (present && !previous) mustLabel.add(i);
      if (!present && previous) mustLabel.add(i - 1);
      previous = present;
    });
  }
  const resumeOrigin = milestones.findIndex(m => m.id === "CLOCK_SET");
  if (resumeOrigin >= 0 && series.some(s => s.resumed)) mustLabel.add(resumeOrigin);
  milestones.forEach((m, i) => { if (i % labelEvery !== 0 && !mustLabel.has(i)) return; const at = x(i); body += `<text class="wb-axis" transform="translate(${String(at)},${String(bottom + 23)}) rotate(-60)" text-anchor="end">${m.label}</text>`; });
  if (series.some(s => s.resumed)) {
    const origin = milestones.findIndex(m => m.id === "CLOCK_SET");
    if (origin >= 0) {
      const at = x(origin);
      body += `<line data-resume-origin="CLOCK_SET" x1="${String(at)}" x2="${String(at)}" y1="${String(top)}" y2="${String(bottom)}" stroke="#b36b00" stroke-width="1.5" stroke-dasharray="3 4" pointer-events="none"/><text class="wb-resume-tag" data-resume-origin="CLOCK_SET" x="${String(at + 6)}" y="${String(top + 14)}">not from zero</text>`;
    }
  }
  for (const { run, color, kind, resumed } of series) {
    const active = kind === "live", isCurrent = active || kind === "paused", open = isCurrent || resumed;
    if (open) body += `<g class="${[active ? "wb-live-run" : "", kind === "paused" ? "wb-paused-run" : "", resumed ? "wb-resumed-run" : ""].filter(c => c !== "").join(" ")}"${isCurrent ? ` data-current-run="${esc(run.id)}"` : ""}${active ? ` data-live-run="${esc(run.id)}"` : ""}${resumed ? ' data-resume="CLOCK_SET"' : ""} style="--wb-run-color:${color}">`;
    let points: string[] = [];
    const flush = (): void => { if (points.length > 1) body += `<polyline data-series="${esc(run.id)}" fill="none" stroke="${color}" stroke-width="${kind === "overlay" || kind === "resumed" ? "1.5" : "2.5"}"${kind === "overlay" ? ' opacity=".45"' : ""}${resumed ? ' stroke-dasharray="8 5"' : ""} points="${points.join(" ")}"/>`; points = []; };
    milestones.forEach((m, i) => { if (!onChart(resumed, m.id)) { flush(); return; } const split = run.splits.find(s => s.name === m.id); if (split === undefined) { if (milestoneStatus(run, m.id) !== "unsupported") flush(); return; } const atX = x(i), atY = y(split.elapsedMs / 60000); points.push(`${String(atX)},${String(atY)}`); }); flush();
    milestones.forEach((m, i) => { if (!onChart(resumed, m.id)) return; const split = run.splits.find(s => s.name === m.id); if (split !== undefined) body += mark(run, m.id, x(i), y(split.elapsedMs / 60000), color, kind === "human" || kind === "best" ? kind : resumed ? "resumed" : "overlay"); });
    if (active) {
      const latest = milestones.findLastIndex(m => onChart(resumed, m.id) && run.splits.some(s => s.name === m.id));
      const split = run.splits.find(s => s.name === milestones[latest]?.id);
      if (split !== undefined) body += `<circle class="wb-live-head" cx="${String(x(latest))}" cy="${String(y(split.elapsedMs / 60000))}" r="10" fill="none" stroke="${color}" pointer-events="none"/>`;
    }
    if (open) body += "</g>";
  }
  const unavailable = `${refs.human === null ? '<p class="wb-notice">Human reference unavailable: recorded baseline is missing or invalid.</p>' : ""}${refs.best === null ? '<p class="wb-notice">Agent frontier unavailable: no eligible finished fresh-boot agent run.</p>' : ""}`;
  const resumeNotice = series.some(s => s.resumed) ? '<p class="wb-notice" data-resume-notice="CLOCK_SET">Dashed runs loaded a Clock set save. They did not start from New game. Minutes on a dashed line start when that save loaded, so a low line is not a faster fresh start.</p>' : "";
  const models = Array.from(new Set(series.filter(s => s.kind === "overlay" || s.kind === "resumed").map(s => modelName(s.run))));
  const references = series.filter(s => s.kind === "human" || s.kind === "best").map(s => `<span data-reference="${s.kind}"><svg aria-hidden="true" viewBox="0 0 40 18" fill="${s.color}" stroke="${s.color}" stroke-width="2"><line x1="0" x2="40" y1="9" y2="9"/>${markerShape(s.kind === "human" ? "human" : "best", 20, 9)}</svg>${s.kind === "human" ? "Human baseline" : `Agent frontier · ${esc(modelName(s.run))}`}</span>`).join("");
  const resumeKey = series.some(s => s.resumed) ? '<span data-resume="CLOCK_SET"><svg aria-hidden="true" viewBox="0 0 40 18" fill="none" stroke="#b36b00" stroke-width="2"><line x1="0" x2="40" y1="9" y2="9" stroke-dasharray="4 3"/><circle cx="20" cy="9" r="4" fill="#fff"/></svg>Not from zero · Clock set save</span>' : "";
  const currentKeys = current.map(run => `<span class="wb-current-key ${run.status === "live" ? "wb-live-key" : ""}" style="--wb-run-color:${colors.get(modelName(run)) ?? "#536d85"}" title="${esc(run.id)}"><i style="background:${colors.get(modelName(run)) ?? "#536d85"}"></i>${run.status === "live" ? "LIVE" : "PAUSED"}${clockSetResume(run) ? " · NOT FROM ZERO" : ""} · ${esc(modelName(run))} · ${esc(run.id.slice(-4))}${run.splits.some(s => milestones.some(m => m.id === s.name)) ? "" : " · waiting for first story checkpoint"}</span>`).join("");
  const legend = `<div class="wb-model-legend" aria-label="Graph legend">${models.map(model => `<span data-model="${esc(model)}"><i style="background:${colors.get(model) ?? "#536d85"}"></i>${esc(model)}</span>`).join("")}${references}${resumeKey}${currentKeys}</div>`;
  return `${unavailable}${resumeNotice}${legend}<svg class="wb-chart wb-frontier-chart" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="${hidden === 0 ? "Full story frontier through gym and badge" : `Story frontier zoomed to ${FRONTIER_MILESTONES[0].label} through ${last}`}">${body}</svg><p class="wb-muted">${hidden === 0 ? `${String(milestones.length)} required progression checkpoints.` : `Zoomed to the frontier: ${FRONTIER_MILESTONES[0].label} → ${last}, ${String(milestones.length)} of ${String(FRONTIER_MILESTONES.length)} checkpoints. ${String(hidden)} later checkpoints hidden; choose FULL BASELINE for the whole human run.`}${labelEvery === 1 ? "" : ` Some axis labels are hidden to fit this width; all ${hidden === 0 ? "recorded" : "visible"} points remain plotted.`} Expand “Completion, missing data &amp; exact times” below for every checkpoint. Recovered first-observation times are upper bounds (≤ in exact times and point details). A checkpoint the run recorded but missed breaks the line; one its build never recorded is skipped.</p>`;
}
