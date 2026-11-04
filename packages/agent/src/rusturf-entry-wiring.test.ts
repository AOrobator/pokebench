import {readFileSync} from "node:fs";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {Type} from "typebox";
import {Governor,piLoop,play} from "./harness.js";
import {playLoopBase} from "./provider.js";
import {discoverModels,selectModel} from "./gateway.js";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,stateOnlyProblems,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";

const ID="rusturf-entry-followup-v1";
const TEXT="Screen: overworld\nDialog: none\nMenu: none open\nLocation: RUSTURF TUNNEL\nPosition: X=6, Y=9, facing up\nField controls: available (terrain and objects can still block a direction)";
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"current",seq:1,turn:1,t:"2026-10-30T00:00:00.000-04:00",...body});
const state=()=>event({...IN_GAME,type:"state",location:"RUSTURF TUNNEL",map_id:[24,4],position:{x:6,y:9},active_ui:null,field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null},story_progress:{flags:"00".repeat(300),rustboro_stage:0,devon_stage:0,letter:false}});
const result=()=>event({type:"tool_result",seq:2,id:"obs",name:"observe",state_seq:1,text:TEXT,is_error:false,duration_ms:1,frames:[]});
const messages=():AgentMessage[]=>[{role:"user",content:"Continue playing.",timestamp:0},{role:"toolResult",toolCallId:"obs",toolName:"observe",content:[{type:"text",text:TEXT}],isError:false,timestamp:0}];
function factory(on:boolean,restoring=false){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[];timing:"next"|"current"|undefined}[]=[];
 const features={...featuresOf(["ram-state-v1"]),[ID]:on};
 const wiring=contextTools(features,{isRestoring:()=>restoring,subscribe:f=>{listeners.push(f);},recordLedgerContext:(n,timing)=>{notes.push({...n,timing});},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
 return {wiring,notes,feed:(...events:RunEvent[])=>{for(const e of events)for(const f of listeners)f(e);}};
}
it("registers a globally OFF append-only treatment with its declared dependency",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(314);expect(featureInfo(ID).needs).toBe("ram-state-v1");expect(featureInfo(ID).description).toContain(" Off: ");
 const old=featuresOf([]);expect(old[ID]).toBe(false);expect(flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false})[ID]).toBe(false);
 const {[ID]:omitted,...legacy}=old;expect(omitted).toBe(false);expect(normalizeFeatures(legacy)[ID]).toBe(false);
 expect(dependencyProblems({...old,[ID]:true})).toContain(`${ID} needs ram-state-v1`);
 expect(playHarnessFeatures({...old,"ram-state-v1":true,[ID]:true},null).at(-1)).toBe(ID);
 expect(stateOnlyProblems({...old,[ID]:true,"state-only-decisions-v1":true})).toContain(`state-only-decisions-v1 requires ${ID} OFF`);
});
it("production factory appends final evidence-bound user feedback and logs source IDs",async()=>{
 const s=factory(true);s.feed(state(),result());const input=messages(),out=await s.wiring.transformContext(input);
 expect(out.slice(0,-1)).toEqual(input);expect(out.at(-1)).toMatchObject({role:"user"});expect(out.at(-1)?.content).toContain("RUSTURF ENTRY FOLLOW-UP");expect(out.at(-1)?.content).toContain("X=6, Y=9");expect(s.notes).toEqual([{text:out.at(-1)?.content,evidence:[1,2],timing:"current"}]);expect(s.wiring.tools).toEqual([]);
});
it("OFF preserves exact production context and never produces a receipt",async()=>{const s=factory(false);s.feed(state(),result());const input=messages();expect(await s.wiring.transformContext(input)).toBe(input);expect(s.notes).toEqual([]);});
it("production recorder adapter propagates historical-restore suppression",async()=>{const s=factory(true,true);s.feed(state(),result());const input=messages();expect(await s.wiring.transformContext(input)).toEqual(input);expect(s.notes).toEqual([]);});
