import {expect,it} from "vitest";
import {ALL_ON,playHarnessFeatures} from "@pokebench/agent/features";
import {FRONTIER_MILESTONES} from "./frontier.js";
import {currentFixture} from "../test-support/current.js";


it("publishes a full-game current state without squeezing configuration and history into the live record",()=>{
 const evaluation={preset_id:"fixture",target:null,failure_limit:3,flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}};
 const f=currentFixture({start:{harness_features:playHarnessFeatures(ALL_ON,null),evaluation:{...evaluation,features:ALL_ON}},extra:FRONTIER_MILESTONES.map(m=>({type:"milestone" as const,turn:1,name:m.id,origin:"observed" as const,server_timestamp:1,evidence:[1]}))});
 expect(new TextEncoder().encode(f.publication.wire?.summary).byteLength).toBeLessThan(65536);
 expect(JSON.parse(f.publication.wire?.summary??"{}")).not.toHaveProperty("header");
 expect(f.summary.progress.count).toBe(FRONTIER_MILESTONES.length);
 expect(f.summary.progress.recorded.length).toBeLessThanOrEqual(2);
});
