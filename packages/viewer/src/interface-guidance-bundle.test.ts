import {fileURLToPath} from "node:url";
import {readFixedDefinition} from "./fixed-definition.js";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {dependencyProblems} from "@pokebench/agent/features";
import {armPreset,controlBaseProblems} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const sourceRoot=fileURLToPath(new URL("../../../",import.meta.url));
const ID="interface-guidance-v1";
const ARCHIVED=["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"];
const CURRENT=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"];
const RECIPES=[...["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"],"gym-rustboro-torchic","gym-rustboro-torchic-healed","random-starter-2h",...ARCHIVED];
const read=(p:string):string=>readFileSync(new URL(`../../../${p}`,import.meta.url),"utf8");
it("normalizes interface guidance ON in both current arms and other bundle arms without JIT or control-base changes",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 for(const name of RECIPES){
  const {definition:d}=readFixedDefinition(sourceRoot,name,ARCHIVED.includes(name));
  expect(controlBaseProblems(d,read(d.controlBase.path)),name).toEqual([]);
  // Later batch features may follow this switch; retain exact unique activation.
  expect(d.switches.filter(id=>id===ID),name).toEqual(CURRENT.includes(name)?[]:[ID]);
  expect(d.onInBoth.includes(ID),name).toBe(CURRENT.includes(name));
  for(const phase of d.phases){
   const control=presetFeatures(parsePlayPreset(armPreset(d,phase.id,"control"))),bundle=presetFeatures(parsePlayPreset(armPreset(d,phase.id,"bundle")));
   expect(d.base.features[ID],name).toBe(CURRENT.includes(name));expect(control[ID],name).toBe(CURRENT.includes(name));expect(bundle[ID],name).toBe(true);
   expect(bundle["just-in-time-prompt-v1"],name).toBe(false);expect(bundle["just-in-time-prompt-v2"],name).toBe(false);
   expect(dependencyProblems(bundle),name).toEqual([]);
  }
 }
});
