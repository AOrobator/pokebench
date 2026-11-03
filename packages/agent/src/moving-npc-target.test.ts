import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {FrameStore} from "./frames.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {parseEvent} from "./events.js";
import {RUN_START_META} from "../test-support/events.js";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {parseTrainerSight,SIGHT_STATUS,type TrainerSightReply,type TrainerSightCheck} from "./trainer-sight.js";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {Button} from "./events.js";
import {featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {MOVING_NPC_SENTENCE} from "./semantic-navigation.js";
import {playGameTools} from "./play-wiring.js";

const ID="moving-npc-target-v1";
const request={map_id:[0,9],target:{kind:"object",local_id:2}};
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const npc=(x:number,y=1):Target=>({kind:"object",x,y,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:2,native_slot:2,destination:null,name:"PERSON"});
function place(state:GameStateSnapshot,targets:readonly Target[]):GameStateSnapshot {
 return {...state,interaction_targets:[...targets],interaction_object_slots:targets.map(t=>({slot:t.native_slot??2,local_id:t.local_id??2,x:t.x,y:t.y,elevation:t.elevation,map_id:[0,9],is_player:false})),navigation_grid:{elevation:3,tiles:Array.from({length:7},(_,x)=>[0,1,2].map(y=>({x,y,collision:0,behavior:0,elevation:3}))).flat(),objects:targets.map(t=>({x:t.x,y:t.y})),warps:[]}};
}
const field=()=>place({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:1},facing:"right",field_controls_locked:false},[npc(3)]);
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
function fixture(on=true,after?:(state:GameStateSnapshot,buttons:readonly Button[],count:number)=>GameStateSnapshot,before?:(state:GameStateSnapshot,button:Button|undefined)=>GameStateSnapshot,overrides:Partial<FeatureSet>={},sightReply?:TrainerSightReply,onRead?:(state:GameStateSnapshot,read:number)=>GameStateSnapshot){
 let current=field(),reads=0;const sent:Button[][]=[],sightRecords:TrainerSightCheck[]=[];
 const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"image" as const,data:`frame-${String(Date.now())}`,mimeType:"image/png"},{type:"text" as const,text:"state"}],details:{state:current}})};
 const checked={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(id:string,args:{buttons:Button[]})=>checked.executeChecked(id,args,()=>undefined),executeChecked:(_id:string,args:{buttons:Button[]},check:(state:GameStateSnapshot)=>void)=>{
  current=before?.(current,args.buttons[0])??current;check(current);sent.push(args.buttons);
  const button=args.buttons[0];if(button==="A")current={...current,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:"Hello"}};
  else if(button!==undefined){const facing=button.toLowerCase();if(current.facing!==facing)current={...current,facing};else {const dx=button==="RIGHT"?1:button==="LEFT"?-1:0,dy=button==="DOWN"?1:button==="UP"?-1:0;current={...current,position:{x:(current.position?.x??0)+dx,y:(current.position?.y??0)+dy}};}}
  current=after?.(current,args.buttons,sent.length)??current;return Promise.resolve(result(current));
 }} as unknown as CheckedPressTool;
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true,[ID]:on,...overrides};
 const recorder={trainerSightCheck:(check:TrainerSightCheck)=>{sightRecords.push(check);},subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
 const tools=playGameTools([observe,checked],features,{read:()=>{reads+=1;current=onRead?.(current,reads)??current;return Promise.resolve(current);},trainerSight:()=>Promise.resolve(sightReply??{available:false,reason:"fixture"})},recorder);
 const tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing tool");
 return {sent,tool,sightRecords,state:()=>current,set:(state:GameStateSnapshot)=>{current=state;}};
}
const BURST="moving-npc-frame-burst-v1";
const images=(out:AgentToolResult<unknown>)=>out.content.filter(part=>part.type==="image");
it("defaults OFF and records only explicitly enabled moving target support",()=>{
 const flags=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 const {[ID]:omitted,...old}=flags;expect(omitted).toBe(false);expect(normalizeFeatures(old)[ID]).toBe(false);
 expect(flags[ID]).toBe(false);expect(featureInfo(ID).description).toContain("Off:");expect(playHarnessFeatures({...flags,[ID]:true},null)).toContain(ID);
});
it("defaults frame burst OFF, pins registry append index, and puts it in both arms of the current recipe",()=>{
 const flags=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 const {[BURST]:omitted,...old}=flags;expect(omitted).toBe(false);expect(normalizeFeatures(old)[BURST]).toBe(false);
 expect(flags[BURST]).toBe(false);expect(featureInfo(BURST).description).toContain("Off:");expect(featureInfo(BURST).needs).toBeNull();
 expect(featureInfo(BURST).description).toContain("on in both arms of the current recipe");
 expect(featureInfo(BURST).group).toBe("observation");
 expect(SWITCHABLE_FEATURES.indexOf(BURST)).toBe(317);
 expect(playHarnessFeatures({...flags,[BURST]:true},null).at(-1)).toBe(BURST);
 const recipe=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {features:Record<string,boolean>;switches:string[];onInBoth:string[];offInBoth:string[]};
 expect(recipe.features[BURST]).toBe(true);expect(recipe.switches).not.toContain(BURST);
 expect(recipe.onInBoth.filter(id=>id===BURST)).toEqual([BURST]);expect(recipe.offInBoth).not.toContain(BURST);
 expect(recipe.onInBoth).toContain(ID);
});
it("production path follows a moving NPC, faces its new tile and presses A once",async()=>{
 const f=fixture(true,(s,_b,n)=>n===1?place(s,[npc(4,2)]):s);
 const out=await f.tool.execute("follow",request);
 expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true,status:"activation handed control back: dialogue or a field message opened"}});
 expect(f.state().position).toEqual({x:4,y:1});expect(f.state().facing).toBe("down");
 expect(images(out)).toEqual([]);
});
it("ON frame burst delivers multiple chronological screenshots with the follow result; OFF keeps none from observe",async()=>{
 const move=(s:GameStateSnapshot,_b:readonly Button[],n:number)=>n===1?place(s,[npc(4,2)]):s;
 const off=await fixture(true,move).tool.execute("off-burst",request);
 const on=await fixture(true,move,undefined,{[BURST]:true}).tool.execute("on-burst",request);
 expect(images(off)).toEqual([]);
 expect(images(on).length).toBeGreaterThanOrEqual(2);
 expect(images(on).length).toBeLessThanOrEqual(6);
 expect(on.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});
it("OFF preserves the first-movement abort and never talks",async()=>{
 const f=fixture(false,(s,_b,n)=>n===1?place(s,[npc(4,2)]):s);
 const out=await f.tool.execute("off",request);
 expect(f.sent).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false,status:"semantic target moved during travel"}});
});
it("stays when the NPC steps to a tile that keeps the current approach valid",async()=>{
 // Player at (4,1) is an approach for NPC at (3,1) (face LEFT) and for NPC at (5,1) (face RIGHT).
 let moved=false;const f=fixture(true,undefined,(s,b)=>{
  if(b==="A"&&!moved){moved=true;return place(s,[npc(5,1)]);}
  return s;
 });
 f.set({...field(),position:{x:4,y:1},facing:"left"});
 const out=await f.tool.execute("stay-approach",request);
 expect(moved).toBe(true);expect(f.state().position).toEqual({x:4,y:1});expect(f.sent.filter(b=>b[0]==="RIGHT"||b[0]==="LEFT"||b[0]==="UP"||b[0]==="DOWN")).toEqual([["RIGHT"]]);expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});
