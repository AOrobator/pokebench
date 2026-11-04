import {navigationTool} from "./navigation.js";
import {expect,it} from "vitest";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {withNavigation} from "./navigation.js";
import {pressTool,observeTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";

const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
async function invoke(semantic=false,settled=false,change:"normal"|"wall"|"nonmatching"|"elevation"|"turn"="normal"){
 let current:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,3],position:{x:0,y:0},facing:"right",navigation_grid:{elevation:3,tiles:[0,1,2,3].map(x=>({x,y:0,collision:0,behavior:0,elevation:3})),objects:[],warps:[]},world_context:{objects:[],triggers:[{x:1,y:0,elevation:3,variable:0x405a,required_value:1,current_value:1,condition_met:true,script_pointer:0x08100000}],dialogue:null},topology:{width:4,height:1,connections:[{direction:"EAST",offset:0,destination:[0,31],destination_name:"ROUTE116",edges:[{x:3,y:0}]}]}};
 if(change==="wall"&&current.navigation_grid)current={...current,navigation_grid:{...current.navigation_grid,tiles:current.navigation_grid.tiles.map(t=>t.x===1?{...t,collision:1}:t)}};
 if((change==="nonmatching"||change==="elevation")&&current.world_context)current={...current,world_context:{...current.world_context,triggers:current.world_context.triggers.map(t=>({...t,...(change==="nonmatching"?{condition_met:false,current_value:2}:{elevation:4})}))}};
 const posts:unknown[]=[];
 const fetchFn:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("Missing action");posts.push(JSON.parse(init.body) as unknown);if(change!=="turn"||posts.length>1)current={...current,position:{x:(current.position?.x??0)+1,y:0},field_controls_locked:!settled,world_context:{objects:[],triggers:[],dialogue:null}};else current={...current,facing:"right"};body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"resulting game observation",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 if(change==="turn")current={...current,facing:"up"};
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"semantic-navigation-v2":semantic,"navigation-truth-v1":true,"coordinate-script-conditions-v1":true};
 const base=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})];
 const source={read:()=>Promise.resolve(current)};
 const tools=withSemanticNavigation(withNavigation(base,features,source),features,source);
 const nav=tools.find(t=>t.name===(semantic?"navigate_to_target":"navigate_to"));if(!nav)throw new Error("Missing navigation");
 const result:AgentToolResult<unknown>=await nav.execute("trigger",semantic?{map_id:[0,3],target:{kind:"connection",direction:"EAST"}}:{x:3,y:0,map_id:[0,3]});
 return {posts,result,text:result.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n"),current};
}
// Unconditional since 2026-11-02: no switch gates the boundary, so a route with no script-free alternative walks
// one step into the first matching script and returns the observation instead of refusing to move.
it.each([false,true])("enters the script once and returns its observation (already settled=%s)",async settled=>{
 const on=await invoke(false,settled);expect(on.posts).toHaveLength(1);expect(on.current.position).toEqual({x:1,y:0});expect(on.text).toContain("script-trigger step attempted at (1,0); inspect the resulting state");expect(on.text).toContain("resulting game observation");expect(on.text).not.toContain("every route navigate_to sees");
});

it("semantic travel returns the boundary instead of continuing or activating the exit",async()=>{
 const on=await invoke(true,true);expect(on.posts).toHaveLength(1);expect(on.current.map_id).toEqual([0,3]);expect(on.current.position).toEqual({x:1,y:0});expect(on.result.details).toMatchObject({navigation:{stop_requested:true},semantic_navigation:{activation_attempted:false}});expect(on.text).toContain("script-trigger step attempted at (1,0)");
});
it("preserves physical collision and does not claim script entry on a wall",async()=>{
 const on=await invoke(false,true,"wall");expect(on.posts).toEqual([]);expect(on.text).not.toContain("script-trigger step attempted");
});
it.each(["nonmatching","elevation"] as const)("does not treat a %s condition as an active boundary",async change=>{
 const on=await invoke(false,true,change);expect(on.posts).toHaveLength(3);expect(on.current.position).toEqual({x:3,y:0});expect(on.text).toContain("arrived at requested coordinate");
});
it("returns after a facing-only trigger attempt without claiming the script ran",async()=>{
 const on=await invoke(false,true,"turn");expect(on.posts).toHaveLength(1);expect(on.current.position).toEqual({x:0,y:0});expect(on.text).toContain("script-trigger step attempted at (1,0)");
});

it("walks singleton actions before a future trigger so running cannot overshoot it",async()=>{
 let current:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,3],position:{x:0,y:0},facing:"right",navigation_grid:{elevation:3,tiles:[0,1,2,3].map(x=>({x,y:0,collision:0,behavior:0,elevation:3})),objects:[],warps:[]},world_context:{objects:[],triggers:[{x:2,y:0,elevation:3,variable:0x405a,required_value:1,current_value:1,condition_met:true,script_pointer:0x08100000}],dialogue:null}};
 const modifiers:unknown[]=[];
 const tool=navigationTool({truth:true,triggers:true,automaticRunning:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check,options)=>{check?.(current);modifiers.push(options);current={...current,position:{x:(current.position?.x??0)+1,y:0}};return Promise.resolve({content:[],details:{state:current}});},observe:()=>Promise.resolve({content:[],details:{state:current}})});
 const result=await tool.execute("walking",{map_id:[0,3],x:3,y:0});
 expect(modifiers).toEqual([{automaticRunning:false},{automaticRunning:false}]);expect(result.details).toMatchObject({state:{position:{x:2,y:0}},navigation:{status:"script-trigger step attempted at (2,0); inspect the resulting state",commands:2}});
});
