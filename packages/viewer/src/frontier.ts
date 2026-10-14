import { esc } from "./format.js";
import type { WorkbenchRun } from "./workbench-data.js";
export const HUMAN_REFERENCE = "2026-10-13T23-50-13_human_1848";
export const FRONTIER_MILESTONES = [
  { id: "PLAYER_NAME_CONFIRMED", label: "Name" }, { id: "FIRST_TRUCK_EXIT", label: "Truck" },
  { id: "CLOCK_SET", label: "Clock" }, { id: "PLAYER_HOUSE_EXITED_AFTER_CLOCK", label: "Home" },
  { id: "RIVAL_HOUSE_ENTERED", label: "Rival house" }, { id: "RIVAL_BEDROOM_REACHED", label: "Bedroom" },
  { id: "RIVAL_MET", label: "Rival met" }, { id: "STARTER_CHOSEN", label: "Starter" },
  { id: "RUSTBORO_CITY_GYM", label: "Gym" }, { id: "STONE_BADGE", label: "Badge" },
] as const;
const RECORD_ORDER: readonly string[] = ["NEW_GAME_CREATED", "PLAYER_NAME_CONFIRMED", "FIRST_TRUCK_EXIT", "PLAYER_HOUSE_ENTERED", "MOM_CLOCK_INSTRUCTION", "PLAYER_BEDROOM", "CLOCK_SET", "MOM_RIVAL_INSTRUCTION", "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED", "RIVAL_MET", "ROUTE_101", "STARTER_CHOSEN", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "OLDALE_TOWN", "ROUTE_103", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "ROUTE_102", "PETALBURG_CITY", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "ROUTE_104", "PETALBURG_WOODS", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_CITY", "RUSTBORO_CITY_GYM", "RUSTBORO_GYM_COMPLETE", "STONE_BADGE", "ROCK_TOMB_RECEIVED"];
export interface ReferencePair { human: WorkbenchRun | null; best: WorkbenchRun | null }
const MODEL_COLORS = ["#208b71", "#2583bd", "#8856b5", "#c25464", "#c16b27", "#238e9f", "#ae4c96", "#6a7e2f"];
const modelName = (run: WorkbenchRun): string => run.model ?? "Model not recorded";
const plottedAgent = (run: WorkbenchRun): boolean => run.excluded === null && run.problem === null && run.measurement?.controller === "agent" && run.config?.start === "boot";
export function frontierModelColors(runs: readonly WorkbenchRun[], previous: ReadonlyMap<string, string> = new Map()): ReadonlyMap<string, string> {
  const colors = new Map(previous);
  for (const model of Array.from(new Set(runs.filter(plottedAgent).map(modelName))).sort()) {
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
  const rank = (r: WorkbenchRun): number => RECORD_ORDER.findLastIndex(name => r.splits.some(s => s.name === name));
  const time = (r: WorkbenchRun): number => r.splits.find(s => s.name === RECORD_ORDER[rank(r)])?.elapsedMs ?? Infinity;
  const agents = runs.filter(r => valid(r) && r.measurement?.controller === "agent" && rank(r) >= 0);
  agents.sort((a, b) => rank(b) - rank(a) || time(a) - time(b) || a.id.localeCompare(b.id));
  return { human: runs.find(r => r.id === HUMAN_REFERENCE && valid(r) && r.measurement?.controller === "human") ?? null, best: agents[0] ?? null };
}
export function milestoneStatus(run: WorkbenchRun, name: string): "reached" | "unsupported" | "pending" | "censored" | "not reached" | "excluded" {
  if (run.excluded !== null || run.problem !== null) return "excluded";
  if (run.splits.some(s => s.name === name)) return "reached";
  const features = run.measurement?.features;
  const required = ["PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED"].includes(name) ? "post-clock-navigation-milestones-v1" : name === "CLOCK_SET" ? "clock-milestone-v1" : name === "RUSTBORO_CITY_GYM" || name === "STONE_BADGE" ? "ram-state-v1" : "story-milestones-v2";
  if (features === undefined || !features.includes(required)) return "unsupported";
  return run.status === "ended" ? "not reached" : run.status === "live" || run.status === "paused" ? "pending" : "censored";
}
export function frontierCoverage(runs: readonly WorkbenchRun[], name: string): string {
  const counts = new Map<string, number>();
  for (const run of runs) { const status = run.measurement?.controller === "human" || run.config?.start !== "boot" ? "excluded" : milestoneStatus(run, name); counts.set(status, (counts.get(status) ?? 0) + 1); }
  const total = runs.length - (counts.get("excluded") ?? 0), reached = counts.get("reached") ?? 0;
  return `<span><b>${String(reached)} / ${String(total)}</b> reached${["not reached", "pending", "censored", "unsupported", "excluded"].flatMap(status => { const n = counts.get(status) ?? 0; return n === 0 ? [] : [` · ${String(n)} ${status}`]; }).join("")}</span>`;
}
function markerShape(shape: "human" | "best" | "overlay", x: number, y: number): string {
  return shape === "best" ? `<path d="M ${String(x)} ${String(y - 6)} l 6 6 -6 6 -6 -6 Z"/>` : shape === "human" ? `<path d="M ${String(x)} ${String(y - 7)} l 2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0 Z"/>` : `<circle cx="${String(x)}" cy="${String(y)}" r="4"/>`;
}
function mark(run: WorkbenchRun, name: string, x: number, y: number, color: string, shape: "human" | "best" | "overlay"): string {
  const split = run.splits.find(s => s.name === name); if (split === undefined) return "";
  const title = `${run.id} · ${name} · active ${preciseTime(split.elapsedMs)} · native #${String(split.seq)}`;
  const body = markerShape(shape, x, y);
  return `<g class="wb-mark" role="button" tabindex="0" data-run="${esc(run.id)}" data-split="${esc(name)}" aria-label="${esc(title)}" fill="${color}" stroke="${color}" stroke-width="${shape === "best" ? "2" : "1"}"><title>${esc(title)}</title>${body}</g>`;
}
export function frontierPlot(refs: ReferencePair, overlays: readonly WorkbenchRun[], requestedWidth: number, colors = frontierModelColors([...overlays, ...(refs.best === null ? [] : [refs.best])])): string {
  const width = Number.isFinite(requestedWidth) ? Math.max(240, Math.round(requestedWidth)) : 640;
  const milestones = FRONTIER_MILESTONES;
  const series: { run: WorkbenchRun; color: string; kind: "human" | "best" | "overlay" }[] = [];
  for (const run of overlays) if (run.id !== refs.human?.id && run.id !== refs.best?.id && plottedAgent(run)) series.push({ run, color: colors.get(modelName(run)) ?? "#536d85", kind: "overlay" });
  if (refs.human !== null) series.push({ run: refs.human, color: "#304f7a", kind: "human" });
  if (refs.best !== null) series.push({ run: refs.best, color: "#af8915", kind: "best" });
  const left = 43, right = width - 15, top = 20, bottom = 255, height = 350;
  const values = series.flatMap(s => milestones.flatMap(m => s.run.splits.filter(p => p.name === m.id).map(p => p.elapsedMs / 60000)));
  const peak = Math.max(0, ...values) * 1.08, step = peak > 60 ? 20 : peak > 20 ? 5 : peak > 10 ? 2 : 1;
  const max = Math.max(1, Math.ceil(peak / step) * step);
  const x = (i: number): number => left + (right - left) * i / (milestones.length - 1);
  const y = (minutes: number): number => bottom - (bottom - top) * minutes / max;
  let body = '<text x="0" y="10" class="wb-axis">Active minutes · lower is faster</text>';
  for (let i = 0; i <= 4; i++) { const value = max * i / 4, at = y(value); body += `<line class="wb-gridline" x1="${String(left)}" x2="${String(right)}" y1="${String(at)}" y2="${String(at)}"/><text class="wb-axis" x="${String(left - 7)}" y="${String(at + 4)}" text-anchor="end">${String(Number(value.toFixed(1)))}</text>`; }
  milestones.forEach((m, i) => { const at = x(i); body += `<text class="wb-axis" transform="translate(${String(at)},278) rotate(-48)" text-anchor="end">${m.label}</text>`; });
  for (const { run, color, kind } of series) {
    let points: string[] = [];
    const flush = (): void => { if (points.length > 1) body += `<polyline data-series="${esc(run.id)}" fill="none" stroke="${color}" stroke-width="${kind === "overlay" ? "1.5" : "2.5"}" ${kind === "overlay" ? 'opacity=".45"' : ""} points="${points.join(" ")}"/>`; points = []; };
    milestones.forEach((m, i) => { const split = run.splits.find(s => s.name === m.id); if (split === undefined) { flush(); return; } const atX = x(i), atY = y(split.elapsedMs / 60000); points.push(`${String(atX)},${String(atY)}`); }); flush();
    milestones.forEach((m, i) => { const split = run.splits.find(s => s.name === m.id); if (split !== undefined) body += mark(run, m.id, x(i), y(split.elapsedMs / 60000), color, kind); });
  }
  const unavailable = `${refs.human === null ? '<p class="wb-notice">Human reference unavailable: recorded baseline is missing or invalid.</p>' : ""}${refs.best === null ? '<p class="wb-notice">Agent frontier unavailable: no eligible finished fresh-boot agent run.</p>' : ""}`;
  const models = Array.from(new Set(series.filter(s => s.kind === "overlay").map(s => modelName(s.run))));
  const references = series.filter(s => s.kind !== "overlay").map(s => `<span data-reference="${s.kind}"><svg aria-hidden="true" viewBox="0 0 40 18" fill="${s.color}" stroke="${s.color}" stroke-width="2"><line x1="0" x2="40" y1="9" y2="9"/>${markerShape(s.kind, 20, 9)}</svg>${s.kind === "human" ? "Human baseline" : `Agent frontier · ${esc(modelName(s.run))}`}</span>`).join("");
  const legend = `<div class="wb-model-legend" aria-label="Graph legend">${models.map(model => `<span data-model="${esc(model)}"><i style="background:${colors.get(model) ?? "#536d85"}"></i>${esc(model)}</span>`).join("")}${references}</div>`;
  return `${unavailable}${legend}<svg class="wb-chart wb-frontier-chart" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="Full story frontier through gym and badge">${body}</svg>`;
}
export function frontierNotes(refs: ReferencePair): string {
  const reference = (run: WorkbenchRun | null, title: string, color: string): string => run === null ? `<span>${title}: unavailable</span>` : `<button type="button" class="wb-reference" data-run="${esc(run.id)}"><i style="background:${color}"></i><strong>${title}</strong> · ${esc(run.model ?? "Model not recorded")} · ${esc(run.id)}</button>`;
  const pause = refs.human?.measurement?.pausedMs;
  return `<div class="wb-reference-list">${reference(refs.human, "Human · recorded baseline", "#304f7a")}${reference(refs.best, "Best valid agent · one actual run", "#af8915")}</div><p>Human includes exploration and team training, not an optimized speedrun.${pause === undefined ? "" : ` ${String(pause / 1000)} seconds of acknowledged pauses removed from active time; raw wall time retained in point details.`} Both lines use cumulative active elapsed time from fresh boot.</p><p>Best = deepest valid native progression, then fastest to that point among eligible finished agent runs. Its early splits all belong to that same run. A selected record is not a reliable configuration or a promotion. Different historical builds, observations and budgets are descriptive references, not same-build causal controls. Missing milestones break lines; they are never zero.</p>`;
}
export function frontierTable(refs: ReferencePair, overlays: readonly WorkbenchRun[]): string {
  const cell = (run: WorkbenchRun | null, name: string): string => {
    if (run === null) return "unavailable";
    const split = run.splits.find(s => s.name === name);
    return split === undefined ? milestoneStatus(run, name) : `<button type="button" class="wb-reference" data-run="${esc(run.id)}" data-split="${esc(name)}">${preciseTime(split.elapsedMs)}</button>`;
  };
  return `<table class="wb-frontier-table"><thead><tr><th>Native checkpoint</th><th>Selected runs · reached / eligible</th><th>Human / best agent · active</th></tr></thead><tbody>${FRONTIER_MILESTONES.map(m => `<tr><td>${m.label}</td><td>${frontierCoverage(overlays, m.id)}</td><td><span>Human: ${cell(refs.human, m.id)}</span><span>Agent: ${cell(refs.best, m.id)}</span></td></tr>`).join("")}</tbody></table><p class="wb-muted">Counts include all selected eligible runs, including failures and unsupported recording. Pending = healthy live/paused; censored = no confirmed terminal; unsupported = this build did not declare the measurement and no valid split exists. Not reached = no recorded completion before the run ended. Human references, non-fresh starts, probes, invalid/aborted and infrastructure-excluded sessions remain in Outcomes but earn no selected-agent denominator credit. Each persistent reference is a single run (N=1).</p>`;
}
