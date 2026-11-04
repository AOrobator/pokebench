import {expect,it} from "vitest";
import {gateArms,planNavigation,withNavigation} from "./navigation.js";
import {gameTools,ALL_TOOL_SWITCHES} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
const ID="rotating-gate-navigation-v1";
const running={permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
// Rows of # and . become the local navigation grid; an arm between (1,1) and (1,2) by default.
const tiles=(rows:readonly string[])=>rows.flatMap((row,y)=>row.split("").map((c,x)=>({x,y,collision:c==="#"?1:0,behavior:0,elevation:3})));
type Edge=readonly [number,number,number,number];
const observation=(edges:readonly Edge[],rows:readonly string[])=>({version:1 as const,map_id:[12,1] as [number,number],origin:[0,0] as [number,number],width:rows[0]?.length??0,height:rows.length,unavailable:[],elements:edges.map(([ax,ay,bx,by])=>({kind:"rotating_gate" as const,x:ax,y:ay,state:"arm",direction:"east" as const,group:"gate:2",orientation:1,edge:[ax,ay,bx,by] as [number,number,number,number]}))});
const map=(rows:readonly string[],position:{x:number;y:number},edges:readonly Edge[]=[[1,1,1,2]]):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[12,1],position,facing:"up",running,navigation_grid:{elevation:3,tiles:tiles(rows),objects:[],warps:[]},map_observation:observation(edges,rows)});
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
async function navigate(features:Record<string,boolean>,start:GameStateSnapshot,goal:{x:number;y:number}){
 let current=start;const presses:string[]=[];
 const fetchFn:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(init?.method==="POST"){
   if(typeof init.body!=="string")throw new Error("Missing body");const d=(JSON.parse(init.body) as {buttons:string[]}).buttons[0]??"";presses.push(d);
   const a=current.position;if(a===null)throw new Error("Missing position");
   const dx=d==="RIGHT"?1:d==="LEFT"?-1:0,dy=d==="DOWN"?1:d==="UP"?-1:0;current={...current,position:{x:a.x+dx,y:a.y+dy}};body={status:"success"};
  }else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"field",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const tools=gameTools("http://test",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{...ALL_TOOL_SWITCHES,automaticRunning:false},{now:()=>0,sleep:()=>Promise.resolve()});
 const all={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":false,"navigation-truth-v1":true,...features};
 const nav=withNavigation(tools,all,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");if(!nav)throw new Error("No navigation");
 const result=await nav.execute("nav",{...goal,map_id:[12,1]});
 return {presses,current,description:nav.description,text:result.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n")};
}
const on={[ID]:true};
const corridor=["###","#.#","#.#","#.#","#.#","###"];
const wide=["....","....","....","...."];
it("is registered last among its family, default off and needs the gate positions",()=>{
 expect(SWITCHABLE_FEATURES.at(SWITCHABLE_FEATURES.indexOf(ID)-1)).toBe("map-code-aliases-v1");
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"rotating-gate-positions-v1"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(SERVER_FEATURES).not.toContain(ID);
 expect(SERVER_FEATURES).toEqual(expect.arrayContaining(["rotating-gate-positions-v1","rotating-gate-rules-v1","rotating-gate-map-v1","map-code-aliases-v1"]));
 for(const id of ["rotating-gate-positions-v1","rotating-gate-rules-v1","rotating-gate-map-v1","map-code-aliases-v1",ID] as const){
  expect(featureInfo(id).description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[id]:false},null)).not.toContain(id);
 }
 expect(dependencyProblems({...ALL_ON,"rotating-gate-positions-v1":false}).join()).toContain(ID);
});
it("reads current arms from the map observation, keyed either way round",()=>{
 const arms=gateArms(map(wide,{x:0,y:0},[[1,1,1,2]]));
 expect([...arms.values()]).toEqual([{gate:"gate 2",a:{x:1,y:1},b:{x:1,y:2}}]);
 expect(gateArms(IN_GAME).size).toBe(0);
});
it("plans around an arm when a way round exists, and straight across it without the arms",()=>{
 const state=map(wide,{x:1,y:2});
 expect(planNavigation(state,{x:1,y:1},{})).toEqual(["UP"]);
 const round=planNavigation(state,{x:1,y:1},{gateArms:gateArms(state)});
 expect(round).toHaveLength(3);expect(round?.[0]).not.toBe("UP");
});
it("walks a clear route without stopping",async()=>{
 const {presses,current,text}=await navigate(on,map(wide,{x:0,y:3}),{x:3,y:3});
 expect(presses).toEqual(["RIGHT","RIGHT","RIGHT"]);expect(current.position).toEqual({x:3,y:3});
 expect(text).toContain("arrived at requested coordinate");
});
it("walks up to the arm, stops before it and names it, without pushing",async()=>{
 const {presses,current,text}=await navigate(on,map(corridor,{x:1,y:4}),{x:1,y:1});
 expect(presses).toEqual(["UP","UP"]);expect(current.position).toEqual({x:1,y:2});
 expect(text).toContain("Navigation: walked from (1,4) to (1,2), then stopped: gate 2's arm between (1,1) and (1,2) is across the route to (1,1); navigate_to does not push gates; 2 ");
});
it("presses nothing when already facing the arm",async()=>{
 const {presses,text}=await navigate(on,map(corridor,{x:1,y:2}),{x:1,y:1});
 expect(presses).toEqual([]);
 expect(text).toContain("Navigation: gate 2's arm between (1,1) and (1,2) is across the route to (1,1); navigate_to does not push gates; 0 ");
});
it("keeps the usual refusal when arms are not what stops the route",async()=>{
 const walled=["###","#.#","###","#.#","###"];
 const gated=await navigate(on,map(walled,{x:1,y:3}),{x:1,y:1});
 const plain=await navigate({},map(walled,{x:1,y:3}),{x:1,y:1});
 expect(gated.presses).toEqual([]);expect(gated.text).not.toContain("arm");expect(gated.text).toBe(plain.text);
});
it("off, the same call walks across the arm and the description never changes",async()=>{
 const off=await navigate({},map(corridor,{x:1,y:3}),{x:1,y:1});
 expect(off.presses).toEqual(["UP","UP"]);expect(off.current.position).toEqual({x:1,y:1});
 const gated=await navigate(on,map(corridor,{x:1,y:3}),{x:1,y:1});
 expect(gated.description).toBe(off.description);
 expect(gated.description).not.toContain("gate");
});
it("does not use the gate rule for a map with no arms",async()=>{
 const none=map(corridor,{x:1,y:3},[]);
 expect((await navigate(on,none,{x:1,y:1})).presses).toEqual(["UP","UP"]);
});
