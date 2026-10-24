import {readFileSync} from "node:fs";
import {it,expect} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {dependencyProblems} from "@pokebench/agent/features";
import {armPreset,controlBaseProblems,parseFixedDefinition} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const IDS=["leader-loss-immediate-v1","battle-action-history-v1","leader-preparation-comparison-v1"] as const;
const RECIPES=["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","gym-rustboro-torchic","gym-rustboro-torchic-healed"];
const read=(p:string)=>readFileSync(new URL(`../../../${p}`,import.meta.url),"utf8");
it("future current recipes enable factual history in bundle only, preserve the pinned control base, and satisfy dependencies",()=>{
 for(const id of IDS)expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 const bases=new Map<string,string>();
 for(const name of RECIPES){
  const {definition:d}=parseFixedDefinition(read(`experiments/fixed/${name}.json`));
  let base=bases.get(d.controlBase.path);if(base===undefined){base=read(d.controlBase.path);bases.set(d.controlBase.path,base);}
  expect(controlBaseProblems(d,base)).toEqual([]);expect(d.switches.filter(id=>id!=="native-task-goal-retirement-v1").slice(-3)).toEqual([...IDS]);
  for(const phase of d.phases){
   const control=presetFeatures(parsePlayPreset(armPreset(d,phase.id,"control"))),bundle=presetFeatures(parsePlayPreset(armPreset(d,phase.id,"bundle")));
   for(const id of IDS){expect(d.base.features[id]).toBe(false);expect(control[id]).toBe(false);expect(bundle[id]).toBe(true);}
   expect(bundle["leader-loss-comparison-v1"]).toBe(true);expect(dependencyProblems(bundle)).toEqual([]);
  }
 }
});
it("older recipes lacking leader-loss comparison do not silently gain dependencies or new history",()=>{
 for(const name of ["bundle-cook-4h","bundle-cook-6h","bundle-cook-6h-v2"]){const {definition:d}=parseFixedDefinition(read(`experiments/fixed/${name}.json`));for(const id of IDS)expect(d.switches).not.toContain(id);expect(d.switches).not.toContain("leader-loss-comparison-v1");}
});
