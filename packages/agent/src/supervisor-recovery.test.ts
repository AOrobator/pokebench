import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {featureInfo,playHarnessFeatures} from "./features.js";
import {flagFeatures} from "./play-preset.js";
const ids=["ineffective-navigation-v2","supervisor-briefing-v2","reachable-story-guidance-v1","text-only-supervisor-v2"] as const;
it("keeps new switches OFF in legacy/default flags and control, ON only in the fixed bundle",()=>{
 const features=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 const def=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
 for(const id of ids){expect(features[id]).toBe(false);expect(def.base.features[id]).toBe(false);expect(def.switches).toContain(id);expect(featureInfo(id).description).toContain(" Off: ");expect(playHarnessFeatures({...features,[id]:true},null)).toContain(id);}
});

import type {LoopNotice} from "./loop-detection.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";
import {goalLine,waysHere,WalkAway} from "./harness-trust.js";
import type {Place,StoryGoal} from "./story-destinations.js";
import {parseGameState} from "./game-state.js";
const base=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
const state={...IN_GAME,started:true as const,screen:"overworld" as const,map_id:[0,19] as [number,number],position:{x:30,y:58},facing:"left",field_controls_locked:false,active_ui:null,in_battle:false};
function recording(){
 const subscribers:((e:RunEvent)=>void)[]=[];const notes:string[]=[];const guards:LoopNotice[]=[];
 return {notes,guards,subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{guards.push(n);},textOnlySupervisor:(_r:number,_n:number,_l:number,text:string)=>{notes.push(text);},feed:(e:RunEvent)=>{for(const fn of subscribers)fn(e);}};
}
it("routes changed-coordinate failures through the production guard factory; OFF has exactly the old notices",()=>{
 for(const on of [false,true]){
  const r=recording(),g=new Governor({limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  const d=attachLoopGuard(r,g,undefined,"enforced",true,()=>"SUPERVISOR: observed failures",false,false,false,false,false,false,false,false,false,false,on);
  for(let i=1;i<=3;i++)d.complete({name:"navigate_to",args:{x:31,y:55-i,map_id:[0,19]},state,beforeState:state,text:"no path",isError:false,seq:i});
  if(on){for(const [seq,n] of r.guards.entries())expect(()=>checkEvent({v:1,run:"guard",seq,turn:1,t:"2026-10-19T12:00:00.000-04:00",type:"loop_guard",...n})).not.toThrow();expect(r.guards).toEqual([expect.objectContaining({phase:"warning",evidence:[2,3]}),expect.objectContaining({phase:"supervisor"})]);expect(d.context()).toBe("SUPERVISOR: observed failures");d.complete({name:"press",args:{buttons:["LEFT"]},state:{...state,position:{x:31,y:58}},beforeState:state,text:"moved",isError:false});expect(r.guards).not.toContainEqual(expect.objectContaining({phase:"recovered"}));}
  else expect(r.guards).toEqual([]);
 }
});
it("production briefing factories use focused observations and preserve legacy text when OFF",()=>{
 for(const focused of [false,true]){
  const r=recording(),f={...base,"loop-guard-supervisor-v1":true,"text-only-supervisor-v1":true,"supervisor-briefing-v2":focused,"text-only-supervisor-v2":true};
  const brief=loopSupervisor(f,r);const note=textOnlySupervisor(f,r,false);
  const event=checkEvent({v:1,run:"focus",seq:1,turn:1,t:"2026-10-19T12:00:00.000-04:00",type:"state",...state});r.feed(event);
  r.feed(checkEvent({v:1,run:"focus",seq:2,turn:1,t:event.t,type:"tool_result",id:"o",name:"observe",is_error:false,duration_ms:1,state_seq:1,text:'Story goal: "Head for RUSTBORO CITY beyond this town." (DAD, turn 159) -> other details',frames:[]}));
  const text=brief?.("ineffective",3)??"";
  expect(text.includes("Current position:")).toBe(focused);expect(text.includes("Story steps the game confirms are done:")).toBe(!focused);
  if(focused){expect(text).toContain('Latest recorded place instruction: "Head for RUSTBORO CITY beyond this town." (DAD, turn 159)');expect(text.length).toBeLessThan(1800);}
  expect(note?.(3,3)).toContain("Reply-based stopping is disabled");expect(r.notes.at(-1)?.includes("Current position:")).toBe(focused);expect(r.notes.at(-1)).not.toContain("the run ends");
 }
 const old=recording();expect(textOnlySupervisor({...base,"text-only-supervisor-v1":true},old,false)?.(3,3)).toContain("the run ends");
 const stopping=recording();expect(textOnlySupervisor({...base,"text-only-supervisor-v1":true,"text-only-supervisor-v2":true},stopping,true)?.(3,3)).toContain("the run ends");
});
const target:Place={map_id:[0,3],name:"RUSTBORO_CITY",display:"RUSTBORO CITY",connections:[],warps:[]};
const route:Place={map_id:[0,19],name:"ROUTE104",display:"ROUTE104",connections:[{direction:"NORTH",to:[0,3]}],warps:[]};
const goal:StoryGoal={line:{turn:159,speaker:"DAD",text:"Head for RUSTBORO CITY beyond this town.",lives:null},resolved:[{quote:'"RUSTBORO CITY"',text:' = RUSTBORO CITY. Way in: this map\'s NORTH edge.',target}]};
const blocked=parseGameState({...state,topology:{width:40,height:80,connections:[]},exit_reach:{foot:{width:40,height:80,rows:Array<string>(80).fill("f".repeat(10))},warps:[],connections:[{direction:"NORTH",destination:[0,3],offset:0,reach:"none"}]}});
it("qualifies prominent local goal entrances, refuses unknown reach, and excludes blocked edges from walk-away measurements",()=>{
 expect(goalLine(goal,[route,target],true)).toContain("Way in: this map's NORTH edge");
 expect(goalLine(goal,[route,target],true,blocked)).toContain("NORTH edge (not reachable on foot from here)");
 expect(goalLine(goal,[route,target],true,state)).toContain("NORTH edge (reachability unknown)");
 expect(waysHere(blocked,[target],[route,target],true)).toEqual([]);
 expect(waysHere(blocked,[target],[route,target])).toEqual([{label:"this map's NORTH edge (to RUSTBORO CITY (map 0/3))",distance:58}]);
 const away=new WalkAway(true);for(const y of [58,59,60])expect(away.observe({...blocked,position:{x:30,y}},goal,[route,target],true)).toBeNull();
});

import {gunzipSync} from "node:zlib";
import {piLoop,play} from "./harness.js";
import {createAssistantMessageEventStream} from "@mariozechner/pi-ai";
import {assistant} from "../test-support/pi.js";
import type {Model,Message} from "@mariozechner/pi-ai";
const MODEL:Model<"openai-completions">={id:"fixture",name:"fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1/v1",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:100};
it("replays the actual whole-map failed-coordinate window and delivers the new briefing through pinned pi before its next decision",async()=>{
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/supervisor-recovery-recorded.json.gz",import.meta.url))).toString()) as {run:string;pin:string;events:unknown[]};
 expect(fixture.pin).toBe("b419848eb9f0b4d872b776189050b7c87c2a2812");
 for(const on of [false,true]){
  const r=recording(),features={...base,"loop-guard-supervisor-v1":true,"supervisor-briefing-v2":on,"world-targets-v1":true};
  const supervisor=loopSupervisor(features,r);
  const g=new Governor({limits:{maxTurns:1,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  const d=attachLoopGuard(r,g,undefined,"enforced",true,supervisor,false,false,false,false,false,false,false,false,false,false,on);
  for(const body of fixture.events){const event=checkEvent(body);r.feed(event);if(on&&r.guards.some(n=>n.phase==="supervisor"))break;}
  if(on)expect(r.guards).toContainEqual(expect.objectContaining({phase:"warning",kind:"ineffective"}));else expect(r.guards).toEqual([]);
  let delivered="";
  const loop=piLoop({systemPrompt:"fixture",tools:[],governor:g,emit:()=>undefined,transformContext:messages=>Promise.resolve(messages),loopDetector:d,signal:new AbortController().signal,base:{model:MODEL,convertToLlm:messages=>messages as Message[]},streamFn:(_model,context)=>{
   delivered=JSON.stringify(context.messages);
   const stream=createAssistantMessageEventStream(),message=assistant({text:"fixture",stopReason:"stop"});stream.push({type:"done",reason:"stop",message});return stream;
  }});
  await play({role:"user",content:"fixture",timestamp:0},g,loop);
  expect(delivered.includes("SUPERVISOR:")).toBe(on);if(on)expect(delivered).toContain("Recent attempts (up to 3)");
 }
});

import {parseExperiment,experimentArms} from "./experiments.js";
it("registers four separate pending experiments with exact one-switch candidates",()=>{
 for(const id of ids){const raw=JSON.parse(readFileSync(new URL(`../../../experiments/${id}.json`,import.meta.url),"utf8")) as Record<string,unknown>;expect(raw.queuePosition).toBeUndefined();const definition=parseExperiment(raw),arms=experimentArms(definition);expect(Object.keys(arms.incumbent.features).filter(key=>arms.incumbent.features[key as keyof typeof arms.incumbent.features]!==arms.candidate.features[key as keyof typeof arms.candidate.features])).toEqual([id]);}
});

it("keeps qualified interface ownership, name text and controls in focused recovery",()=>{
 const r=recording(),brief=loopSupervisor({...base,"loop-guard-supervisor-v1":true,"supervisor-briefing-v2":true},r);
 r.feed(checkEvent({v:1,run:"ui",seq:1,turn:1,t:"2026-10-19T12:00:00.000-04:00",type:"state",...state,screen:"naming",naming:{text:"AAA",page:"uppercase",column:0,row:0,key:"A",ready:true},active_ui:{phase:"naming_editor",selected:"A",ready:true,controls:"START selects OK",diagnostic:null,value:"AAA",details:{naming_owner:"player"}}}));
 r.feed(checkEvent({v:1,run:"ui",seq:2,turn:1,t:"2026-10-19T12:00:00.000-04:00",type:"tool_result",id:"o",name:"observe",state_seq:1,is_error:false,duration_ms:1,text:"naming",frames:[]}));
 expect(brief?.("ineffective",3)).toContain("Open interface: player naming editor; phase naming_editor; text AAA; selected A; controls: START selects OK");
});

// Native nearby lists are clipped to +/-7 tiles. Membership is not a changed game condition.
const nearby={objects:[{local_id:1,map_id:[0,19] as [number,number],graphics_id:1,sprite_kind:"person",x:23,y:58}],triggers:[{x:23,y:58,elevation:0,variable:16384,required_value:1,current_value:0,condition_met:false,script_pointer:134217728}],dialogue:null};
const geometry={elevation:0,tiles:[{x:30,y:58,collision:0,behavior:0,elevation:0}],objects:[],warps:[]};
function activeNavigation(s:import("./game-state.js").GameStateSnapshot){
 const r=recording(),g=new Governor({limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const d=attachLoopGuard(r,g,undefined,"enforced",true,()=>"SUPERVISOR",false,false,false,false,false,false,false,false,false,false,true);
 for(let seq=1;seq<=3;seq++)d.complete({name:"navigate_to",args:{x:31,y:55-seq},state:s,beforeState:s,text:"no path",isError:false,seq});
 expect(d.context()).toBe("SUPERVISOR");
 return {r,d};
}
it("holds the production episode across clipped object/trigger windows and recovers on a known trigger change",()=>{
 const s=parseGameState({...state,world_context:nearby}),{r,d}=activeNavigation(s);
 for(const [seq,context] of [[4,{...nearby,objects:[],triggers:[]}],[5,nearby]] as const){
  d.complete({name:"press",args:{buttons:["RIGHT"]},state:parseGameState({...s,position:{x:31,y:58},world_context:context}),beforeState:s,text:"small move",isError:false,seq});
  expect(r.guards).not.toContainEqual(expect.objectContaining({phase:"recovered"}));
 }
 d.complete({name:"observe",args:{},state:parseGameState({...s,world_context:{...nearby,triggers:[{...nearby.triggers[0],current_value:1,condition_met:true}]}}),beforeState:s,text:"changed trigger",isError:false,seq:6});
 expect(r.guards).toContainEqual(expect.objectContaining({phase:"recovered"}));
});
it("holds the production episode across unavailable optional observations, then recognizes known geometry recovery",()=>{
 const s=parseGameState({...state,navigation_grid:geometry,world_context:nearby}),{r,d}=activeNavigation(s);
 for(const [seq,extra] of [[4,{navigation_grid:null,world_context:null,money:null}],[5,{navigation_grid:undefined,world_context:undefined,money:null}],[6,{navigation_grid:geometry,world_context:nearby,money:state.money}]] as const){
  d.complete({name:"observe",args:{},state:parseGameState({...s,...extra}),beforeState:s,text:"observation",isError:false,seq});
  expect(r.guards).not.toContainEqual(expect.objectContaining({phase:"recovered"}));
 }
 d.complete({name:"observe",args:{},state:parseGameState({...s,navigation_grid:{...geometry,elevation:1}}),beforeState:s,text:"changed elevation",isError:false,seq:7});
 expect(r.guards).toContainEqual(expect.objectContaining({phase:"recovered"}));
});

it.each([
 {label:"money",initial:{money:null},known:{money:0},changed:{money:5}},
 {label:"geometry elevation",initial:{navigation_grid:null},known:{navigation_grid:geometry},changed:{navigation_grid:{...geometry,elevation:1}}},
 {label:"nullable trigger value",initial:{world_context:{...nearby,triggers:[{...nearby.triggers[0],current_value:null,condition_met:null}]}},known:{world_context:nearby},changed:{world_context:{...nearby,triggers:[{...nearby.triggers[0],current_value:1,condition_met:true}]}}},
])("learns initially unknown $label without recovering, preserves it across unreadable gaps, then recovers on a confirmed change",({initial,known,changed})=>{
 const s=parseGameState({...state,...initial}),{r,d}=activeNavigation(s);
 for(const [seq,extra] of [[4,known],[5,initial]] as const){
  d.complete({name:"observe",args:{},state:parseGameState({...state,...extra}),beforeState:s,text:"observed conditions",isError:false,seq});
  expect(r.guards).not.toContainEqual(expect.objectContaining({phase:"recovered"}));
 }
 d.complete({name:"observe",args:{},state:parseGameState({...state,...changed}),beforeState:s,text:"confirmed changed condition",isError:false,seq:7});
 expect(r.guards).toContainEqual(expect.objectContaining({phase:"recovered"}));
});
it.each(["object","trigger"] as const)("learns newly observed nearby %s identities, retains them through clipping, then recovers on a confirmed change",kind=>{
 const empty={...nearby,objects:[],triggers:[]},s=parseGameState({...state,world_context:empty}),{r,d}=activeNavigation(s);
 for(const [seq,context] of [[4,nearby],[5,empty],[6,nearby]] as const){
  d.complete({name:"observe",args:{},state:parseGameState({...state,world_context:context}),beforeState:s,text:"nearby window",isError:false,seq});
  expect(r.guards).not.toContainEqual(expect.objectContaining({phase:"recovered"}));
 }
 d.complete({name:"observe",args:{},state:parseGameState({...state,world_context:kind==="object"?{...nearby,objects:[{...nearby.objects[0],x:24}]}:{...nearby,triggers:[{...nearby.triggers[0],current_value:1,condition_met:true}]}}),beforeState:s,text:"confirmed nearby change",isError:false,seq:7});
 expect(r.guards).toContainEqual(expect.objectContaining({phase:"recovered"}));
});
