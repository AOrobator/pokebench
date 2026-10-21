// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  abilityOf,
  expProgress,
  genderOf,
  hpBar,
  natureOf,
  parsePartyData,
  partyPage,
  ppState,
  statusOf,
  trainerMemo,
  type PartyData,
  type PartyMon,
} from "./party-view.js";

const MEDIUM_FAST = Array.from({ length: 101 }, (_, n) => (n <= 1 ? n : n ** 3));
const MEDIUM_SLOW = Array.from({ length: 101 }, (_, n) => (n <= 1 ? n : Math.floor((6 * n ** 3) / 5) - 15 * n * n + 100 * n - 140));
const NATURES = "HARDY LONELY BRAVE ADAMANT NAUGHTY BOLD DOCILE RELAXED IMPISH LAX TIMID HASTY SERIOUS JOLLY NAIVE MODEST MILD QUIET BASHFUL RASH CALM GENTLE SASSY CAREFUL QUIRKY".split(" ");
const TYPES = "normal fight flying poison ground rock bug ghost steel mystery fire water grass electric psychic ice dragon dark".split(" ");

const RAW = {
  version: 1,
  types: TYPES,
  species: {
    "281": { types: [10, 1], gender: 31, growth: 3, abilities: [66, 0], dex: 5 },
    "288": { types: [0, 0], gender: 127, growth: 0, abilities: [53, 0], dex: 12 },
    "25": { types: [13, 13], gender: 127, growth: 0, abilities: [9, 0], dex: 156 },
    "300": { types: [0, 0], gender: 191, growth: 0, abilities: [56, 31], dex: 205 },
    "100": { types: [13, 13], gender: 255, growth: 0, abilities: [43, 9], dex: 84 },
  },
  moves: {
    "10": { type: 0, power: 40, accuracy: 100, pp: 35, description: "Scratches the foe with\nsharp claws." },
    "45": { type: 0, power: 0, accuracy: 100, pp: 40, description: "Growls cutely to reduce the\nfoe's ATTACK." },
    "116": { type: 0, power: 0, accuracy: 0, pp: 30, description: "Focuses power to raise the\ncritical-hit ratio." },
    "52": { type: 10, power: 40, accuracy: 100, pp: 25, description: "A weak fire attack that may\ninflict a burn." },
  },
  abilities: { "66": { name: "BLAZE", description: "Ups FIRE moves in a pinch." }, "53": { name: "PICKUP", description: "May pick up items." }, "56": { name: "CUTE CHARM", description: "Infatuates on contact." }, "31": { name: "LIGHTNINGROD", description: "Draws electrical moves." } },
  natures: NATURES,
  experience: [MEDIUM_FAST, [], [], MEDIUM_SLOW, [], []],
};
const DATA = parsePartyData(RAW) as PartyData;

const COMBUSKEN: PartyMon = {
  species: "COMBUSKEN", nickname: "COMBUSKEN", level: 16, hp: 7, max_hp: 50, species_id: 281, personality: 1517418261, ot_id: 49759423,
  is_egg: false, status: 0, held_item: 0, held_item_name: null, experience: 2858,
  attack: 41, defense: 30, speed: 35, sp_attack: 48, sp_defense: 33, ability_num: 0, ability_id: 66,
  met_location: 16, met_location_name: "ROUTE 101", met_level: 5, met_game: 3, ball: 4, ball_name: "POKé BALL", ot_name: "GREEN", ot_gender: "male",
  moves: [
    { move_id: 10, name: "SCRATCH", pp: 34, max_pp: 35, pp_bonus: 0 },
    { move_id: 45, name: "GROWL", pp: 40, max_pp: 40, pp_bonus: 0 },
    { move_id: 116, name: "FOCUS ENERGY", pp: 0, max_pp: 30, pp_bonus: 0 },
    { move_id: 52, name: "EMBER", pp: 23, max_pp: 25, pp_bonus: 0 },
  ],
};
const ZIGZAGOON: PartyMon = { species: "ZIGZAGOON", nickname: "ZIG<b>", level: 7, hp: 14, max_hp: 25, species_id: 288, personality: 200, ot_id: 1, status: 8, experience: 399, moves: [] };
const FAINTED: PartyMon = { ...ZIGZAGOON, nickname: "DOWN", hp: 0, status: 0 };

