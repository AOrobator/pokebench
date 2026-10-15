import {describe,expect,it} from "vitest";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {navigationTool,withNavigation,type NavigationPorts} from "./navigation.js";
import {observeTool,pressTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";

type Goal={x:number;y:number};
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const tile=(x:number,y:number,collision=0,behavior=0,elevation=3)=>({x,y,collision,behavior,elevation});
const square=(size:number,override:(x:number,y:number)=>ReturnType<typeof tile>|null=()=>null)=>Array.from({length:size*size},(_,i)=>{const x=i%size,y=Math.floor(i/size);return override(x,y)??tile(x,y);});
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
const field:GameStateSnapshot={screen:"overworld",started:true,name:"A",location:"LITTLEROOT TOWN",map_id:[0,9],position:{x:0,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:{elevation:3,tiles:square(3),objects:[],warps:[]}};
const target=(kind:string,x:number,y:number,name:string|null):Target=>({kind,name,x,y,elevation:3,activation:"A",availability:"available",facing:null,local_id:kind==="object"?1:null,destination:null});
const world=(message:boolean,dialogue:string|null=null):NonNullable<GameStateSnapshot["world_context"]>=>({objects:[],triggers:[],dialogue,...(message?{message:{phase:"dismiss_wait" as const,cursor:12,ready:true}}:{})});

async function status(state:GameStateSnapshot,goal:Goal,extra:Partial<NavigationPorts>={},after?:GameStateSnapshot):Promise<string> {
 let presses=0;
 const tool=navigationTool({read:()=>Promise.resolve(state),press:()=>{presses++;if(after===undefined)throw new Error("pressed");return Promise.resolve(result(after));},observe:()=>Promise.resolve(result(after??state)),...extra});
 const outcome=await tool.execute("nav",{...goal,map_id:[0,9]},new AbortController().signal);
 const text=outcome.content[0]?.type==="text"?outcome.content[0].text:"";
 expect(text).toBe(`Navigation: ${(outcome.details as {navigation:{status:string}}).navigation.status}; ${String(presses)} ordinary button attempts.`);
 return (outcome.details as {navigation:{status:string}}).navigation.status;
}
const on={refusalReasons:true} as const;

const MESSAGE="a message is waiting for A or B; dismiss it with B, then call navigate_to again";
const LOCKED="field controls are locked by a script and no message is open; the game is acting on its own, so inspect the new state before calling navigate_to again";
const CONTROL_UNKNOWN="field control state is unavailable; inspect the new state before calling navigate_to again";
const BATTLE="a battle is in progress; navigate_to walks only on the field";
const SCREEN="the game is not on the field (screen: title_menu); navigate_to walks only on the field";
const UI="a menu or other interface is open (start_menu); close it before calling navigate_to";
const GEOMETRY="this map's navigation geometry is unavailable; inspect the new state before calling navigate_to again";
const UNAVAILABLE="field input or navigation geometry unavailable";
const NO_LOCAL="no supported local path; choose a reachable local waypoint";
const NO_FULL="no supported path on the current map; choose a reachable waypoint";

describe("navigation-refusal-reasons-v1: why navigate_to cannot start",()=>{
 const message={...field,field_controls_locked:true,world_context:world(true,"The PROF isn't one for doing desk work.")};
 it("a waiting message: dismiss it with B (run 0c40 retried 42 times)",async()=>{
  expect(await status(message,{x:2,y:0},on)).toBe(MESSAGE);
  expect(await status({...field,field_controls_locked:true,world_context:world(false,"Hello there!")},{x:2,y:0},on)).toBe(MESSAGE);
 });
 it("a script lock with no message keeps a locked reason",async()=>{
  expect(await status({...field,field_controls_locked:true,world_context:world(false)},{x:2,y:0},on)).toBe(LOCKED);
  expect(await status({...field,field_controls_locked:true},{x:2,y:0},on)).toBe(LOCKED);
  expect(await status({...field,field_controls_locked:null},{x:2,y:0},on)).toBe(CONTROL_UNKNOWN);
 });
 it("battle, other screens, open interfaces and missing geometry each say so",async()=>{
  expect(await status({...field,in_battle:true},{x:2,y:0},on)).toBe(BATTLE);
  expect(await status({...field,screen:"title_menu"},{x:2,y:0},on)).toBe(SCREEN);
  expect(await status({...field,started:false},{x:2,y:0},on)).toBe("the game has not started yet; navigate_to walks only on the field");
  expect(await status({...field,active_ui:{phase:"start_menu",selected:null,ready:false,controls:"menu",diagnostic:null}},{x:2,y:0},on)).toBe(UI);
  expect(await status({...field,active_ui:{phase:"bag",selected:null,ready:true,controls:"menu",diagnostic:"unsupported"}},{x:2,y:0},on)).toBe("a menu or other interface is open (bag); close it before calling navigate_to");
  // Round-6 review: a healthy field menu locks controls; it is the menu, not a script.
  expect(await status({...field,field_controls_locked:true,active_ui:{phase:"start_menu",selected:"BAG",ready:true,controls:"menu",diagnostic:null}},{x:2,y:0},on)).toBe("a menu or other interface is open (start_menu); close it before calling navigate_to");
  expect(await status({...field,navigation_grid:null},{x:2,y:0},on)).toBe(GEOMETRY);
  expect(await status({...field,position:null},{x:2,y:0},on)).toBe(GEOMETRY);
  expect(await status({...field,map_grid:null},{x:2,y:0},{...on,fullMap:true})).toBe(GEOMETRY);
 });
 it("a message that opens mid-walk interrupts with the same reason",async()=>{
  const moved={...field,position:{x:0,y:1},field_controls_locked:true,world_context:world(true)};
  expect(await status(field,{x:0,y:2},on,moved)).toBe(`walk interrupted: ${MESSAGE}`);
  expect(await status(field,{x:0,y:2},{},moved)).toBe("field input locked or unavailable; inspect new state");
 });
 it("off keeps the generic refusal text for every case",async()=>{
  for(const state of [message,{...field,field_controls_locked:true},{...field,field_controls_locked:null},{...field,in_battle:true},{...field,screen:"title_menu"},{...field,navigation_grid:null}]){
   expect(await status(state,{x:2,y:0})).toBe(UNAVAILABLE);
   expect(await status(state,{x:2,y:0},{refusalReasons:false})).toBe(UNAVAILABLE);
  }
 });
});

describe("navigation-refusal-reasons-v1: why the target cannot be walked to",()=>{
 const mom={...field,navigation_grid:{elevation:3,tiles:square(3),objects:[{x:1,y:1}],warps:[]},interaction_targets:[target("object",1,1,"MOM")]};
 const OBJECT="(1,1) is MOM (person or object), which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: (1,0) facing DOWN; (1,2) facing UP; (0,1) facing RIGHT; (2,1) facing LEFT";
 it("a person on the target tile is named with every free reachable neighbour and its facing (runs c497)",async()=>{
  expect(await status(mom,{x:1,y:1},on)).toBe(OBJECT);
 });
 it("an unnamed live object, and one whose neighbours are walled or occupied",async()=>{
  const unnamed={...mom,interaction_targets:[]};
  expect(await status(unnamed,{x:1,y:1},on)).toBe(OBJECT.replace("MOM (person or object)","a person or object"));
  const live={...unnamed,navigation_grid:{...unnamed.navigation_grid,objects:[]},world_context:{...world(false),objects:[{local_id:2,map_id:[0,9] as [number,number],graphics_id:7,sprite_kind:"npc",x:1,y:1}]}};
  expect(await status({...live,navigation_grid:{...live.navigation_grid,tiles:square(3,(x,y)=>x===1&&y===1?tile(1,1,1):null)}},{x:1,y:1},on)).toBe(OBJECT.replace("MOM (person or object)","a person or object"));
  const otherMap={...live,world_context:{...world(false),objects:[{local_id:2,map_id:[0,10] as [number,number],graphics_id:7,sprite_kind:"npc",x:1,y:1}]}};
  expect(await status({...otherMap,navigation_grid:{...otherMap.navigation_grid,tiles:square(3,(x,y)=>x===1&&y===1?tile(1,1,1):null)}},{x:1,y:1},on)).toBe("(1,1) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (1,0)");
  const boxed={...mom,navigation_grid:{elevation:3,tiles:square(3,(x,y)=>(x===1&&y===0)||(x===0&&y===1)?tile(x,y,1):x===2&&y===1?tile(x,y,0,0x10):null),objects:[{x:1,y:1},{x:1,y:2}],warps:[]}};
  expect(await status(boxed,{x:1,y:1},on)).toBe("(1,1) is MOM (person or object), which navigate_to cannot stand on, and none of its free neighbouring tiles can be reached from here; choose a reachable waypoint nearer to it");
 });
 it("an object you face and press A on, standing on a solid tile, is named the same way (run 0c40 targeted the lab Machine)",async()=>{
  const machine={...field,navigation_grid:{elevation:3,tiles:square(3,(x,y)=>x===1&&y===1?tile(1,1,1):null),objects:[],warps:[]},interaction_targets:[target("warp",0,2,"Warp to map 0/9"),target("background",1,1,"Machine")]};
  expect(await status(machine,{x:1,y:1},on)).toBe(OBJECT.replace("MOM (person or object)","Machine (background)"));
  const pc={...machine,interaction_targets:[target("pc",1,1,null)]};
  expect(await status(pc,{x:1,y:1},on)).toBe(OBJECT.replace("MOM (person or object)","a pc"));
 });
 it("walls, water, ledges and other terrain say they are not walkable and name the nearest reachable tile",async()=>{
  const at=(collision:number,behavior:number)=>({...field,navigation_grid:{elevation:3,tiles:square(3,(x,y)=>x===2&&y===0?tile(2,0,collision,behavior):null),objects:[],warps:[]}});
  expect(await status(at(1,0),{x:2,y:0},on)).toBe("(2,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (1,0)");
  expect(await status(at(0,0x10),{x:2,y:0},on)).toBe("(2,0) is water, not a walkable tile; the nearest walkable tile navigate_to can reach is (1,0)");
  expect(await status(at(1,0x3b),{x:2,y:0},on)).toBe("(2,0) is a ledge, which you can only hop over in its arrow direction, not a walkable tile; the nearest walkable tile navigate_to can reach is (1,0)");
  expect(await status(at(0,0x20),{x:2,y:0},on)).toBe("(2,0) is terrain navigate_to does not walk on (metatile behavior 0x20), not a walkable tile; the nearest walkable tile navigate_to can reach is (1,0)");
  const beside=(behavior:number)=>({...field,navigation_grid:{elevation:3,tiles:square(3,(x,y)=>x===2&&y===0?tile(2,0,1):x===1&&y===0?tile(1,0,0,behavior):null),objects:[],warps:[]}});
  const wall="(2,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is ";
  expect(await status(beside(0x06),{x:2,y:0},{...on,floor:true})).toBe(`${wall}(1,0)`);
  expect(await status(beside(0x06),{x:2,y:0},on)).toBe(`${wall}(2,1)`);
  expect(await status(beside(0x30),{x:2,y:0},{...on,oneWay:true})).toBe(`${wall}(1,0)`);
  expect(await status(beside(0x30),{x:2,y:0},on)).toBe(`${wall}(2,1)`);
  const sealed={...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,1),tile(3,0,1),tile(4,0,1),tile(5,0),tile(4,1)],objects:[],warps:[]}};
  expect(await status(sealed,{x:4,y:0},on)).toBe("(4,0) is a wall or other solid tile, not a walkable tile; no walkable tile navigate_to can reach lies within 3 steps of it");
 });
 it("a target outside the map gives the map's bounds",async()=>{
  const bounded={...field,topology:{width:20,height:20,connections:[]}};
  expect(await status(bounded,{x:25,y:3},on)).toBe("(25,3) is outside this map; its tiles run from (0,0) to (19,19); to reach another map, use a listed warp or a map connection");
 });
 it("explains the same reasons on the whole map",async()=>{
  const row="0300".repeat(3);
  const full={...field,navigation_grid:null,map_grid:{width:3,height:3,elevation:3,rows:[row,"030013000300",row],objects:[],warps:[]}};
  expect(await status(full,{x:1,y:1},{...on,fullMap:true})).toBe("(1,1) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (1,0)");
  expect(await status(full,{x:3,y:0},{...on,fullMap:true})).toBe("(3,0) is outside this map; its tiles run from (0,0) to (2,2); to reach another map, use a listed warp or a map connection");
  expect(await status(full,{x:1,y:1},{fullMap:true})).toBe(NO_FULL);
 });
 it("keeps the generic text when it has no specific reason: warps, enclosed floor, unknown tiles, broken geometry",async()=>{
  const door={...field,navigation_grid:{elevation:3,tiles:square(3,(x,y)=>x===2&&y===0?tile(2,0,1,0x69):x===2&&y===1?tile(2,1,1):null),objects:[],warps:[{x:2,y:0}]}};
  expect(await status({...door,position:{x:0,y:2}},{x:2,y:0},on)).toBe(NO_LOCAL);
  const enclosed={...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,1),tile(2,0)],objects:[],warps:[]}};
  expect(await status(enclosed,{x:2,y:0},on)).toBe(NO_LOCAL);
  expect(await status(field,{x:9,y:9},on)).toBe(NO_LOCAL);
  expect(await status({...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,1),tile(2,0)],objects:[],warps:[]},topology:{width:2,height:2,connections:[]}},{x:1,y:0},on)).toBe(NO_LOCAL);
 });
 it("prefers the counter hint when counter-talk-v1 is on",async()=>{
  const counter={...field,position:{x:0,y:2},navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0),tile(2,0),tile(0,1,1,0x80),tile(1,1,1,0x80),tile(2,1,1,0x80),tile(0,2),tile(1,2),tile(2,2)],objects:[{x:1,y:0}],warps:[]}};
  expect(await status(counter,{x:1,y:1},{...on,counters:true})).toBe("target is behind a counter; walk to (1,2), face UP toward the counter at (1,1) and press A to talk across it");
 });
 it("off keeps the generic refusal text byte for byte",async()=>{
  const bounded={...mom,topology:{width:20,height:20,connections:[]}};
  for(const goal of [{x:1,y:1},{x:25,y:3}]){
   expect(await status(bounded,goal)).toBe(NO_LOCAL);
   expect(await status(bounded,goal,{refusalReasons:false})).toBe(NO_LOCAL);
  }
 });
});

