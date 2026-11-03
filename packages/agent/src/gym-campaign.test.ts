import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {playGoal,playSystemPrompt,initialPlayTask,stableJitPrompts} from "./play-config.js";
import {contextTools} from "./play-wiring.js";
const mission="eight-badge-mission-v1",checklist="discovered-gym-checklist-v1";
const flags=(on=true)=>({...featuresOf([]),[checklist]:on});
const stringValue=(v:unknown):string=>typeof v==="string"?v:"";
const text='Screen: overworld\nLocation: DEWFORD TOWN (map 0/11)\nBadges: STONE\nSign text "DEWFORD TOWN POKéMON GYM | LEADER: BRAWLY | “A big wave in fighting!”" at (11,16), elevation 0; A';
const assistant=(seq:number)=>checkEvent({v:1,run:"r",seq,turn:1,t:"2026-10-28T00:00:00.000-04:00",type:"assistant",thinking:"",text:"ok",tool_calls:[],stop_reason:"stop",usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null});
function setup(on=true,extra:Partial<FeatureSet>={}){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const wiring=contextTools({...flags(on),...extra},{subscribe:f=>{listeners.push(f);},recordLedgerContext:n=>{notes.push(n);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
 const feed=(...es:RunEvent[])=>{for(const e of es)for(const f of listeners)f(e);};
 const state=(seq:number,badges:string[]=[],map:[number,number]=[0,11],run="r",location="DEWFORD TOWN")=>checkEvent({v:1,run,seq,turn:1,t:"2026-10-28T00:00:00.000-04:00",...IN_GAME,type:"state",map_id:map,badges,location});
 const result=(seq:number,body=text,extra:Record<string,unknown>={})=>checkEvent({v:1,run:"r",seq,turn:1,t:"2026-10-28T00:00:00.000-04:00",type:"tool_result",state_seq:seq-1,id:`c${String(seq)}`,name:"observe",text:body,is_error:false,duration_ms:1,frames:[],...extra});
 const history=(seq:number,body=text):AgentMessage[]=>[{role:"toolResult",toolCallId:`c${String(seq)}`,toolName:"observe",content:[{type:"text",text:body}],isError:false,timestamp:0}];
 return {wiring,feed,state,result,history,notes};
}
it("registers independent default-OFF features and records them only when enabled",()=>{
 for(const id of [mission,checklist] as const){expect(featureInfo(id).description).toContain(" Off: ");expect(normalizeFeatures(featuresOf([]))[id]).toBe(false);expect(playHarnessFeatures({...featuresOf([]),[id]:true},null)).toContain(id);}
 expect(featureInfo(checklist).description).toContain("Delivers a note on discovery");
});
it("mission changes untargeted goal, initial task and all JIT scenes but preserves explicit targets",()=>{
 const off=featuresOf([]),on={...off,[mission]:true};
 expect(playSystemPrompt(off,null)).not.toContain("all eight Gym Badges");
 expect(playGoal(null,on)).toContain("all eight Gym Badges");
 expect(initialPlayTask({kind:"boot"},null,on)).toContain("all eight Gym Badges");
 for(const open of [false,true])for(const scene of ["core","overworld","battle","menu","unknown"] as const){const f={...on,"open-goal-prompt-v1":open};expect(playSystemPrompt(f,null,scene)).toContain("all eight Gym Badges");expect(stableJitPrompts(f,null,scene==="core"?"unknown":scene).core).toContain("all eight Gym Badges");}
 expect(playGoal("STONE_BADGE",on)).toBe(playGoal("STONE_BADGE",off));expect(playSystemPrompt(on,"STONE_BADGE")).toBe(playSystemPrompt(off,"STONE_BADGE"));
});
it("OFF preserves exact context identity and adds no tools or receipts",async()=>{
 const s=setup(false);s.feed(s.state(1,["STONE"]),s.result(2));const h=s.history(2);expect(await s.wiring.transformContext(h)).toBe(h);expect(s.notes).toEqual([]);expect(s.wiring.tools).toEqual([]);
});
it("delivers on discovery, leave, re-enter and native badge completion — not as a heartbeat",async()=>{
 const s=setup();s.feed(s.state(1,["STONE"]),s.result(2));
 let out=await s.wiring.transformContext(s.history(2));
 expect(stringValue(out.at(-1)?.content)).toContain("DEWFORD TOWN GYM — unfinished; discovered at result 2");
 expect(stringValue(out.at(-1)?.content)).toContain("may defer");expect(s.notes.at(-1)?.evidence).toEqual([1,2]);
 s.feed(assistant(3));
 const stay="Screen: overworld\nLocation: DEWFORD TOWN\nBadges: STONE";
 s.feed(s.state(4,["STONE"],[0,11],"r","DEWFORD TOWN"),s.result(5,stay));
 expect(await s.wiring.transformContext(s.history(5,stay))).toEqual(s.history(5,stay));
 const away="Screen: overworld\nLocation: SLATEPORT CITY\nBadges: STONE";
 s.feed(s.state(6,["STONE"],[0,1],"r","SLATEPORT CITY"),s.result(7,away));
 out=await s.wiring.transformContext(s.history(7,away));
 expect(stringValue(out.at(-1)?.content)).toContain("Left DEWFORD TOWN");expect(stringValue(out.at(-1)?.content)).toContain("unfinished");
 s.feed(assistant(8));
 s.feed(s.state(9,["STONE"],[0,1],"r","SLATEPORT CITY"),s.result(10,away));
 expect(await s.wiring.transformContext(s.history(10,away))).toEqual(s.history(10,away));
 s.feed(s.state(11,["STONE"],[0,11],"r","DEWFORD TOWN"),s.result(12,stay));
 out=await s.wiring.transformContext(s.history(12,stay));
 expect(stringValue(out.at(-1)?.content)).toContain("Entered DEWFORD TOWN");
 s.feed(assistant(13));
 s.feed(s.state(14,["STONE","KNUCKLE"]));expect(await s.wiring.transformContext(s.history(12,stay))).toEqual(s.history(12,stay));
 s.feed(s.result(15,away,{is_error:true}));expect(await s.wiring.transformContext(s.history(15,away))).toEqual(s.history(15,away));
 s.feed(s.state(16,["STONE","KNUCKLE"],[0,11],"r","DEWFORD TOWN"),s.result(17,"Screen: overworld\nLocation: DEWFORD TOWN\nBadges: STONE, KNUCKLE"));
 out=await s.wiring.transformContext(s.history(17,"Screen: overworld\nLocation: DEWFORD TOWN\nBadges: STONE, KNUCKLE"));
 expect(stringValue(out.at(-1)?.content)).toContain("2/8");expect(stringValue(out.at(-1)?.content)).toContain("completed (native KNUCKLE badge)");expect(stringValue(out.at(-1)?.content)).not.toContain("unfinished");
});
it("does not discover hidden templates, historical summaries, model claims, wrong state refs or failed observations",async()=>{
 for(const [body,extra] of [["Historical place dialogue: DEWFORD TOWN GYM",{}],["Story goal: DEWFORD TOWN GYM",{}],["Offscreen template: DEWFORD TOWN GYM",{}],[text,{is_error:true}],[text,{state_seq:99}]] as const){const s=setup();s.feed(s.state(1),s.result(2,body,extra));const out=await s.wiring.transformContext(s.history(2,body));expect(JSON.stringify(out)).not.toContain("discovered at result");}
});
it("rejects cross-run evidence while retaining a due discovery after pruning until an assistant reply",async()=>{
 const s=setup();s.feed(s.state(1,[],[0,11],"other"),s.result(2));expect(await s.wiring.transformContext(s.history(2))).toEqual(s.history(2));
 const b=setup();b.feed(b.state(1),b.result(2));expect(stringValue((await b.wiring.transformContext(b.history(2,"compacted"))).at(-1)?.content)).toContain("DEWFORD TOWN GYM — unfinished");expect(stringValue((await b.wiring.transformContext(b.history(99))).at(-1)?.content)).toContain("DEWFORD TOWN GYM — unfinished");
 b.feed(assistant(3));expect(await b.wiring.transformContext(b.history(99))).toEqual(b.history(99));
});
it("a deferred Petalburg gym discovery does not order a battle or block an exit",async()=>{
 const s=setup(),p='Screen: overworld\nLocation: PETALBURG CITY\nSign text "PETALBURG CITY POKéMON GYM | LEADER: NORMAN"';s.feed(s.state(1,[],[0,0],"r","PETALBURG CITY"),s.result(2,p));const out=await s.wiring.transformContext(s.history(2,p));expect(stringValue(out.at(-1)?.content)).toContain("PETALBURG CITY GYM — unfinished");expect(stringValue(out.at(-1)?.content)).toContain("may defer");expect(s.wiring.tools).toEqual([]);
});
it("completes each of the eight gyms only with its own native badge",async()=>{
 const towns=["RUSTBORO CITY","DEWFORD TOWN","MAUVILLE CITY","LAVARIDGE TOWN","PETALBURG CITY","FORTREE CITY","MOSSDEEP CITY","SOOTOPOLIS CITY"],badges=["STONE","KNUCKLE","DYNAMO","HEAT","BALANCE","FEATHER","MIND","RAIN"];
 for(const [i,town] of towns.entries()){
  const s=setup(),body=`Screen: overworld\nLocation: ${town} GYM`;
  s.feed(s.state(1,[badges[(i+1)%8]??"STONE"],[0,0],"r",`${town} GYM`),s.result(2,body));expect(stringValue((await s.wiring.transformContext(s.history(2,body))).at(-1)?.content)).toContain(`${town} GYM — unfinished`);
  s.feed(assistant(3),s.state(4,[badges[i]??"STONE"],[0,0],"r",`${town} GYM`),s.result(5,body));expect(stringValue((await s.wiring.transformContext(s.history(5,body))).at(-1)?.content)).toContain("completed");expect(stringValue((await s.wiring.transformContext(s.history(5,body))).at(-1)?.content)).not.toContain("unfinished");
 }
});
it("keeps a due discovery through unknown state and does not invent completion from it",async()=>{
 const s=setup();s.feed(s.state(1,["STONE"]),s.result(2));await s.wiring.transformContext(s.history(2));
 const body="Screen: unknown\nPlayer defeated BRAWLY!\nLocation: DEWFORD TOWN";
 const unknown=checkEvent({...s.state(3,["STONE","KNUCKLE"]),screen:"unknown"});s.feed(unknown,s.result(4,body));expect(stringValue((await s.wiring.transformContext(s.history(4,body))).at(-1)?.content)).toContain("DEWFORD TOWN GYM — unfinished");
 const b=setup();b.feed(unknown,b.result(4,body));expect(await b.wiring.transformContext(b.history(4,body))).toEqual(b.history(4,body));
});
it("uses only delivered field dialogue, not a pending, failed, battle or future page",async()=>{
 for(const mode of ["field","pending","battle","future","failed"]){
  const s=setup(),body="Screen: overworld\nLocation: GRANITE CAVE";
  const page={state_seq:mode==="future"?99:1,map:"GRANITE CAVE",map_id:[24,7],position:{x:1,y:1},speaker:null,speaker_source:null,text:"But, to use it, you need the GYM BADGE\nfrom DEWFORD's POKéMON GYM.",...(mode==="battle"?{battle_turn:1}:{})};
  s.feed(s.state(1,[ ],[24,7],"r","GRANITE CAVE"),checkEvent({v:1,run:"r",seq:2,turn:1,t:"2026-10-28T00:00:00.000-04:00",type:"dialogue_auto_advance",tool_call_id:"c4",pages:[page],tool:"observe",requested:[],sent:[],dropped:[],auto_presses:1,stop:"field_free",detail:"fixture",duration_ms:1}));
  if(mode!=="pending")s.feed(s.state(3,[],[24,7],"r","GRANITE CAVE"),s.result(4,`${body}\n${page.text}`,{is_error:mode==="failed"}));
  const out=await s.wiring.transformContext(s.history(4,`${body}\n${page.text}`));expect(stringValue(out.at(-1)?.content).includes("DEWFORD TOWN GYM — unfinished")).toBe(mode==="field");
 }
});
it("does not invent a goal from a state poll, pregame or unbound tool output",async()=>{
 const s=setup();s.feed(s.result(2));expect(await s.wiring.transformContext(s.history(2))).toEqual(s.history(2));
 s.feed(checkEvent({...s.state(3),started:false}),s.result(4));expect(await s.wiring.transformContext(s.history(4))).toEqual(s.history(4));
 s.feed(s.state(5),s.result(6,text,{state_seq:undefined}));expect(await s.wiring.transformContext(s.history(6))).toEqual(s.history(6));
});
it("does not match town-only mentions and remembers only delivered evidence after replay",async()=>{
 const s=setup(),body="Screen: overworld\nLocation: DEWFORD TOWN\nDialog: GYM?";s.feed(s.state(1),s.result(2,body));expect(stringValue((await s.wiring.transformContext(s.history(2,body))).at(-1)?.content)).not.toContain("DEWFORD TOWN GYM — unfinished");
 s.feed(s.state(3),s.result(4));await s.wiring.transformContext(s.history(4));
 s.feed(assistant(5));
 const away="Screen: overworld\nLocation: SLATEPORT CITY\nBadges: STONE";
 s.feed(s.state(6,["STONE"],[0,1],"r","SLATEPORT CITY"),s.result(7,away));await s.wiring.transformContext(s.history(7,away));
 s.feed(assistant(8),s.state(9),s.result(10,body));
 const out=await s.wiring.transformContext(s.history(10,body));
 expect(stringValue(out.at(-1)?.content)).toContain("Entered DEWFORD TOWN");expect(stringValue(out.at(-1)?.content)).toContain("discovered at result 4");
});

it("replays GLM discovery without heartbeat-delivering every later result",async()=>{
 const raw:unknown[]=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/gym-campaign-6bbd.json.gz",import.meta.url))).toString()) as unknown[];
 const s=setup();
 let deliveries=0,sawDiscovery=false;
 const results=raw.filter(e=>(e as {type?:string}).type==="tool_result").length;
 for(const e of raw.map(checkEvent)){
  s.feed(e);
  if(e.type!=="tool_result")continue;
  const input:AgentMessage[]=[{role:"toolResult",toolCallId:e.id,toolName:e.name,content:[{type:"text",text:e.text}],isError:false,timestamp:0}];
  const before=s.notes.length,out=await s.wiring.transformContext(input),note=stringValue(out.at(-1)?.content);
  if(s.notes.length>before){deliveries++;if(note.includes("discovered at result 66304"))sawDiscovery=true;expect(note).not.toContain("BRAWLY");}
 }
 expect(sawDiscovery).toBe(true);expect(deliveries).toBeGreaterThan(0);expect(deliveries).toBeLessThanOrEqual(results);expect(deliveries).toBeLessThanOrEqual(4);
});

it.each([
 ["Are you off to FORTREE GYM next?","FORTREE CITY"],
 ["See? This is PETALBURG CITY's GYM.","PETALBURG CITY"],
 ["See? This is PETALBURG CITY’s GYM.","PETALBURG CITY"],
])("recognizes source-owned gym dialogue forms: %s",async(line,town)=>{
 const s=setup(),body=`Screen: overworld\nLocation: ROUTE 119\nDialogue shown during this call:\n${line}`;
 s.feed(s.state(1,[],[0,34],"r","ROUTE 119"),checkEvent({v:1,run:"r",seq:2,turn:1,t:"2026-10-28T00:00:00.000-04:00",type:"dialogue_auto_advance",tool_call_id:"c4",tool:"observe",requested:[],sent:[],dropped:[],auto_presses:1,stop:"field_free",detail:"pret Route119_Text_ScottWayToGoBeSeeingYou / PetalburgCity_Text_ThisIsPetalburgGym",duration_ms:1,pages:[{state_seq:1,map:"ROUTE119",map_id:[0,34],position:null,speaker:null,speaker_source:null,text:line}]}),s.state(3,[],[0,34],"r","ROUTE 119"),s.result(4,body));
 expect(stringValue((await s.wiring.transformContext(s.history(4,body))).at(-1)?.content)).toContain(`${town} GYM — unfinished`);
});

it("keeps a due discovery after stateless memory results until an assistant reply",async()=>{
 const s=setup();s.feed(s.state(1,["STONE"]),s.result(2));await s.wiring.transformContext(s.history(2));
 for(const [name,is_error] of [["get_dialogue",false],["get_instruction_goals",false],["navigate_to",true]] as const){
  s.feed(s.result(3,"Memory tool response",{name,state_seq:undefined,is_error}));
  const out=await s.wiring.transformContext([{role:"toolResult",toolCallId:"c3",toolName:name,content:[{type:"text",text:"Memory tool response"}],isError:is_error,timestamp:0}]);
  expect(stringValue(out.at(-1)?.content)).toContain("DEWFORD TOWN GYM — unfinished; discovered at result 2");
 }
 s.feed(assistant(4));
 expect(await s.wiring.transformContext([{role:"toolResult",toolCallId:"c5",toolName:"observe",content:[{type:"text",text:"Memory tool response"}],isError:false,timestamp:0}])).toEqual([{role:"toolResult",toolCallId:"c5",toolName:"observe",content:[{type:"text",text:"Memory tool response"}],isError:false,timestamp:0}]);
});
it("discovers a source-owned gym in the native Dialog readout with auto-advance OFF",async()=>{
 const s=setup(),body='Screen: overworld\nDialog: "See? This is PETALBURG CITY\'s GYM."\nLocation: PETALBURG CITY';
 s.feed(s.state(1,[],[0,0],"r","PETALBURG CITY"),s.result(2,body));expect(stringValue((await s.wiring.transformContext(s.history(2,body))).at(-1)?.content)).toContain("PETALBURG CITY GYM — unfinished");
});
it("recognizes the game's reversed short gym name in delivered dialogue",async()=>{
 const s=setup(),body='Screen: overworld\nDialog: "BADGE from the GYM in FORTREE."\nLocation: SOOTOPOLIS CITY';
 s.feed(s.state(1,[],[0,7],"r","SOOTOPOLIS CITY"),s.result(2,body));expect(stringValue((await s.wiring.transformContext(s.history(2,body))).at(-1)?.content)).toContain("FORTREE CITY GYM — unfinished");
});
it("preserves existing type-gap last-message priority with checklist ON",async()=>{
 const fixture=JSON.parse(readFileSync(new URL("../test-support/type-gap-replay-cases.json",import.meta.url),"utf8")) as {recorded:{block:string}[]};
 const block=fixture.recorded[0]?.block;if(block===undefined)throw Error("fixture");
 const s=setup(true,{"type-gap-team-v1":true,"type-gap-team-last-message-v1":true}),body=`${text}\n${block}`;
 s.feed(s.state(1),s.result(2,body));const out=await s.wiring.transformContext(s.history(2,body));
 expect(stringValue(out.at(-1)?.content)).toBe(block);expect(out.some(m=>typeof m.content==="string"&&m.content.startsWith("DISCOVERED GYM CHECKLIST"))).toBe(true);
});
it("preserves existing scene-followup priority with checklist ON",async()=>{
 const fixture=JSON.parse(readFileSync(new URL("../test-support/scene-followup-events.json",import.meta.url),"utf8")) as Record<string,{event:RunEvent}>;
 const raw=fixture["theft-9e33"]?.event;if(raw?.type!=="dialogue_auto_advance")throw Error("fixture");
 const s=setup(true,{"scene-followup-prompt-v1":true});
 s.feed(s.state(200000),checkEvent({...raw,run:"r",tool_call_id:"c200001"}),s.result(200001));const out=await s.wiring.transformContext(s.history(200001));
 expect(stringValue(out.at(-1)?.content)).toContain("SUPERVISOR: You just watched a scene");expect(out.some(m=>typeof m.content==="string"&&m.content.startsWith("DISCOVERED GYM CHECKLIST"))).toBe(true);
});
it("pins appended campaign switch identity without changing existing positions",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(mission)).toBe(308);expect(SWITCHABLE_FEATURES.indexOf(checklist)).toBe(309);
});
