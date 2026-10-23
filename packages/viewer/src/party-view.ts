// The PokéNav POKéMON PARTY page (runs/mockups/party-menu/variant-d3.html, "D3 · Party opens up"):
// the party list in the game's party-slot palettes, and the chosen slot opened in place into its
// summary (PROFILE, STATS, MOVES). Art and tables come from `just party-art` (runs/sprites/party-v1,
// read from the ROM); values come only from the recorded state or those tables, never guessed.
import type { StateEvent } from "./model.js";
import { esc } from "./format.js";

export type PartyMon = StateEvent["party"][number];
export interface SpeciesData { readonly types: readonly [number, number]; readonly gender: number; readonly growth: number; readonly abilities: readonly [number, number]; readonly dex: number }
export interface MoveData { readonly type: number; readonly power: number; readonly accuracy: number; readonly pp: number; readonly description: string }
export interface AbilityData { readonly name: string; readonly description: string }
export interface PartyData {
  readonly types: readonly string[];
  readonly species: ReadonlyMap<number, SpeciesData>;
  readonly moves: ReadonlyMap<number, MoveData>;
  readonly abilities: ReadonlyMap<number, AbilityData>;
  readonly natures: readonly string[];
  readonly experience: readonly (readonly number[])[];
}
export type PartyTab = 0 | 1 | 2;
export interface PartyUi { readonly slot: number; readonly tab: PartyTab; readonly move: number | null }

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const byte = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 255;
const nat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(byte);
const KEY = /^(?:0|[1-9][0-9]*)$/;

function table<T>(value: unknown, parse: (v: unknown) => T | null): Map<number, T> | null {
  if (!record(value)) return null;
  const out = new Map<number, T>();
  for (const [key, entry] of Object.entries(value)) {
    const parsed = KEY.test(key) ? parse(entry) : null;
    if (parsed === null) return null;
    out.set(Number(key), parsed);
  }
  return out;
}

// data.json from `just party-art`; null when it is missing or not the shape this page reads.
export function parsePartyData(value: unknown): PartyData | null {
  if (!record(value) || value.version !== 1) return null;
  const { types, natures, experience } = value;
  if (!Array.isArray(types) || types.length !== 18 || !types.every((t) => typeof t === "string")) return null;
  if (!Array.isArray(natures) || natures.length !== 25 || !natures.every((n) => typeof n === "string")) return null;
  if (!Array.isArray(experience) || experience.length !== 6 || !experience.every((row) => Array.isArray(row) && row.every(nat))) return null;
  const species = table(value.species, (s): SpeciesData | null =>
    record(s) && pair(s.types) && byte(s.gender) && byte(s.growth) && pair(s.abilities) && nat(s.dex) ? { types: s.types, gender: s.gender, growth: s.growth, abilities: s.abilities, dex: s.dex } : null);
  const moves = table(value.moves, (m): MoveData | null =>
    record(m) && byte(m.type) && byte(m.power) && byte(m.accuracy) && byte(m.pp) && typeof m.description === "string" ? { type: m.type, power: m.power, accuracy: m.accuracy, pp: m.pp, description: m.description } : null);
  const abilities = table(value.abilities, (a): AbilityData | null =>
    record(a) && typeof a.name === "string" && typeof a.description === "string" ? { name: a.name, description: a.description } : null);
  if (species === null || moves === null || abilities === null) return null;
  return { types, species, moves, abilities, natures, experience };
}

// GetGenderFromSpeciesAndPersonality: 0 always male, 254 always female, 255 genderless.
export function genderOf(personality: number | null | undefined, ratio: number): "m" | "f" | null {
  if (personality == null || ratio === 255) return null;
  if (ratio === 0) return "m";
  if (ratio === 254) return "f";
  return (personality & 0xff) < ratio ? "f" : "m";
}

export function natureOf(personality: number | null | undefined, data: PartyData): string | null {
  return personality == null ? null : (data.natures[personality % 25] ?? null);
}

