import { describe, expect, it } from "vitest";
import { BASE_MS, START, must } from "../test-support/events.js";
import { BROWSER_MODULES } from "./browser-modules.js";
import { FRONTIER_MILESTONES } from "./frontier.js";
import { RunView } from "./model.js";
import { parseRaceMap, raceHeadline, raceList, raceMap, raceOf, raceRail, raceSwings, runLabel, startIndex } from "./splits-race.js";

const mark = (name: string, at: number) => ({ name, at, derived: false });
const frontier = (...rows: readonly (readonly [string, number])[]) => ({ run: "front", milestones: rows.map(([name, s]) => ({ name, offsetMs: s * 1000 })) });
const none = new Set<number>();

describe("the race against the frontier", () => {
  it("measures each stretch from the previous shared milestone and tallies it", () => {
    const race = raceOf([mark("NEW_GAME_CREATED", 10), mark("CLOCK_SET", 50), mark("OLDALE_TOWN", 60), mark("ROUTE_103", 90)], frontier(["NEW_GAME_CREATED", 12], ["CLOCK_SET", 100], ["ROUTE_103", 110]), 95, -1);
    expect(race.rows.map(r => [r.name, r.gain, r.kind])).toEqual([["NEW_GAME_CREATED", 2, "up"], ["CLOCK_SET", 48, "up"], ["OLDALE_TOWN", null, "none"], ["ROUTE_103", -30, "dn"]]);
    expect([race.faster, race.slower, race.even, race.gap]).toEqual([2, 1, 0, -20]);
    expect(race.gains.map(r => r.name)).toEqual(["CLOCK_SET", "NEW_GAME_CREATED"]);
    expect(race.losses.map(r => r.name)).toEqual(["ROUTE_103"]);
    expect(race.pace).toEqual({ gain: 20, count: 3 });
    expect(race.frontierAt?.name).toBe("NEW_GAME_CREATED");
  });

  it("calls gaps under a second even", () => {
    expect(raceOf([mark("CLOCK_SET", 10)], frontier(["CLOCK_SET", 10.4]), 11, -1).rows[0]?.kind).toBe("ev");
  });

  it("keeps a milestone the runs did in another order out of the stretches and swings", () => {
    const race = raceOf([mark("A", 10), mark("B", 20), mark("C", 30), mark("D", 40)], frontier(["A", 10], ["B", 100], ["C", 30], ["D", 120]), 50, -1);
    expect(race.rows.filter(r => r.kind === "order").length).toBe(1);
    expect(race.rows.at(-1)?.gain).toBe(0);
    expect([...race.gains, ...race.losses].some(r => r.kind === "order")).toBe(false);
  });

  it("groups milestones under the badge being chased, whatever their order", () => {
    const race = raceOf([mark("ROUTE_101", 1), mark("STONE_BADGE", 2), mark("ROUTE_104", 3), mark("DYNAMO_BADGE", 4), mark("ROUTE_111", 5)], null, 6, -1);
    expect(race.legs.map(l => [l.badge, l.rows.length, l.current])).toEqual([["STONE", 2, false], ["KNUCKLE", 1, false], ["DYNAMO", 1, false], ["HEAT", 1, true], ["BALANCE", 0, false], ["FEATHER", 0, false], ["MIND", 0, false], ["RAIN", 0, false]]);
    expect(race.gap).toBeNull();
    expect(race.pace).toBeNull();
  });

  it("starts a checkpoint run at the badge after its save", () => {
    const stone = FRONTIER_MILESTONES.findIndex(m => m.id === "STONE_BADGE");
    expect(raceOf([], null, 1, stone).legs.find(l => l.current)?.badge).toBe("KNUCKLE");
  });

  it("names what is left to pass the frontier", () => {
    const race = raceOf([mark("NEW_GAME_CREATED", 1)], frontier(["NEW_GAME_CREATED", 2], [must(FRONTIER_MILESTONES[1]).id, 3], ["FIRST_POKEMON_CAUGHT", 4]), 5, -1);
    expect(race.toPass).toEqual([must(FRONTIER_MILESTONES[1]).label]);
    expect(race.frontierEnd?.name).toBe("FIRST_POKEMON_CAUGHT");
  });
});

describe("where a save starts", () => {
  const view = (path: string | null): RunView => Object.assign(new RunView(), { start: path === null ? START : { ...START, start_state: { kind: "save_state", path, sha1: "a".repeat(40) } }, startMs: BASE_MS });
  it("reads boot, main menu and known checkpoints, and knows nothing of other saves", () => {
    expect(startIndex(view(null))).toBe(-1);
    expect(startIndex(view("x/MAIN_MENU.state"))).toBe(-1);
    expect(startIndex(view("x/PLAYER_NAME_CONFIRMED.state"))).toBe(1);
    expect(startIndex(view("custom.state"))).toBeNull();
  });
});

