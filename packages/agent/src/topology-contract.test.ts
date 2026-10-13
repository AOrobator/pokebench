import {expect,it} from "vitest";
import {parseGameState} from "./game-state.js";
import {parsePlayPreset,presetFeatures,flagFeatures} from "./play-preset.js";
import {playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {NAME_CONFIRMED} from "../test-support/events.js";
it("validates topology records and preserves historical missing state",()=>{
 const topology={width:20,height:20,connections:[{direction:"NORTH",offset:0,destination:[0,16],destination_name:"ROUTE 101"}]};
 expect(parseGameState({...NAME_CONFIRMED,topology}).topology).toEqual(topology);
 expect(parseGameState(NAME_CONFIRMED).topology).toBeUndefined();
 expect(()=>parseGameState({...NAME_CONFIRMED,topology:{...topology,connections:[{...topology.connections[0],direction:"NORTHEAST"}]}})).toThrow(/direction/);
});
it("defaults historical presets off, declares explicit topology and rejects string switches",()=>{
 const features=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 const {"world-destinations-v1":unused,...historical}=features;expect(unused).toBe(false);
 const base={version:2,id:"topology",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096}};
 expect(presetFeatures(parsePlayPreset({...base,features:historical}))["world-destinations-v1"]).toBe(false);
 const on=presetFeatures(parsePlayPreset({...base,features:{...features,"world-destinations-v1":true}}));
 expect(playHarnessFeatures(on,null)).toContain("world-destinations-v1");
 expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF).toContain("world-destinations-v1");
 expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF).not.toContain("world-destinations-v1");
 expect(()=>parsePlayPreset({...base,features:{...features,"world-destinations-v1":"true"}})).toThrow(/preset/);
});
