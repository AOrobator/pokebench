import {expect,it} from "vitest";
import {flagFeatures} from "./play-preset.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import {serverOff,serverOffWith} from "../test-support/server-features.js";
const ID="rotating-gate-regions-v1";
it("is registered at its fixed place, default off and needs the gate positions",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(346);
 expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"rotating-gate-positions-v1"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 expect(dependencyProblems({...ALL_ON,"rotating-gate-positions-v1":false}).join()).toContain(ID);
});
it("is a server switch: its state reaches the game server's off list",()=>{
 expect(SERVER_FEATURES).toContain(ID);
 expect(serverOff({...ALL_ON,[ID]:false})).toEqual(serverOffWith(ALL_ON,{off:[ID]}));
});
it("is recorded in the run's harness features only when on",()=>{
 expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
 expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
});