describe("the page pieces", () => {
  const race = raceOf([mark("NEW_GAME_CREATED", 10), mark("STONE_BADGE", 100), mark("ROUTE_104", 110)], frontier(["NEW_GAME_CREATED", 20], ["STONE_BADGE", 300], ["ROUTE_104", 200]), 120, -1);
  it("leads with the race in the frontier's name", () => {
    const html = raceHeadline(race, "…5f0f", 120);
    expect(html).toContain("…5f0f is 0:03:20 ahead of the FRONTIER!");
    expect(html).toContain("At 0:02:00 the FRONTIER had reached");
    expect(html).toContain("2 FASTER");
    expect(html).not.toMatch(/ghost/i);
    expect(raceHeadline(raceOf([mark("A", 30)], frontier(["A", 10]), 40, -1), "r", 40)).toContain("r is 0:00:20 behind the FRONTIER!");
    expect(raceHeadline(raceOf([mark("A", 10)], frontier(["A", 10]), 40, -1), "r", 40)).toContain("r is level with the FRONTIER!");
    expect(raceHeadline(raceOf([mark("A", 10)], frontier(["B", 10]), 5, -1), "r", 5)).toContain("No shared milestones");
    expect(raceHeadline(raceOf([mark("A", 10)], null, 40, -1), "r", 40)).toContain("no frontier run");
    expect(raceHeadline(raceOf([mark("A", 10)], frontier(["A", 12]), 40, -1), "r", 40)).toContain("past the FRONTIER's last milestone");
  });
  it("folds past badges unless told otherwise, and filters to faster or slower", () => {
    const shut = raceList(race, "all", none);
    expect(shut).toContain('aria-expanded="false"');
    expect(shut).not.toContain("New game</span>");
    const open = raceList(race, "all", new Set([0]));
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("New game");
    const slower = raceList(race, "dn", none);
    expect(slower).toContain("No slower milestones");
    expect(raceList(race, "up", none)).toContain("New game");
  });
  it("shows every badge on the rail and marks what is not reached", () => {
    const html = raceRail(race);
    expect(html).toContain('data-race-jump="0"');
    expect(html).toContain("???");
    expect(html.match(/class="race-badge"/g)?.length).toBe(8);
  });
  it("lists the biggest swings, or says there are none", () => {
    expect(raceSwings(race.gains, "BIGGEST GAINS")).toContain("BIGGEST GAINS");
    expect(raceSwings([], "BIGGEST LOSSES")).toContain("None yet");
  });
  it("is served to the browser", () => { expect(BROWSER_MODULES).toContain("splits-race"); });
  it("gives runs a short label", () => { expect(runLabel("2026_x_5f0f")).toBe("…5f0f"); expect(runLabel("abc")).toBe("abc"); });
});

describe("the map", () => {
  const map = must(parseRaceMap({ map: [{ name: "FORTREE CITY", x: 12, y: 0, width: 1, height: 1 }, { name: "ROUTE 119", x: 11, y: 0, width: 1, height: 6 }, { name: "MT. CHIMNEY", x: 6, y: 2, width: 1, height: 1 }, { name: "", x: 0, y: 0, width: 0, height: 0 }] }));
  it("rejects a data file without a map", () => { expect(parseRaceMap({})).toBeNull(); expect(parseRaceMap({ map: [{ name: 1 }] })).toBeNull(); expect(parseRaceMap(null)).toBeNull(); });
  it("places this run from its location and the frontier from its last named milestone", () => {
    const race = raceOf([], frontier(["ROUTE_119", 10], ["MT_CHIMNEY_MAXIE_DEFEATED", 20], ["WINONA", 30], ["FORTREE_CITY", 99]), 40, -1);
    const html = raceMap(map, "FORTREE CITY GYM", race, "…5f0f");
    expect(html).toContain("left:");
    expect(html).toContain("…5f0f");
    expect(html).toContain("FRONTIER");
    expect(html).toContain("/sprites/page/map-run.png");
  });
  it("leaves off a run it cannot place", () => {
    expect(raceMap(map, null, raceOf([], null, 1, -1), "r")).not.toContain("map-run.png");
    expect(raceMap(null, null, raceOf([], null, 1, -1), "r")).toContain("just trainer-page-art");
  });
});
