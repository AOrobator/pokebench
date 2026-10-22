import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";

const ID="battle-effective-damage-v1" as const;
const root=(path:string)=>readFileSync(fileURLToPath(new URL(`../../../${path}`,import.meta.url)),"utf8");

describe(ID,()=>{
 it("is a default-off server observation switch that depends on battle details",()=>{
  expect(SWITCHABLE_FEATURES.at(-83)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"battle-details-v2",switchable:true,title:"BATTLE EFFECTIVE DAMAGE"});
  expect(SERVER_FEATURES.at(-25)).toBe(ID);
  expect(serverFeatureEnv({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toEqual([ID,"safe-navigation-strides-v1","original-speed-pacing-v1","exit-labels-v2","heal-before-trainers-v2","respawn-readout-v1","caught-nickname-prompt-v1","party-item-confirmation-v1","yes-no-answer-readout-v1","field-move-gates-v1","exit-labels-v3","move-learn-settle-v1","move-learn-question-v1","move-learn-comparison-v1","gym-door-label-v1","mart-stock-readout-v1","caught-dex-input-v1","exp-next-level-v1","pokedex-own-v1","shop-interface-v1","map-wide-triggers-v1","birch-intro-pages-v1","post-battle-readout-v1"]);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"battle-details-v2":false})).toContain(`${ID} needs battle-details-v2`);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
 });

 it("is an isolated candidate in the fixed bundle and has tracked operator docs",()=>{
  const bundle=JSON.parse(root("experiments/fixed/bundle-v-control.json")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(bundle.base.features[ID]).toBe(false);
  expect(bundle.switches).toContain(ID);
  expect(root("docs/explainers/README.md")).toContain("battle-effective-damage-v1.html");
  expect(root("docs/explainers/battle-effective-damage-v1.html")).toContain("The harness does not rank moves");
  expect(root("docs/experiments/README.md")).toContain("battle-effective-damage.html");
  expect(root("experiments/battle-effective-damage.json")).toContain(`"changedFeature": "${ID}"`);
 });
});
