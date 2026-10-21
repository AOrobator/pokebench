import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {pressTool,observeTool} from "./game-tools.js";
import {withNavigation} from "./navigation.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {flagFeatures} from "./play-preset.js";

const ID="trigger-navigation-boundary-v1";
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
const trigger=(x:number,y:number)=>({x,y,elevation:0,variable:0x408d,required_value:2,current_value:2,condition_met:true,script_pointer:0x081f8a73});
function field(detour=false):GameStateSnapshot {
 return {...IN_GAME,screen:"overworld",started:true,in_battle:false,active_ui:null,field_controls_locked:false,map_id:[1,2],position:{x:0,y:0},facing:"right",navigation_grid:{elevation:3,tiles:[0,1,...(detour?[2,3,4,5]:[2])].map(i=>({x:i%3,y:Math.floor(i/3),collision:0,behavior:0,elevation:3})),objects:[],warps:[]},world_context:{objects:[],triggers:[trigger(1,0),...(detour?[]:[trigger(2,0)])],dialogue:null},topology:{width:3,height:detour?2:1,connections:[{direction:"EAST",offset:0,destination:[0,9],destination_name:"LITTLEROOT TOWN",edges:[{x:2,y:0}]}]}};
}
async function run(start:GameStateSnapshot,on:boolean,semantic=false,effect:"move"|"unchanged"="move",fullMap=false){
 let current=start;const posts:unknown[]=[];
 const fetchFn:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(url.endsWith("/action")){
   if(typeof init?.body!=="string")throw new Error("missing action");const action:unknown=JSON.parse(init.body);posts.push(action);
   if(typeof action!=="object"||action===null||!("buttons"in action)||!Array.isArray(action.buttons))throw new Error("invalid action");
   const dir:unknown=action.buttons[0];const delta=dir==="DOWN"?[0,1]:dir==="UP"?[0,-1]:dir==="LEFT"?[-1,0]:[1,0];
   if(current.position===null)throw new Error("missing position");
   current={...current,position:effect==="move"?{x:current.position.x+(delta[0]??0),y:current.position.y+(delta[1]??0)}:current.position,facing:typeof dir==="string"?dir.toLowerCase():current.facing};
   body={status:"success"};
  }else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"observed state after ordinary input",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"semantic-navigation-v2":semantic,"full-map-navigation-v1":fullMap,"safe-navigation-strides-v1":fullMap,"navigation-truth-v1":true,"coordinate-script-conditions-v1":true,[ID]:on};
 const base=[observeTool("http://game",fetchFn),pressTool("http://game",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})],source={read:()=>Promise.resolve(current)};
 const tools=withSemanticNavigation(withNavigation(base,features,source),features,source),nav=tools.find(t=>t.name===(semantic?"navigate_to_target":"navigate_to"));if(nav===undefined)throw new Error("missing nav");
 const args=fullMap?(semantic?{map_id:[1,2],target:{kind:"warp",x:1,y:8}}:{map_id:[1,2],x:1,y:8}):(semantic?{map_id:[1,2],target:{kind:"connection",direction:"EAST"}}:{map_id:[1,2],x:2,y:0});
 const result:AgentToolResult<unknown>=await nav.execute("first-trigger",args);
 return {posts,current,details:result.details,text:result.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n")};
}
it.each([false,true])("prefers an available script-free route (semantic=%s)",async semantic=>{
 const result=await run(field(true),true,semantic);
 expect(result.posts).toEqual(["DOWN","RIGHT","RIGHT","UP",...(semantic?["RIGHT"]:[])].map(d=>({buttons:[d],hold_frames:10,release_frames:8})));
 expect(result.text).not.toContain("script-trigger step attempted");
});
it.each([false,true])("stops at the first of two triggers without activating the destination (semantic=%s)",async semantic=>{
 const result=await run(field(),true,semantic);
 expect(result.posts).toEqual([{buttons:["RIGHT"],hold_frames:10,release_frames:8}]);expect(result.current.position).toEqual({x:1,y:0});
 expect(result.text).toContain("script-trigger step attempted at (1,0)");
 if(semantic)expect(result.details).toMatchObject({semantic_navigation:{activation_attempted:false},navigation:{stop_requested:true}});
});
it("never retries a trigger attempt with no net movement (including pushback)",async()=>{
 const effect="unchanged";
 const result=await run(field(),true,true,effect);expect(result.posts).toHaveLength(1);expect(result.current.position).toEqual({x:0,y:0});expect(result.text).toContain("script-trigger step attempted");
});
it.each([false,true])("replays the rival stair landing with exactly one DOWN and no exit activation (semantic=%s)",async semantic=>{
 const raw:unknown=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/rival-trigger-1fe0.json.gz",import.meta.url))).toString("utf8"));const start=parseGameState(raw);
 expect(start.position).toEqual({x:2,y:3});
 const off=await run(start,false,semantic,"move",true);expect(off.posts).toEqual([]);expect(off.text).toContain("crosses a script-trigger tile");
 const on=await run(start,true,semantic,"move",true);expect(on.posts).toEqual([{buttons:["DOWN"],hold_frames:10,release_frames:8}]);expect(on.current.position).toEqual({x:2,y:4});expect(on.text).toContain("script-trigger step attempted at (2,4)");
});
it("enables the separate switch only in fixed bundle treatment",()=>{
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"]){
  const d=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[];offInBoth:string[]};
  expect(d.base.features[ID]).toBe(false);expect(d.switches).toContain(ID);expect(d.onInBoth).not.toContain(ID);expect(d.offInBoth).not.toContain(ID);
 }
});

it("semantic selection prefers a script-free edge over a shorter edge behind a script",async()=>{
 const start=field(true);
 const state:GameStateSnapshot={...start,topology:{width:3,height:2,connections:[{direction:"EAST" as const,offset:0,destination:[0,9],destination_name:"LITTLEROOT TOWN",edges:[{x:2,y:0},{x:2,y:1}]}]}};
 const result=await run(state,true,true);
 expect(result.posts).toEqual(["DOWN","RIGHT","RIGHT","RIGHT"].map(d=>({buttons:[d],hold_frames:10,release_frames:8})));
 expect(result.text).not.toContain("script-trigger step attempted");
});
