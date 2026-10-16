// A run as Emerald's Trainer Card (design: runs/mockups/viewer-header-desktop/trainer-cards-9.html,
// option 1, picked by the operator 2026-10-16). The art comes from runs/sprites/trainer-card-v1, built from
// the ROM by `just trainer-card-art`; positions below are in the card art's own pixels.
import { esc } from "./format.js";
import type { WorkbenchCard } from "./workbench-data.js";
import { armColor, clockText, type PlateFacts } from "./workbench-view.js";

export const TIERS = ["green", "bronze", "copper", "silver", "gold"] as const;
export type Tier = (typeof TIERS)[number];
export type CardKind = "wide" | "mini";
export interface CardArt { readonly trainers: readonly string[]; readonly icons: ReadonlySet<number>; readonly egg: number }
export interface CardInput {
  readonly runId: string;
  // The tab: the run's experiment, else its preset, model or id.
  readonly title: string;
  readonly arm: string | null;
  readonly trial: string | null;
  readonly card: WorkbenchCard | null;
  readonly facts: PlateFacts;
  readonly status: "watching" | "live" | "paused";
  readonly trainer: string;
}

const SPECIES = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= 412;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseCardArt(value: unknown): CardArt | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.tiers) || value.tiers.join() !== TIERS.join()) return null;
  const { trainers, icons, egg } = value;
  if (!Array.isArray(trainers) || trainers.length === 0 || !trainers.every(t => typeof t === "string" && /^[a-z]+$/.test(t))) return null;
  if (!Array.isArray(icons) || !icons.every(SPECIES) || !SPECIES(egg)) return null;
  return { trainers: trainers as string[], icons: new Set(icons), egg };
}

export function tierOf(level: number, total: number): Tier {
  return TIERS[total > 0 ? Math.min(TIERS.length - 1, Math.floor((level / total) * TIERS.length)) : 0] ?? "green";
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}

// The arms of one experiment take trainers in sorted order, each probing past ones already taken,
// so two arms never share a sprite while there are sprites to go round.
export function trainerFor(experiment: string, arm: string, arms: readonly string[], trainers: readonly string[]): string {
  const taken = new Set<number>(), all = [...new Set([...arms, arm])].sort();
  for (const each of all) {
    let index = fnv1a(`${experiment}\u0000${each}`) % trainers.length;
    for (let probes = 0; taken.has(index) && probes < trainers.length; probes++) index = (index + 1) % trainers.length;
    taken.add(index);
    if (each === arm) return trainers[index] ?? "";
  }
  return trainers[0] ?? "";
}

export function placeText(location: string | null): string {
  if (location === null) return "";
  return location.replace(/^ROUTE ?(\d+)/, "ROUTE $1").toLowerCase().replace(/\b[a-z]/g, ch => ch.toUpperCase()).replace(/\b(\d+)f\b/gi, "$1F");
}

const pct = (part: number, whole: number): string => `${(whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0).toFixed(1)}%`;

// What changes every second, filled in place so the card's animations never restart.
export function clockParts(facts: PlateFacts, kind: CardKind): { text: string; width: string } {
  const time = clockText(facts.elapsed);
  return { text: kind === "wide" && facts.cap !== null ? `${time}/${clockText(facts.cap)}` : time, width: pct(facts.cap === null ? 0 : facts.elapsed, facts.cap ?? 0) };
}

interface Geometry { readonly w: number; readonly h: number }
const box = (g: Geometry, x: number, y: number, w: number, h: number, html: string, cls = ""): string =>
  `<span class="tc-abs${cls}" style="left:${pct(x, g.w)};top:${pct(y, g.h)};width:${pct(w, g.w)};height:${pct(h, g.h)}">${html}</span>`;
// Game-font text: the span keeps its text until game-font.ts paints it.
const gt = (text: string, colour: string, height: number, bold = 0): string =>
  `<span class="gtx" data-gt="${esc(text)}" data-c="${colour}" data-h="${String(height)}"${bold > 0 ? ` data-b="${String(bold)}"` : ""}>${esc(text)}</span>`;

function stateChip(status: CardInput["status"]): string {
  const word = status === "watching" ? "WATCHING" : status === "paused" ? "PAUSED" : "LIVE";
  return `<span class="tc-chip tc-state${status === "watching" ? "" : " tc-off"}">${status === "paused" ? "" : '<span class="tc-dot"></span>'}${gt(word, "white", 14)}</span>`;
}
const badge = (): string => `<span class="tc-chip tc-badge">${gt("NEW MILESTONE!", "badge", 14)}</span>`;

