// The Reports page (design: runs/mockups/viewer-reports/round2.html, option 2, picked by the operator 2026-10-20): a
// numbered Pokédex list of the run-analysis reports beside the selected report as the top of a trainer card,
// cut off above the party band, with its verdict on a plain sheet under it.
import { esc } from "./format.js";
import { FRONTIER_MILESTONES } from "./frontier.js";
import { tierOf, type CardArt } from "./trainer-card.js";

export interface ReportEntry {
  readonly slug: string;
  readonly date: string;
  readonly title: string;
  readonly kind: string;
  readonly verdict: string | null;
  readonly frontier: string | null;
  readonly facts: readonly (readonly [string, string])[];
  readonly trainer: string | null;
}

const KIND_COLORS: Readonly<Record<string, string>> = { FRONTIER: "#c0392b", COOK: "#7a3fb8", EXPERIMENT: "#2f6fb0", AUDIT: "#3a8f5a", CENSUS: "#a07020" };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
// Professor Birch stands in for reports that name no run's trainer.
const DEFAULT_TRAINER = "birch";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const nullableStr = (v: unknown): v is string | null => v === null || typeof v === "string";

export function parseReportList(value: unknown): ReportEntry[] {
  const ok = Array.isArray(value) && value.every(r => record(r) && str(r.slug) && str(r.date) && str(r.title) && str(r.kind) && nullableStr(r.verdict) && nullableStr(r.frontier) && nullableStr(r.trainer)
    && Array.isArray(r.facts) && r.facts.every(f => Array.isArray(f) && f.length === 2 && str(f[0]) && str(f[1])));
  if (!ok) throw new Error("Invalid report list from the viewer.");
  return value as ReportEntry[];
}

const shortDate = (date: string): string => {
  const [, month, day] = date.split("-");
  return `${MONTHS[Number(month) - 1] ?? "???"} ${String(Number(day))}`;
};
const number = (n: number): string => `No.${String(n).padStart(3, "0")}`;
const typeBadge = (kind: string): string => `<span class="ty">TYPE/<em style="--c:${KIND_COLORS[kind] ?? "#5a6b85"}">${esc(kind)}</em></span>`;

export function listHtml(entries: readonly ReportEntry[], selected: string): string {
  return entries.map((r, i) => `<a class="rp-row" href="/reports#${esc(r.slug)}" data-report="${esc(r.slug)}"${r.slug === selected ? ' aria-current="true"' : ""}>`
    + `<span class="rp-no">${number(entries.length - i)}</span><span class="rp-name">${shortDate(r.date)} · ${esc(r.title)}</span>${typeBadge(r.kind)}</a>`).join("");
}

export function detailHtml(entry: ReportEntry, n: number, art: CardArt | null): string {
  const level = entry.frontier === null ? -1 : FRONTIER_MILESTONES.findIndex(m => m.id === entry.frontier), total = FRONTIER_MILESTONES.length;
  const milestone = level < 0 ? null : FRONTIER_MILESTONES[level];
  const story = milestone === undefined || milestone === null ? "" : `<span class="sb"><span>STORY</span><span class="sb-t"><i style="width:${((level + 1) / total * 100).toFixed(1)}%"></i></span><span>${String(level + 1)}/${String(total)}</span></span>`;
  const trainer = art === null ? null : entry.trainer !== null && art.trainers.includes(entry.trainer) ? entry.trainer : DEFAULT_TRAINER;
  const head = `<span class="rp-tab">${shortDate(entry.date)} · ${number(n)}</span>${trainer === null ? "" : `<img src="/sprites/trainers/${esc(trainer)}.png" alt="">`}<span class="rp-id"><b>${esc(entry.title)}</b>${typeBadge(entry.kind)}${story}</span>`;
  const card = art === null ? `<div class="rp-card plain">${head}</div>` : `<div class="rp-card" style="--art:url(/sprites/card/wide-${level < 0 ? "green" : tierOf(level + 1, total)}.png)">${head}</div>`;
  const facts = entry.facts.length === 0 ? "" : `<dl>${entry.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  return `<div class="rp-det">${card}<div class="rp-sheet"><p class="rp-v">${entry.verdict === null ? "Open the report to read its findings." : esc(entry.verdict)}</p>`
    + `${milestone == null ? "" : `<span class="rp-fr">Frontier · <b>${esc(milestone.label)}</b></span>`}${facts}<a class="rp-go" href="/reports?open=${esc(entry.slug)}">OPEN REPORT ▸</a></div></div>`;
}

export function openedHtml(entries: readonly ReportEntry[], slug: string): string {
  const i = entries.findIndex(r => r.slug === slug), entry = entries[i];
  if (entry === undefined) return `<div class="rp-bar"><a href="/reports">◀ REPORTS</a><b>No report called ${esc(slug)}</b></div>`;
  const newer = entries[i - 1], older = entries[i + 1];
  const link = (r: ReportEntry | undefined, label: string): string => (r === undefined ? `<span class="off">${label}</span>` : `<a href="/reports?open=${esc(r.slug)}">${label}</a>`);
  return '<div class="rp-progress" data-rp="progress" role="progressbar" aria-label="How far down the report you are" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>'
    + `<div class="rp-bar"><a href="/reports#${esc(entry.slug)}">◀ REPORTS</a><b>${shortDate(entry.date)} · ${esc(entry.title)}</b><span class="rp-pct" data-rp="pct">0%</span><span class="rp-nav">${link(newer, "NEWER")}${link(older, "OLDER ▶")}</span></div>`
    + `<iframe class="rp-frame" src="/reports/${esc(entry.slug)}/index.html" title="${esc(entry.title)}"></iframe>`;
}

// How far down its report an opened report's scroll probe (reports-scroll.ts) says it is, or null for any other message.
export function reportScrollFraction(data: unknown): number | null {
  if (!record(data)) return null;
  const f = data.pokebenchReportScroll;
  return typeof f === "number" && f >= 0 && f <= 1 ? f : null;
}
