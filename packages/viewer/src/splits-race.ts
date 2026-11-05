// The PokéNav splits page: this run racing the agent frontier, grouped by badge. Pure, so it tests in memory.
import { esc, hms } from "./format.js";
import { FRONTIER_MILESTONES } from "./frontier.js";
import type { RunView } from "./model.js";
import type { Baseline } from "./panels.js";

const BADGES = [["STONE_BADGE", "STONE", "Stone Badge"], ["KNUCKLE_BADGE", "KNUCKLE", "Knuckle Badge"], ["DYNAMO_BADGE", "DYNAMO", "Dynamo Badge"], ["HEAT_BADGE", "HEAT", "Heat Badge"], ["BALANCE_BADGE", "BALANCE", "Balance Badge"], ["FEATHER_BADGE", "FEATHER", "Feather Badge"], ["MIND_BADGE", "MIND", "Mind Badge"], ["RAIN_BADGE", "RAIN", "Rain Badge"]] as const;
const LABELS = new Map<string, string>(FRONTIER_MILESTONES.map(m => [m.id, m.label]));
for (const [id, , title] of BADGES) LABELS.set(id, title);
const raw = (name: string): string => { const text = name.replaceAll("_", " ").toLowerCase(); return text.charAt(0).toUpperCase() + text.slice(1); };
const label = (name: string): string => LABELS.get(name) ?? raw(name);
const PACE_WINDOW = 10, SWINGS = 3, EVEN_SECONDS = 1;

export type RaceKind = "up" | "dn" | "ev" | "none" | "order";
export type RaceFilter = "all" | "up" | "dn";
export interface RaceRow { readonly name: string; readonly label: string; readonly at: number; readonly frontier: number | null; readonly gap: number | null; readonly gain: number | null; readonly kind: RaceKind }
export interface RaceLeg { readonly index: number; readonly badge: string; readonly title: string; readonly current: boolean; readonly rows: readonly RaceRow[]; readonly gain: number; readonly faster: number; readonly slower: number; readonly gap: number | null }
export interface Race {
  readonly compared: boolean; readonly rows: readonly RaceRow[]; readonly legs: readonly RaceLeg[]; readonly faster: number; readonly slower: number; readonly even: number;
  readonly gap: number | null; readonly lastShared: string | null; readonly pace: { readonly gain: number; readonly count: number } | null;
  readonly frontierAt: { readonly name: string; readonly label: string; readonly at: number } | null; readonly frontierEnd: { readonly name: string; readonly label: string; readonly at: number } | null;
  readonly frontierPath: readonly string[]; readonly gains: readonly RaceRow[]; readonly losses: readonly RaceRow[]; readonly toPass: readonly string[];
}

// Where the run began among the frontier milestones; null for a save with no known position.
export function startIndex(view: RunView): number | null {
  const state = view.start?.start_state;
  if (state === undefined || state.kind !== "save_state") return -1;
  const file = state.path.split(/[/\\]/).pop() ?? "";
  if (file === "MAIN_MENU.state") return -1;
  const at = FRONTIER_MILESTONES.findIndex(m => file === `${m.id}.state`);
  return at < 0 ? null : at;
}

// The longest run of shared milestones both runs did in the same order. The rest cannot be compared stretch by stretch.
function inOrder(times: readonly number[]): ReadonlySet<number> {
  const best = times.map(() => 1), from = times.map(() => -1);
  times.forEach((time, i) => { for (let j = 0; j < i; j += 1) if ((times[j] ?? 0) <= time && (best[j] ?? 0) + 1 > (best[i] ?? 0)) { best[i] = (best[j] ?? 0) + 1; from[i] = j; } });
  const keep = new Set<number>();
  for (let at = best.indexOf(Math.max(0, ...best)); at >= 0; at = from[at] ?? -1) keep.add(at);
  return keep;
}

