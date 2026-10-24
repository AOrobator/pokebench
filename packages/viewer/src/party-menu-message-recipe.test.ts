import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {serverFeatureEnv} from "@pokebench/agent/features";
import {armFeatures,controlBaseProblems,parseFixedDefinition} from "./fixed-design.js";

const ID="party-menu-message-v1";
const recipeIds=["bundle-v-control-2h","bundle-v-control"] as const;
for(const recipe of recipeIds){
 it(`${recipe}: enables party message only in bundle and transports the exact server flag`,()=>{
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${recipe}.json`,import.meta.url),"utf8"));
  expect(def.switches.filter(id=>id===ID)).toEqual([ID]);
  expect(def.base.features[ID]).toBe(false);
  expect(def.offInBoth).not.toContain(ID);
  expect(def.onInBoth).not.toContain(ID);
  const normalized=(arm:"control"|"bundle")=>presetFeatures(parsePlayPreset({version:2,id:`party-recipe-${arm}`,...def.base,limits:{...def.base.limits,maxWallMs:1},features:armFeatures(def,arm)}));
  const control=normalized("control");
  const bundle=normalized("bundle");
  expect(control[ID]).toBe(false);
  expect(bundle[ID]).toBe(true);
  expect(serverFeatureEnv(control).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(bundle).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  const root=fileURLToPath(new URL("../../../",import.meta.url));
  expect(controlBaseProblems(def,readFileSync(`${root}${def.controlBase.path}`,"utf8"))).toEqual([]);
 });
}
