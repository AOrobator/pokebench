// A run as Emerald's Trainer Card (design: runs/mockups/viewer-header-desktop/trainer-cards-9.html,
// option 1, picked by the operator 2026-10-16). The art comes from runs/sprites/trainer-card-v1, built from
// the ROM by `just trainer-card-art`; positions below are in the card art's own pixels.
import { esc } from "./format.js";
import type { WorkbenchCard, WorkbenchRun } from "./workbench-data.js";
import { armColor, clockText, plateFacts, type PlateFacts } from "./workbench-view.js";

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
  readonly status: "watching" | "live" | "paused" | "replay";
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

function trainerAllocation(group: string, identities: readonly string[], trainers: readonly string[], reserved: ReadonlySet<number> = new Set()): ReadonlyMap<string, number> {
  const taken = new Set(reserved), allocated = new Map<string, number>();
  const all = [...new Set(identities)].sort();
  for (const each of all) {
    const seed = `${group}\u0000${each}`;
    let index = fnv1a(seed) % trainers.length;
    for (let probes = 0; taken.has(index) && probes < trainers.length; probes++) index = (index + 1) % trainers.length;
    taken.add(index);
    allocated.set(each, index);
  }
  return allocated;
}

// Identities in one group take trainers in sorted order, probing past ones already taken.
export function trainerFor(group: string, identity: string, identities: readonly string[], trainers: readonly string[]): string {
  const index = trainerAllocation(group, [...identities, identity], trainers).get(identity) ?? 0;
  return trainers[index] ?? "";
}

function gpuOf(runId: string): string {
  return /(?:^|[-_])(gpu\d+)(?=[-_]|$)/i.exec(runId)?.[1]?.toLowerCase() ?? "";
}

function trainerIdentity(arm: string, gpu: string): string {
  return gpu === "" ? arm : `${arm}\u0000${gpu}`;
}

interface TrainerPeer { readonly arm: string; readonly gpu: string }

function experimentTrainerFor(group: string, current: TrainerPeer, peers: readonly TrainerPeer[], trainers: readonly string[]): string {
  const all = [...peers, current], arms = [...new Set(all.map(peer => peer.arm))];
  const legacy = trainerAllocation(group, arms, trainers);
  if (current.gpu === "") return trainers[legacy.get(current.arm) ?? 0] ?? "";
  const reserved = new Set(all.flatMap(peer => peer.gpu === "" ? [legacy.get(peer.arm) ?? 0] : []));
  const identities = all.flatMap(peer => peer.gpu === "" ? [] : [trainerIdentity(peer.arm, peer.gpu)]);
  const index = trainerAllocation(group, identities, trainers, reserved).get(trainerIdentity(current.arm, current.gpu)) ?? 0;
  return trainers[index] ?? "";
}

// One run's card from the workbench snapshot; runs: every run the snapshot has, so the trainer pick sees
// all of the experiment's arms the same way on every page.
export function cardInputFor(run: WorkbenchRun, at: number, now: number, status: CardInput["status"], runs: readonly WorkbenchRun[], art: CardArt): CardInput {
  const experiment = run.experiment ?? null, title = experiment?.id ?? run.model ?? run.id;
  const gpu = gpuOf(run.id);
  const trainer = experiment === null
    ? trainerFor(title, trainerIdentity("", gpu), [], art.trainers)
    : experimentTrainerFor(title, { arm: experiment.arm, gpu }, runs.flatMap((other) => (other.experiment?.id === experiment.id ? [{ arm: other.experiment.arm, gpu: gpuOf(other.id) }] : [])), art.trainers);
  const facts = plateFacts(run, at, now);
  return { runId: run.id, title, arm: experiment?.arm ?? null, trial: experiment === null ? null : `trial ${String(experiment.trial)}/${String(experiment.of)}`,
    card: run.card ?? null, facts: status === "replay" ? { ...facts, fresh: false } : facts, status, trainer };
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
  const word = status === "watching" ? "WATCHING" : status === "paused" ? "PAUSED" : status === "replay" ? "REPLAY" : "LIVE";
  const dot = status === "watching" || status === "live" ? '<span class="tc-dot"></span>' : "";
  return `<span class="tc-chip tc-state${status === "watching" ? "" : " tc-off"}">${dot}${gt(word, "white", 14)}</span>`;
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

// href: the card is a link there (the comparisons page links to the viewer); without it, a button that watches the run.
export function cardHtml(input: CardInput, art: CardArt, kind: CardKind, href: string | null = null): string {
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
  const body = `<span class="tc-tab" style="left:${pct(13, g.w)};top:${pct(10, g.h)};height:${pct(16, g.h)};width:${pct(wide ? 168 : 166, g.w)}">${gt(input.title, "tab", 14, 1)}</span>`
    + box(g, wide ? 196 : 184, 9, wide ? 184 : 98, 18, `<span class="tc-line tc-end">${corner}</span>`)
    + (wide ? box(g, 10, 37, 64, 64, sprite, " tc-sprite") : box(g, 4, 26, 44, 44, sprite, " tc-sprite"))
    + (wide ? box(g, 92, 30, 286, 20, nameType(input, true)) + box(g, 92, 52, 286, 14, `<span class="tc-line tc-l2">${second}</span>`) + box(g, 92, 68, 286, 13, story) + box(g, 92, 84, 286, 13, time)
      : box(g, 52, 27, 230, 18, nameType(input, false)) + box(g, 52, 47, 172, 11, story) + box(g, 52, 59, 172, 11, time))
    + mons
    + (ribbon ? box(g, 8, 72, 272, 16, `<span class="tc-ribbon">${badge()}</span>`) : "");
  const label = `Watch run ${input.runId}: ${input.title}${input.arm === null ? "" : `, ${input.arm}`}`;
  const cls = `tc tc-${kind}${facts.fresh ? " tc-new" : ""}`, frame = `<span class="tc-art" style="--gw:${String(g.w)};aspect-ratio:${String(g.w)}/${String(g.h)};background-image:url(${image})">${body}</span>`;
  return href === null
    ? `<button type="button" class="${cls}" data-watch="${esc(input.runId)}" aria-pressed="${String(input.status === "watching" || input.status === "replay")}" aria-label="${esc(label)}">${frame}</button>`
    : `<a class="${cls}" href="${esc(href)}" data-watch="${esc(input.runId)}" aria-label="${esc(label)}">${frame}</a>`;
}