it("replans when the NPC moves during facing instead of pressing A at an empty tile",async()=>{
 let moved=false;const f=fixture(true,(s,b)=>{if(b[0]==="DOWN"&&!moved){moved=true;return place(s,[npc(5,2)]);}return s;});f.set({...field(),position:{x:3,y:0}});
 const out=await f.tool.execute("face",request);
 expect(moved).toBe(true);expect(f.state().position).toEqual({x:5,y:1});expect(f.state().facing).toBe("down");expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});
it("rechecks the recipient in the A precondition and follows a last-moment move",async()=>{
 let moved=false;const f=fixture(true,undefined,(s,b)=>{if(b==="A"&&!moved){moved=true;return place(s,[npc(5,2)]);}return s;});
 const out=await f.tool.execute("race",request);
 expect(moved).toBe(true);expect(f.state().position).toEqual({x:5,y:1});expect(f.state().facing).toBe("down");expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});
it.each(["gone","identity","battle","map","script","menu"] as const)("stops immediately for %s",async kind=>{
 const f=fixture(true,(s,_b,n)=>n!==1?s:kind==="gone"?place(s,[]):kind==="identity"?place(s,[{...npc(4),native_slot:3}]):kind==="battle"?{...s,in_battle:true,screen:"battle"}:kind==="map"?{...s,map_id:[1,2]}:kind==="script"?{...s,field_controls_locked:true}:{...s,screen:"menu"});
 const out=await f.tool.execute(kind,request);expect(f.sent).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});