// An unknown save has no known position, so its clock cannot be raced against one from New Game.
export function raceOf(reached: readonly { readonly name: string; readonly at: number }[], given: Baseline | null, now: number, start: number | null): Race {
  const frontier = start === null ? null : given;
  const seconds = new Map(frontier?.milestones.map(m => [m.name, m.offsetMs / 1000]) ?? []);
  const sorted = reached.map((m, i) => ({ m, i })).sort((a, b) => a.m.at - b.m.at || a.i - b.i).map(({ m }) => m);
  const shared = sorted.filter(m => seconds.has(m.name));
  const keep = inOrder(shared.map(m => seconds.get(m.name) ?? 0));
  const ordered = new Set(shared.filter((_, i) => keep.has(i)).map(m => m.name));
  let previous = 0;
  const rows = sorted.map((m): RaceRow => {
    const time = seconds.get(m.name), base = { name: m.name, label: label(m.name), at: m.at };
    if (time === undefined) return { ...base, frontier: null, gap: null, gain: null, kind: "none" };
    const gap = m.at - time;
    if (!ordered.has(m.name)) return { ...base, frontier: time, gap, gain: null, kind: "order" };
    const gain = previous - gap; previous = gap;
    return { ...base, frontier: time, gap, gain, kind: Math.abs(gain) < EVEN_SECONDS ? "ev" : gain > 0 ? "up" : "dn" };
  });
  const firstLeg = BADGES.filter(([id]) => FRONTIER_MILESTONES.findIndex(m => m.id === id) <= (start ?? -1)).length;
  const buckets: RaceRow[][] = BADGES.map(() => []);
  let leg = firstLeg;
  for (const row of rows) {
    const badge = BADGES.findIndex(([id]) => id === row.name);
    (buckets[Math.min(Math.max(leg, badge), BADGES.length - 1)] ?? []).push(row);
    if (badge >= leg) leg = badge + 1;
  }
  const legs = BADGES.map(([, badge, title], index): RaceLeg => {
    const own = buckets[index] ?? [], compared = own.filter(r => r.gain !== null);
    return { index, badge, title, current: index === leg, rows: own, gain: compared.reduce((sum, r) => sum + (r.gain ?? 0), 0), faster: own.filter(r => r.kind === "up").length, slower: own.filter(r => r.kind === "dn").length, gap: compared.at(-1)?.gap ?? null };
  });
  const compared = rows.filter(r => r.gain !== null), last = compared.at(-1), recent = compared.slice(-PACE_WINDOW);
  const mile = (m: { readonly name: string; readonly offsetMs: number }): { name: string; label: string; at: number } => ({ name: m.name, label: label(m.name), at: m.offsetMs / 1000 });
  const byTime = [...(frontier?.milestones ?? [])].sort((a, b) => a.offsetMs - b.offsetMs), past = byTime.filter(m => m.offsetMs / 1000 <= now);
  const lastPast = past.at(-1), lastAll = byTime.at(-1), own = new Set(reached.map(m => m.name));
  const deepest = Math.max(-1, ...FRONTIER_MILESTONES.map((m, i) => own.has(m.id) ? i : -1));
  return {
    compared: frontier !== null, rows, legs, faster: rows.filter(r => r.kind === "up").length, slower: rows.filter(r => r.kind === "dn").length, even: rows.filter(r => r.kind === "ev").length,
    gap: last?.gap ?? null, lastShared: last?.label ?? null, pace: recent.length === 0 ? null : { gain: recent.reduce((sum, r) => sum + (r.gain ?? 0), 0), count: recent.length },
    frontierAt: lastPast === undefined ? null : mile(lastPast), frontierEnd: lastAll === undefined ? null : mile(lastAll), frontierPath: past.map(m => m.name),
    gains: compared.filter(r => r.kind === "up").sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0)).slice(0, SWINGS), losses: compared.filter(r => r.kind === "dn").sort((a, b) => (a.gain ?? 0) - (b.gain ?? 0)).slice(0, SWINGS),
    toPass: FRONTIER_MILESTONES.filter((m, i) => i > deepest && seconds.has(m.id) && !own.has(m.id)).map(m => m.label),
  };
}

