import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {OPTIONAL_PROGRESS_NAMES,PROGRESS_CATALOG} from "./story-progress.js";
import {
  OBJECTIVE_EDGES,
  OBJECTIVE_NODES,
  blockingPrerequisites,
  enabledObjectives,
  objectiveDepth,
  remainingToClear,
  unmetPrerequisites,
} from "./objective-graph.js";

// A node set is all these functions take, so order of arrival can never leak into the answer.
const at=(...names:string[]):ReadonlySet<string>=>new Set(names);
const parents=(name:string,relation:"requires"|"expects"):string[]=>
  OBJECTIVE_EDGES.filter(edge=>edge.to===name&&edge.relation===relation).map(edge=>edge.from).sort();

describe("objective graph topology",()=>{

  it("keeps the requires relation acyclic",()=>{
    const state=new Map<string,"open"|"closed">();
    const visit=(name:string):void=>{
      if(state.get(name)==="closed")return;
      expect(state.get(name),`cycle through ${name}`).not.toBe("open");
      state.set(name,"open");
      for(const parent of parents(name,"requires"))visit(parent);
      state.set(name,"closed");
    };
    for(const edge of OBJECTIVE_EDGES)if(edge.relation==="requires")visit(edge.to);
  });

  it("never lets an optional acquisition gate progress",()=>{
    for(const edge of OBJECTIVE_EDGES){
      if(edge.relation!=="requires")continue;
      expect(OPTIONAL_PROGRESS_NAMES.has(edge.from),`optional gates ${edge.to}`).toBe(false);
      expect(OPTIONAL_PROGRESS_NAMES.has(edge.to),`optional is required`).toBe(false);
    }
  });

  it("mirrors each declared catalog prerequisite as a requires edge",()=>{
    for(const definition of PROGRESS_CATALOG){
      for(const prerequisite of definition.prerequisites??[]){
        const mirrored=OBJECTIVE_EDGES.some(edge=>edge.relation==="requires"&&edge.from===prerequisite&&edge.to===definition.name);
        expect(mirrored,`${prerequisite} -> ${definition.name} is declared but not ranked`).toBe(true);
      }
    }
  });

  it("cites a source file for every hard gate",()=>{
    for(const edge of OBJECTIVE_EDGES){
      expect(edge.evidence.trim().length,`${edge.from} -> ${edge.to}`).toBeGreaterThan(0);
      // A reader must be able to open the line, not just the directory.
      if(edge.relation==="requires")expect(edge.evidence,`${edge.from} -> ${edge.to}`).toMatch(/\.(c|inc|json|md):\d/);
    }
  });
});

describe("objective depth",()=>{
  it("counts a node only once its requires ancestors are reached",()=>{
    // Knuckle hangs off Brawly's defeat script (DewfordTown_Gym/scripts.inc:144-151), not off the Devon
    // goods chain: the badge flag alone is not enough.
    expect(objectiveDepth(at("KNUCKLE_BADGE"))).toBe(0);
    expect(objectiveDepth(at("DEVON_GOODS_RECOVERED","KNUCKLE_BADGE"))).toBe(1);
    expect(objectiveDepth(at("BRAWLY_DEFEATED","KNUCKLE_BADGE"))).toBe(2);
  });

  it("does not depend on the order badges arrived in",()=>{
    const record=at("LAVARIDGE_TOWN","HEAT_BADGE","HM_ROCK_SMASH_RECEIVED","DYNAMO_BADGE","DEVON_GOODS_RECOVERED","KNUCKLE_BADGE");
    const linear=at("DEVON_GOODS_RECOVERED","KNUCKLE_BADGE","HM_ROCK_SMASH_RECEIVED","DYNAMO_BADGE","LAVARIDGE_TOWN","HEAT_BADGE");
    expect(objectiveDepth(record)).toBe(objectiveDepth(linear));
    // Five of the six count: Knuckle's own gate (Brawly) is absent from both sets.
    expect(objectiveDepth(record)).toBe(5);
  });

  it("never decreases as objectives are added",()=>{
    const base=at("DEVON_GOODS_RECOVERED","KNUCKLE_BADGE");
    const extra=at("DEVON_GOODS_RECOVERED","KNUCKLE_BADGE","STONE_BADGE","HM_ROCK_SMASH_RECEIVED","DYNAMO_BADGE");
    expect(objectiveDepth(extra)).toBeGreaterThanOrEqual(objectiveDepth(base));
  });

  it("keeps expects edges out of the earned count",()=>{
    // Champion room is reachable in the plan only after the Rain Badge, but the game does not refuse
    // entry, so the relation is expects and it must not block the depth of the node itself.
    expect(parents("CHAMPION_ROOM_REACHED","requires")).toEqual([]);
    expect(parents("CHAMPION_ROOM_REACHED","expects")).toEqual(["ELITE_FOUR_DRAKE_DEFEATED","RAIN_BADGE"]);
  });

  it("ignores ids that are optional or unknown",()=>{
    expect(objectiveDepth(at("HM_FLY_RECEIVED","NOT_A_MILESTONE"))).toBe(0);
  });
});

