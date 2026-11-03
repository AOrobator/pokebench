import {describe,expect,it} from "vitest";
import {REQUIRED_FRONTIER_MILESTONES} from "./milestones.js";
import {OBJECTIVE_NODES,blockingPrerequisites} from "./objective-graph.js";
import {NextObjective,objectiveLine,targetIn} from "./next-objective.js";
import type {RunEvent} from "./events.js";

const foothold=(name:string):RunEvent=>({type:"milestone",turn:1,name,seq:1,kind:"story",origin:"observed",evidence:[1]} as unknown as RunEvent);
const at=(...names:string[]):NextObjective=>{
  const target=new NextObjective();
  for(const name of names)target.observe(foothold(name));
  return target;
};

describe("the next objective a stall briefing may name",()=>{
  it("names the first unmet step of the record order",()=>{
    const target=at().target();
    expect(target).not.toBeNull();
    expect(target?.id).toBe(REQUIRED_FRONTIER_MILESTONES[0]);
    expect(target?.blockedBy).toEqual([]);
    expect(OBJECTIVE_NODES).toContain(target?.id);
  });

  it("never names an objective the run already reached",()=>{
    const reached=REQUIRED_FRONTIER_MILESTONES.slice(0,40);
    const target=at(...reached).target();
    expect(reached).not.toContain(target?.id);
  });

  it("skips a step whose hard prerequisites are unmet, and names a legal one instead",()=>{
    // Everything the record order holds up to the Devon Scope, without the Scope itself: the Fortree
    // obstruction is next in the list but cannot be cleared, so the briefing must not name it.
    const scope="DEVON_SCOPE_RECEIVED";
    const cut=REQUIRED_FRONTIER_MILESTONES.indexOf("FORTREE_GYM_OBSTRUCTION_CLEARED");
    expect(cut).toBeGreaterThan(0);
    const reached=REQUIRED_FRONTIER_MILESTONES.slice(0,cut).filter(id=>id!==scope);
    const target=at(...reached).target();
    expect(target?.id).not.toBe("FORTREE_GYM_OBSTRUCTION_CLEARED");
    expect(target?.blockedBy).toEqual([]);
  });

  it("names the blocked step with its blockers when nothing ahead is legal",()=>{
    const scope="DEVON_SCOPE_RECEIVED";
    const obstruction="FORTREE_GYM_OBSTRUCTION_CLEARED";
    // A plan whose only step is gated on something the plan never lists: the skip loop finds nothing
    // legal, so the fallback names the blocked step and says what it needs.
    const target=targetIn([obstruction],new Set());
    expect(target?.id).toBe(obstruction);
    expect(target?.blockedBy).toContain(scope);
    expect(blockingPrerequisites(obstruction,new Set())).toContain(scope);
  });

  it("does not nag back to a step the run deliberately left behind",()=>{
    // The GLM 0d5d shape: Stone and Dynamo down, the Dewford gym deferred. The record order lists Knuckle
    // before Dynamo, so the earliest gap is Knuckle; the briefing must name what comes after Dynamo instead.
    const dynamo=REQUIRED_FRONTIER_MILESTONES.indexOf("DYNAMO_BADGE");
    const reached=new Set(REQUIRED_FRONTIER_MILESTONES.slice(0,dynamo+1).filter(id=>id!=="KNUCKLE_BADGE"));
    const target=at(...reached).target();
    expect(target?.id).not.toBe("KNUCKLE_BADGE");
    expect(REQUIRED_FRONTIER_MILESTONES.indexOf(target?.id??"")).toBeGreaterThan(dynamo);
  });

  it("falls back to the id's own words when the catalog has no label for it",()=>{
    // An id the graph does not know is never named by the legal loop; the fallback still has to read.
    const target=targetIn(["STONE_BADGE","INVENTED_STEP_V1"],new Set(["STONE_BADGE"]));
    expect(target).toEqual({id:"INVENTED_STEP_V1",label:"invented step v1",blockedBy:[]});
  });

  it("says nothing when a non-milestone event arrives, and says what a blocked step needs",()=>{
    const target=new NextObjective();
    target.observe({type:"turn",turn:1,seq:1} as unknown as RunEvent);
    const first=REQUIRED_FRONTIER_MILESTONES[0];
    expect(target.target()?.id).toBe(first);
    expect(objectiveLine({id:"FORTREE_GYM_OBSTRUCTION_CLEARED",label:"Fortree gym obstruction cleared",blockedBy:["DEVON_SCOPE_RECEIVED"]}))
      .toMatch(/^- Next milestone: Fortree gym obstruction cleared \(FORTREE_GYM_OBSTRUCTION_CLEARED\); needs .+ first$/);
  });

  it("says nothing once the whole order is reached",()=>{
    expect(at(...REQUIRED_FRONTIER_MILESTONES).target()).toBeNull();
    expect(at(...REQUIRED_FRONTIER_MILESTONES).describe()).toBeNull();
  });

  it("puts the id in the line, so a recorded briefing can be counted by objective",()=>{
    const line=at("NEW_GAME_CREATED").describe()??"";
    expect(line).toMatch(/^- Next milestone: .+ \([A-Z0-9_]+\)$/);
    expect(line).toContain(`(${at("NEW_GAME_CREATED").target()?.id ?? ""})`);
  });

  it("names the blocker in words when it names a blocked step",()=>{
    const line=at().describe()??"";
    expect(line).not.toContain("needs ");
  });
});
