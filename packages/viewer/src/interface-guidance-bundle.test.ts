import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {dependencyProblems} from "@pokebench/agent/features";
import {armPreset,controlBaseProblems,parseFixedDefinition} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const ID="interface-guidance-v1";
const RECIPES=["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","gym-rustboro-torchic","gym-rustboro-torchic-healed","random-starter-2h","glm53-flash-4h"];
const read=(p:string):string=>readFileSync(new URL(`../../../${p}`,import.meta.url),"utf8");
it("normalizes interface guidance ON only in current bundle arms without JIT or control-base changes",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 for(const name of RECIPES){
  const {definition:d}=parseFixedDefinition(read(`experiments/fixed/${name}.json`));
  expect(controlBaseProblems(d,read(d.controlBase.path)),name).toEqual([]);
  expect(d.switches.at(-1),name).toBe(ID);
  for(const phase of d.phases){
   const control=presetFeatures(parsePlayPreset(armPreset(d,phase.id,"control"))),bundle=presetFeatures(parsePlayPreset(armPreset(d,phase.id,"bundle")));
   expect(d.base.features[ID],name).toBe(false);expect(control[ID],name).toBe(false);expect(bundle[ID],name).toBe(true);
   expect(bundle["just-in-time-prompt-v1"],name).toBe(false);expect(bundle["just-in-time-prompt-v2"],name).toBe(false);
   expect(dependencyProblems(bundle),name).toEqual([]);
  }
 }
});
