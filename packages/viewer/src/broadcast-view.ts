// The broadcast page's drawing: the press lane's geometry and each panel's HTML. Log text always goes through esc.
import type { BroadcastHeader, BroadcastMon } from "./broadcast-feed.js";
import { LANE_SECONDS } from "./broadcast-timeline.js";
import { esc } from "./format.js";

const GLOW_SECONDS = 1.2;
const CHIP_GAP = 30;
const BUTTON_WIDTH = 18;
const LABEL_ROOM = 190;
const ARROW_TURN: Readonly<Record<string, number>> = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };
const SHORT: Readonly<Record<string, string>> = { START: "ST", SELECT: "SE" };
const BADGES: readonly (readonly [name: string, color: string])[] = [["STONE", "#9c8a6a"], ["KNUCKLE", "#b85c3c"], ["DYNAMO", "#e8b830"], ["HEAT", "#e05030"], ["BALANCE", "#c0c8d0"], ["FEATHER", "#5aa8e0"], ["MIND", "#d070b0"], ["RAIN", "#3870c8"]];

export type LaneMark =
  | { readonly kind: "chip"; readonly x: number; readonly buttons: readonly string[]; readonly fresh: boolean }
  | { readonly kind: "tool"; readonly x: number }
  | { readonly kind: "star"; readonly x: number }
  | { readonly kind: "label"; readonly x: number; readonly name: string };

export interface LaneInput {
  readonly now: number;
  readonly width: number;
  readonly presses: readonly { readonly t: number; readonly b: readonly string[] }[];
  readonly tools: readonly { readonly t: number }[];
  readonly miles: readonly { readonly t: number; readonly name: string }[];
}

export function laneMarks({ now, width, presses, tools, miles }: LaneInput): LaneMark[] {
  const px = (t: number): number => width * (1 - (now - t) / LANE_SECONDS);
  const marks: LaneMark[] = tools.map(tool => ({ kind: "tool", x: px(tool.t) }));
  // Newest first: each chip sits at its own time unless that would touch the newer chip to its right.
  let edge = Infinity;
  for (const press of [...presses].reverse()) {
    const x = Math.min(px(press.t), edge);
    if (x < 0) break;
    edge = x - Math.max(CHIP_GAP, press.b.length * BUTTON_WIDTH + 12);
    marks.push({ kind: "chip", x, buttons: press.b, fresh: now - press.t < GLOW_SECONDS });
  }
  for (const mile of miles) marks.push({ kind: "star", x: px(mile.t) });
  const newest = miles.at(-1);
  if (newest !== undefined) marks.push({ kind: "label", x: px(newest.t), name: newest.name });
  return marks;
}

const glyph = (button: string): string => {
  const turn = ARROW_TURN[button];
  if (turn !== undefined) return `<svg width="12" height="12" viewBox="0 0 12 12" style="transform:rotate(${String(turn)}deg)"><path d="M6 1 11 10H1z" fill="#0b1a2c"/></svg>`;
  return esc(SHORT[button] ?? button);
};
const left = (x: number): string => `style="left:${x.toFixed(1)}px"`;

export function laneHtml(marks: readonly LaneMark[]): string {
  return marks.map(mark => {
    if (mark.kind === "tool") return `<i class="tool" ${left(mark.x)}></i>`;
    if (mark.kind === "star") return `<span class="mstar" ${left(mark.x)}>★</span>`;
    if (mark.kind === "label") return `<span class="${mark.x < LABEL_ROOM ? "mile right" : "mile"}" ${left(mark.x)}>${esc(mark.name.replace(/_/g, " "))}</span>`;
    return `<b class="${mark.fresh ? "chip new" : "chip"}" ${left(mark.x)}>${mark.buttons.map(glyph).join("")}</b>`;
  }).join("");
}

export const thinkingHtml = (paragraphs: readonly string[]): string => paragraphs.map(line => `<p>${esc(line)}</p>`).join("");
export const actionHtml = (action: { readonly name: string; readonly detail: string }): string => `<code>${esc(action.name)}</code> ${esc(action.detail)}`;

function hpHtml(hp: number | null, max: number | null): string {
  if (hp === null || max === null || max <= 0) return '<div class="hp"></div><div class="hpn">?/?</div>';
  const percent = Math.max(0, Math.min(100, 100 * hp / max));
  const color = percent > 50 ? "#38c060" : percent > 20 ? "#e8c030" : "#e04848";
  return `<div class="hp"><i style="width:${percent.toFixed(0)}%;background:${color}"></i></div><div class="hpn">${String(hp)}/${String(max)}</div>`;
}

export function partyHtml(party: readonly BroadcastMon[]): string {
  const mons = party.map(mon => `<div class="mon"><div class="mn">${esc(mon.name ?? "???")}</div><div class="ml">Lv${mon.level === null ? "?" : String(mon.level)}</div>${hpHtml(mon.hp, mon.maxHp)}</div>`).join("");
  return `<div class="${party.length > 3 ? "mons two" : "mons"}">${mons}</div>`;
}

// Sprites from the ROM, in the gitignored runs/sprites/rom-badges/. The game's Trainer Card draws every badge in grey.
export const BADGE_FILES: readonly string[] = BADGES.map(([name], index) => `badge-${String(index + 1)}-${name.toLowerCase()}.png`);
export const BADGE_URLS: readonly string[] = BADGE_FILES.map(file => `/sprites/badges/${file}`);

export function badgesHtml(earned: readonly string[], sprites = false): string {
  const next = BADGES.find(([name]) => !earned.includes(name))?.[0];
  return BADGES.map(([name, color], index) => {
    const state = earned.includes(name) ? "bdg got" : name === next ? "bdg live" : "bdg";
    if (sprites) return `<div class="${state} spr"><img src="${BADGE_URLS[index] ?? ""}" alt="${name}"></div>`;
    return `<div class="${state}" style="--c:${color}"><span>${name.charAt(0)}</span></div>`;
  }).join("");
}

export function runPill(header: Pick<BroadcastHeader, "kind" | "save">): string {
  return header.kind === "boot" ? "FROM BOOT" : `PRACTICE RUN · FROM ${header.save === null ? "A" : header.save} SAVE`;
}

export const modelTitle = (model: string): string => (model.split("/").pop() ?? model).replace(/[-_]+/g, " ").toUpperCase();
