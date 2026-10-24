import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";
import {featuresOf} from "./features.js";
import {withNavigation,planNavigation,matchingTriggers} from "./navigation.js";

const ID="navigation-cycle-stop-v1";
interface Fixture {
 readonly goal:{x:number;y:number;map_id:[number,number]};
 readonly before:Record<string,number[]>;
 readonly presses:Record<string,string[][]>;
 readonly results:Record<string,{state_seq:number;text:string}>;
 readonly states:Record<string,unknown>;
}
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/navigation-cycle-0d5d.json.gz",import.meta.url))).toString()) as Fixture;
const snapshot=(seq:number):GameStateSnapshot=>parseGameState(fixture.states[String(seq)]);
const options={ledges:true,oneWay:true,floor:true,elevation:"game" as const};
const features=featuresOf(["bounded-navigation-v1","ledge-hops-v1","one-way-tiles-v1","walkable-floor-v1","elevation-transitions-v1","navigation-truth-v1","navigation-refusal-reasons-v1","navigation-refusal-reasons-v2","exit-reachability-v1","coordinate-script-conditions-v1"]);
const result=(state:GameStateSnapshot):AgentToolResult<unknown>=>({content:[{type:"text",text:"Recorded observation"}],details:{state}});
function recorded(turn:string,enabled:boolean,change:(s:GameStateSnapshot,attempt:number)=>GameStateSnapshot=s=>s,boundary=false,goal:Fixture["goal"]=fixture.goal){
 const before=fixture.before[turn],after=fixture.results[turn];if(before===undefined||after===undefined)throw new Error("missing recorded turn");
 let state=change(snapshot(before[0]??0),0),attempt=0;const buttons:string[][]=[];
 const press=(_id:string,args:{buttons:string[]},_signal?:AbortSignal,check?:(s:GameStateSnapshot|undefined)=>void)=>{
  check?.(state);expect(args.buttons).toEqual(fixture.presses[turn]?.[attempt]);buttons.push(args.buttons);
  attempt++;state=change(snapshot(before[attempt]??after.state_seq),attempt);return Promise.resolve(result(state));
 };
 const observe={name:"observe",label:"observe",description:"offline",parameters:{},execute:()=>Promise.resolve(result(state))} as unknown as AgentTool;
 const tool={name:"press",label:"press",description:"offline",parameters:{},execute:press,executeChecked:press} as unknown as CheckedPressTool;
 const nav=withNavigation([observe,tool],{...features,[ID]:enabled,"trigger-navigation-boundary-v1":boundary},{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("navigation missing");
 return {buttons,description:nav.description,call:()=>nav.execute("recorded",goal)};
}
for(const turn of ["1031","1032"]){
 it(`OFF preserves 0d5d turn ${turn}'s eight native inputs and exact delivered status`,async()=>{
  const h=recorded(turn,false);const r=await h.call();expect(h.buttons).toEqual(fixture.presses[turn]);
  expect(r.content).toEqual([{type:"text",text:(fixture.results[turn]?.text??"")},{type:"text",text:"Recorded observation"}]);
  expect(r.details).toMatchObject({state:{position:{x:15,y:3}},navigation:{commands:8}});
 });
 it(`ON stops the internal cycle in 0d5d turn ${turn} before another repeated step`,async()=>{
  const h=recorded(turn,true);expect(h.description).toContain(CYCLE_STOP_SENTENCE);const r=await h.call();expect(h.buttons).toEqual([["RIGHT"],["LEFT"]]);
  expect(r.details).toMatchObject({state:{position:{x:15,y:3}},navigation:{commands:2}});
  const line=r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
  expect(line).toContain("route cycle");expect(line).toContain("stopped before repeating RIGHT");expect(line).not.toContain("call navigate_to again");expect(line).not.toContain("cannot be reached");
 });
}
it("the pinned native geometry reproduces the frontier reversal without invented walls",()=>{
 const seqs=fixture.before["1031"];if(seqs===undefined)throw new Error("missing states");
 expect(planNavigation(snapshot(seqs[0]??0),fixture.goal,options)?.[0]).toBe("RIGHT");
 expect(planNavigation(snapshot(seqs[1]??0),fixture.goal,options)?.[0]).toBe("LEFT");
});

it("changed local terrain does not trigger a stale cycle, even when positions repeat",async()=>{
 const h=recorded("1031",true,(s,attempt)=>({...s,navigation_grid:s.navigation_grid==null?null:{...s.navigation_grid,tiles:s.navigation_grid.tiles.map((t,i)=>i===0?{...t,elevation:attempt+1}:t)}}));
 const r=await h.call();expect(h.buttons).toEqual(fixture.presses["1031"]);expect(r.details).toMatchObject({navigation:{commands:8}});
});
it("a changed player elevation is not the same cycle state",async()=>{
 const h=recorded("1031",true,(s,attempt)=>attempt<2||s.navigation_grid==null?s:{...s,navigation_grid:{...s.navigation_grid,elevation:0}});
 const r=await h.call();expect(h.buttons).toEqual([["RIGHT"],["LEFT"],["RIGHT"],["LEFT"]]);expect(r.details).toMatchObject({navigation:{commands:4}});
});
for(const changed of ["warp","trigger"] as const)it(`a changed off-route ${changed} is not the same cycle state`,async()=>{
 const h=recorded("1031",true,(s,attempt)=>{
  if(attempt<2||s.navigation_grid==null)return s;
  const point={x:20,y:0};
  return changed==="warp"?{...s,navigation_grid:{...s.navigation_grid,warps:[...s.navigation_grid.warps,point]}}:{...s,world_context:{...s.world_context,objects:s.world_context?.objects??[],dialogue:null,triggers:[{...point,elevation:3,variable:0x4002,required_value:1,current_value:1,condition_met:true,script_pointer:0x08100000}]}};
 });
 const r=await h.call();expect(h.buttons).toEqual([["RIGHT"],["LEFT"],["RIGHT"],["LEFT"]]);expect(r.details).toMatchObject({navigation:{commands:4}});
});
it("a changed matching trigger remains distinct when trigger-boundary planning falls back",async()=>{
 const goal:Fixture["goal"]={x:8,y:5,map_id:[9,0]};
 const trigger=(x:number,y:number)=>({x,y,elevation:3,variable:0x4002,required_value:1,current_value:1,condition_met:true,script_pointer:0x08100000});
 const change=(s:GameStateSnapshot,attempt:number):GameStateSnapshot=>{
  if(s.navigation_grid==null)throw new Error("missing grid");
  return {...s,navigation_grid:{...s.navigation_grid,tiles:s.navigation_grid.tiles.map(t=>t.x===8&&t.y===5?{...t,collision:0,behavior:0,elevation:3}:t)},world_context:{...s.world_context,objects:s.world_context?.objects??[],dialogue:null,triggers:[trigger(16,4),trigger(17,4),trigger(18,4),...(attempt>=2?[trigger(20,0)]:[])]}};
 };
 const seq=fixture.before["1031"]?.[0];if(seq===undefined)throw new Error("missing state");
 const before=change(snapshot(seq),0),changed=change(snapshot(seq),2);
 for(const state of [before,changed])expect(planNavigation(state,goal,{...options,triggers:matchingTriggers(state)})).toBeNull();
 const fallback=planNavigation(before,goal,{...options,triggers:[]});
 expect(fallback?.[0]).toBe("RIGHT");expect(planNavigation(changed,goal,{...options,triggers:[]})).toEqual(fallback);
 const h=recorded("1031",true,change,true,goal);const r=await h.call();
 expect(h.buttons).toEqual([["RIGHT"],["LEFT"],["RIGHT"],["LEFT"]]);
 expect(r.details).toMatchObject({state:{position:{x:15,y:3}},navigation:{commands:4}});
});
it("an off-route moving NPC does not hide the recorded cycle",async()=>{
 const h=recorded("1032",true);await h.call();expect(h.buttons).toEqual([["RIGHT"],["LEFT"]]);
});
it("a changed planned route can revisit a position without the stale-cycle stop",async()=>{
 const h=recorded("1031",true,(s,attempt)=>attempt<2||s.navigation_grid==null?s:{...s,navigation_grid:{...s.navigation_grid,objects:[...s.navigation_grid.objects,{x:16,y:5}]}});
 const r=await h.call();expect(h.buttons).toEqual([["RIGHT"],["LEFT"],["RIGHT"]]);expect(r.details).toMatchObject({navigation:{commands:3}});
});
it("later model calls have independent cycle state",async()=>{
 const h=recorded("1031",true);await h.call();const again=await h.call();expect(h.buttons).toEqual([["RIGHT"],["LEFT"],["RIGHT"],["LEFT"]]);expect(again.details).toMatchObject({navigation:{commands:2}});
});

import {navigationTool} from "./navigation.js";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
const corridor=():GameStateSnapshot=>({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"left",field_controls_locked:false,navigation_grid:{elevation:3,tiles:[0,1,2,3].map(x=>({x,y:0,collision:0,behavior:0,elevation:3})),objects:[],warps:[]}});
it("a different position with the same facing, terrain and route is not a cycle",async()=>{
 const tiles=[0,2].flatMap(y=>[0,1,2].map(x=>({x,y,collision:0,behavior:0,elevation:3})));
 let state:GameStateSnapshot={...corridor(),position:{x:0,y:0},facing:"right",navigation_grid:{elevation:3,tiles,objects:[],warps:[]},topology:{width:10,height:3,connections:[]}};
 let pending=false;const presses:string[][]=[];
 const goal={x:9,y:1,map_id:[0,9] as [number,number]};
 expect(planNavigation(state,goal,options)).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation({...state,position:{x:0,y:2}},goal,options)).toEqual(["RIGHT","RIGHT"]);
 const nav=navigationTool({cycleStop:true,...options,truth:true,read:()=>{
  if(pending){state={...state,position:{x:0,y:2}};pending=false;}return Promise.resolve(state);
 },observe:()=>Promise.resolve(result(state)),press:(_id,args)=>{
  presses.push([...args.buttons]);state={...state,position:{x:(state.position?.x??0)+1,y:state.position?.y??0}};
  if(presses.length===1)pending=true;return Promise.resolve(result(state));
 }});
 const r=await nav.execute("position",goal);expect(presses).toEqual([["RIGHT"],["RIGHT"],["RIGHT"]]);expect(r.details).toMatchObject({navigation:{commands:3}});expect(JSON.stringify(r)).not.toContain("route cycle");
});
for(const mode of ["full","visited"] as const)it(`${mode} mode retains its existing bounded inputs`,async()=>{
 let state=corridor();const presses:string[][]=[];
 const row="0300".repeat(4);
 state={...state,facing:"right",map_grid:{width:4,height:1,elevation:3,rows:[row],objects:[],warps:[]}};
 const initial=state;let restore=false;
 const nav=navigationTool({cycleStop:true,maxCommands:3,...options,truth:true,...(mode==="full"?{fullMap:true}:{visitedTerrain:true}),read:()=>{if(restore){state=initial;restore=false;}return Promise.resolve(state);},observe:()=>Promise.resolve(result(state)),press:(_id,args)=>{
  presses.push([...args.buttons]);state={...state,position:{x:1,y:0}};restore=true;return Promise.resolve(result(state));
 }});
 const r=await nav.execute("other-mode",{x:3,y:0,map_id:[0,9]});expect(presses).toEqual(Array.from({length:3},()=>["RIGHT"]));expect(r.details).toMatchObject({navigation:{commands:3,status:"command limit: stopped at (1,0) after 3 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (3,0)"}});
});
it("useful movement and an initial turn complete normally",async()=>{
 let state=corridor(),turn=true;const presses:string[][]=[];
 const nav=navigationTool({cycleStop:true,...options,truth:true,read:()=>Promise.resolve(state),observe:()=>Promise.resolve(result(state)),press:(_id,args)=>{
  presses.push([...args.buttons]);if(turn){turn=false;state={...state,facing:"right"};}else state={...state,position:{x:(state.position?.x??0)+1,y:0}};
  return Promise.resolve(result(state));
 }});
 const r=await nav.execute("progress",{x:3,y:0,map_id:[0,9]});expect(presses).toEqual(Array.from({length:4},()=>["RIGHT"]));expect(r.details).toMatchObject({navigation:{commands:4,status:"arrived at requested coordinate"}});
});
for(const interrupted of ["map","lock"] as const)it(`a ${interrupted} interruption returns normally without diagnosing a cycle`,async()=>{
 let state=corridor();const nav=navigationTool({cycleStop:true,...options,truth:true,read:()=>Promise.resolve(state),observe:()=>Promise.resolve(result(state)),press:()=>{
  state=interrupted==="map"?{...state,map_id:[0,10]}:{...state,field_controls_locked:true};return Promise.resolve(result(state));
 }});
 const r=await nav.execute("interrupt",{x:3,y:0,map_id:[0,9]});expect(r.details).toMatchObject({navigation:{commands:1}});expect(JSON.stringify(r)).not.toContain("route cycle");
});

import {featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,SERVER_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {CYCLE_STOP_SENTENCE} from "./navigation.js";
it("registers the default-OFF treatment and keeps OFF prompt bytes",()=>{
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 expect(SWITCHABLE_FEATURES.at(247)).toBe(ID);expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"bounded-navigation-v1"});expect(featureInfo(ID).description).toContain(" Off: ");expect(SERVER_FEATURES).not.toContain(ID);
 expect(flagFeatures(flags)[ID]).toBe(false);const {[ID]:priorValue,...oldPreset}=flagFeatures(flags);expect(priorValue).toBe(false);expect(normalizeFeatures(oldPreset)[ID]).toBe(false);
 const on={...features,[ID]:true};expect(playHarnessFeatures(on,null)).toContain(ID);expect(playHarnessFeatures(features,null)).not.toContain(ID);
 expect(playSystemPrompt(features,null)).not.toContain(CYCLE_STOP_SENTENCE);expect(playSystemPrompt(on,null)).toContain(CYCLE_STOP_SENTENCE);expect(playSystemPrompt(on,null).replace(`\n\n${CYCLE_STOP_SENTENCE}`,"")).toBe(playSystemPrompt(features,null));
});

import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {parseEvent} from "./events.js";
it("records the exact cycle stop delivered by the production tool as a normal tool result",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"navigation-cycle-recording-"));
 try{
  const log=RunLog.create(dir,"cycle-proof");const state=snapshot(fixture.before["1031"]?.[0]??0);
  const recorder=new RunRecorder({log,frames:new FrameStore(dir),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)}});
  await recorder.start({...RUN_START_META,harness_features:[...RUN_START_META.harness_features,ID]});
  await recorder.emit({type:"tool_execution_start",toolCallId:"cycle",toolName:"navigate_to",args:fixture.goal});
  const r=await recorded("1031",true).call();await recorder.emit({type:"tool_execution_end",toolCallId:"cycle",toolName:"navigate_to",result:r,isError:false});recorder.end("budget");
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(l=>parseEvent(l));
  const delivered=events.find(e=>e.type==="tool_result");expect(delivered?.type).toBe("tool_result");if(delivered?.type!=="tool_result")throw new Error("result missing");
  expect(delivered.text).toBe(r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n"));expect(delivered.text).toContain("stopped before repeating RIGHT");expect(delivered.is_error).toBe(false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