export const runLabel = (id: string): string => id.length > 4 ? `…${id.slice(-4)}` : id;
const short = (seconds: number): string => { const text = hms(Math.abs(seconds)); return Math.abs(seconds) >= 3600 ? text : text.replace(/^0:0?/, ""); };
const stand = (gap: number): string => Math.abs(gap) < EVEN_SECONDS ? "level" : `${short(gap)} ${gap < 0 ? "ahead" : "behind"}`;
function gainHtml(gain: number | null, kind: RaceKind): string {
  if (kind === "none") return '<span class="race-g ev">no time</span>';
  if (kind === "order") return '<span class="race-g ev">route differs</span>';
  if (gain === null || kind === "ev") return '<span class="race-g ev">even</span>';
  return `<span class="race-g ${kind}">${kind === "up" ? "▲" : "▼"} ${short(gain)}</span>`;
}
const barScale = (rows: readonly number[]): number => Math.sqrt(Math.max(1, ...rows.map(Math.abs)));
function bar(gain: number | null, scale: number): string {
  if (gain === null || Math.abs(gain) < EVEN_SECONDS) return '<span class="race-bar"><i></i></span>';
  return `<span class="race-bar"><i></i><u class="${gain > 0 ? "up" : "dn"}" style="width:${(Math.sqrt(Math.abs(gain)) / scale * 50).toFixed(1)}%;${gain > 0 ? "right" : "left"}:50%"></u></span>`;
}

export function raceHeadline(race: Race, run: string, now: number, loading = false): string {
  const lead = !race.compared ? loading ? "Loading the frontier run…" : `${esc(run)}: no frontier run to race yet.` : race.gap === null ? "No shared milestones with the FRONTIER yet." : Math.abs(race.gap) < EVEN_SECONDS ? `${esc(run)} is level with the FRONTIER!` : `${esc(run)} is ${hms(Math.abs(race.gap))} ${race.gap < 0 ? "ahead of" : "behind"} the FRONTIER!`;
  const where = race.frontierEnd !== null && now > race.frontierEnd.at ? `${hms(now)} is past the FRONTIER's last milestone, ${esc(race.frontierEnd.label)} at ${hms(race.frontierEnd.at)}.` : race.frontierAt === null ? "" : `At ${hms(now)} the FRONTIER had reached ${esc(race.frontierAt.label)}.`;
  const pace = race.pace === null ? "" : ` ${race.pace.gain >= 0 ? "Gained" : "Lost"} ${short(race.pace.gain)} over the last ${String(race.pace.count)} milestone${race.pace.count === 1 ? "" : "s"}.`;
  const toPass = race.toPass.length === 0 ? "" : ` Still to pass: ${esc(race.toPass.slice(0, 3).join(", "))}.`;
  return `<div><p class="race-lead">${lead}</p><p class="race-sub">${where}${pace}${toPass}</p></div>${race.compared ? `<div class="race-tally"><span class="up">${String(race.faster)} FASTER</span><span class="dn">${String(race.slower)} SLOWER</span><span>${String(race.even)} EVEN</span></div>` : ""}`;
}

export function raceRail(race: Race): string {
  const scale = barScale(race.legs.map(l => l.gain));
  return race.legs.map(leg => {
    const art = `<i class="race-badge" style="--badge:${String(leg.index)}"></i>`;
    if (leg.rows.length === 0 && !leg.current) return `<span class="race-stop off">${art}<span>${leg.badge}<br>???</span></span>`;
    return `<button type="button" class="race-stop" data-race-jump="${String(leg.index)}">${art}<span>${leg.badge}${leg.current ? " · NOW" : ""}<br>${race.compared ? gainHtml(leg.gain, Math.abs(leg.gain) < EVEN_SECONDS ? "ev" : leg.gain > 0 ? "up" : "dn") : `${String(leg.rows.length)} splits`}</span>${race.compared ? bar(leg.gain, scale) : ""}</button>`;
  }).join("");
}

export function raceSwings(rows: readonly RaceRow[], title: string): string {
  return `<h4>${title}</h4>${rows.length === 0 ? '<p class="race-sub">None yet</p>' : `<ol>${rows.map(r => `<li><span>${esc(r.label)}</span>${gainHtml(r.gain, r.kind)}</li>`).join("")}</ol>`}`;
}

function rowHtml(row: RaceRow, scale: number): string {
  const times = row.frontier === null ? hms(row.at) : `${hms(row.at)} vs ${hms(row.frontier)}${row.gap === null ? "" : ` · ${stand(row.gap)}`}`;
  return `<li class="race-row"><span class="race-name">${esc(row.label)}</span>${bar(row.gain, scale)}${gainHtml(row.gain, row.kind)}<span class="race-times">${times}</span></li>`;
}

