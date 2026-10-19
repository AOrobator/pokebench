import {expect,it} from "vitest";
import {definition} from "../test-support/fixed.js";
import {generatePlan,parseFixedDefinition} from "./fixed-design.js";
it("plans exactly one concurrent pair on two lanes without changing legacy plans",()=>{
 const legacy=definition();expect(generatePlan(legacy)).toEqual(legacy.plan);
 const draft={...legacy,phases:[{...legacy.phases[0]!,id:"pilot",perArm:1,singlePair:true,maxWallMs:1200000}],replacementReserveMs:0};
 const plan=generatePlan(draft);expect(plan).toHaveLength(2);expect(new Set(plan.map(s=>s.lane)).size).toBe(2);expect(plan.map(s=>s.arm).sort()).toEqual(["bundle","control"]);
 expect(()=>parseFixedDefinition(JSON.stringify({...draft,plan}))).not.toThrow();
 expect(()=>parseFixedDefinition(JSON.stringify({...draft,phases:[{...draft.phases[0],perArm:2}],plan}))).toThrow();
});
