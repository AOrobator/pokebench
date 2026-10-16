import { esc } from "./format.js";
import { clockSetResume, frontierLabel, markerShape, shownAgent, type FrontierStatus, type ReferencePair } from "./frontier.js";
import { orderedVersions, type HarnessVersion, type SwitchRef, type VersionIndex } from "./frontier-versions.js";
import type { WorkbenchRun } from "./workbench-data.js";
// The story frontier's legend: harness versions, what the marks mean and how to read the chart. This module
// also runs in the browser. Everything open or isolated comes from LegendState, so a poll's re-render keeps it.
export interface LegendState {
  readonly isolated: string | null; readonly legendOpen: boolean; readonly marksOpen: boolean; readonly howOpen: boolean;
  readonly changed: ReadonlySet<string>; readonly all: ReadonlySet<string>; readonly expanded: ReadonlySet<string>;
}
export const HUMAN_VERSION = "__human", FRONTIER_VERSION = "__best";
const HUMAN_COLOR = "#304f7a", FRONTIER_COLOR = "#af8915";
const runs = (n: number): string => `${String(n)} run${n === 1 ? "" : "s"}`;
// "qwen36 · bundle v1" → "bundle v1": versions compared within one model need no model prefix.
const local = (name: string): string => name.split(" · ").slice(1).join(" · ") || name;
// What each switch does, by id (the viewer's /api/features catalog); a switch it does not know shows no description.
export type SwitchDescriptions = ReadonlyMap<string, string>;
// A described switch row is focusable: its title is the hover tooltip, and focus (a tap on a phone, Tab on a
// keyboard) shows the same text inline under the name, which is also the row's accessible description.
function switchList(list: readonly SwitchRef[], key: string, descriptions: SwitchDescriptions, columns = false): string {
  const row = (f: SwitchRef, i: number): string => {
    const text = descriptions.get(f.id), name = `<span>${esc(f.label)}</span> <code>${esc(f.id)}</code>`;
    if (text === undefined) return `<li>${name}</li>`;
    const id = `wb-sd-${key}-${String(i)}`;
    return `<li data-sw="${key}-${String(i)}" tabindex="0" title="${esc(text)}" aria-describedby="${id}">${name}<span class="wb-sw-desc" id="${id}">${esc(text)}</span></li>`;
  };
  return `<ul class="wb-sw-list${columns ? " wb-sw-cols" : ""}">${list.map(row).join("")}</ul>`;
}
function changeLine(v: HarnessVersion): string {
  if (v.number === null) return "no switch map recorded · not compared";
  if (v.previous === null) return v.family === "control" ? "first version · the baseline every other control version is compared with" : `first ${esc(v.arm)} version`;
  const counts = `<b class="wb-add">${String(v.added.length)} added</b>, <b class="wb-rem">${String(v.removed.length)} removed</b>`;
  return v.number === 1 ? `first ${esc(v.arm)} version · vs ${esc(local(v.previous))}: ${counts}` : `vs ${esc(local(v.previous))}: ${counts}`;
}
function details(v: HarnessVersion, state: LegendState, descriptions: SwitchDescriptions): string {
  const me = esc(local(v.name)), meta = `<p class="wb-ver-meta">Fingerprint <code>#${esc(v.fingerprint)}</code>${v.builds.length === 0 ? "" : ` · builds ${v.builds.map(b => `<code>${esc(b)}</code>`).join(", ")}`}</p>`;
  if (v.number === null) return `<p class="wb-none">These runs recorded no switch map, so their harness version is unknown. They are grouped by model and ${v.arm === "untagged" ? "have no arm or preset" : `arm or preset (${esc(v.arm)})`}.</p>${meta}`;
  const all = `<details class="wb-ver-all" data-all="${v.id}"${state.all.has(v.id) ? " open" : ""}><summary>All ${String(v.on.length)} switches on in ${me}</summary>${switchList(v.on, `${v.id}-on`, descriptions, true)}</details>`;
  if (v.previous === null) return `<p class="wb-none">First ${esc(v.arm)} version, so there is nothing earlier to compare it with.</p>${all}${meta}`;
  const before = esc(local(v.previous));
  const added = v.added.length === 0 ? '<p class="wb-none">None.</p>' : switchList(v.added, `${v.id}-add`, descriptions);
  const removed = v.removed.length === 0 ? `<p class="wb-none">None. Every switch that was on in ${before} is still on.</p>` : switchList(v.removed, `${v.id}-rem`, descriptions);
  return `<div class="wb-ver-sets"><div><h4 class="wb-add">Added since ${before} (${String(v.added.length)})<small>on in ${me}, off in ${before}</small></h4>${added}</div><div><h4 class="wb-rem">Removed since ${before} (${String(v.removed.length)})<small>on in ${before}, off in ${me}</small></h4>${removed}</div></div>${all}${meta}`;
}
function card(v: HarnessVersion, count: number, state: LegendState, descriptions: SwitchDescriptions): string {
  const selected = state.isolated === v.id, expanded = state.expanded.has(v.id);
  const switches = v.number === null ? "switches unknown" : `${String(v.on.length)} switch${v.on.length === 1 ? "" : "es"} on`;
  const tip = `${v.name} · fingerprint #${v.fingerprint}${v.builds.length === 0 ? "" : ` · builds ${v.builds.join(", ")}`}`;
  return `<li class="wb-ver${selected ? " wb-sel" : ""}${expanded ? " wb-xp" : ""}" data-ver="${v.id}" data-ver-name="${esc(v.name)}" tabindex="0" style="--vc:${v.color}" title="${esc(tip)}" aria-label="${esc(`${v.name}, ${runs(count)}. ${selected ? "Isolated; press Enter to show all versions" : "Press Enter to isolate this version"}`)}"${selected ? ' aria-current="true"' : ""}>`
    + `<span class="wb-cursor" aria-hidden="true">▶</span><i class="wb-sw"></i><span class="wb-ver-name">${esc(v.name)}</span><small class="wb-ver-count">${runs(count)}</small>`
    + `<button type="button" class="wb-ver-more" data-ver-more="${v.id}" aria-expanded="${String(expanded)}" aria-label="Details for ${esc(v.name)}"><span class="wb-chev" aria-hidden="true"></span></button>`
    + `<div class="wb-ver-body"><span class="wb-ver-sub"><span class="wb-ver-runs">${runs(count)} · </span><b>${switches}</b></span><span class="wb-ver-change">${changeLine(v)}</span>`
    + `<details class="wb-ver-what" data-what="${v.id}"${state.changed.has(v.id) ? " open" : ""}><summary>Show what changed</summary><div class="wb-ver-detail">${details(v, state, descriptions)}</div></details></div></li>`;
}
const SECTION: Readonly<Record<HarnessVersion["family"], string>> = { bundle: "Bundle arm versions", control: "Control arm versions", other: "Other versions", legacy: "Legacy runs · no switch map" };
const keySvg = (inner: string): string => `<svg aria-hidden="true" viewBox="0 0 40 18" width="40" height="18">${inner}</svg>`;
function marks(refs: ReferencePair, versions: VersionIndex, state: LegendState, status: FrontierStatus): string {
  const item = (attrs: string, svg: string, title: string, text: string): string => `<li${attrs} title="${esc(`${title}: ${text.replace(/<[^>]+>/g, "")}`)}"><span class="wb-cursor" aria-hidden="true">▶</span>${svg}<span><b>${title}</b><span class="wb-kd">: ${text}</span></span></li>`;
  const pick = (id: string, label: string): string => ` data-ver="${id}" data-ver-name="${label}" tabindex="0"${state.isolated === id ? ' class="wb-sel" aria-current="true"' : ""}`;
  const best = refs.best === null ? "" : item(` data-reference="best"${pick(FRONTIER_VERSION, "Agent frontier")}`, keySvg(`<g fill="${FRONTIER_COLOR}" stroke="${FRONTIER_COLOR}" stroke-width="2"><line x1="0" x2="40" y1="9" y2="9"/>${markerShape("best", 20, 9)}</g>`), "Agent frontier", `${frontierLabel(refs.best, status, versions).replace(/^Agent frontier · /, "")}. The valid New Game start (from power-on or the saved main menu) that got furthest, then fastest; live runs count as they progress, Clock set resumes never do. It also lights up with its version.`);
  const human = refs.human === null ? "" : item(` data-reference="human"${pick(HUMAN_VERSION, "Human baseline")}`, keySvg(`<g fill="${HUMAN_COLOR}" stroke="${HUMAN_COLOR}" stroke-width="2"><line x1="0" x2="40" y1="9" y2="9"/>${markerShape("human", 20, 9)}</g>`), "Human baseline", "one recorded human playthrough, the speed to beat.");
  const rows = [human, best,
    item("", keySvg('<g fill="#c16b27" stroke="#c16b27"><line x1="0" x2="40" y1="9" y2="9" stroke-width="1.5" opacity=".55"/><circle cx="20" cy="9" r="4"/></g>'), "Any other run", "thin line colored by its harness version. Each dot is a story checkpoint it reached; click one for its evidence and settings."),
    item("", keySvg('<g fill="#238e9f" stroke="#238e9f"><line x1="0" x2="40" y1="9" y2="9" stroke-width="1.5" stroke-dasharray="8 5"/><circle cx="20" cy="9" r="5" fill="#fff" stroke-width="2"/></g>'), "Dashed line, hollow dots", "the run loaded a Clock set save instead of starting from New game. Its minutes count from when the save loaded."),
    item("", keySvg('<line x1="20" x2="20" y1="0" y2="18" stroke="#b36b00" stroke-width="1.5" stroke-dasharray="3 4"/>'), "Orange dotted rule", "Clock set, where dashed runs begin (not from zero)."),
    item("", keySvg('<g fill="#2583bd" stroke="#2583bd" stroke-width="1.5"><polyline fill="none" points="0,12 12,7"/><circle cx="12" cy="7" r="3"/><polyline fill="none" points="28,9 40,5"/><circle cx="28" cy="9" r="3"/></g>'), "Gap in a line", "the run recorded that checkpoint as missed. One its build never recorded is skipped."),
    item("", keySvg('<g fill="#c25464" stroke="#c25464"><line x1="0" x2="40" y1="9" y2="9" stroke-width="2.5"/><circle cx="20" cy="9" r="4"/><circle cx="20" cy="9" r="8" fill="none" stroke-width="1.5" opacity=".45"/></g>'), "Glow and pulse", "the run is live now; a LIVE tag above the chart names it."),
    item("", keySvg('<g fill="#c25464" stroke="#c25464"><line x1="0" x2="40" y1="9" y2="9" stroke-width="1.5" opacity=".12"/><circle cx="20" cy="9" r="4" opacity=".12"/></g>'), "Faded", "not in the version you are hovering or isolated; it is still plotted."),
    item("", keySvg('<g fill="#c25464" stroke="#c25464"><line x1="0" x2="40" y1="9" y2="9" stroke-width="2.5"/><circle cx="20" cy="9" r="4"/></g>'), "Full color", "runs in the version you are hovering or isolated."),
  ].join("");
  return `<details class="wb-bar wb-marks" data-bar="marks"${state.marksOpen ? " open" : ""}><summary><h3>What the marks mean<span class="wb-chev" aria-hidden="true"></span></h3></summary><ul>${rows}</ul></details>`;
}
const HOW = `<div class="wb-how-grid">
<div><h4>What a harness version is</h4><p>The harness has dozens of feature switches (live map, dialogue auto-advance, loop guard and so on). Each run records which ones were <b>on</b>. That exact set of on-switches, for one model, is the run's <b>harness version</b>. Runs with the identical set share one color; changing even one switch makes a new version, whatever the preset or build.</p></div>
<div><h4>How versions are named</h4><p><b>bundle v3</b> is the third different switch set first used by a bundle-arm run, numbered in the order the sets were first used. Each arm counts separately; runs outside an experiment use their preset instead of an arm. Bundle versions take warm colors, control versions cool ones. Each card compares a version with the one before it in the same arm; <b>bundle v1</b> is compared with <b>control v1</b>, so you can see what the bundle adds.</p></div>
<div><h4>Using the legend</h4><ul><li><b>Hover</b> or focus a version: its runs stand out and the rest fade.</li><li><b>Click</b> it, or press Enter: only that version stays bright, until you click it again or choose Show all.</li><li><b>Show what changed</b>: the switches added and removed since the previous version, then every switch on.</li></ul></div>
<div><h4>Reading the chart</h4><p>Each line is one run; lower is faster. Minutes are active minutes from that run's start. The navy stars are the human baseline and the gold diamonds the agent frontier. A dashed line loaded a Clock set save, so its minutes start when that save loaded. Click any point for its recorded evidence and settings.</p></div>
</div>`;
export function frontierLegend(refs: ReferencePair, plotted: readonly WorkbenchRun[], versions: VersionIndex, state: LegendState, status: FrontierStatus = null, descriptions: SwitchDescriptions = new Map()): string {
  const counts = new Map<string, number>(), seen = new Set<string>();
  for (const run of [...plotted, ...(refs.best === null ? [] : [refs.best])]) {
    const v = versions.byRun.get(run.id); if (v === undefined || seen.has(run.id) || !shownAgent(run) || run.id === refs.human?.id) continue;
    seen.add(run.id); counts.set(v.id, (counts.get(v.id) ?? 0) + 1);
  }
  const shown = orderedVersions(versions.versions).filter(v => counts.has(v.id));
  const sections = (["bundle", "control", "other", "legacy"] as const).map(family => {
    const list = shown.filter(v => v.family === family);
    return list.length === 0 ? "" : `<h3>${SECTION[family]}</h3><ul class="wb-ver-grid">${list.map(v => card(v, counts.get(v.id) ?? 0, state, descriptions)).join("")}</ul>`;
  }).join("");
  const isolated = state.isolated === HUMAN_VERSION ? { name: "Human baseline", color: HUMAN_COLOR } : state.isolated === FRONTIER_VERSION ? { name: "Agent frontier", color: FRONTIER_COLOR } : shown.find(v => v.id === state.isolated) ?? null;
  const swatches = shown.map(v => `<i style="background:${v.color}"></i>`).join("");
  const chip = isolated === null ? "" : `<span class="wb-iso" role="status"><span class="wb-cursor" aria-hidden="true">▶</span><i style="background:${isolated.color}"></i><b title="${esc(isolated.name)}">${esc(isolated.name)}</b><b class="wb-iso-short" aria-hidden="true">${esc("number" in isolated ? local(isolated.name) : isolated.name)}</b><button type="button" class="wb-show-all" data-show-all>Show all</button></span>`;
  const resumed = plotted.some(clockSetResume) ? '<p class="wb-legend-note">Dashed lines are Clock set resumes; see What the marks mean.</p>' : "";
  const legend = `<div class="wb-vlegend${state.legendOpen ? " wb-open" : ""}${isolated === null ? "" : " wb-isolating"}" data-legend><div class="wb-vbar"><button type="button" class="wb-vtoggle" data-legend-toggle aria-expanded="${String(state.legendOpen)}"><span class="wb-vtitle"><span class="wb-vlong">Harness </span>versions · ${String(shown.length)}</span><span class="wb-vnote">(color = version)</span><span class="wb-sws" aria-hidden="true">${swatches}</span><span class="wb-chev" aria-hidden="true"></span></button>${chip}</div>`
    + `<div class="wb-vpanel">${shown.length === 0 ? '<p class="wb-none">No agent runs in this selection.</p>' : sections}${resumed}</div></div>`;
  return `${legend}${marks(refs, versions, state, status)}<details class="wb-bar wb-how" data-bar="how"${state.howOpen ? " open" : ""}><summary><h3>How to read this chart<span class="wb-chev" aria-hidden="true"></span></h3></summary>${HOW}</details>`;
}
