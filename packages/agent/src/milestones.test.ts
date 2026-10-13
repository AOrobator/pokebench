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
      ["FIRST_TRUCK_EXIT", "INTRO_CUTSCENE_COMPLETE", "LITTLEROOT_TOWN"],
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
    expect(await source([at(null)]).poll()).toEqual([{ name: "GAME_RUNNING", serverTimestamp: 2, kind: "legacy", origin: "observed" }]);
  });

  it("lists the path to the first gym in order", () => {
    expect(MILESTONES.map((m) => m.name)).toEqual([
      "GAME_RUNNING",
      "NEW_GAME_CREATED",
      "PLAYER_NAME_CONFIRMED",
      "PLAYER_NAME_SET",
      "FIRST_TRUCK_EXIT",
      "INTRO_CUTSCENE_COMPLETE",
      "LITTLEROOT_TOWN",
      "PLAYER_HOUSE_ENTERED",
      "MOM_CLOCK_INSTRUCTION",
      "PLAYER_BEDROOM",
      "CLOCK_SET",
      "MOM_RIVAL_INSTRUCTION",
      "RIVAL_MET",
      "ROUTE_101",
      "STARTER_CHOSEN",
      "BIRCH_RESCUE_COMPLETE",
      "BIRCH_STARTER_HANDOFF_COMPLETE",
      "OLDALE_TOWN",
      "ROUTE_103",
      "RIVAL_BATTLE_WON",
      "RECEIVED_POKEDEX",
      "STARTER_TUTORIAL_COMPLETE",
      "RUNNING_SHOES_RECEIVED",
      "ROUTE_102",
      "PETALBURG_CITY",
      "DAD_FIRST_MEETING",
      "WALLY_TUTORIAL_COMPLETE",
      "ROUTE_104",
      "PETALBURG_WOODS",
      "TEAM_AQUA_WOODS_EVENT_COMPLETE",
      "RUSTBORO_CITY",
      "RUSTBORO_CITY_GYM",
      "RUSTBORO_GYM_COMPLETE",
      "STONE_BADGE",
      "ROCK_TOMB_RECEIVED",
    ]);
  });
});

it("records story completion, not nearby places or premature rescue flags", async () => {
  const states = source([
    at("LITTLEROOT TOWN MAYS HOUSE 2F"),
    at("ROUTE 101", { story: { name_confirmed:true, intro_stage:6, rival_stage:3, birch_lab_stage:0, petalburg_gym_stage:0, woods_stage:0, clock_set:true, rival_battle_won:false, pokedex_received:false, running_shoes_received:false, starter_tutorial_complete:false, rustboro_gym_complete:false, stone_badge:false, rock_tomb_received:false } }),
  ]);
  expect((await states.poll()).map((m) => m.name)).not.toContain("CLOCK_SET");
  const reached = (await states.poll()).map((m) => m.name);
  expect(reached).toContain("CLOCK_SET");
  expect(reached).toContain("RIVAL_MET");
  expect(reached).not.toContain("BIRCH_RESCUE_COMPLETE");
});

