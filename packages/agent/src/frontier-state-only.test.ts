import {expect,it} from "vitest";
import {featuresOf,stateOnlyProblems} from "./features.js";

it.each(["explorer-family-guidance-v1","coherent-healing-feedback-v1","delivered-place-evidence-v1"] as const)("rejects %s in a state-only preset",id=>{
 const features={...featuresOf([]),"state-only-decisions-v1":true,[id]:true};
 expect(stateOnlyProblems(features)).toContain(`state-only-decisions-v1 requires ${id} OFF`);
});
