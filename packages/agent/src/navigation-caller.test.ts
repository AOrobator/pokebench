import {expect,it} from "vitest";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {withNavigation} from "./navigation.js";
import {observeTool,pressTool,PRESS_TIMING} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META,IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";
const tile=(x:number,y:number)=>({x,y,collision:0,behavior:0,elevation:3});
it("the enabled factory executes real ordinary action and recorder seams, preserving final coherent state",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-nav-call-"));
 try{
  let current:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0),tile(2,0)],objects:[],warps:[]}};
  const actions:unknown[]=[];
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
  const fetchFn:typeof fetch=(input,init)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
   if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("Action body must be JSON text");actions.push(JSON.parse(init.body) as unknown);const x=current.position?.x??0;current={...current,position:{x:x+1,y:0}};body={status:"success"};}
   else if(url.endsWith("/queue_status"))body={queue_empty:true};
   else if(url.endsWith("/pokebench/observation")){current={...current,play_time_s:(current.play_time_s??0)+1};body={state_text:"coherent field",screenshot_base64:png.toString("base64"),state:current};}
   else if(url.endsWith("/pokebench/state"))body=current;
   else throw new Error(`Unexpected request ${url}`);
   return Promise.resolve(new Response(JSON.stringify(body)));
  };
  const log=RunLog.create(root,"nav-caller");const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(current)}});await recorder.start(RUN_START_META);
  const base=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:(id,buttons,timing,before)=>{recorder.buttonPress(id,buttons,timing,before);},afterPress:()=>recorder.afterPress()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})];
  const features=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(withNavigation(base,features,{read:()=>Promise.resolve(current)}).map(t=>t.name)).toEqual(["observe","press"]);
  const tools=withNavigation(base,{...features,"bounded-navigation-v1":true},{read:()=>Promise.resolve(current)});
  const nav=tools.find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("Missing navigation tool");
  await recorder.emit({type:"tool_execution_start",toolCallId:"nav",toolName:"navigate_to",args:{x:2,y:0,map_id:[0,9]}});
  const result=await nav.execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal);
  await recorder.emit({type:"tool_execution_end",toolCallId:"nav",toolName:"navigate_to",result,isError:false});recorder.end("budget");
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>JSON.parse(line) as {type:string;buttons?:string[];tool_call_id?:string;position?:{x:number;y:number};before_state_seq?:number;play_time_s?:number});
  const presses=events.filter(e=>e.type==="button_press");expect(presses.map(e=>[e.tool_call_id,e.buttons])).toEqual([["nav",["RIGHT"]],["nav",["RIGHT"]]]);
  expect(presses.every(e=>e.before_state_seq!==undefined)).toBe(true);
  expect(actions).toEqual([{buttons:["RIGHT"],...PRESS_TIMING},{buttons:["RIGHT"],...PRESS_TIMING}]);
  expect(events.filter(e=>e.type==="state").at(-1)?.position).toEqual({x:2,y:0});
  expect(events.filter(e=>e.type==="state").at(-1)?.play_time_s).toBe(current.play_time_s);
  expect(events.filter(e=>e.type==="tool_result")).toHaveLength(1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("ordinary press revalidation withholds a stale-map navigation action",async()=>{
 const state:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0)],objects:[],warps:[]}};
 let actions=0,recorded=0;const changed={...state,map_id:[1,0] as [number,number]};
 const fetchFn:typeof fetch=(input)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;if(url.endsWith("/action")){actions++;throw new Error("Stale action");}return Promise.resolve(new Response(JSON.stringify(changed)));};
 const press=pressTool("http://127.0.0.1",{beforePress:()=>{recorded++;},afterPress:()=>Promise.resolve()},fetchFn);
 await expect(press.executeChecked("nav",{buttons:["RIGHT"]},actual=>{if(actual?.map_id?.[0]!==0)throw new Error("map changed before action");},new AbortController().signal)).rejects.toThrow("map changed before action");expect(actions).toBe(0);expect(recorded).toBe(0);
});

it("the production navigation factory applies the fresh before-action check",async()=>{
 const state:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0)],objects:[],warps:[]}};
 const changed={...state,map_id:[1,0] as [number,number]};let posts=0;
 const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
 const fetchFn:typeof fetch=(input)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=changed;if(url.endsWith("/action")){posts++;body={status:"success"};}else if(url.endsWith("/queue_status"))body={queue_empty:true};else if(url.endsWith("/pokebench/observation"))body={state:changed,state_text:"new map",screenshot_base64:png.toString("base64")};return Promise.resolve(new Response(JSON.stringify(body)));};
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true};
 const tools=withNavigation([observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})],features,{read:()=>Promise.resolve(state)});
 const nav=tools.find(t=>t.name==="navigate_to");if(!nav)throw new Error("Missing navigation");
 const result=await nav.execute("nav",{x:1,y:0,map_id:[0,9]});
 expect(posts,JSON.stringify(result)).toBe(0);expect(JSON.stringify(result.details)).toContain("before action");expect(result.details).toMatchObject({state:{map_id:[1,0]},navigation:{commands:0}});
});

it("the production factory walks the whole-map route when that treatment is on",()=>{
 const fetchFn:typeof fetch=()=>Promise.reject(new Error("unused"));
 const base=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn)];
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true};
 const local=withNavigation(base,features,{read:()=>Promise.reject(new Error("unused"))}).find(t=>t.name==="navigate_to");
 const full=withNavigation(base,{...features,"full-map-navigation-v1":true},{read:()=>Promise.reject(new Error("unused"))}).find(t=>t.name==="navigate_to");
 expect(local?.description).toContain("Maximum 8");expect(full?.description).toContain("whole current map");
});

it("the production factory passes the elevation switch to the planner",async()=>{
 const stairs:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,navigation_grid:{elevation:3,tiles:[tile(0,0),{x:1,y:0,collision:0,behavior:0,elevation:0},{x:2,y:0,collision:0,behavior:0,elevation:4}],objects:[],warps:[]}};
 const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
 const fetchFn:typeof fetch=()=>Promise.resolve(new Response(JSON.stringify({state:stairs,state_text:"stairs",screenshot_base64:png.toString("base64")})));
 const base=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})];
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"elevation-transitions-v1":false};
 const nav=withNavigation(base,features,{read:()=>Promise.resolve(stairs)}).find(t=>t.name==="navigate_to");if(!nav)throw new Error("Missing navigation");
 const result=await nav.execute("nav",{x:2,y:0,map_id:[0,9]});
 expect(result.details).toMatchObject({navigation:{status:"no supported local path; choose a reachable local waypoint",commands:0}});
});