// DrawExperienceProgressBar: 64 one-pixel ticks, at least one once any EXP is past the level.
export function expProgress(exp: number | null | undefined, level: number, growth: number, data: PartyData): { ticks: number; next: number } | null {
  const rates = data.experience[growth];
  if (exp == null || rates === undefined || rates.length < 101) return null;
  if (level >= 100) return { ticks: 0, next: 0 };
  const lo = rates[level] ?? 0, hi = rates[level + 1] ?? lo, since = exp - lo, between = hi - lo;
  let ticks = between > 0 ? Math.floor((since * 64) / between) : 0;
  if (ticks === 0 && since > 0) ticks = 1;
  return { ticks: Math.min(64, Math.max(0, ticks)), next: Math.max(0, hi - exp) };
}

export type StatusName = "PSN" | "PAR" | "SLP" | "FRZ" | "BRN" | "FNT";
const STATUS_ROWS: Readonly<Record<StatusName, number>> = { PSN: 0, PAR: 1, SLP: 2, FRZ: 3, BRN: 4, FNT: 6 };
// The party status word (include/constants/battle.h STATUS1_*); a fainted Pokémon shows FNT.
export function statusOf(mon: { readonly hp: number | null; readonly status?: number | null }): StatusName | null {
  if (mon.hp === 0) return "FNT";
  const s = mon.status ?? 0;
  if ((s & 0x7) !== 0) return "SLP";
  if ((s & 0x88) !== 0) return "PSN";
  if ((s & 0x10) !== 0) return "BRN";
  if ((s & 0x20) !== 0) return "FRZ";
  if ((s & 0x40) !== 0) return "PAR";
  return null;
}

// GetHPBarLevel on the party menu's 48-pixel bar: green over 24, yellow over 9, red below.
export function hpBar(hp: number | null, max: number | null): { px: number; level: "g" | "y" | "r" } {
  if (hp == null || max == null || max <= 0) return { px: 0, level: "r" };
  let px = Math.floor((Math.min(hp, max) * 48) / max);
  if (hp > 0 && px === 0) px = 1;
  return { px, level: px > 24 ? "g" : px > 9 ? "y" : "r" };
}

// GetCurrentPPToMaxPPState: 3 normal, 0 yellow, 1 orange, 2 red.
export function ppState(pp: number, max: number): 0 | 1 | 2 | 3 {
  if (pp === max) return 3;
  if (max <= 7) return pp > (max <= 2 ? 1 : 2) ? 3 : (Math.min(2, Math.max(0, 2 - pp)) as 0 | 1 | 2);
  if (pp === 0) return 2;
  if (pp <= Math.floor(max / 4)) return 1;
  if (pp > Math.floor(max / 2)) return 3;
  return 0;
}

// The recorded ability; runs recorded before the party readout kept the ability show it only
// when the species has one ability.
export function abilityOf(mon: Pick<PartyMon, "species_id" | "ability_id">, data: PartyData): AbilityData | null {
  if (mon.ability_id != null) return data.abilities.get(mon.ability_id) ?? null;
  const species = mon.species_id == null ? undefined : data.species.get(mon.species_id);
  if (species === undefined) return null;
  const [a, b] = species.abilities;
  return b === 0 || a === b ? (data.abilities.get(a) ?? null) : null;
}