describe("navigation-refusal-reasons-v1 production wiring",()=>{
 it("withNavigation reads the switch from the FeatureSet",async()=>{
  const state:GameStateSnapshot={...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:8,y:7},facing:"up",field_controls_locked:true,navigation_grid:{elevation:3,tiles:[tile(8,7),tile(9,7)],objects:[],warps:[]},world_context:world(true,"The PROF isn't one for doing desk work.")};
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
  let posts=0;
  const fetchFn:typeof fetch=(input)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=state;if(url.endsWith("/action")){posts++;body={status:"success"};}else if(url.endsWith("/queue_status"))body={queue_empty:true};else if(url.endsWith("/pokebench/observation"))body={state,state_text:"message",screenshot_base64:png.toString("base64")};return Promise.resolve(new Response(JSON.stringify(body)));};
  const refusal=async(enabled:boolean):Promise<unknown>=>{
   const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"navigation-refusal-reasons-v1":enabled};
   const tools=withNavigation([observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})],features,{read:()=>Promise.resolve(state)});
   const nav=tools.find(t=>t.name==="navigate_to");if(!nav)throw new Error("Missing navigation");
   const outcome=await nav.execute("nav",{x:10,y:7,map_id:[0,9]});
   return (outcome.details as {navigation:{status:string}}).navigation.status;
  };
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["navigation-refusal-reasons-v1"]).toBe(false);
  expect(await refusal(true)).toBe(MESSAGE);
  expect(await refusal(false)).toBe(UNAVAILABLE);
  expect(posts).toBe(0);
 });
 it("the tool description is unchanged by the switch",()=>{
  const ports={read:()=>Promise.resolve(field),press:()=>Promise.reject(new Error("unused")),observe:()=>Promise.reject(new Error("unused"))};
  expect(navigationTool({...ports,refusalReasons:true}).description).toBe(navigationTool(ports).description);
 });
});
