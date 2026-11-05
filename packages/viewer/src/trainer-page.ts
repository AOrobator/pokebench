// The PokéNav TRAINER CARD page: the game's own card with this run's values on it, a run window beside it,
// and a gym page for each badge (mockup A, picked by the operator 2026-11-04). Art and the gym table come from
// `just trainer-page-art` (runs/sprites/trainer-page-v1, never git). Positions are the game's, in card pixels.
import { displayModelName } from "./frontier-versions.js";
import { esc, hms } from "./format.js";
import type { RunView } from "./model.js";

export interface GymMon { readonly name: string; readonly level: number; readonly icon: number }
export interface Gym { readonly badge: string; readonly title: string; readonly city: string; readonly leader: string; readonly type: string; readonly tm: string; readonly sprite: string; readonly team: readonly GymMon[] }
export interface TrainerPageData { readonly gyms: readonly Gym[] }
export interface PartyIcon { readonly icon: number | null; readonly level: number; readonly hp: number }
export interface TrainerFacts {
  readonly gender: "male" | "female"; readonly name: string; readonly id: string; readonly money: string; readonly time: string;
  readonly badges: readonly string[]; readonly earnedAt: ReadonlyMap<string, string>;
  readonly model: string; readonly modelId: string; readonly thinking: string; readonly turn: string; readonly runTime: string; readonly map: string;
  readonly party: readonly PartyIcon[]; readonly legacy: boolean;
}

const BLANK = "---";
const EGG_ICON = 412;
// What /sprites/page/ may serve from runs/sprites/trainer-page-v1.
export const PAGE_SPRITE_PATH = /^(data\.json|card-(male|female)\.png|stripes-(male|female)\.png|text-window\.png|badges\.png|region-map\.png|map-run\.png|map-frontier\.png|leader-[a-z-]+\.png)$/;
const SPRITE = /^leader-[a-z-]+\.png$/;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v !== "";
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const isMon = (v: unknown): v is GymMon => record(v) && text(v["name"]) && count(v["level"]) && count(v["icon"]);
const isGym = (v: unknown): v is Gym => record(v) && ["badge", "title", "city", "leader", "type", "tm"].every(key => text(v[key])) && text(v["sprite"]) && SPRITE.test(v["sprite"]) && Array.isArray(v["team"]) && v["team"].every(isMon);

export function parseTrainerPageData(value: unknown): TrainerPageData | null {
  if (!record(value) || value["version"] !== 1) return null;
  const gyms: unknown = value["gyms"];
  return Array.isArray(gyms) && gyms.every(isGym) ? { gyms } : null;
}

const mapName = (location: string | null | undefined): string => location == null ? BLANK : location.replaceAll("_", " ").replace(/([A-Z])(\d)/, "$1 $2");

export function trainerFacts(view: RunView, wallSeconds: number): TrainerFacts {
  // A battle or map transition reads blank for a moment; the card keeps the last full sample through it.
  const state = view.state?.name != null ? view.state : view.partyState ?? view.state, party = view.partyMembers;
  // The player's own Pokémon carry the player's ID; a traded one in the lead must not lend its trainer's.
  const owner = party.find(mon => mon.ot_id != null && mon.ot_name != null && mon.ot_name === state?.name) ?? (party.some(mon => mon.ot_name != null) ? undefined : party.find(mon => mon.ot_id != null));
  const earnedAt = new Map(view.milestones.flatMap(mark => {
    const badge = /^([A-Z]+)_BADGE$/.exec(mark.name)?.[1];
    return badge === undefined || view.startMs === null || mark.origin === "present_at_start" ? [] : [[badge, hms((mark.ms - view.startMs - view.control.pausedBefore(mark.ms)) / 1000)] as const];
  }));
  const play = state?.play_time_s ?? null, id = view.start?.model.id ?? "";
  return {
    gender: owner?.ot_gender === "female" ? "female" : "male",
    name: state?.name ?? BLANK,
    id: owner?.ot_id == null ? "-----" : String(owner.ot_id % 65_536).padStart(5, "0"),
    money: state?.money == null ? BLANK : `¥${String(state.money)}`,
    time: play === null ? BLANK : `${String(Math.floor(play / 3600))}:${String(Math.floor((play % 3600) / 60)).padStart(2, "0")}`,
    badges: state?.badges ?? [], earnedAt,
    model: displayModelName(id), modelId: id, thinking: view.start?.sampling.thinking_level ?? BLANK,
    turn: view.turn.toLocaleString("en-US"), runTime: hms(wallSeconds), map: mapName(state?.location),
    party: party.map(mon => ({ icon: mon.is_egg === true ? EGG_ICON : mon.species_id ?? null, level: mon.level ?? 0, hp: mon.hp != null && mon.max_hp != null && mon.max_hp > 0 ? (mon.hp / mon.max_hp) * 100 : 0 })),
    legacy: view.legacyState,
  };
}

