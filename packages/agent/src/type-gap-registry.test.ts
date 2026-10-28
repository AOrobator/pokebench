import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const IDS=["type-gap-team-v1","supplies-v1","untalked-in-gym-v1"] as const;
const TITLES=["GYM TYPE GAP","SUPPLIES","UNTALKED PEOPLE IN GYM"];
const CURRENT=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {switches:string[];onInBoth:string[];offInBoth:string[];features:Record<string,boolean>};

describe("type-gap-team-v1, supplies-v1 and untalked-in-gym-v1 (the operator 2026-10-27)",()=>{
 it("are appended, in order, right after context-exact-count-v1 in every registry list as default-off observations",()=>{
  // Pinned by position after the switch they were appended to, so a later switch never edits this test (feature-switch skill).
  const after=(list:readonly string[])=>{const i=list.indexOf("context-exact-count-v1")+1;return list.slice(i,i+3);};
  expect(after(SWITCHABLE_FEATURES)).toEqual([...IDS]);
  expect(after(FEATURES.filter(f=>f.switchable).map(f=>f.id))).toEqual([...IDS]);
  expect(SERVER_FEATURES.at(-1)).toBe("type-gap-team-v1");
  const all=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,true])) as Parameters<typeof playHarnessFeatures>[0];
  expect(after(playHarnessFeatures(all,null))).toEqual([...IDS]);
  IDS.forEach((id,i)=>{
   expect(featureInfo(id)).toMatchObject({group:"observation",switchable:true,title:TITLES[i],needs:null});
   expect(featureInfo(id).description).toContain("Bundle arm only, default off");
   expect(featureInfo(id).description).toContain(" Off: ");
  });
 });
 it("default off in presets, legacy flags and the frozen legacy all-on set",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  for(const id of IDS){
   expect(off[id]).toBe(false);
   expect(LEGACY_ALL_ON[id]).toBe(false);
   const {[id]:omitted,...rest}=off;
   expect(omitted).toBe(false);
   expect(normalizeFeatures(rest)[id]).toBe(false);
  }
 });
 it("hands only type-gap-team-v1 to the game server",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain("type-gap-team-v1");
  const on={...off,"type-gap-team-v1":true,"supplies-v1":true,"untalked-in-gym-v1":true};
  const list=serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",");
  for(const id of IDS)expect(list).not.toContain(id);
 });
 it("are bundle switches in current.json: OFF in the shared base, in no both-arm list",()=>{
  for(const id of IDS){
   expect(CURRENT.switches).toContain(id);
   expect(CURRENT.features[id]).toBe(false);
   expect(CURRENT.onInBoth).not.toContain(id);
   expect(CURRENT.offInBoth).not.toContain(id);
  }
 });
});
