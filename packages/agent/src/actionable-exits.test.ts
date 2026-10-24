import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,featureInfo,featuresOf,playHarnessFeatures,SERVER_FEATURES,serverFeatureEnv,type SwitchableFeature} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
const IDS=["active-warp-exits-v1","available-exits-presentation-v1"] as const;
it.each(IDS)("%s defaults OFF, transports independently and has an explainer",id=>{
 const key=id as SwitchableFeature;
 expect(featureInfo(key).description).toContain(" Off: ");
 const old=Object.fromEntries(Object.entries(ALL_ON).filter(([k])=>!IDS.includes(k as typeof IDS[number]))) as Parameters<typeof normalizeFeatures>[0];
 expect(normalizeFeatures(old)[key]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[key]).toBe(false);
 const features={...ALL_ON,[id]:true};
 expect(featuresOf(playHarnessFeatures(features,null))[key]).toBe(true);
 expect(SERVER_FEATURES).toContain(id);
 expect(serverFeatureEnv({...features,[id]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(id);
 expect(readFileSync(new URL("../../viewer/src/panels.ts",import.meta.url),"utf8")).toContain(`"${id}":"${id}.html"`);
});

import {IN_GAME} from "../test-support/events.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {parseGameState} from "./game-state.js";
import {withUntakenExits} from "./untaken-exits.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {checkEvent} from "./events.js";
import type {AgentTool} from "@mariozechner/pi-agent-core";
const raw:unknown=JSON.parse(readFileSync(new URL("./fixtures/actionable-exits-native.json",import.meta.url),"utf8"));
function nativeCase(name:string){
 if(typeof raw!=="object"||raw===null||!(name in raw))throw Error("missing native case");
 const c:unknown=Reflect.get(raw,name);
 if(typeof c!=="object"||c===null||!("state" in c)||!("text" in c)||typeof c.text!=="string")throw Error("bad native case");
 return {state:parseGameState(c.state),text:c.text};
}
it("delivers native filtered exits through the production observation annotation and supervisor consumers",async()=>{
 const features={...LEGACY_ALL_ON,"active-warp-exits-v1":true,"available-exits-presentation-v1":true};
 for(const name of ["tunnel-on","route-on","blocked"]){
  const {state,text}=nativeCase(name);
  const tool:AgentTool={name:"observe",label:"observe",description:"observe",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text}],details:{state}})};
  const wrapped=withUntakenExits([tool],features,{subscribe:()=>undefined})[0];if(wrapped===undefined)throw Error("missing observe");
  const result=await wrapped.execute("observed-native",{});
  const delivered=result.content.map(c=>c.type==="text"?c.text:"").join("\n");
  expect(delivered).not.toContain("TERRA CAVE");
  const untried=delivered.split("\n").find(l=>l.startsWith("Exits here you have not taken:"));expect(untried).toBeDefined();
  const supervisor=new SupervisorBriefing(features);supervisor.observe(checkEvent({v:1,run:"native-exits",seq:1,t:"2026-10-24T15:00:00.000-04:00",turn:1,type:"state",...IN_GAME,...state}));
  const advice=supervisor.text("ineffective",10);
  expect(advice).not.toContain("TERRA CAVE");
  if(name==="blocked"){
   expect(untried).not.toContain("NORTH");
   expect(advice).not.toContain("stand on any tile from (12,0)");
   expect(delivered).toContain("Unavailable from here:");
  }
 }
});
it("historical OFF evidence still exposes the original dormant listing",()=>{
 expect(nativeCase("tunnel-off").text).toContain("TERRA CAVE");
 expect(nativeCase("route-off").state.interaction_targets?.some(t=>t.kind==="warp"&&t.x===59&&t.y===13)).toBe(true);
});