const MAPSEC_NONE = 213, METLOC_IN_GAME_TRADE = 0xfe, METLOC_FATEFUL_ENCOUNTER = 0xff, EGG_HATCH_LEVEL = 5, VERSION_LEAF_GREEN = 5;
export type MemoPiece = readonly [text: string, red: boolean];
// BufferMonTrainerMemo: the nature, then where and at what level it was met. Owner match is by OT
// name only (the player's ID and gender are not recorded). Null pieces mean the run did not record it.
export function trainerMemo(mon: PartyMon, nature: string, trainer: string | null): MemoPiece[][] {
  const head: MemoPiece[] = [[nature, true], [" nature", false]];
  const at = mon.met_location, level = mon.met_level, game = mon.met_game;
  if (at == null || level == null) return [[...head, [".", false]]];
  const lv: MemoPiece = [`${LV2}${String(level === 0 ? EGG_HATCH_LEVEL : level)}`, true];
  // A met location the run could not name is left out rather than printed blank.
  const named = mon.met_location_name != null && mon.met_location_name !== "";
  const place: MemoPiece[] = [[mon.met_location_name ?? "", true], [".", false]];
  const lvLine = (prefix: string): MemoPiece[][] => (named ? [[[prefix, false], lv, [",", false]], place] : [[[prefix, false], lv, [".", false]]]);
  const own = trainer !== null && mon.ot_name === trainer;
  if (own) {
    const verb = level === 0 ? "hatched" : "met";
    if (at >= MAPSEC_NONE) return [[...head, [",", false]], [[`${verb} somewhere at `, false], lv, [".", false]]];
    return [[...head, [",", false]], ...lvLine(`${verb} at `)];
  }
  if (at === METLOC_FATEFUL_ENCOUNTER) return [[...head, [",", false]], [["obtained in a fateful", false]], [["encounter at ", false], lv, [".", false]]];
  if (at !== METLOC_IN_GAME_TRADE && game != null && game > 0 && game <= VERSION_LEAF_GREEN && at < MAPSEC_NONE) return [[...head, [",", false]], ...lvLine("probably met at ")];
  return [[...head, [",", false]], [["obtained in a trade.", false]]];
}

// ---- markup ----------------------------------------------------------------------------------

// Private-use characters for the game's control-code glyphs (font/*.json from `just party-art`).
const LV = "", LV2 = "", PP = "", ID = "", NO = "";
const SPOKEN: Readonly<Record<string, string>> = { [LV]: "Lv", [LV2]: "Lv", [PP]: "PP", [ID]: "ID", [NO]: "No." };
const spoken = (text: string): string => text.replace(/[-]/g, (ch) => SPOKEN[ch] ?? "");
const ART = "/sprites/party";
const EGG_ICON = 412;
const UNKNOWN = "Unknown Pokémon · harness bug";
const DEX_HOENN = 202;
export const PARTY_TABS = ["PROFILE", "STATS", "MOVES"] as const;
const THEMES = ["info", "skills", "moves"] as const;

const gt = (text: string, colour: string, font: "s" | "n" = "s"): string =>
  `<span class="gtx" data-gt="${esc(text)}" data-c="${colour}" data-f="${font}" data-h="14">${esc(spoken(text))}</span>`;
const sprite = (cls: string, style = ""): string => `<i class="${cls}" aria-hidden="true"${style === "" ? "" : ` style="${style}"`}></i>`;
const gender = (g: "m" | "f" | null): string => (g === null ? "" : gt(g === "f" ? "♀" : "♂", g === "f" ? "pv-female" : "pv-male"));
const pad = (n: number, width: number, fill = " "): string => String(n).padStart(width, fill);

function hpMarkup(hp: number, max: number): string {
  const { px, level } = hpBar(hp, max);
  return `<span class="pv-hp" role="img" aria-label="HP ${String(hp)} of ${String(max)}"><i class="frame"></i><i class="track"><i class="fill ${level}" style="width:${((px / 48) * 100).toFixed(2)}%"></i></i><i class="tag"></i></span>`;
}
function statusMarkup(name: StatusName): string {
  return `<i class="pv-status" role="img" aria-label="${name}" style="--row:${String(STATUS_ROWS[name])}"></i>`;
}
function iconMarkup(mon: PartyMon, open: boolean): string {
  const id = mon.is_egg === true ? EGG_ICON : mon.species_id;
  return id == null ? sprite("pv-icon none") : sprite(`pv-icon${open ? " sel" : ""}`, `background-image:url(/sprites/icons/${String(id)}.png)`);
}
const nameOf = (mon: PartyMon): string => (mon.is_egg === true ? "EGG" : (mon.nickname ?? mon.species ?? UNKNOWN));