it("does not talk to a different native recipient at the same tile",async()=>{
 const f=fixture(true,undefined,(s,b)=>b==="A"?{...s,interaction_object_slots:[{slot:1,local_id:9,x:3,y:1,elevation:3,map_id:[0,9],is_player:false},...(s.interaction_object_slots??[])]}:s);
 const out=await f.tool.execute("recipient",request);expect(f.sent.some(b=>b[0]==="A")).toBe(false);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});
it("bounds a continuously moving target even when no further input is submitted",async()=>{
 let checks=0;const f=fixture(true,undefined,s=>{checks++;return place(s,[npc(s.interaction_targets?.[0]?.x===3?4:3)]);});
 const out=await f.tool.execute("budget",request);
 expect(f.sent.some(b=>b[0]==="A")).toBe(false);
 expect(f.sent.filter(b=>b[0]==="RIGHT").length).toBeGreaterThan(0);
 expect(checks).toBeGreaterThan(0);
 expect(out.details).toMatchObject({semantic_navigation:{status:"moving target attempt limit reached; inspect the current state",activation_attempted:false}});
});

it("keeps walking when the target drifts before each step instead of burning the bound at 0 moves",async()=>{
 // Briney cottage shape: NPC walks every pre-input check; old ON aborted each navigate with
 // "moving target position changed before input; 0 bounded movement actions" and never stepped.
 let checks=0;const f=fixture(true,undefined,s=>{checks++;const x=s.interaction_targets?.[0]?.x??3;return place(s,[npc(x===3?4:3)]);});
 const out=await f.tool.execute("drift-walk",request);
 expect(f.sent.filter(b=>b[0]==="RIGHT").length).toBeGreaterThan(0);
 expect(checks).toBeGreaterThan(0);
 // Continuous pre-input flips prevent a clean A; progress is the walked steps, not a 0-move limit.
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false,status:"moving target attempt limit reached; inspect the current state"}});
 expect((out.details as {semantic_navigation:{status:string}}).semantic_navigation.status).not.toContain("0 bounded");
});
it("replans when navigate refuses an approach the NPC just occupied",async()=>{
 // Player one tile shy of approach (2,1) for NPC at (3,1). After followObject chooses (2,1), the
 // next state read (navigate's plan) parks the NPC on that tile so the destination is occupied.
 let parked=false;
 const f=fixture(true,undefined,undefined,{},undefined,(s,read)=>{
  if(!parked&&read>=2&&(s.interaction_targets?.[0]?.x??0)===3){parked=true;return place(s,[npc(2,1)]);}
  return s;
 });
 f.set({...field(),position:{x:1,y:1},facing:"right"});
 const out=await f.tool.execute("occupy-approach",request);
 expect(parked).toBe(true);
 const status=(out.details as {semantic_navigation:{status:string}}).semantic_navigation.status;
 expect(status).not.toMatch(/person or object|cannot stand on/i);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
 expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);
});

it("documents the ON bound in tool and system prompt, preserving OFF bytes",()=>{
 const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 const base={...off,"semantic-navigation-v1":true,"bounded-navigation-v1":true};
 expect(fixture(true).tool.description).toContain(MOVING_NPC_SENTENCE);
 expect(fixture(false).tool.description).not.toContain(MOVING_NPC_SENTENCE);
 expect(playSystemPrompt({...base,[ID]:true},null)).toContain(MOVING_NPC_SENTENCE);
 expect(playSystemPrompt({...base,[ID]:false},null)).toBe(playSystemPrompt(base,null));
});

it("reaches a stationary NPC without changing the original interaction result",async()=>{
 const on=fixture(),off=fixture(false);
 const a=await on.tool.execute("on",request),b=await off.tool.execute("off",request);
 expect(on.sent).toEqual(off.sent);expect(a).toEqual(b);
});
it("returns without input when no valid approach is reachable",async()=>{
 const f=fixture();f.set({...field(),navigation_grid:{elevation:3,tiles:[{x:0,y:1,collision:0,behavior:0,elevation:3}],objects:[{x:3,y:1}],warps:[]}});
 const out=await f.tool.execute("unreachable",request);
 expect(f.sent).toEqual([]);expect(out.details).toMatchObject({semantic_navigation:{status:"no supported route to a valid approach",activation_attempted:false}});
});