describe("objective enablement",()=>{
  it("holds a gated objective back until every requirement is met",()=>{
    expect(enabledObjectives(at("HM_ROCK_SMASH_RECEIVED"))).not.toContain("ROUTE_111_NORTH");
    expect(enabledObjectives(at("HM_ROCK_SMASH_RECEIVED","DYNAMO_BADGE"))).toContain("ROUTE_111_NORTH");
  });

  it("names the unmet requirements in catalog order",()=>{
    expect(unmetPrerequisites("ROUTE_111_NORTH",at("HM_ROCK_SMASH_RECEIVED"))).toEqual(["DYNAMO_BADGE"]);
    expect(unmetPrerequisites("ROUTE_111_NORTH",at())).toEqual(["DYNAMO_BADGE","HM_ROCK_SMASH_RECEIVED"]);
  });

  it("never enables an objective that was already reached",()=>{
    expect(enabledObjectives(at("HM_ROCK_SMASH_RECEIVED","DYNAMO_BADGE"))).not.toContain("HM_ROCK_SMASH_RECEIVED");
  });

  it("separates hard blockers from expectations",()=>{
    expect(blockingPrerequisites("ROUTE_111_NORTH",at("DYNAMO_BADGE","HM_ROCK_SMASH_RECEIVED"))).toEqual([]);
    expect(blockingPrerequisites("NOT_A_MILESTONE",at())).toEqual([]);
    expect(unmetPrerequisites("NOT_A_MILESTONE",at())).toEqual([]);
    // The champion room is expected after the Rain Badge but nothing hard-blocks it.
    expect(blockingPrerequisites("CHAMPION_ROOM_REACHED",at())).toEqual([]);
    expect(unmetPrerequisites("CHAMPION_ROOM_REACHED",at())).toContain("RAIN_BADGE");
  });
});

describe("distance to a cleared game",()=>{
  it("counts unmet prerequisite nodes, not a route list",()=>{
    const empty=remainingToClear(at());
    expect(empty).toBeGreaterThan(10);
    expect(remainingToClear(at("FEATHER_BADGE","LEAGUE_ADMISSION_GRANTED","RAIN_BADGE"))).toBeLessThan(empty);
  });

  it("never increases when an objective is added",()=>{
    const before=remainingToClear(at("HM_ROCK_SMASH_RECEIVED"));
    expect(remainingToClear(at("HM_ROCK_SMASH_RECEIVED","DYNAMO_BADGE"))).toBeLessThanOrEqual(before);
  });

  it("reaches zero once every prerequisite of a cleared game is done",()=>{
    const needed=["GAME_CLEAR_CONFIRMED",...unmetPrerequisites("GAME_CLEAR_CONFIRMED",at())];
    expect(needed.length).toBeGreaterThan(1);
    expect(remainingToClear(new Set(needed))).toBe(0);
  });
});