function slotMarkup(mon: PartyMon, data: PartyData, i: number, open: boolean, extra = ""): string {
  const status = mon.is_egg === true ? null : statusOf(mon), faint = status === "FNT" ? " faint" : "";
  const g = mon.is_egg === true ? null : genderFor(mon, data);
  const lv = status !== null ? statusMarkup(status) : mon.is_egg === true || mon.level == null ? "" : gt(`${LV}${String(mon.level)}`, "pv-slot");
  const hp = mon.is_egg === true ? "" : mon.hp == null || mon.max_hp == null ? `<span class="pv-hpw"><span class="pv-hpn">${gt("---", "pv-slot")}</span></span>` : `<span class="pv-hpw">${hpMarkup(mon.hp, mon.max_hp)}<span class="pv-hpn">${gt(`${pad(mon.hp, 3)}/${pad(mon.max_hp, 3)}`, "pv-slot")}</span></span>`;
  return `<button type="button" class="pv-box pv-slot${open ? " sel" : ""}${faint}${extra}" data-pv-slot="${String(i)}" aria-expanded="${String(open)}" aria-label="${esc(nameOf(mon))}, slot ${String(i + 1)}">`
    + `<i class="pv-ball${open ? " open" : ""}" aria-hidden="true"></i>${iconMarkup(mon, open)}`
    + `<span class="pv-who">${gt(nameOf(mon), "pv-slot")}<span class="pv-lv">${lv}${gender(g)}</span></span>${hp}</button>`;
}

function genderFor(mon: PartyMon, data: PartyData): "m" | "f" | null {
  const ratio = mon.species_id == null ? undefined : data.species.get(mon.species_id)?.gender;
  return ratio === undefined ? null : genderOf(mon.personality, ratio);
}

const kv = (key: string, value: string): string => `<div class="pv-kv"><span class="k">${gt(key, "pv-white", "n")}</span><span class="v">${value}</span></div>`;
const ribbon = (i: PartyTab, tab: PartyTab): string =>
  `<button type="button" class="pv-rib t-${THEMES[i]}${i === tab ? " on" : ""}" role="tab" data-pv-tab="${String(i)}" aria-selected="${String(i === tab)}">${gt(PARTY_TABS[i], "pv-white")}</button>`;
const typeIcon = (type: number, data: PartyData): string => `<i class="pv-type" role="img" data-type="${esc(data.types[type] ?? "")}" aria-label="${esc((data.types[type] ?? "").toUpperCase())}" style="--row:${String(type)}"></i>`;

function profile(mon: PartyMon, data: PartyData, trainer: string | null): string {
  const species = mon.species_id == null ? undefined : data.species.get(mon.species_id);
  const ability = abilityOf(mon, data), nature = natureOf(mon.personality, data);
  const types = species === undefined ? [] : species.types[0] === species.types[1] ? [species.types[0]] : [...species.types];
  const ot = mon.ot_name ?? null;
  return kv("OT/", `${ot === null ? "" : gt(ot, mon.ot_gender === "female" ? "pv-ot-f" : "pv-ot", "n")}<span class="sp"></span>${mon.ot_id == null ? "" : gt(`${ID}${NO}${pad(mon.ot_id & 0xffff, 5, "0")}`, "pv-dark", "n")}`)
    + kv("TYPE/", types.map((t) => typeIcon(t, data)).join(""))
    + (ability === null ? "" : `<div class="pv-band">${gt(ability.name, "pv-white", "n")}</div><div class="pv-rowv">${gt(ability.description, "pv-dark", "n")}</div>`)
    + (nature === null ? "" : `<div class="pv-rowv pv-memo">${trainerMemo(mon, nature, trainer).map((line) => `<span>${line.map(([text, red]) => gt(text, red ? "pv-red" : "pv-dark", "n")).join("")}</span>`).join("")}</div>`);
}

