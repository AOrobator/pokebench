import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,featureInfo,playHarnessFeatures} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {playGoal,playSystemPrompt,initialPlayTask,stableJitPrompts} from "./play-config.js";
import {contextTools} from "./play-wiring.js";
const mission="eight-badge-mission-v1",checklist="discovered-gym-checklist-v1";
const flags=(on=true)=>({...featuresOf([]),[checklist]:on});
const text='Screen: overworld\nLocation: DEWFORD TOWN (map 0/11)\nBadges: STONE\nSign text "DEWFORD TOWN POKéMON GYM | LEADER: BRAWLY | “A big wave in fighting!”" at (11,16), elevation 0; A';
function setup(on=true){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const wiring=contextTools(flags(on),{subscribe:f=>{listeners.push(f);},recordLedgerContext:n=>{notes.push(n);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
 const feed=(...es:RunEvent[])=>{for(const e of es)for(const f of listeners)f(e);};
 const state=(seq:number,badges:string[]=[],map:[number,number]=[0,11],run="r")=>checkEvent({v:1,run,seq,turn:1,t:"2026-10-28T00:00:00.000-04:00",...IN_GAME,type:"state",map_id:map,badges});
 const result=(seq:number,body=text,extra:Record<string,unknown>={})=>checkEvent({v:1,run:"r",seq,turn:1,t:"2026-10-28T00:00:00.000-04:00",type:"tool_result",state_seq:seq-1,id:`c${seq}`,name:"observe",text:body,is_error:false,duration_ms:1,frames:[],...extra});
 const history=(seq:number,body=text):AgentMessage[]=>[{role:"toolResult",toolCallId:`c${seq}`,toolName:"observe",content:[{type:"text",text:body}],isError:false,timestamp:0}];
 return {wiring,feed,state,result,history,notes};
}
it("registers independent default-OFF features and records them only when enabled",()=>{
 for(const id of [mission,checklist]){expect(featureInfo(id).description).toContain(" Off: ");expect(normalizeFeatures(featuresOf([]))[id]).toBe(false);expect(playHarnessFeatures({...featuresOf([]),[id]:true},null)).toContain(id);}
});
it("mission changes untargeted goal, initial task and all JIT scenes but preserves explicit targets",()=>{
 const off=featuresOf([]),on={...off,[mission]:true};
 expect(playSystemPrompt(off,null)).not.toContain("all eight Gym Badges");
 expect(playGoal(null,on)).toContain("all eight Gym Badges");
 expect(initialPlayTask({kind:"boot"},null,on)).toContain("all eight Gym Badges");
 for(const open of [false,true])for(const scene of ["core","overworld","battle","menu","unknown"] as const){const f={...on,"open-goal-prompt-v1":open};expect(playSystemPrompt(f,null,scene)).toContain("all eight Gym Badges");expect(stableJitPrompts(f,null,scene).core).toContain("all eight Gym Badges");}
 expect(playGoal("STONE_BADGE",on)).toBe(playGoal("STONE_BADGE",off));expect(playSystemPrompt(on,"STONE_BADGE")).toBe(playSystemPrompt(off,"STONE_BADGE"));
});
it("OFF preserves exact context identity and adds no tools or receipts",async()=>{
 const s=setup(false);s.feed(s.state(1,["STONE"]),s.result(2));const h=s.history(2);expect(await s.wiring.transformContext(h)).toBe(h);expect(s.notes).toEqual([]);expect(s.wiring.tools).toEqual([]);
});
it("factory persists a discovered gym across travel and compaction; only a delivered native badge closes it",async()=>{
 const s=setup();s.feed(s.state(1,["STONE"]),s.result(2));let out=await s.wiring.transformContext(s.history(2));expect(out.at(-1)).toMatchObject({content:expect.stringContaining("DEWFORD TOWN GYM — unfinished; discovered at result 2")});expect(s.notes.at(-1)?.evidence).toEqual([1,2]);
 const away="Screen: overworld\nLocation: SLATEPORT CITY\nBadges: STONE";s.feed(s.state(3,["STONE"],[0,1]),s.result(4,away));out=await s.wiring.transformContext(s.history(4,away));expect(out.at(-1)).toMatchObject({content:expect.stringContaining("DEWFORD TOWN GYM — unfinished")});
 // A private poll, an assistant claim and a failed result cannot earn a badge.
 s.feed(s.state(5,["STONE","KNUCKLE"]));expect((await s.wiring.transformContext(s.history(4,away))).at(-1)).toMatchObject({content:expect.stringContaining("unfinished")});
 s.feed(s.result(6,away,{is_error:true}));expect(await s.wiring.transformContext(s.history(6,away))).toEqual(s.history(6,away));
 s.feed(s.state(7,["STONE","KNUCKLE"],[0,11]),s.result(8,"Screen: overworld\nLocation: DEWFORD TOWN\nBadges: STONE, KNUCKLE"));out=await s.wiring.transformContext(s.history(8,"Screen: overworld\nLocation: DEWFORD TOWN\nBadges: STONE, KNUCKLE"));expect(out.at(-1)).toMatchObject({content:expect.stringContaining("2/8")});expect(String(out.at(-1)?.content)).not.toContain("DEWFORD TOWN GYM — unfinished");
});
it("does not discover hidden templates, historical summaries, model claims, wrong state refs or failed observations",async()=>{
 for(const [body,extra] of [["Historical place dialogue: DEWFORD TOWN GYM",{}],["Story goal: DEWFORD TOWN GYM",{}],["Offscreen template: DEWFORD TOWN GYM",{}],[text,{is_error:true}],[text,{state_seq:99}]] as const){const s=setup();s.feed(s.state(1),s.result(2,body,extra));const out=await s.wiring.transformContext(s.history(2,body));expect(JSON.stringify(out)).not.toContain("discovered at result");}
});
it("rejects cross-run evidence and stale or missing delivery in the request",async()=>{
 const s=setup();s.feed(s.state(1,[],[0,11],"other"),s.result(2));expect(await s.wiring.transformContext(s.history(2))).toEqual(s.history(2));
 const b=setup();b.feed(b.state(1),b.result(2));expect(await b.wiring.transformContext(b.history(2,"compacted"))).toEqual(b.history(2,"compacted"));expect(await b.wiring.transformContext(b.history(99))).toEqual(b.history(99));
});
it("a deferred Petalburg gym persists without ordering a battle or blocking an exit",async()=>{
 const s=setup(),p='Screen: overworld\nLocation: PETALBURG CITY\nSign text "PETALBURG CITY POKéMON GYM | LEADER: NORMAN"';s.feed(s.state(1,[],[0,0]),s.result(2,p));const out=await s.wiring.transformContext(s.history(2,p));expect(String(out.at(-1)?.content)).toContain("PETALBURG CITY GYM — unfinished");expect(String(out.at(-1)?.content)).toContain("may defer");expect(s.wiring.tools).toEqual([]);
});
