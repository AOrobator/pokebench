import {expect,it} from "vitest";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {withNavigation} from "./navigation.js";
import {pressTool,observeTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";

const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
async function invoke(on:boolean,semantic=false,settled=false){
 let current:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,3],position:{x:0,y:0},facing:"right",navigation_grid:{elevation:3,tiles:[0,1,2,3].map(x=>({x,y:0,collision:0,behavior:0,elevation:3})),objects:[],warps:[]},world_context:{objects:[],triggers:[{x:1,y:0,elevation:3,variable:0x405a,required_value:1,current_value:1,condition_met:true,script_pointer:0x08100000}],dialogue:null},topology:{width:4,height:1,connections:[{direction:"EAST",offset:0,destination:[0,31],destination_name:"ROUTE116",edges:[{x:3,y:0}]}]};
 const posts:unknown[]=[];
 const fetchFn:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("Missing action");posts.push(JSON.parse(init.body) as unknown);current={...current,position:{x:(current.position?.x??0)+1,y:0},field_controls_locked:!settled,world_context:{objects:[],triggers:[],dialogue:null}};body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"resulting game observation",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"navigation-truth-v1":true,"coordinate-script-conditions-v1":true,"trigger-navigation-boundary-v1":on};
 const base=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})];
 const tools=withNavigation(base,features,{read:()=>Promise.resolve(current)});
 const nav=tools.find(t=>t.name===(semantic?"navigate_to_target":"navigate_to"));if(!nav)throw new Error("Missing navigation");
 const result:AgentToolResult<unknown>=await nav.execute("trigger",{x:3,y:0,map_id:[0,3]});
 return {posts,result,text:result.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n"),current};
}
it("OFF preserves the existing trigger refusal and sends no movement",async()=>{
 const off=await invoke(false);expect(off.posts).toEqual([]);expect(off.text).toContain("every route navigate_to sees");expect(off.text).toContain("variable 0x405A=1, needs 1");
});
it.each([false,true])("ON enters the script once and returns its observation (already settled=%s)",async settled=>{
 const on=await invoke(true,false,settled);expect(on.posts).toHaveLength(1);expect(on.current.position).toEqual({x:1,y:0});expect(on.text).toContain("script-trigger step attempted at (1,0); inspect the resulting state");expect(on.text).toContain("resulting game observation");expect(on.text).not.toContain("every route navigate_to sees");
});
