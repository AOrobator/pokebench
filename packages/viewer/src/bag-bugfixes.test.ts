import {readFileSync,readdirSync} from "node:fs";
import {expect,it} from "vitest";
import {armFeatures,controlBaseProblems,definitionProblems,parseFixedDefinition} from "./fixed-design.js";
const IDs=["bag-pocket-truth-v1","bag-press-feedback-v1","bag-ineffective-loop-v1"];
it("enables all three bugfixes in both arms of current fixed definitions",()=>{
 const root=new URL("../../../experiments/fixed/",import.meta.url);
 for(const file of readdirSync(root).filter(f=>f.endsWith(".json")&&!["bundle-cook-4h.json", "bundle-cook-6h.json", "bundle-cook-6h-v2.json"].includes(f))){const {definition:def}=parseFixedDefinition(readFileSync(new URL(file,root),"utf8"));
 expect(definitionProblems(def),file).toEqual([]);expect(controlBaseProblems(def,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8")),file).toEqual([]);
 for(const id of IDs){expect(def.onInBoth,file).toContain(id);expect(def.switches,file).not.toContain(id);for(const arm of ["bundle","control"] as const)expect(armFeatures(def,arm)[id],`${file} ${arm} ${id}`).toBe(true);}}
});