function mon(art: CardArt, m: WorkbenchCard["party"][number]): string {
  const id = m.egg ? art.egg : m.speciesId;
  if (id === null || !art.icons.has(id)) return "";
  return `<i class="tc-mon" style="background-image:url(/sprites/icons/${String(id)}.png)" title="${m.egg ? "Egg" : `Lv${String(m.level)}`}"></i>`;
}

function nameType(input: CardInput, wide: boolean): string {
  const arm = input.arm === null ? "" : `<span class="tc-ty">TYPE/<em style="--tyc:${armColor(input.arm)}">${esc(input.arm.toUpperCase())}</em></span>`;
  return `<span class="tc-line"><span class="tc-nm${wide ? " tc-big" : ""}">${esc(input.card?.name ?? "—")}</span>${arm}</span>`;
}

function bar(label: string, fill: string, width: string, value: string, clock: boolean): string {
  return `<span class="tc-bar"><span class="tc-bl">${label}</span><span class="tc-track"><i style="width:${width};--fill:${fill}"${clock ? " data-time-bar" : ""}></i></span><span class="tc-bv"${clock ? " data-clock" : ""}>${esc(value)}</span></span>`;
}

export function cardHtml(input: CardInput, art: CardArt, kind: CardKind): string {
  const { facts } = input, wide = kind === "wide", ribbon = !wide && facts.fresh;
  const g: Geometry = wide ? { w: 388, h: 180 } : { w: 288, h: ribbon ? 94 : 76 };
  const image = `/sprites/card/${wide ? "wide" : ribbon ? "mini-ribbon" : "mini"}-${tierOf(facts.level, facts.total)}.png`;
  const corner = wide && facts.fresh ? `<span class="tc-dot"></span>${badge()}` : stateChip(input.status);
  const second = [`<b>${esc(facts.reached?.label ?? "No milestone yet")}</b>`, esc(placeText(input.card?.location ?? null)), input.trial === null ? "" : esc(input.trial)].filter(part => part !== "").join(" · ");
  const story = bar("STORY", "#58b850", pct(facts.level, facts.total), `${String(facts.level)}/${String(facts.total)}`, false);
  const time = bar("TIME", "#3890f8", "0%", "", true);
  const party = input.card?.party ?? [], sprite = `<img src="/sprites/trainers/${esc(input.trainer)}.png" alt="">`;
  const mons = wide
    ? party.map((m, i) => { const html = mon(art, m); return html === "" ? "" : box(g, 42 + 60.8 * i - 32, 132 - 32, 64, 64, html, " tc-slot"); }).join("")
    : (() => { const lead = party[0], html = lead === undefined ? "" : mon(art, lead); return html === "" ? "" : box(g, 262 - 18, 54 - 18, 36, 36, html, " tc-slot"); })();
  const body = `<span class="tc-tab" style="left:${pct(13, g.w)};top:${pct(10, g.h)};height:${pct(16, g.h)};min-width:${pct(wide ? 168 : 176, g.w)}">${gt(input.title, "tab", 14, 1)}</span>`
    + box(g, wide ? 196 : 184, 9, wide ? 184 : 98, 18, `<span class="tc-line tc-end">${corner}</span>`)
    + (wide ? box(g, 10, 37, 64, 64, sprite, " tc-sprite") : box(g, 4, 26, 44, 44, sprite, " tc-sprite"))
    + (wide ? box(g, 92, 30, 286, 20, nameType(input, true)) + box(g, 92, 52, 286, 14, `<span class="tc-line tc-l2">${second}</span>`) + box(g, 92, 68, 286, 13, story) + box(g, 92, 84, 286, 13, time)
      : box(g, 52, 27, 230, 18, nameType(input, false)) + box(g, 52, 47, 172, 11, story) + box(g, 52, 59, 172, 11, time))
    + mons
    + (ribbon ? box(g, 8, 72, 272, 16, `<span class="tc-ribbon">${badge()}</span>`) : "");
  const label = `Watch run ${input.runId}: ${input.title}${input.arm === null ? "" : `, ${input.arm}`}`;
  return `<button type="button" class="tc tc-${kind}${facts.fresh ? " tc-new" : ""}" data-watch="${esc(input.runId)}" aria-pressed="${String(input.status === "watching")}" aria-label="${esc(label)}">`
    + `<span class="tc-art" style="--gw:${String(g.w)};aspect-ratio:${String(g.w)}/${String(g.h)};background-image:url(${image})">${body}</span></button>`;
}
