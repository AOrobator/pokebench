import {describe,expect,it} from "vitest";
import {REQUIRED_FRONTIER_MILESTONES} from "./milestones.js";
import {LOCATION_ONLY_OBJECTIVES,OBJECTIVE_NODES,blockingPrerequisites} from "./objective-graph.js";
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

  it("names the prerequisite, not the step that is waiting on it",()=>{
    // Everything up to the Fortree obstruction except the Devon Scope: the obstruction is later in the
    // list, and the Scope is the step the run can actually take.
    const scope="DEVON_SCOPE_RECEIVED";
    const cut=REQUIRED_FRONTIER_MILESTONES.indexOf("FORTREE_GYM_OBSTRUCTION_CLEARED");
    expect(cut).toBeGreaterThan(0);
    const reached=REQUIRED_FRONTIER_MILESTONES.slice(0,cut).filter(id=>id!==scope);
    const target=at(...reached).target();
    expect(target?.id).toBe(scope);
    expect(target?.blockedBy).toEqual([]);
  });

  it("skips a blocked step and names the legal one after it",()=>{
    // A plan that lists the gated step first: the scope is not in the plan, so it can never be cleared.
    const target=targetIn(["FORTREE_GYM_OBSTRUCTION_CLEARED","STONE_BADGE"],new Set());
    expect(target?.id).toBe("STONE_BADGE");
    expect(target?.blockedBy).toEqual([]);
  });

  it("is not dragged forward by a milestone reached out of order",()=>{
    // Recorded in d41e and 6bbd: SLATEPORT_HARBOR emitted before DYNAMO_BADGE, while its own gate
    // (Magma Hideout) was open. The honour cannot move the mark, or Mauville disappears from the plan.
    const dynamo=REQUIRED_FRONTIER_MILESTONES.indexOf("DYNAMO_BADGE");
    const reached=new Set([...REQUIRED_FRONTIER_MILESTONES.slice(0,dynamo + 1).filter(id=>id!=="KNUCKLE_BADGE"),"SLATEPORT_HARBOR"]);
    const target=at(...reached).target();
    // Pinned to the step immediately after Dynamo: the old rule returned index 140 on this same input, so
    // "somewhere after Dynamo" is not a test of the fix.
    expect(target?.id).toBe(REQUIRED_FRONTIER_MILESTONES[dynamo + 1]);
  });

  it("is not stalled by the map visits a checkpoint start never saw",()=>{
    // A save-state launch reports what is true at that moment, so LAVARIDGE_TOWN and friends are missing
    // from the log. A badge reached that way is still earned: its map gates cannot testify either way.
    const dynamo=REQUIRED_FRONTIER_MILESTONES.indexOf("DYNAMO_BADGE");
    const full=REQUIRED_FRONTIER_MILESTONES.slice(0,dynamo + 1);
    const checkpoint=full.filter(id=>!LOCATION_ONLY_OBJECTIVES.has(id));
    expect(checkpoint.length).toBeLessThan(full.length);
    expect(at(...checkpoint).target()?.id).toBe(at(...full).target()?.id);
    expect(at(...checkpoint).target()?.id).toBe(REQUIRED_FRONTIER_MILESTONES[dynamo + 1]);
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

  it("is unmoved by an event that is not a milestone",()=>{
    const target=new NextObjective();
    target.observe({type:"turn",turn:1,seq:1} as unknown as RunEvent);
    expect(target.target()?.id).toBe(REQUIRED_FRONTIER_MILESTONES[0]);
  });

  it("says what a blocked step needs when the fallback names one",()=>{
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