it.each(["slot","elevation","activation"] as const)("rejects a changed %s as identity drift",async change=>{
 const f=fixture(true,(s,_b,n)=>n!==1?s:place(s,[{...npc(4),...(change==="slot"?{native_slot:3}:change==="elevation"?{elevation:4}:{activation:"step"})}]));
 const out=await f.tool.execute(change,request);
 expect(f.sent).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{status:"selected moving object disappeared or changed identity",activation_attempted:false}});
});
it("respects the existing matching script boundary instead of following through it",async()=>{
 // The script boundary has no switch; it needs the two switches that make coordinate scripts visible.
 const f=fixture(true,undefined,undefined,{"navigation-truth-v1":true,"coordinate-script-conditions-v1":true});
 f.set({...field(),navigation_grid:{elevation:3,tiles:[0,1,2,3].map(x=>({x,y:1,collision:0,behavior:0,elevation:3})),objects:[{x:3,y:1}],warps:[]},world_context:{objects:[],dialogue:null,triggers:[{x:1,y:1,elevation:0,variable:16385,required_value:0,current_value:0,condition_met:true,script_pointer:134217729}]}});
 const out=await f.tool.execute("trigger",request);
 expect(f.sent).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false,status:"script-trigger step attempted at (1,1); inspect the resulting state"}});
});

it("records the production result text, paired final state and semantic activation receipt",async()=>{
 const f=fixture(true,(s,_b,n)=>n===1?place(s,[npc(4,2)]):s,undefined,{"semantic-navigation-v1":false,"semantic-navigation-v2":true});
 const out=await f.tool.execute("recorded-follow",request);
 const root=mkdtempSync(join(tmpdir(),"pokebench-moving-rec-"));
 try{
  const log=RunLog.create(root,"2026-10-24T15-00-00_moving-npc_test");
  const recorder=new RunRecorder({log,frames:new FrameStore(root,10000,()=>undefined),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(f.state())}});
  await recorder.start({...RUN_START_META,harness_features:["semantic-navigation-v2",ID]},false);
  await recorder.emit({type:"tool_execution_start",toolCallId:"recorded-follow",toolName:"navigate_to_target",args:request});
  await recorder.emit({type:"tool_execution_end",toolCallId:"recorded-follow",toolName:"navigate_to_target",isError:false,result:out});
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>parseEvent(line));
  const recorded=events.find(e=>e.type==="tool_result");if(recorded?.type!=="tool_result")throw new Error("missing recorded result");
  expect(recorded.semantic_navigation).toEqual({target:request.target,activation_attempted:true});
  expect(recorded.text).toContain("activation handed control back: dialogue or a field message opened");
  expect(events.find(e=>e.type==="state"&&e.seq===recorded.state_seq)).toMatchObject({position:{x:4,y:1},facing:"down"});
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("shares the 32-attempt budget across navigation segments",async()=>{
 const f=fixture(),initial=place(field(),[npc(40)]);
 f.set({...initial,navigation_grid:{elevation:3,tiles:Array.from({length:41},(_,x)=>({x,y:1,collision:0,behavior:0,elevation:3})),objects:[{x:40,y:1}],warps:[]}});
 const out=await f.tool.execute("long-follow",request);
 expect(f.sent).toEqual(Array.from({length:32},()=>["RIGHT"]));
 expect(f.state().position).toEqual({x:32,y:1});
 expect(out.details).toMatchObject({semantic_navigation:{status:"moving target attempt limit reached; inspect the current state",activation_attempted:false}});
});

it.each([true,false])("preserves selected-trainer exclusion and other-trainer refusal (selected=%s)",async selected=>{
 const fixtureReply=JSON.parse(readFileSync(new URL("../test-support/trainer-sight-b300.json",import.meta.url),"utf8")) as {replies:{turn501:{reply:unknown}}};
 const native=parseTrainerSight(fixtureReply.replies.turn501.reply);if(!native.available)throw new Error("native fixture unavailable");
 const trainer=native.trainers[0],sighting=native.sightings[0];if(trainer===undefined||sighting===undefined)throw new Error("missing sight fixture");
 const local_id=selected?2:9,reply={...native,map_id:[0,9] as [number,number],trainers:[{...trainer,local_id}],sightings:[{...sighting,local_id}]};
 const f=fixture(true,undefined,undefined,{"trainer-sight-check-v1":true,"trainer-sight-check-v2":true},reply);
 const out=await f.tool.execute("sight-follow",request);
 if(selected){expect(f.sightRecords.map(r=>r.outcome)).toEqual(["clear","clear"]);expect(f.sent).toEqual([["RIGHT"],["RIGHT"],["A"]]);}
 else {expect(f.sightRecords.map(r=>r.outcome)).toEqual(["refused"]);expect(f.sent).toEqual([]);expect(out.details).toMatchObject({semantic_navigation:{status:SIGHT_STATUS,activation_attempted:false}});}
});