it("separates final name acceptance from gameplay start and requires a witnessed truck exit", () => {
  const tracker = source([]);
  const story = {name_confirmed:true, intro_stage:null, rival_stage:null, birch_lab_stage:null,petalburg_gym_stage:null,woods_stage:null,clock_set:null,rival_battle_won:null,pokedex_received:null,running_shoes_received:null,starter_tutorial_complete:null,rustboro_gym_complete:null,stone_badge:null,rock_tomb_received:null};
  expect(tracker.observe(at(null, {story}), 10)).toEqual([
    {name:"GAME_RUNNING",serverTimestamp:2,kind:"legacy",origin:"observed",evidence:[10]},
    {name:"PLAYER_NAME_CONFIRMED",serverTimestamp:2,kind:"story",origin:"observed",evidence:[10]},
  ]);
  expect(tracker.observe(at("INSIDE OF TRUCK"), 11).map((m) => m.name)).toEqual(["PLAYER_NAME_SET"]);
  const exit = tracker.observe(at("LITTLEROOT TOWN"), 12).find((m) => m.name === "FIRST_TRUCK_EXIT");
  expect(exit?.evidence).toEqual([11,12]);
  expect(tracker.observe(at("LITTLEROOT TOWN"), 13)).toEqual([]);
  const resumed = source([]);
  resumed.initialize("save_state");
  const existing = resumed.observe(at("LITTLEROOT TOWN", {story:{...story,clock_set:true}}), 20);
  expect(existing.map((m) => m.name)).not.toContain("FIRST_TRUCK_EXIT");
  expect(existing.find((m) => m.name === "CLOCK_SET")).toMatchObject({origin:"present_at_start",evidence:[20]});
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

it("records each verified story predicate, withholds unknown/pre-event values and deduplicates", () => {
  const story = {name_confirmed:false,intro_stage:0,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:false,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
  const cases: readonly [Partial<typeof story>, readonly string[]][] = [
    [{name_confirmed:true},["PLAYER_NAME_CONFIRMED"]],
    [{intro_stage:4},["MOM_CLOCK_INSTRUCTION"]],
    [{clock_set:true},["CLOCK_SET"]],
    [{intro_stage:7},["MOM_CLOCK_INSTRUCTION","MOM_RIVAL_INSTRUCTION"]],
    [{rival_stage:3},["RIVAL_MET"]],
    [{birch_lab_stage:2},["BIRCH_RESCUE_COMPLETE"]],
    [{birch_lab_stage:3},["BIRCH_RESCUE_COMPLETE","BIRCH_STARTER_HANDOFF_COMPLETE"]],
    [{rival_battle_won:true},["RIVAL_BATTLE_WON"]],
    [{pokedex_received:true},["RECEIVED_POKEDEX"]],
    [{starter_tutorial_complete:true},["STARTER_TUTORIAL_COMPLETE"]],
    [{running_shoes_received:true},["RUNNING_SHOES_RECEIVED"]],
    [{petalburg_gym_stage:1},["DAD_FIRST_MEETING"]],
    [{petalburg_gym_stage:2},["DAD_FIRST_MEETING","WALLY_TUTORIAL_COMPLETE"]],
    [{woods_stage:1},["TEAM_AQUA_WOODS_EVENT_COMPLETE"]],
    [{rustboro_gym_complete:true},["RUSTBORO_GYM_COMPLETE"]],
    [{rock_tomb_received:true},["ROCK_TOMB_RECEIVED"]],
  ];
  for (const [change,expected] of cases) {
    const tracker = source([]);
    tracker.observe(at("ROUTE 101",{story}),1);
    expect(tracker.observe(at("ROUTE 101",{story:{...story,...change}}),2).map((m)=>m.name)).toEqual(expected);
    expect(tracker.observe(at("ROUTE 101",{story:{...story,...change}}),3)).toEqual([]);
  }
  const modern = source([]);
  const trigger = {x:1,y:1,elevation:0,variable:0x4092,current_value:6,required_value:5,condition_met:false,script_pointer:0x08000000};
  expect(modern.observe(at("ROUTE 101",{story,world_context:{objects:[],triggers:[trigger],dialogue:null}}),1).map((m)=>m.name)).not.toContain("CLOCK_SET");
  const nonField = source([]);
  expect(nonField.observe(at(null,{story:{...story,clock_set:true,rival_battle_won:true,pokedex_received:true,running_shoes_received:true,starter_tutorial_complete:true,rustboro_gym_complete:true,rock_tomb_received:true}}),1).map((m)=>m.name)).toEqual(["GAME_RUNNING"]);
});

it("keeps unknown resumed baselines unresolved per predicate until readable", () => {
  const story = {name_confirmed:null,intro_stage:null,rival_stage:null,birch_lab_stage:null,petalburg_gym_stage:null,woods_stage:null,clock_set:null,rival_battle_won:null,pokedex_received:null,running_shoes_received:null,starter_tutorial_complete:null,rustboro_gym_complete:null,stone_badge:null,rock_tomb_received:null};
  const resume = source([]);resume.initialize("save_state");
  resume.observe(at(null,{screen:"unknown",story}),1);
  resume.observe(at("LITTLEROOT TOWN",{story}),2);
  const positive=resume.observe(at("LITTLEROOT TOWN",{story:{...story,name_confirmed:true,clock_set:true,intro_stage:6,rival_stage:3,birch_lab_stage:2}}),3);
  expect(positive.filter((m)=>m.kind==="story").map((m)=>[m.name,m.origin])).toEqual([
    ["PLAYER_NAME_CONFIRMED","present_at_start"],["MOM_CLOCK_INSTRUCTION","present_at_start"],["CLOCK_SET","present_at_start"],["RIVAL_MET","present_at_start"],["BIRCH_RESCUE_COMPLETE","present_at_start"],
  ]);
  const witnessed=source([]);witnessed.initialize("save_state");
  witnessed.observe(at(null,{screen:"unknown",story}),1);
  witnessed.observe(at("LITTLEROOT TOWN",{story:{...story,clock_set:false,intro_stage:0}}),2);
  const earned=witnessed.observe(at("LITTLEROOT TOWN",{story:{...story,clock_set:true,intro_stage:6}}),3);
  expect(earned.filter((m)=>m.kind==="story").map((m)=>[m.name,m.origin])).toEqual([["MOM_CLOCK_INSTRUCTION","observed"],["CLOCK_SET","observed"]]);
});

it("retains witnessed negatives across unknown reads and earns naming-save startup", () => {
  const tracker=new StateMilestones({read:()=>Promise.resolve(BASE)},()=>2000);tracker.initialize("save_state");
  const unknown={name_confirmed:null,intro_stage:null,rival_stage:null,birch_lab_stage:null,petalburg_gym_stage:null,woods_stage:null,clock_set:null,rival_battle_won:null,pokedex_received:null,running_shoes_received:null,starter_tutorial_complete:null,rustboro_gym_complete:null,stone_badge:null,rock_tomb_received:null};
  tracker.observe(at(null,{screen:"unknown",story:unknown}),1);
  tracker.observe(at(null,{screen:"naming",story:{...unknown,name_confirmed:false}}),2);
  tracker.observe(at(null,{screen:"unknown",story:unknown}),3);
  expect(tracker.observe(at(null,{story:{...unknown,name_confirmed:true}}),4)).toEqual([{name:"PLAYER_NAME_CONFIRMED",kind:"story",origin:"observed",serverTimestamp:2,evidence:[4]}]);
  expect(tracker.observe(at("INSIDE OF TRUCK",{story:{...unknown,name_confirmed:true}}),5)).toEqual([{name:"PLAYER_NAME_SET",kind:"legacy",origin:"observed",serverTimestamp:2,evidence:[5]}]);
  tracker.observe(at("INSIDE OF TRUCK",{story:{...unknown,clock_set:false}}),6);
  tracker.observe(at("INSIDE OF TRUCK",{story:unknown}),7);
  expect(tracker.observe(at("INSIDE OF TRUCK",{story:{...unknown,clock_set:true}}),8)).toEqual([{name:"CLOCK_SET",kind:"story",origin:"observed",serverTimestamp:2,evidence:[8]}]);
});


describe("new game creation split", () => {
  it("waits for verified Birch introduction, emits once, and cites the observation", () => {
    const tracker = new StateMilestones({ read: () => Promise.resolve(BASE) }, () => 2000);
    tracker.initialize("boot");
    for (const screen of ["intro", "title", "main_menu", "unknown", "naming"] as const) {
      expect(tracker.observe(at(null, { screen }), 1).filter(m => m.name === "NEW_GAME_CREATED")).toEqual([]);
    }
    expect(tracker.observe(at(null, { screen: "birch_speech" }), 7)).toEqual([
      { name: "NEW_GAME_CREATED", kind: "story", origin: "observed", serverTimestamp: 2, evidence: [7] },
    ]);
    expect(tracker.observe(at(null, { screen: "birch_speech" }), 8)).toEqual([]);
  });
  it("does not infer creation from a resumed overworld or nickname editor", () => {
    const tracker = new StateMilestones({ read: () => Promise.resolve(BASE) });
    tracker.initialize("save_state");
    expect(tracker.observe(at("ROUTE 101"), 1).some(m => m.name === "NEW_GAME_CREATED")).toBe(false);
    expect(tracker.observe(at(null, { screen: "naming" }), 2).some(m => m.name === "NEW_GAME_CREATED")).toBe(false);
  });
});


it("marks an intro already active in a loaded state as present rather than a timed split", () => {
  const tracker = new StateMilestones({ read: () => Promise.resolve(BASE) }, () => 2000);
  tracker.initialize("save_state");
  const result = tracker.observe(at(null, { screen: "birch_speech" }), 1);
  expect(result.filter(m => m.name === "NEW_GAME_CREATED")).toEqual([
    { name: "NEW_GAME_CREATED", kind: "story", origin: "present_at_start", serverTimestamp: 2, evidence: [1] },
  ]);
});

it("rejects transient positive save fields and accepts the stable native completion",async()=>{
 const falseFields={name_confirmed:true,clock_set:true,rival_battle_won:true,intro_stage:0,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
 const bad=at("PETALBURG CITY",{screen:"field_transition",position:{x:8,y:2},story:falseFields,party:[{species:"TORCHIC",level:5,hp:20,max_hp:20}],badges:["STONE"]});
 for(const name of ["CLOCK_SET","RIVAL_BATTLE_WON","PETALBURG_CITY","STARTER_CHOSEN","STONE_BADGE","PLAYER_NAME_CONFIRMED","PLAYER_NAME_SET"]){expect(MILESTONES.find(m=>m.name===name)?.reached(bad)).toBeNull();}
 const good={...bad,screen:"overworld",location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_id:[1,1] as [number,number],story:{...falseFields,intro_stage:6}};
 expect(MILESTONES.find(m=>m.name==="CLOCK_SET")?.reached(good)).toBe(true);
 const tracker=source([bad,good]);expect(await tracker.poll()).not.toContainEqual(expect.objectContaining({name:"CLOCK_SET"}));expect(await tracker.poll()).toContainEqual(expect.objectContaining({name:"CLOCK_SET"}));
});


it("does not treat a loading truck observation as an exit witness",async()=>{
 const tracker=source([at("INSIDE OF TRUCK",{screen:"field_transition"}),at("LITTLEROOT TOWN")]);
 await tracker.poll();expect((await tracker.poll()).map(m=>m.name)).not.toContain("FIRST_TRUCK_EXIT");
});