const stat = (value: number | null | undefined): string => (value == null ? "---" : String(value));
const hpText = (mon: PartyMon): string => (mon.hp == null || mon.max_hp == null ? "---" : `${String(mon.hp)}/${String(mon.max_hp)}`);

function stats(mon: PartyMon, data: PartyData): string {
  const species = mon.species_id == null ? undefined : data.species.get(mon.species_id);
  const exp = species === undefined || mon.level == null ? null : expProgress(mon.experience, mon.level, species.growth, data);
  const cell = (k: string, v: string): string => `<span class="k">${gt(k, "pv-white", "n")}</span><span class="v">${gt(v, "pv-dark", "n")}</span>`;
  const status = statusOf(mon);
  return `<div class="pv-pair">${kv("ITEM", gt(mon.held_item_name ?? (mon.held_item === 0 ? "NONE" : "---"), "pv-dark", "n"))}${kv("RIBBON", gt("---", "pv-dark", "n"))}</div>`
    + `<div class="pv-stats">${cell("HP", hpText(mon))}${cell("SP. ATK", stat(mon.sp_attack))}${cell("ATTACK", stat(mon.attack))}${cell("SP. DEF", stat(mon.sp_defense))}${cell("DEFENSE", stat(mon.defense))}${cell("SPEED", stat(mon.speed))}</div>`
    + kv("EXP. POINTS", gt(mon.experience == null ? "---" : String(mon.experience), "pv-dark", "n"))
    + kv("NEXT LV.", gt(exp === null ? "---" : String(exp.next), "pv-dark", "n"))
    + (exp === null ? "" : `<div class="pv-expw">${expMarkup(exp.ticks)}</div>`)
    + (status === null ? "" : kv("STATUS", statusMarkup(status)));
}

function expMarkup(ticks: number): string {
  const shown = 16 + ticks;
  return `<span class="pv-exp" role="img" aria-label="EXP bar ${String(ticks)} of 64"><i class="full" style="width:${((shown / 84) * 100).toFixed(3)}%;--whole:${((84 / shown) * 100).toFixed(3)}%"></i></span>`;
}

function moves(mon: PartyMon, data: PartyData, open: number | null): string {
  return `<div class="pv-moves">${(mon.moves ?? []).map((m, i) => {
    if (m.move_id === 0) return "";
    // CalculatePPWithBonus from the move table when the run did not record the maximum.
    const info = data.moves.get(m.move_id), max = m.max_pp ?? (info === undefined ? null : info.pp + Math.floor((info.pp * m.pp_bonus) / 5));
    const state = max === null ? null : ppState(m.pp, max), isOpen = open === i;
    const row = `<button type="button" class="pv-mv${isOpen ? " on" : ""}" data-pv-move="${String(i)}" data-pp="${state === null ? "unknown" : String(state)}" aria-expanded="${String(isOpen)}">${info === undefined ? sprite("pv-type none") : typeIcon(info.type, data)}<span class="mn">${gt(m.name ?? `MOVE ${String(m.move_id)}`, "pv-white", "n")}</span><span class="pp">${gt(`${PP}${pad(m.pp, 2)}/${max === null ? "--" : pad(max, 2)}`, state === null ? "pv-dark" : `pv-pp${String(state)}`, "n")}</span></button>`;
    if (!isOpen || info === undefined) return row;
    return row + `<div class="pv-mdet">${kv("POWER", gt(info.power < 2 ? "---" : String(info.power), "pv-dark", "n"))}${kv("ACCURACY", gt(info.accuracy === 0 ? "---" : String(info.accuracy), "pv-dark", "n"))}<div class="pv-rowv pv-desc">${info.description.split("\n").map((line) => `<span>${gt(line, "pv-dark", "n")}</span>`).join("")}</div></div>`;
  }).join("")}</div>`;
}