const game = (value: string, colour = "tp-dark"): string => `<span class="gtx" data-gt="${esc(value)}" data-c="${colour}">${esc(value)}</span>`;
const at = (value: string, x: number, y: number, right = false, colour?: string): string => `<span class="tp-at" style="${right ? "right" : "left"}:calc(var(--u)*${String(right ? 240 - x : x)});top:calc(var(--u)*${String(y)})">${game(value, colour)}</span>`;
// Party icon sheets hold two animation frames; the window shows the first.
const icon = (id: number, alt: string): string => `<span class="tp-icon"><img src="/sprites/icons/${String(id)}.png" alt="${esc(alt)}"></span>`;
const slot = (index: number): number => 32 + 24 * index;

export function cardHtml(facts: TrainerFacts, gyms: readonly Gym[]): string {
  const row = (label: string, value: string, y: number): string => at(label, 24, y) + at(value, 144, y, true);
  const badges = gyms.map((gym, i) => {
    const earned = facts.badges.includes(gym.badge), left = `left:calc(var(--u)*${String(slot(i))})`;
    return (earned ? `<i class="tp-badge-art" style="${left};background-position-x:calc(var(--u)*${String(-16 * i)})"></i>` : "")
      + `<button type="button" class="tp-slot" data-tp-badge="${String(i)}" style="${left}" aria-label="${esc(`${gym.title}, ${gym.leader}, ${earned ? "earned" : "not earned"}`)}" aria-pressed="false"></button>`;
  }).join("");
  return `<div class="tp-card"><img class="tp-card-art" src="/sprites/page/card-${facts.gender}.png" alt=""><img class="tp-player" src="/sprites/trainers/${facts.gender === "female" ? "may" : "brendan"}.png" alt="">`
    + at(`NAME: ${facts.name}`, 24, 43) + at(`IDNo.${facts.id}`, 216, 19, true) + row("MONEY", facts.money, 67) + row("POKéDEX", BLANK, 83) + row("TIME", facts.time, 99) + badges + "</div>";
}

const pair = (label: string, value: string): string => `<div class="tp-row">${game(label, "tp-muted")}${game(value)}</div>`;

export function runHtml(facts: TrainerFacts): string {
  const party = facts.party.map(mon => `<div class="tp-mon">${mon.icon === null ? "" : icon(mon.icon, "")}${game(`Lv${String(mon.level)}`)}<div class="tp-hp"><i style="width:${mon.hp.toFixed(1)}%"></i></div></div>`).join("");
  return `<div class="tp-rows"><div class="tp-row" title="${esc(facts.modelId)}">${game("MODEL", "tp-muted")}${game(facts.model)}</div>${pair("THINKING", facts.thinking)}${pair("TURN", facts.turn)}${pair("RUN TIME", facts.runTime)}${pair("MAP", facts.map)}</div><div class="tp-party">${party}</div>${facts.legacy ? '<p class="nodata">Historical vendor readout; accurate state unavailable for this run.</p>' : ""}`;
}

// The box opens on the gym this run faces next, or the last one once all are won.
export const nextGym = (gyms: readonly Gym[], facts: TrainerFacts): number => {
  const next = gyms.findIndex(gym => !facts.badges.includes(gym.badge));
  return next < 0 ? gyms.length - 1 : next;
};

export function gymHtml(gym: Gym, facts: TrainerFacts): string {
  const earned = facts.badges.includes(gym.badge), when = facts.earnedAt.get(gym.badge);
  const team = gym.team.map(mon => `<span>${icon(mon.icon, mon.name)}${game(`Lv${String(mon.level)}`)}</span>`).join("");
  return `<div class="tp-gym-body"><img class="tp-leader" src="/sprites/page/${esc(gym.sprite)}" alt=""><div class="tp-rows">${game(gym.title.toUpperCase(), "tab")}${game(gym.leader)}${game(gym.city)}${game(`${gym.type} · TM ${gym.tm}`)}${earned ? game(when === undefined ? "Earned" : `Earned at ${when}`) : game("Not earned yet", "tp-red")}</div><div class="tp-team">${team}</div></div>`;
}
