import {describe,expect,it} from "vitest";
import {OBJECTIVE_EDGES,OBJECTIVE_NODES} from "./objective-graph.js";
import {OFF_PLAN_TURNS,ROUTE_PLAN,RoutePlan} from "./route-plan.js";
import type {RunEvent} from "./events.js";

const reached=(name:string,turn:number):RunEvent=>({type:"milestone",turn,name,seq:turn,kind:"story",origin:"observed",evidence:[1]} as unknown as RunEvent);
const at=(...steps:(readonly [string,number])[]):RoutePlan=>{
  const plan=new RoutePlan();
  for(const [name,turn] of steps)plan.observe(reached(name,turn));
  return plan;
};
const IDS=ROUTE_PLAN.map(step=>step.objective);

describe("the route plan",()=>{
  it("names only objectives the graph knows",()=>{
    for(const id of IDS)expect(OBJECTIVE_NODES,id).toContain(id);
  });

  it("visits each objective once",()=>{
    expect(new Set(IDS).size).toBe(IDS.length);
  });

  it("never asks for a step before the thing that gates it",()=>{
    // INV-RP1: a step's hard prerequisites are steps the plan already took. Curated order is only a
    // route if the graph agrees with it.
    const position=new Map(IDS.map((id,index)=>[id,index]));
    for(const step of ROUTE_PLAN){
      for(const edge of OBJECTIVE_EDGES){
        if(edge.to!==step.objective||edge.relation!=="requires")continue;
        const parent=position.get(edge.from);
        expect(parent,`${step.objective} needs ${edge.from}, which the plan never takes`).toBeDefined();
        expect(parent??0).toBeLessThan(position.get(step.objective)??0);
      }
    }
  });

  it("defers the second badge past the third and fourth, which is the whole point",()=>{
    const badges=IDS.filter(id=>id.endsWith("_BADGE"));
    expect(badges).toEqual(["STONE_BADGE","DYNAMO_BADGE","HEAT_BADGE","KNUCKLE_BADGE","BALANCE_BADGE","FEATHER_BADGE","MIND_BADGE","RAIN_BADGE"]);
  });
});

describe("a run's position on the plan",()=>{
  it("starts at the first step",()=>{
    const plan=new RoutePlan();
    expect(plan.completed()).toBe(0);
    expect(plan.next()?.objective).toBe("STONE_BADGE");
    expect(plan.status()).toBe(`step 1 of ${String(ROUTE_PLAN.length)} in Rustboro; next waypoint: Roxanne: Water Gun the two Geodude (STONE_BADGE)`);
  });

  it("advances only on plan steps, and counts by them",()=>{
    const plan=at(["STONE_BADGE",100],["LEVEL_UP",120],["DEVON_GOODS_RECOVERED",300]);
    expect(plan.completed()).toBe(2);
    expect(plan.next()?.objective).toBe("STEVEN_LETTER_RECEIVED");
    expect(plan.status()).toContain(`step 3 of ${String(ROUTE_PLAN.length)}`);
  });

  it("says nothing extra inside the drought bar",()=>{
    const plan=at(["STONE_BADGE",100]);
    plan.observe({type:"turn_start",turn:100+OFF_PLAN_TURNS,seq:1} as unknown as RunEvent);
    expect(plan.status()).not.toContain("off-plan");
  });

  it("dates the drought from the last step that landed",()=>{
    const plan=at(["STONE_BADGE",1552]);
    plan.observe({type:"turn_start",turn:2210,seq:2} as unknown as RunEvent);
    expect(plan.status()).toContain("off-plan since turn 1552");
  });

  it("restarts the clock on the next step",()=>{
    const plan=at(["STONE_BADGE",1552],["DEVON_GOODS_RECOVERED",2210]);
    plan.observe({type:"turn_start",turn:2300,seq:3} as unknown as RunEvent);
    expect(plan.status()).not.toContain("off-plan");
  });

  it("says nothing once the plan is done",()=>{
    const plan=at(...ROUTE_PLAN.map((step,index)=>[step.objective,index*10] as const));
    expect(plan.next()).toBeNull();
    expect(plan.status()).toBeNull();
  });
});