function portrait(mon: PartyMon, data: PartyData): string {
  const dex = mon.species_id == null ? undefined : data.species.get(mon.species_id)?.dex;
  const species = mon.species ?? UNKNOWN;
  const growth = mon.species_id == null ? undefined : data.species.get(mon.species_id)?.growth;
  const exp = growth === undefined || mon.level == null ? null : expProgress(mon.experience, mon.level, growth, data);
  return `<div class="pv-card"><div class="pv-pic">${dex !== undefined && dex >= 1 && dex <= DEX_HOENN ? `<span class="pv-dex">${gt(`${NO}${pad(dex, 3, "0")}`, "pv-white", "n")}</span>` : ""}${sprite("pv-marks")}${mon.species_id == null ? "" : sprite("pv-front", `background-image:url(${ART}/front/${String(mon.species_id)}.png)`)}</div>`
    + `<div class="pv-name">${gt(nameOf(mon), "pv-white", "n")}${gt(`/${species}`, "pv-white", "n")}<span class="pv-prow">${mon.ball != null && mon.ball >= 1 && mon.ball <= 12 ? `<i class="pv-pball" role="img" aria-label="${esc(mon.ball_name ?? "BALL")}" style="--row:${String(mon.ball - 1)}"></i>` : ""}${mon.level == null ? "" : gt(`${LV}${String(mon.level)}`, "pv-white", "n")}${gender(genderFor(mon, data))}</span></div>`
    + `<div class="pv-bars">${mon.hp == null || mon.max_hp == null ? "" : hpMarkup(mon.hp, mon.max_hp)}<span class="pv-hpn">${gt(hpText(mon), "pv-white")}</span>${exp === null ? "" : expMarkup(exp.ticks)}</div></div>`;
}

function summary(mon: PartyMon, data: PartyData, ui: PartyUi, trainer: string | null): string {
  if (mon.is_egg === true) return "";
  const body = ui.tab === 0 ? profile(mon, data, trainer) : ui.tab === 1 ? stats(mon, data) : moves(mon, data, ui.move);
  return `<div class="pv-openb">${portrait(mon, data)}<section class="pv-sec t-${THEMES[ui.tab]}"><div class="pv-ribs" role="tablist">${([0, 1, 2] as const).map((i) => ribbon(i, ui.tab)).join("")}</div><div class="pv-body" role="tabpanel">${body}</div></section></div>`;
}

const NO_PARTY_DATA: PartyData = { types: [], species: new Map(), moves: new Map(), abilities: new Map(), natures: [], experience: [] };

export function partyPage(party: readonly PartyMon[], tables: PartyData | null, ui: PartyUi, trainer: string | null = null): string {
  const data = tables ?? NO_PARTY_DATA;
  const slot = Math.min(Math.max(0, ui.slot), party.length - 1);
  const opened = party[slot];
  const move = opened !== undefined && ui.move !== null && (opened.moves ?? [])[ui.move] !== undefined ? ui.move : null;
  let rows = "";
  for (let i = 0; i < 6; i++) {
    const mon = party[i];
    if (mon === undefined) { rows += '<div class="pv-box pv-empty" aria-hidden="true"></div>'; continue; }
    if (i !== slot) { rows += slotMarkup(mon, data, i, false); continue; }
    const faint = mon.is_egg !== true && statusOf(mon) === "FNT" ? " faint" : "";
    rows += `<div class="pv-box pv-open sel${faint}">${slotMarkup(mon, data, i, true, " pv-head")}${summary(mon, data, { slot, tab: ui.tab, move }, trainer)}</div>`;
  }
  return `<div class="pv"><div class="pv-scr"><div class="pv-hdr"><span class="pv-hl">${gt("POKéMON PARTY", "pv-white", "n")}</span><span class="pv-cap"></span><span class="pv-hr"></span></div><div class="pv-list">${rows}</div></div></div>`;
}
