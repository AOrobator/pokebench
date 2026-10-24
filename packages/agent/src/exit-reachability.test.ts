import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// exit-reachability-v1: one walk-reachability check (the server's exit_reach) read by every exit list and navigate_to message.
// Fixture exit-reach-states.json.gz: recorded state bodies (envelope stripped) from runs/<id>/events.jsonl, each with the
// exit_reach the server code (env/pokebench_env/exit_reach.py) reads from that state's own raw-RAM archive, and map_grids,
// the whole-map grid full-map-navigation-v1 would have sent. Runs:
// - 2026-10-17T11-15-07_qwen36-gpu0_0e05 seq 22539-22579: navigate_to (12,0) on ROUTE104 from the south half, eight presses;
//   tool result 22580 said "call navigate_to again to continue to (12,0)" though the flood reaches no tile above y=38.
// - 2026-10-16T20-49-11_qwen36-gpu1_4198 seq 23325: navigate_to MAY at (10,3) on ROUTE103 from (16,7); tool result 23326 said
//   none of her free neighbouring tiles can be reached from here, though the map's walkable area reaches all of them (west).
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {FEATURES,SERVER_FEATURES,featureInfo,featuresOf,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {MAX_FULL_ROUTE_COMMANDS,navigationTool,withNavigation} from "./navigation.js";
import {exitReach} from "./surf-gate.js";
import {loopSupervisor,playGameTools} from "./play-wiring.js";
import {UntakenExits} from "./untaken-exits.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {edgeNote} from "./connection-edges.js";
import {checkEvent,type RunEvent} from "./events.js";
import type {CheckedPressTool} from "./game-tools.js";
import {IN_GAME} from "../test-support/events.js";

const ID="exit-reachability-v1";
interface Fixture {readonly harness_features:Record<string,string[]>;readonly states:Record<string,unknown>;readonly map_grids:Record<string,unknown>;readonly results:Record<string,string>}
const FIXTURE=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/exit-reach-states.json.gz",import.meta.url))).toString("utf8")) as Fixture;
const recorded=(key:string,full=false):GameStateSnapshot=>{const body=FIXTURE.states[key];if(body===undefined)throw new Error(`missing ${key}`);return parseGameState(full?{...(body as object),map_grid:FIXTURE.map_grids[key]}:body);};
const runFeatures=(tag:string):FeatureSet=>{const list=FIXTURE.harness_features[tag];if(list===undefined)throw new Error(tag);return {...featuresOf(list),[ID]:false};};
const resultLine=(key:string):string=>FIXTURE.results[key]??"";
const ROUTE104=["0e05:22539","0e05:22544","0e05:22549","0e05:22554","0e05:22559","0e05:22564","0e05:22569","0e05:22574","0e05:22579"];

const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
// The production factory over fake ordinary tools. Replay: each press returns the next recorded state. Walk: each press
// moves the player one tile in the pressed direction (synthetic maps).
type Presses=readonly GameStateSnapshot[]|"walk";
const STEP:Readonly<Record<string,readonly [number,number]>>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
async function navigate(features:FeatureSet,start:GameStateSnapshot,goal:{x:number;y:number},presses:Presses=[]):Promise<{line:string;status:string}> {
 let current=start,count=0;
 const next=(_id:string,params:{buttons:string[]}):Promise<AgentToolResult<{state:GameStateSnapshot}>>=>{
  if(presses==="walk"){const [dx,dy]=STEP[params.buttons[0]??""]??[0,0];const p=current.position;if(p===null)throw new Error("no position");current={...current,position:{x:p.x+dx,y:p.y+dy}};count++;return Promise.resolve(result(current));}
  const s=presses[count++];if(s===undefined)throw new Error("unexpected press");current=s;return Promise.resolve(result(s));
 };
 const observe={name:"observe",label:"observe",description:"observe",parameters:{},execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
 const press={name:"press",label:"press",description:"press",parameters:{},execute:next,executeChecked:next} as unknown as CheckedPressTool;
 const tools=withNavigation([observe,press],features,{read:()=>Promise.resolve(current)});
 const nav=tools.find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("no navigate_to");
 const map=start.map_id;if(map===null)throw new Error("no map");
 const out=await nav.execute("nav",{...goal,map_id:[map[0],map[1]]});
 const part=out.content[0];
 return {line:part?.type==="text"?part.text:"",status:(out.details as {navigation:{status:string}}).navigation.status};
}
const cell=(collision:number,behavior=0,elevation=3):string=>((collision<<12)|(elevation<<8)|behavior).toString(16).padStart(4,"0");
const hexRows=(rows:readonly string[]):string[]=>rows.map(r=>{const bits=Array.from(r).map(c=>c==="#"?"0":"1").join("").padEnd(Math.ceil(r.length/4)*4,"0");return Array.from({length:bits.length/4},(_,i)=>Number.parseInt(bits.slice(i*4,i*4+4),2).toString(16)).join("");});
// A synthetic field from rows (# wall, anything else floor) as both the local window and the whole map, with the
// flood's foot rows marking every floor tile.
function field(rows:readonly string[],player:{x:number;y:number}):GameStateSnapshot {
 const width=rows[0]?.length??0,height=rows.length;
 const all=rows.flatMap((r,y)=>Array.from(r).map((c,x)=>({x,y,collision:c==="#"?1:0,behavior:0,elevation:3})));
 // The local window: the whole field when it fits in 15x15 tiles, else the tiles within 7 of the player (schema bound).
 const tiles=all.length<=225?all:all.filter(t=>Math.abs(t.x-player.x)<=7&&Math.abs(t.y-player.y)<=7);
 return {...IN_GAME,started:true,screen:"overworld",location:"ROUTE",map_id:[0,9],position:player,facing:"down",field_controls_locked:false,
  navigation_grid:{elevation:3,tiles,objects:[],warps:[]},
  map_grid:{width,height,elevation:3,rows:rows.map(r=>Array.from(r).map(c=>c==="#"?cell(1):cell(0)).join("")),objects:[],warps:[]},
  interaction_targets:[],topology:{width,height,connections:[]},
  exit_reach:{warps:[],connections:[],foot:{width,height,rows:hexRows(rows)}}};
}
const NAV:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"ledge-hops-v1":true,"one-way-tiles-v1":true,"navigation-refusal-reasons-v1":true,"navigation-truth-v1":true};

describe("exit-reachability-v1: 'call navigate_to again' stays for a goal on foot reach, in both modes",()=>{
 it("local map: a corridor longer than eight presses",async()=>{
  const s=field(["............"],{x:0,y:0});
  const CONTINUE="command limit: stopped at (8,0) after 8 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (11,0)";
  expect((await navigate(NAV,s,{x:11,y:0},"walk")).status).toBe(CONTINUE);
  expect((await navigate({...NAV,[ID]:true},s,{x:11,y:0},"walk")).status).toBe(CONTINUE);
 });
 it("whole map: command-limit guidance is identical ON and OFF at an injected tiny bound",async()=>{
  expect(MAX_FULL_ROUTE_COMMANDS).toBe(512);
  const initial=field(["............"],{x:0,y:0});
  const statuses:string[]=[];
  for(const enabled of [false,true]){
   let current=initial,presses=0;
   const tool=navigationTool({fullMap:true,truth:true,exitReach:enabled,maxCommands:3,
    read:()=>Promise.resolve(current),observe:()=>Promise.resolve(result(current)),
    press:(_id,params)=>{expect(params.buttons).toEqual(["RIGHT"]);presses++;current={...current,position:{x:presses,y:0}};return Promise.resolve(result(current));}});
   const output=await tool.execute("bounded-full-map",{x:11,y:0,map_id:[0,9]});
   expect(presses).toBe(3);
   expect(output.details).toMatchObject({navigation:{commands:3,status:"command limit: stopped at (3,0) after 3 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (11,0)"}});
   statuses.push(output.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n"));
  }
  expect(statuses[1]).toBe(statuses[0]);
 });
});

describe("exit-reachability-v1: navigate_to's command-limit text on ROUTE104 (0e05 T890, seq 22538-22580)",()=>{
 const start=recorded(ROUTE104[0]??""),after=ROUTE104.slice(1).map(k=>recorded(k));
 it("OFF reproduces the recorded result line byte for byte",async()=>{
  expect((await navigate(runFeatures("0e05"),start,{x:12,y:0},after)).line).toBe(resultLine("0e05:22580"));
 });
 it("ON says (12,0) cannot be reached on foot from where you stand instead of 'call navigate_to again'",async()=>{
  const {line}=await navigate({...runFeatures("0e05"),[ID]:true},start,{x:12,y:0},after);
  expect(line).toBe("Navigation: command limit: stopped at (18,42) after 8 ordinary button attempts, the most one navigate_to call makes; (12,0) cannot be reached on foot from where you stand: no walkable way on this map leads from your tile to it or to a tile next to it, so calling navigate_to again will not get there; 8 ordinary button attempts.");
  expect(line).not.toContain("call navigate_to again to continue");
 });
 it("the helper's foot set: the player's tile and the south half, nothing above y=38, nothing off the map",()=>{
  const reach=exitReach({...runFeatures("0e05"),[ID]:true},recorded("0e05:22579"));
  expect([reach.footNear(17,50),reach.foot(12,0),reach.foot(18,42),reach.foot(40,0),reach.foot(-1,0),reach.foot(18,37)]).toEqual([true,false,true,false,false,false]);
 });
 it("whole-map mode: the whole-map plan refuses (12,0) before any press, ON as OFF",async()=>{
  const full:FeatureSet={...runFeatures("0e05"),"full-map-navigation-v1":true};
  const s=recorded("0e05:22579",true);
  for(const features of [full,{...full,[ID]:true}]){
   const unreachable=await navigate(features,s,{x:12,y:0});
   expect(unreachable.status).toBe("no supported path on the current map; choose a reachable waypoint");
  }
 });
});

describe("exit-reachability-v1: the person refusal for MAY at (10,3) on ROUTE103 (4198 T592, seq 23324-23326)",()=>{
 const may=recorded("4198:23325");
 it("OFF reproduces the recorded result line byte for byte",async()=>{
  expect((await navigate(runFeatures("4198"),may,{x:10,y:3})).line).toBe(resultLine("4198:23326"));
 });
 it("ON, local map: a route exists outside the 15x15 local map, and the nearest reachable tile on its edge is named",async()=>{
  const {status}=await navigate({...runFeatures("4198"),[ID]:true},may,{x:10,y:3});
  expect(status).not.toContain("can be reached from here");
  expect(status).toBe("(10,3) is RIVAL_MAY_NORMAL (person or object), which navigate_to cannot stand on; none of its free neighbouring tiles can be reached inside the 15x15 local map navigate_to plans over, but this map's walkable area reaches (10,4) next to it, so the way there leaves that local map; walk to (9,6) on its west edge first, then call navigate_to (10,3) again");
 });
 it("ON, whole map: the whole-map plan reaches her, so the refusal offers the tiles to talk from and never mentions a local window",async()=>{
  const features:FeatureSet={...runFeatures("4198"),"full-map-navigation-v1":true};
  const on=await navigate({...features,"coherent-battle-observation-v1":false,[ID]:true},recorded("4198:23325",true),{x:10,y:3});
  const off=await navigate(features,recorded("4198:23325",true),{x:10,y:3});
  expect(on.status).toBe(off.status);
  expect(on.status).toContain("walk to one of these free tiles, face it and press A");
  expect(on.status).not.toContain("15x15");
 });
});

// Synthetic: a 6x3 whole map; MAY at (4,1) with people on her other sides; the only way to her free neighbour (3,1) runs
// through a person at (2,1) in the wall's gap. The whole-map plan cannot pass people; the flood (which ignores them) can.
function synthetic():GameStateSnapshot {
 const rows=["..#...","......","..#..."].map(r=>Array.from(r).map(c=>c==="#"?cell(1):cell(0)).join(""));
 const footRows=["dc","fc","dc"];
 const reachable={warps:[],connections:[],foot:{width:6,height:3,rows:footRows}};
 return {...IN_GAME,started:true,screen:"overworld",location:"ROUTE",map_id:[0,9],position:{x:0,y:1},facing:"down",field_controls_locked:false,
  map_grid:{width:6,height:3,elevation:3,rows,objects:[{x:2,y:1},{x:4,y:0},{x:4,y:1},{x:4,y:2},{x:5,y:1}],warps:[]},
  navigation_grid:{elevation:3,tiles:[0,1,2].flatMap(y=>[0,1,2,3,4,5].map(x=>({x,y,collision:x===2&&y!==1?1:0,behavior:0,elevation:3}))),objects:[{x:2,y:1},{x:4,y:0},{x:4,y:1},{x:4,y:2},{x:5,y:1}],warps:[]},
  interaction_targets:[{kind:"object",x:4,y:1,elevation:3,activation:"A",availability:"available",facing:null,local_id:3,destination:null,name:"MAY"}],
  topology:{width:6,height:3,connections:[]},exit_reach:reachable};
}
describe("exit-reachability-v1: whole-map person refusal",()=>{
 const base:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":true,"ledge-hops-v1":true,"one-way-tiles-v1":true,"navigation-refusal-reasons-v1":true,"navigation-truth-v1":true};
 it("a neighbour on foot reach but off every whole-map route: names it, no guessed causes and no local-window wording",async()=>{
  const on=await navigate({...base,[ID]:true},synthetic(),{x:4,y:1});
  expect(on.status).toBe("(4,1) is MAY (person or object), which navigate_to cannot stand on; navigate_to finds no route on this map to a free tile next to it right now, though this map's walkable area reaches (3,1) next to it; choose a waypoint nearer to it");
  const off=await navigate(base,synthetic(),{x:4,y:1});
  expect(off.status).toBe("(4,1) is MAY (person or object), which navigate_to cannot stand on, and none of its free neighbouring tiles can be reached from here; choose a reachable waypoint nearer to it");
 });
 it("local map: when the flood inside the window reaches the neighbour, the plan (not the window) is what failed",async()=>{
  const local={...base,"full-map-navigation-v1":false};
  expect((await navigate({...local,[ID]:true},synthetic(),{x:4,y:1})).status).toBe("(4,1) is MAY (person or object), which navigate_to cannot stand on; navigate_to finds no route on the 15x15 local map it plans over to a free tile next to it right now, though this map's walkable area reaches (3,1) next to it; choose a waypoint nearer to it");
 });
 it("no neighbour on foot reach: says so plainly",async()=>{
  const s=synthetic();
  const walled={...s,exit_reach:{warps:[],connections:[],foot:{width:6,height:3,rows:["c0","c0","c0"]}}} as GameStateSnapshot;
  expect((await navigate({...base,[ID]:true},walled,{x:4,y:1})).status).toBe("(4,1) is MAY (person or object), which navigate_to cannot stand on, and none of its neighbouring tiles can be reached on foot from where you stand: no walkable way on this map leads there; choose another target");
 });
});

// ROUTE104 (0e05 seq 22579): the exits labelled none are the flower shop, the woods' north and east mouths and the NORTH edge.
describe("exit-reachability-v1: exit lists on ROUTE104 (0e05 seq 22579)",()=>{
 const s=recorded("0e05:22579");
 const OFF_LINE="Exits here you have not taken: (17,50) -> map 17/0; (5,18) -> map 17/1; (10,30) -> map 24/11; (11,30) -> map 24/11; (10,38) -> map 24/11; (11,38) -> map 24/11; (32,42) -> map 24/11; (33,42) -> map 24/11; NORTH edge -> map 0/3; EAST edge -> map 0/0";
 it("untaken exits: OFF lists every exit as today; ON leaves out the five warps and the NORTH edge you cannot walk to",()=>{
  expect(new UntakenExits(runFeatures("0e05")).line(s,"")).toBe(OFF_LINE);
  expect(new UntakenExits({...runFeatures("0e05"),[ID]:true}).line(s,"")).toBe("Exits here you have not taken: (17,50) -> map 17/0; (10,38) -> map 24/11; (11,38) -> map 24/11; EAST edge -> map 0/0");
 });
 const edge=(direction:string)=>{const c=s.topology?.connections.find(k=>k.direction===direction);if(c===undefined)throw new Error(direction);return c;};
 it("the helper blocks only none (and water while Surf cannot be used, with surf-gated-exits-v1 on)",()=>{
  const on=exitReach({...runFeatures("0e05"),[ID]:true},s);
  expect([on.warp(5,18),on.warp(10,38),on.warp(32,42),on.connection(edge("NORTH")),on.connection(edge("EAST")),on.connection(edge("SOUTH"))]).toEqual([true,false,true,true,false,true]);
  expect([on.warpCut(5,18),on.connectionCut(edge("SOUTH")),on.connectionCut(edge("EAST"))]).toEqual(["none","water",null]);
  const off=exitReach(runFeatures("0e05"),s);
  expect([off.warp(5,18),off.connection(edge("NORTH")),off.connection(edge("SOUTH")),off.foot(18,42)]).toEqual([false,false,true,null]);
  const noSurf=exitReach({...runFeatures("0e05"),[ID]:true,"surf-gated-exits-v1":false},s);
  expect([noSurf.connection(edge("SOUTH")),noSurf.connection(edge("NORTH"))]).toEqual([false,true]);
 });
 it("says why none is left: cut off on foot, or across water and cut off",()=>{
  const features={...runFeatures("0e05"),[ID]:true};
  const north={...s,interaction_targets:(s.interaction_targets??[]).filter(t=>t.kind!=="warp"||t.x===5),topology:s.topology==null?null:{...s.topology,connections:s.topology.connections.filter(c=>c.direction==="NORTH")}} as GameStateSnapshot;
  expect(new UntakenExits(features).line(north,"")).toBe("Exits here you have not taken: none you can walk to (no exit listed on this map can be reached on foot from where you stand)");
  const both={...north,topology:s.topology} as GameStateSnapshot;
  const noEast={...both,topology:both.topology==null?null:{...both.topology,connections:both.topology.connections.filter(c=>c.direction!=="EAST")}} as GameStateSnapshot;
  expect(new UntakenExits(features).line(noEast,"")).toBe("Exits here you have not taken: none you can walk to (every exit listed on this map is across water you cannot Surf yet or cannot be reached on foot from where you stand)");
 });
 it("surf-gated-exits-v2 rewords only the water part; the on-foot part is exit-reachability-v1's own",()=>{
  // GetInteractedWaterScript (src/field_control_avatar.c) returns no script, so the game shows nothing, unless badge 5
  // and a party Surf user both hold: v2 states only the fact.
  const features={...runFeatures("0e05"),[ID]:true,"surf-gated-exits-v2":true};
  const north={...s,interaction_targets:(s.interaction_targets??[]).filter(t=>t.kind!=="warp"||t.x===5),topology:s.topology==null?null:{...s.topology,connections:s.topology.connections.filter(c=>c.direction==="NORTH")}} as GameStateSnapshot;
  expect(new UntakenExits(features).line(north,"")).toBe("Exits here you have not taken: none you can walk to (no exit listed on this map can be reached on foot from where you stand)");
  const noEast={...north,topology:s.topology==null?null:{...s.topology,connections:s.topology.connections.filter(c=>c.direction!=="EAST")}} as GameStateSnapshot;
  expect(new UntakenExits(features).line(noEast,"")).toBe("Exits here you have not taken: none you can walk to (every exit listed on this map is across water you cannot cross yet or cannot be reached on foot from where you stand)");
  const water={...s,interaction_targets:[],topology:s.topology==null?null:{...s.topology,connections:s.topology.connections.filter(c=>c.direction==="SOUTH")}} as GameStateSnapshot;
  expect(new UntakenExits(features).line(water,"")).toBe("Exits here you have not taken: none you can walk to (every exit listed on this map is across water you cannot cross yet)");
  expect(new UntakenExits({...features,"coherent-battle-observation-v1":false,"surf-gated-exits-v2":false}).line(water,"")).toBe("Exits here you have not taken: none you can walk to (every exit listed on this map is across water, and you cannot use Surf yet)");
 });
 it("the supervisor's lists and ways-off line leave them out with the switch on and are unchanged off",()=>{
  const shown:RunEvent[]=[
   checkEvent({v:1,run:"s",t:"2026-10-17T13:00:00.000-04:00",turn:1,seq:1,type:"state",...s}),
   checkEvent({v:1,run:"s",t:"2026-10-17T13:00:00.000-04:00",turn:1,seq:2,type:"tool_result",id:"c1",name:"observe",is_error:false,duration_ms:1,text:"Location: ROUTE104",frames:[],state_seq:1}),
  ];
  const brief=(features:FeatureSet)=>{const b=new SupervisorBriefing(features);for(const e of shown)b.observe(e);return b.stallText({kind:"milestone_drought",minutes:5},9);};
  const features={...runFeatures("0e05"),"briefing-exits-v1":true,"connection-edge-tiles-v1":true};
  const off=brief(features),on=brief({...features,"coherent-battle-observation-v1":false,[ID]:true});
  const pick=(text:string,head:string)=>text.split("\n").find(l=>l.startsWith(head))??"";
  const WAYS="- Ways off this map across its edge (the game's map connections)";
  expect(pick(off,WAYS)).toContain("NORTH -> RUSTBORO CITY (map 0/3)");
  expect(pick(on,WAYS)).toBe(`${WAYS}: EAST -> PETALBURG CITY (map 0/0): stand on (39,62) or (39,63) and press RIGHT`);
  const EXITS="- Exits to maps you have not entered since your last story progress";
  expect(pick(off,EXITS)).toContain("at 5,18");
  expect(pick(on,EXITS)).not.toContain("at 5,18");
  expect(pick(on,EXITS)).not.toContain("NORTH edge");
  const UNTRIED="- Listed here that you have not tried yet";
  expect(pick(off,UNTRIED)).toContain("at 10,30");
  expect(pick(on,UNTRIED)).not.toContain("at 10,30");
  expect(pick(on,UNTRIED)).toContain("at 10,38");
  // Only the lines that list exits change.
  const changed=off.split("\n").filter((l,i)=>l!==on.split("\n")[i]).map(l=>l.split(":")[0]);
  expect(changed.sort()).toEqual([EXITS,UNTRIED,WAYS].sort());
 });
 it("edgeNote leaves out a connection the helper blocks and is unchanged without a block",()=>{
  const topology=s.topology;
  expect(edgeNote(topology,{x:12,y:0})).toContain("walk off the map NORTH to RUSTBORO CITY");
  const block=exitReach({...runFeatures("0e05"),[ID]:true},s);
  expect(edgeNote(topology,{x:12,y:0},block.connection)).toBeNull();
  expect(edgeNote(topology,{x:39,y:62},block.connection)).toContain("walk off the map EAST");
 });
});

// untaken-exits-v1 groups warps by destination; with this switch a tile labelled none is not printed, even when
// another tile of the same doorway can be walked to.
describe("exit-reachability-v1: one doorway, tiles with different labels",()=>{
 const door=(x:number,y:number)=>({kind:"warp",x,y,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[24,11,0] as [number,number,number],name:"Warp to map 24/11"});
 const state={...field(["......"],{x:0,y:0}),interaction_targets:[door(1,0),door(5,0)],
  exit_reach:{warps:[{x:1,y:0,reach:"foot"},{x:5,y:0,reach:"none"}],connections:[],foot:{width:6,height:1,rows:["c0"]}}} as GameStateSnapshot;
 it("ON prints only the tile you can walk to; OFF prints both, as today",()=>{
  expect(new UntakenExits({...NAV,[ID]:true}).line(state,"")).toBe("Exits here you have not taken: (1,0) -> map 24/11");
  expect(new UntakenExits(NAV).line(state,"")).toBe("Exits here you have not taken: (1,0) or (5,0) -> map 24/11");
 });
 it("surf-gated-exits-v1 alone keeps printing every tile of a doorway that is not wholly across water",()=>{
  const gate={can_surf:false,balance_badge:false,party_surf:false,surfing:false,warps:[{x:5,y:0}],connections:[]};
  expect(new UntakenExits({...NAV,"surf-gated-exits-v1":true}).line({...state,surf_gate:gate},"")).toBe("Exits here you have not taken: (1,0) or (5,0) -> map 24/11");
 });
});

// Route 111 has two WEST connections and Route 124 two EAST ones: each connection is looked up on its own.
describe("exit-reachability-v1: two connections on one side",()=>{
 const west=(destination:[number,number],offset:number,x:number)=>({direction:"WEST" as const,offset,destination,destination_name:`ROUTE ${String(destination[1])}`,edges:[{x:0,y:x}]});
 const A=west([0,1],0,0),B=west([0,2],2,2);
 const two={...field(["..","##",".."],{x:1,y:0}),topology:{width:2,height:3,connections:[A,B]},
  exit_reach:{warps:[],connections:[{direction:"WEST",destination:[0,1],offset:0,reach:"foot"},{direction:"WEST",destination:[0,2],offset:2,reach:"none"}],foot:{width:2,height:3,rows:["c","0","0"]}}} as GameStateSnapshot;
 const features:FeatureSet={...NAV,"world-destinations-v1":true,[ID]:true};
 it("blocks only the one cut off, and the untaken line keeps the other",()=>{
  const block=exitReach(features,two);
  expect([block.connection(A),block.connection(B),block.connectionCut(B)]).toEqual([false,true,"none"]);
  expect(new UntakenExits(features).line(two,"")).toBe("Exits here you have not taken: WEST edge -> map 0/1");
  expect(new UntakenExits({...features,"coherent-battle-observation-v1":false,[ID]:false}).line(two,"")).toBe("Exits here you have not taken: WEST edge -> map 0/1; WEST edge -> map 0/2");
  expect(edgeNote(two.topology,{x:0,y:0},block.connection)).toContain("WEST to ROUTE 1 (map 0/1)");
  expect(edgeNote(two.topology,{x:0,y:2},block.connection)).toBeNull();
 });
});

// A foot mask that does not have exactly height rows of ceil(width/4) hex digits, or whose size disagrees with the
// map's, is unknown: nothing is left out and nothing is called unreachable.
describe("exit-reachability-v1: malformed foot masks are unknown",()=>{
 const s=recorded("0e05:22579");
 const reach=s.exit_reach;if(reach==null)throw new Error("no exit_reach");
 const rows=reach.foot.rows;
 const edge=(direction:string)=>{const c=s.topology?.connections.find(k=>k.direction===direction);if(c===undefined)throw new Error(direction);return c;};
 const masks:Record<string,NonNullable<GameStateSnapshot["exit_reach"]>["foot"]>={
  truncated:{...reach.foot,rows:rows.slice(0,40)},
  short:{...reach.foot,rows:rows.map((r,y)=>y===42?r.slice(0,4):r)},
  long:{...reach.foot,rows:rows.map((r,y)=>y===0?`${r}0`:r)},
  "other size":{width:41,height:80,rows:rows.map(r=>`${r}0`)},
 };
 for(const [name,foot] of Object.entries(masks)){
  it(`${name}: no foot answer, every exit listed, no "cannot be reached" text`,async()=>{
   const bad={...s,exit_reach:{...reach,foot}} as GameStateSnapshot;
   const features={...runFeatures("0e05"),[ID]:true};
   const block=exitReach(features,bad);
   expect([block.foot(18,42),block.footNear(12,0),block.warp(5,18),block.connection(edge("NORTH"))]).toEqual([null,null,false,false]);
   expect(new UntakenExits(features).line(bad,"")).toBe(new UntakenExits(runFeatures("0e05")).line(s,""));
   const start=recorded(ROUTE104[0]??""),after=ROUTE104.slice(1).map(k=>recorded(k));
   const last=after.length-1;const walked=after.map((a,i)=>i===last?{...a,exit_reach:{...reach,foot}}:a);
   expect((await navigate(features,start,{x:12,y:0},walked)).line).toBe(resultLine("0e05:22580"));
  });
 }
});

describe("exit-reachability-v1 schema, registry and presets",()=>{
 it("a state carrying exit_reach is schema-valid; a malformed one is not",()=>{
  const s=FIXTURE.states["0e05:22579"] as Record<string,unknown>;
  const event={v:1,run:"s",t:"2026-10-17T13:00:00.000-04:00",turn:1,seq:1,type:"state",...s};
  expect(()=>checkEvent(event)).not.toThrow();
  const reach=s.exit_reach as {warps:unknown[];connections:unknown[];foot:{rows:string[]}};
  expect(()=>checkEvent({...event,exit_reach:{...reach,warps:[{x:1,y:1,reach:"maybe"}]}})).toThrow();
  expect(()=>checkEvent({...event,exit_reach:{...reach,foot:{...reach.foot,rows:["XYZ"]}}})).toThrow();
  expect(()=>checkEvent({...event,exit_reach:{...reach,extra:1}})).toThrow();
  expect(()=>checkEvent({...event,exit_reach:{...reach,connections:[{direction:"WEST",reach:"foot"}]}})).toThrow();
 });
 it("is a default-off server observation switch recorded last, described as bundle arm only",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true,title:"EXIT REACHABILITY"});
  const description=featureInfo(ID).description;
  expect(description).toContain(" Off: ");
  expect(description).toContain("bundle arm only");
  expect(description).not.toContain("both arms");
  expect(FEATURES.filter(f=>f.switchable).at(102)?.id).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-38)).toBe(ID);
  expect(SERVER_FEATURES.at(-42)).toBe(ID);
  expect(serverFeatureEnv({...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 });
 it("defaults off in presets that omit it and in legacy flag presets",()=>{
  const {[ID]:omitted,...rest}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(rest as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 });
});

describe("exit-reachability-v1 production wiring (playGameTools and loopSupervisor)",()=>{
 const BASE:FeatureSet={...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,"battle-move-tool-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"dialogue-auto-advance-v1":false,"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false,"next-milestone-hint-v1":false,"story-destinations-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false};
 const snapshot=recorded("0e05:22579");
 const readout="Screen: overworld\nLocation: ROUTE104\nPosition: X=18, Y=42, facing left\nMoney: 1";
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state:snapshot}})}) as unknown as AgentTool;
 const recorder=()=>{const observers:((e:RunEvent)=>void)[]=[];return {observers,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),textOnlySupervisor:()=>undefined,storyDestinations:()=>undefined,subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);}};};
 const text=async(tools:readonly AgentTool[])=>{const r=await tools.find(t=>t.name==="observe")?.execute("id",{});const part=r?.content[0];return part?.type==="text"?part.text:"";};
 it("playGameTools passes the switch to the untaken-exits line",async()=>{
  const on=await text(playGameTools([tool("observe")],{...BASE,[ID]:true},{read:()=>Promise.resolve(snapshot)},recorder()));
  const off=await text(playGameTools([tool("observe")],{...BASE,[ID]:false},{read:()=>Promise.resolve(snapshot)},recorder()));
  expect(off).toContain("(5,18) -> map 17/1");
  expect(on).not.toContain("(5,18) -> map 17/1");
  expect(on).not.toContain("NORTH edge");
 });
 it("loopSupervisor passes the switch to the briefing's edge line",()=>{
  const ways=(features:FeatureSet)=>{
   const r=recorder();const loop=loopSupervisor(features,r);
   const events:RunEvent[]=[
    checkEvent({v:1,run:"s",t:"2026-10-17T13:00:00.000-04:00",turn:1,seq:1,type:"state",...snapshot}),
    checkEvent({v:1,run:"s",t:"2026-10-17T13:00:00.000-04:00",turn:1,seq:2,type:"tool_result",id:"c1",name:"observe",is_error:false,duration_ms:1,text:"Location: ROUTE104",frames:[],state_seq:1}),
   ];
   for(const e of events)for(const o of r.observers)o(e);
   return (loop?.("cycle",9)??"").split("\n").find(l=>l.startsWith("- Ways off this map"))??"";
  };
  expect(ways({...BASE,[ID]:false})).toContain("NORTH -> RUSTBORO CITY");
  expect(ways({...BASE,[ID]:true})).not.toContain("NORTH -> RUSTBORO CITY");
 });
});
