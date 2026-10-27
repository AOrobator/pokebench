import {serverOff, serverOffWith} from "../test-support/server-features.js";
import {armPreset,parseFixedDefinition} from "../../viewer/src/fixed-design.js";
import {parsePlayPreset,presetFeatures} from "./play-preset.js";
import {recipeText} from "../../viewer/test-support/recipe-text.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";

const ID="battle-effective-damage-v1" as const;
const root=(path:string)=>readFileSync(fileURLToPath(new URL(`../../../${path}`,import.meta.url)),"utf8");

describe(ID,()=>{
 it("is a default-off server observation switch that depends on battle details",()=>{
  expect(SWITCHABLE_FEATURES.at(129)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"battle-details-v2",switchable:true,title:"BATTLE EFFECTIVE DAMAGE"});
  expect(SERVER_FEATURES.at(47)).toBe(ID);
  expect(serverOff({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false})).toEqual(serverOffWith(ALL_ON,{off:[ID]}));
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"battle-details-v2":false})).toContain(`${ID} needs battle-details-v2`);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
 });

 it("preserves the archived isolated treatment and tracked operator docs",()=>{
  const bundle=JSON.parse(recipeText(new URL("../../../experiments/archive/fixed/bundle-cook-1h.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(bundle.base.features[ID]).toBe(false);
  expect(bundle.switches).toContain(ID);
  expect(root("docs/explainers/README.md")).toContain("battle-effective-damage-v1.html");
  expect(root("docs/explainers/battle-effective-damage-v1.html")).toContain("The harness does not rank moves");
  expect(root("docs/experiments/README.md")).toContain("battle-effective-damage.html");
 });
});

it("keeps the established newer whole-map baseline enabled in both materialized current arms",()=>{
 const {definition}=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8"));
 expect(definition.base.features[ID]).toBe(true);expect(definition.switches).not.toContain(ID);
 for(const phase of definition.phases)for(const arm of ["control","bundle"] as const){
  expect(presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)))[ID],`${phase.id}/${arm}`).toBe(true);
 }
});