function dom(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("parsePartyData", () => {
  it("accepts the built tables", () => {
    expect(DATA).not.toBeNull();
    expect(DATA.species.get(281)?.dex).toBe(5);
    expect(DATA.moves.get(52)?.power).toBe(40);
    expect(DATA.abilities.get(66)?.name).toBe("BLAZE");
  });
  it("accepts ABILITY_NONE's row 0, as the built data.json carries it", () => {
    expect(parsePartyData({ ...RAW, abilities: { ...RAW.abilities, "0": { name: "-------", description: "No special ability." } } })?.abilities.get(0)?.name).toBe("-------");
    expect(parsePartyData({ ...RAW, abilities: { "01": { name: "x", description: "" } } })).toBeNull();
  });
  it("rejects malformed tables", () => {
    expect(parsePartyData(null)).toBeNull();
    expect(parsePartyData({ ...RAW, version: 2 })).toBeNull();
    expect(parsePartyData({ ...RAW, natures: NATURES.slice(1) })).toBeNull();
    expect(parsePartyData({ ...RAW, types: ["normal"] })).toBeNull();
    expect(parsePartyData({ ...RAW, species: { "1": { types: [0], gender: 0, growth: 0, abilities: [0, 0], dex: 1 } } })).toBeNull();
    expect(parsePartyData({ ...RAW, species: { x: RAW.species["281"] } })).toBeNull();
    expect(parsePartyData({ ...RAW, moves: { "1": { type: 0, power: "40", accuracy: 100, pp: 35, description: "" } } })).toBeNull();
    expect(parsePartyData({ ...RAW, abilities: { "1": { name: 3, description: "" } } })).toBeNull();
    expect(parsePartyData({ ...RAW, experience: [MEDIUM_FAST] })).toBeNull();
    expect(parsePartyData({ ...RAW, experience: [MEDIUM_FAST, [], [], ["x"], [], []] })).toBeNull();
  });
});

describe("derived values follow the game", () => {
  it("genders by the species ratio", () => {
    expect(genderOf(1517418261, 31)).toBe("f");
    expect(genderOf(111, 31)).toBe("m");
    expect(genderOf(5, 0)).toBe("m");
    expect(genderOf(5, 254)).toBe("f");
    expect(genderOf(5, 255)).toBeNull();
    expect(genderOf(null, 127)).toBeNull();
  });
  it("names the nature from the personality value", () => {
    expect(natureOf(1517418261, DATA)).toBe("HASTY");
    expect(natureOf(null, DATA)).toBeNull();
  });
  it("draws the 64-pixel EXP bar like DrawExperienceProgressBar", () => {
    expect(expProgress(2858, 16, 3, DATA)).toEqual({ ticks: 35, next: 262 });
    expect(expProgress(2535, 16, 3, DATA)).toEqual({ ticks: 0, next: 585 });
    expect(expProgress(2536, 16, 3, DATA)).toEqual({ ticks: 1, next: 584 });
    expect(expProgress(1_000_000, 100, 0, DATA)).toEqual({ ticks: 0, next: 0 });
    expect(expProgress(null, 16, 3, DATA)).toBeNull();
    expect(expProgress(10, 16, 1, DATA)).toBeNull();
  });
  it("decodes the status word, fainted first", () => {
    expect(statusOf({ hp: 7, status: 0 })).toBeNull();
    expect(statusOf({ hp: 7, status: 3 })).toBe("SLP");
    expect(statusOf({ hp: 7, status: 8 })).toBe("PSN");
    expect(statusOf({ hp: 7, status: 0x10 })).toBe("BRN");
    expect(statusOf({ hp: 7, status: 0x20 })).toBe("FRZ");
    expect(statusOf({ hp: 7, status: 0x40 })).toBe("PAR");
    expect(statusOf({ hp: 7, status: 0x80 })).toBe("PSN");
    expect(statusOf({ hp: 0, status: 8 })).toBe("FNT");
    expect(statusOf({ hp: null, status: null })).toBeNull();
  });
  it("sizes and colors the HP bar on the game's 48-pixel scale", () => {
    expect(hpBar(7, 50)).toEqual({ px: 6, level: "r" });
    expect(hpBar(23, 47)).toEqual({ px: 23, level: "y" });
    expect(hpBar(25, 48)).toEqual({ px: 25, level: "g" });
    expect(hpBar(49, 49)).toEqual({ px: 48, level: "g" });
    expect(hpBar(1, 300)).toEqual({ px: 1, level: "r" });
    expect(hpBar(0, 20)).toEqual({ px: 0, level: "r" });
    expect(hpBar(null, 20)).toEqual({ px: 0, level: "r" });
  });
  it("colors PP like GetCurrentPPToMaxPPState", () => {
    expect(ppState(35, 35)).toBe(3);
    expect(ppState(0, 30)).toBe(2);
    expect(ppState(7, 30)).toBe(1);
    expect(ppState(14, 30)).toBe(0);
    expect(ppState(16, 30)).toBe(3);
    expect(ppState(1, 5)).toBe(1);
    expect(ppState(3, 5)).toBe(3);
    expect(ppState(0, 2)).toBe(2);
    expect(ppState(2, 2)).toBe(3);
  });
  it("shows the recorded ability, else only a species' single ability", () => {
    expect(abilityOf({ species_id: 300, ability_id: 31 }, DATA)?.name).toBe("LIGHTNINGROD");
    expect(abilityOf({ species_id: 300, ability_id: 200 }, DATA)).toBeNull();
    expect(abilityOf({ species_id: 281 }, DATA)?.name).toBe("BLAZE");
    expect(abilityOf({ species_id: 300 }, DATA)).toBeNull();
    expect(abilityOf({ species_id: 999 }, DATA)).toBeNull();
    expect(abilityOf({ species_id: null }, DATA)).toBeNull();
  });
  it("writes the trainer memo the way BufferMonTrainerMemo picks it", () => {
    const flat = (lines: ReturnType<typeof trainerMemo>): string[] => lines.map((l) => l.map(([t]) => t).join("").replace(/\ue001/g, "Lv"));
    expect(flat(trainerMemo(COMBUSKEN, "HASTY", "GREEN"))).toEqual(["HASTY nature,", "met at Lv5,", "ROUTE 101."]);
    expect(trainerMemo(COMBUSKEN, "HASTY", "GREEN")[0]?.[0]).toEqual(["HASTY", true]);
    expect(flat(trainerMemo({ ...COMBUSKEN, met_level: 0 }, "HASTY", "GREEN"))).toEqual(["HASTY nature,", "hatched at Lv5,", "ROUTE 101."]);
    expect(flat(trainerMemo({ ...COMBUSKEN, met_location: 213 }, "HASTY", "GREEN"))).toEqual(["HASTY nature,", "met somewhere at Lv5."]);
    expect(flat(trainerMemo(COMBUSKEN, "HASTY", "MAY"))).toEqual(["HASTY nature,", "probably met at Lv5,", "ROUTE 101."]);
    expect(flat(trainerMemo({ ...COMBUSKEN, met_location: 255 }, "HASTY", "MAY"))).toEqual(["HASTY nature,", "obtained in a fateful", "encounter at Lv5."]);
    expect(flat(trainerMemo({ ...COMBUSKEN, met_location: 254 }, "HASTY", "MAY"))).toEqual(["HASTY nature,", "obtained in a trade."]);
    expect(flat(trainerMemo({ ...COMBUSKEN, met_game: 15 }, "HASTY", "MAY"))).toEqual(["HASTY nature,", "obtained in a trade."]);
    expect(flat(trainerMemo({ ...COMBUSKEN, met_location: null }, "HASTY", "GREEN"))).toEqual(["HASTY nature."]);
  });
});

describe("partyPage", () => {
  const party = [COMBUSKEN, ZIGZAGOON, FAINTED];
  it("lists every slot with the cursor palette on the chosen one and empty frames after", () => {
    const doc = dom(partyPage(party, DATA, { slot: 1, tab: 0, move: null }));
    const slots = [...doc.querySelectorAll("[data-pv-slot]")];
    expect(slots.map((s) => s.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
    expect(doc.querySelectorAll(".pv-empty")).toHaveLength(3);
    expect(slots[2]?.className).toContain("faint");
    expect(doc.querySelector(".pv-open")?.className).toContain("sel");
    expect(doc.querySelector("b")).toBeNull();
    expect(doc.body.textContent).toContain("ZIG<b>");
  });
  it("shows the profile: OT, ID, types, ability and the trainer memo", () => {
    const doc = dom(partyPage(party, DATA, { slot: 0, tab: 0, move: null }, "GREEN"));
    const text = doc.querySelector(".pv-open")?.textContent ?? "";
    expect(text).toContain("GREEN");
    expect(text).toContain("17599");
    expect(text).toContain("BLAZE");
    expect(text).toContain("HASTY");
    expect(text).toContain("met at Lv5,");
    expect(text).toContain("ROUTE 101.");
    expect(doc.querySelector(".pv-pball")?.getAttribute("aria-label")).toBe("POKé BALL");
    expect([...doc.querySelectorAll(".pv-open .pv-type")].map((t) => t.getAttribute("data-type"))).toEqual(["fire", "fight"]);
    expect(doc.querySelector('[data-pv-tab="0"]')?.getAttribute("aria-selected")).toBe("true");
  });
  it("shows the recorded stats, ribbons as ---, and the EXP bar", () => {
    const doc = dom(partyPage(party, DATA, { slot: 0, tab: 1, move: null }));
    const text = doc.querySelector(".pv-open")?.textContent ?? "";
    expect(text).toContain("7/50");
    for (const v of ["41", "30", "35", "48", "33"]) expect(text).toContain(v);
    expect(text.match(/---/g)).toHaveLength(1);
    const old = dom(partyPage([{ ...COMBUSKEN, attack: null, defense: null, speed: null, sp_attack: null, sp_defense: null }], DATA, { slot: 0, tab: 1, move: null }));
    expect(old.querySelector(".pv-open")?.textContent.match(/---/g)).toHaveLength(6);
    expect(text).toContain("2858");
    expect(text).toContain("262");
    expect(doc.querySelector(".pv-exp")?.getAttribute("aria-label")).toBe("EXP bar 35 of 64");
  });
  it("lists moves with PP colors and opens one for its details", () => {
    const closed = dom(partyPage(party, DATA, { slot: 0, tab: 2, move: null }));
    expect([...closed.querySelectorAll("[data-pv-move]")].map((m) => m.getAttribute("data-pp"))).toEqual(["3", "3", "2", "3"]);
    expect(closed.querySelector(".pv-mdet")).toBeNull();
    const open = dom(partyPage(party, DATA, { slot: 0, tab: 2, move: 2 }));
    const det = open.querySelector(".pv-mdet")?.textContent ?? "";
    expect(det).toContain("POWER");
    expect(det).toContain("---");
    expect(det).toContain("critical-hit ratio.");
    expect(open.querySelector('[data-pv-move="2"]')?.getAttribute("aria-expanded")).toBe("true");
  });
  it("hides the dex number outside the Hoenn dex and copes with missing data", () => {
    const skitty: PartyMon = { species: "SKITTY", nickname: "SKITTY", level: 5, hp: 20, max_hp: 20, species_id: 300 };
    const doc = dom(partyPage([skitty], DATA, { slot: 0, tab: 0, move: null }));
    expect(doc.querySelector(".pv-dex")).toBeNull();
    expect(doc.querySelector(".pv-open")?.textContent).not.toContain("nature");
    const odd: PartyMon = { species: null, level: 3, hp: 3, max_hp: 9 };
    const doc2 = dom(partyPage([odd], DATA, { slot: 0, tab: 2, move: null }));
    expect(doc2.body.textContent).toContain("Unknown Pokémon · harness bug");
    expect(doc2.querySelectorAll("[data-pv-move]")).toHaveLength(0);
  });
  it("shows eggs without HP or a summary", () => {
    const egg: PartyMon = { species: "EGG", nickname: "EGG", level: 5, hp: 0, max_hp: 10, species_id: 288, is_egg: true };
    const doc = dom(partyPage([egg], DATA, { slot: 0, tab: 0, move: null }));
    expect(doc.querySelector(".hpbar")).toBeNull();
    expect(doc.querySelector(".pv-sec")).toBeNull();
  });
  it("clamps a stale cursor to the party", () => {
    const doc = dom(partyPage([COMBUSKEN], DATA, { slot: 4, tab: 2, move: 3 }));
    expect(doc.querySelector('[data-pv-slot="0"]')?.getAttribute("aria-expanded")).toBe("true");
  });
  it("renders sparse or odd records without inventing values", () => {
    const sparse: PartyMon = { species: "MYSTERY", nickname: null, level: null, hp: null, max_hp: null, species_id: 999, personality: 3, experience: null, ot_name: "MAY", ot_gender: "female", ball: 9, ball_name: null,
      moves: [{ move_id: 999, name: null, pp: 5, pp_bonus: 0 }, { move_id: 52, name: "EMBER", pp: 25, max_pp: null, pp_bonus: 3 }] };
    for (const tab of [0, 1, 2] as const) {
      const doc = dom(partyPage([sparse], DATA, { slot: 0, tab, move: 1 }, "GREEN"));
      const text = doc.querySelector(".pv-open")?.textContent ?? "";
      if (tab === 0) { expect(text).toContain("MAY"); expect(doc.querySelectorAll(".pv-open .pv-type")).toHaveLength(0); expect(doc.querySelector(".pv-pball")?.getAttribute("aria-label")).toBe("BALL"); }
      if (tab === 1) { expect(text).toContain("0/0"); expect(doc.querySelector(".pv-exp")).toBeNull(); }
      if (tab === 2) {
        expect(text).toContain("MOVE 999");
        expect([...doc.querySelectorAll("[data-pv-move]")].map((m) => m.getAttribute("data-pp"))).toEqual(["3", "3"]);
        expect(text).toContain("/40");
      }
    }
    const poisoned = dom(partyPage([{ ...COMBUSKEN, status: 8 }, { ...ZIGZAGOON, is_egg: true }], DATA, { slot: 0, tab: 1, move: null }));
    expect(poisoned.querySelector('.pv-open [aria-label="PSN"]')).not.toBeNull();
    expect(poisoned.querySelector('[data-pv-slot="1"] .hpbar')).toBeNull();
    const fainted = dom(partyPage([FAINTED], DATA, { slot: 0, tab: 0, move: null }));
    expect(fainted.querySelector(".pv-open")?.className).toContain("faint");
    expect(dom(partyPage([{ ...COMBUSKEN, moves: null }], DATA, { slot: 0, tab: 2, move: 0 })).querySelectorAll("[data-pv-move]")).toHaveLength(0);
  });
  it("says so when the party is empty", () => {
    expect(partyPage([], DATA, { slot: 0, tab: 0, move: null })).toContain("no Pokémon yet");
  });
});