// `open` holds the folded state; a filter opens whatever matches instead.
export function raceList(race: Race, filter: RaceFilter, open: ReadonlySet<number>): string {
  const scale = barScale(race.rows.flatMap(r => r.gain === null ? [] : [r.gain])), legScale = barScale(race.legs.map(l => l.gain));
  const groups = [...race.legs].reverse().flatMap(leg => {
    const rows = filter === "all" ? leg.rows : leg.rows.filter(r => r.kind === filter);
    if (rows.length === 0 && !(filter === "all" && leg.current)) return [];
    const expanded = filter !== "all" || open.has(leg.index), summary = !race.compared ? `${String(leg.rows.length)} splits` : `${String(leg.faster)} faster · ${String(leg.slower)} slower${leg.gap === null ? "" : ` · ${stand(leg.gap)}`}`;
    return [`<section class="race-leg" data-race-section="${String(leg.index)}"><button type="button" class="race-head" data-race-leg="${String(leg.index)}" aria-expanded="${String(expanded)}"><i class="race-badge" style="--badge:${String(leg.index)}"></i><span class="race-title">${expanded ? "▾" : "▸"} ${leg.title.toUpperCase()}${leg.current ? " · NOW" : ""}</span>${race.compared ? bar(leg.gain, legScale) : "<span></span>"}${race.compared ? gainHtml(leg.gain, Math.abs(leg.gain) < EVEN_SECONDS ? "ev" : leg.gain > 0 ? "up" : "dn") : "<span></span>"}<span class="race-count">${summary}</span></button>${expanded ? `<ol>${[...rows].reverse().map(r => rowHtml(r, scale)).join("")}</ol>` : ""}</section>`];
  });
  return groups.length === 0 ? `<p class="race-sub">No ${filter === "dn" ? "slower" : "faster"} milestones yet.</p>` : groups.join("");
}

export function raceFilters(filter: RaceFilter, race: Race): string {
  const count = filter === "all" ? race.rows.length : filter === "up" ? race.faster : race.slower;
  const button = (value: RaceFilter, text: string): string => `<button type="button" data-race-filter="${value}" aria-pressed="${String(filter === value)}">${text}</button>`;
  return `${button("all", "ALL")}${race.compared ? `${button("up", "FASTER")}${button("dn", "SLOWER")}` : ""}<span>${String(count)} milestones</span>`;
}

export interface RaceMapSection { readonly name: string; readonly key: string; readonly x: number; readonly y: number }
const MAP_WIDTH = 256, MAP_HEIGHT = 160, CELL = 8, MAP_LEFT = 1, MAP_TOP = 2;
const plain = (text: string): string => text.toUpperCase().replaceAll("_", " ").replaceAll(".", "").replaceAll("'", "").replace(/ROUTE(\d)/, "ROUTE $1");
// data.json's map sections, in the game's region map cells.
export function parseRaceMap(value: unknown): readonly RaceMapSection[] | null {
  const map = typeof value === "object" && value !== null && "map" in value ? value.map : null;
  if (!Array.isArray(map)) return null;
  const sections: RaceMapSection[] = [];
  for (const item of map as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const { name, x, y, width, height } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return null;
    if (name !== "" && width > 0 && height > 0) sections.push({ name, key: plain(name).replace(/ (CITY|TOWN)$/, ""), x: (x + MAP_LEFT + width / 2) * CELL, y: (y + MAP_TOP + height / 2) * CELL });
  }
  return sections.sort((a, b) => b.key.length - a.key.length);
}
const place = (map: readonly RaceMapSection[], text: string): RaceMapSection | undefined => { const name = plain(text); return map.find(section => name.includes(section.key)); };

export function raceMap(map: readonly RaceMapSection[] | null, location: string | null | undefined, race: Race, run: string): string {
  if (map === null) return '<p class="race-sub">Region map art is not built. Run just trainer-page-art.</p>';
  const marker = (section: RaceMapSection | undefined, icon: string, text: string): string => section === undefined ? "" : `<span class="race-who" style="left:${(section.x / MAP_WIDTH * 100).toFixed(1)}%;top:${(section.y / MAP_HEIGHT * 100).toFixed(1)}%"><img src="/sprites/page/${icon}" alt="">${esc(text)}</span>`;
  const frontier = race.frontierPath.reduceRight<RaceMapSection | undefined>((found, name) => found ?? place(map, name), undefined);
  return `<div class="race-map">${marker(frontier, "map-frontier.png", "FRONTIER")}${marker(location == null ? undefined : place(map, location), "map-run.png", run)}</div>`;
}
