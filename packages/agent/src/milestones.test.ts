import { describe, expect, it } from "vitest";
import type { GameStateSnapshot } from "./game-state.js";
import { MILESTONES, StateMilestones } from "./milestones.js";

const BASE: GameStateSnapshot = {
  screen: "intro",
  started: false,
  name: null,
  location: null,
  map_id: null,
  position: null,
  facing: null,
  in_battle: false,
  party: [],
  money: null,
  badges: [],
  play_time_s: null,
};

function at(location: string | null, extra: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return location === null
    ? { ...BASE, ...extra }
    : { ...BASE, screen: "overworld", started: true, name: "MAY", location, money: 3000, play_time_s: 1, ...extra };
}

function source(states: GameStateSnapshot[]) {
  let now = 1000;
  const milestones = new StateMilestones({ read: () => Promise.resolve(states.shift() ?? BASE) }, () => (now += 1000));
  return milestones;
}

describe("StateMilestones", () => {
  it("derives each milestone once, in order, from RAM-read state only", async () => {
    const milestones = source([
      at(null),
      at(null, { screen: "naming" }),
      at("INSIDE OF TRUCK"),
      at("LITTLEROOT TOWN"),
      at("LITTLEROOT TOWN MAYS HOUSE 1F"),
      at("LITTLEROOT TOWN MAYS HOUSE 2F"),
      at("ROUTE 101", { party: [{ species: "TORCHIC", level: 5, hp: 20, max_hp: 20 }] }),
      at("RUSTBORO CITY GYM", { badges: ["STONE"] }),
      at("ROUTE 101"),
    ]);
    const names: string[][] = [];
    for (let i = 0; i < 9; i += 1) names.push((await milestones.poll()).map((m) => m.name));
    expect(names).toEqual([
      ["GAME_RUNNING"],
      [],
      ["PLAYER_NAME_SET"],
      ["INTRO_CUTSCENE_COMPLETE", "LITTLEROOT_TOWN"],
      ["PLAYER_HOUSE_ENTERED"],
      ["PLAYER_BEDROOM"],
      ["ROUTE_101", "STARTER_CHOSEN"],
      ["RUSTBORO_CITY_GYM", "STONE_BADGE"],
      [],
    ]);
  });

  it("does not count the default name at the naming screen as a set name", async () => {
    const milestones = source([at(null, { screen: "naming", name: null })]);
    expect((await milestones.poll()).map((m) => m.name)).toEqual(["GAME_RUNNING"]);
  });

  it("stamps milestones with the poll time in seconds", async () => {
    expect(await source([at(null)]).poll()).toEqual([{ name: "GAME_RUNNING", serverTimestamp: 2 }]);
  });

  it("lists the path to the first gym in order", () => {
    expect(MILESTONES.map((m) => m.name)).toEqual([
      "GAME_RUNNING",
      "PLAYER_NAME_SET",
      "INTRO_CUTSCENE_COMPLETE",
      "LITTLEROOT_TOWN",
      "PLAYER_HOUSE_ENTERED",
      "PLAYER_BEDROOM",
      "CLOCK_SET",
      "ROUTE_101",
      "STARTER_CHOSEN",
      "OLDALE_TOWN",
      "ROUTE_103",
      "ROUTE_102",
      "PETALBURG_CITY",
      "ROUTE_104",
      "PETALBURG_WOODS",
      "RUSTBORO_CITY",
      "RUSTBORO_CITY_GYM",
      "STONE_BADGE",
    ]);
  });
});

it("counts a confirmed clock from the existing intro script variable, once", async () => {
  const trigger = (variable: number, current_value: number | null) => ({ x: 1, y: 1, elevation: 0, variable, required_value: 5, current_value, condition_met: false, script_pointer: 0x08000000 });
  const states = [at("LITTLEROOT TOWN MAYS HOUSE 2F"), ...[5, 6, 7].map((value) => at("LITTLEROOT TOWN MAYS HOUSE 2F", { world_context: { objects: [], triggers: [trigger(0x4092, value)], dialogue: null } }))];
  expect((await source([at("LITTLEROOT TOWN", { world_context: { objects: [], triggers: [trigger(0x4092, 7)], dialogue: null } })]).poll()).map((m) => m.name)).toContain("CLOCK_SET");
  const tracker = source(states);
  expect((await tracker.poll()).map((m) => m.name)).not.toContain("CLOCK_SET");
  expect(await tracker.poll()).toEqual([]);
  expect((await tracker.poll()).map((m) => m.name)).toEqual(["CLOCK_SET"]);
  expect(await tracker.poll()).toEqual([]);
  for (const [variable, value, started] of [[0x4091, 6, true], [0x4092, null, true], [0x4092, 8, true], [0x4092, 6, false]] as const) {
    const s = at("LITTLEROOT TOWN", { started, world_context: { objects: [], triggers: [trigger(variable, value)], dialogue: null } });
    expect((await source([s]).poll()).map((m) => m.name)).not.toContain("CLOCK_SET");
  }
});
