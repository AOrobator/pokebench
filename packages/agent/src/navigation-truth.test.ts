// navigation-truth-v1 (cook harness audit 2026-10-16, items 1-7) and navigation-refusal-reasons-v2.
// Recorded states come from runs/<id>/events.jsonl (state events, envelope and heavy unused fields stripped).
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {matchingTriggers,navigationTool,planNavigation,withNavigation,type NavigationPorts} from "./navigation.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {LoopDetector,LOOP_POLICY,type CompletedCall,type LoopNotice} from "./loop-detection.js";
import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {observeTool,pressTool,type Clock} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {decisionContext,parseRun} from "./decision-probe.js";
import {RUN_START_META} from "../test-support/events.js";
import type {Button,RunEvent} from "./events.js";

const STATES=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/navigation-truth-states.json.gz",import.meta.url))).toString("utf8")) as Record<string,unknown>;
const recorded=(key:string):GameStateSnapshot=>{const body=STATES[key];if(body===undefined)throw new Error(`missing fixture state ${key}`);return parseGameState(body);};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});

// The bundle arm's terrain switches; the refusal switches vary per test.
const TERRAIN={ledges:true,oneWay:true,elevation:"game"} as const satisfies Partial<NavigationPorts>;
const TRUTH={...TERRAIN,refusalReasons:true,truth:true,triggers:true} as const satisfies Partial<NavigationPorts>;
const CONTROL={...TERRAIN,refusalReasons:true} as const satisfies Partial<NavigationPorts>;

// Replays a recorded walk: read() returns the latest state; each press returns the next recorded result.
async function walk(start:GameStateSnapshot,goal:{x:number;y:number},ports:Partial<NavigationPorts>,after:readonly GameStateSnapshot[]=[]):Promise<{status:string;text:string;presses:number}> {
 let current=start,presses=0;
 const tool=navigationTool({read:()=>Promise.resolve(current),press:()=>{const next=after[presses++];if(next===undefined)throw new Error("unexpected press");current=next;return Promise.resolve(result(next));},observe:()=>Promise.resolve(result(current)),...ports});
 const map=start.map_id;if(map===null)throw new Error("no map");
 const outcome=await tool.execute("nav",{...goal,map_id:[map[0],map[1]]},new AbortController().signal);
 const text=outcome.content[0]?.type==="text"?outcome.content[0].text:"";
 return {status:(outcome.details as {navigation:{status:string}}).navigation.status,text,presses};
}


const chars=(row:string):string[]=>Array.from({length:row.length},(_,x)=>row.charAt(x));
const gridOf=(s:GameStateSnapshot):NonNullable<GameStateSnapshot["navigation_grid"]>=>{if(s.navigation_grid==null)throw new Error("no grid");return s.navigation_grid;};
const mapOf=(s:GameStateSnapshot):NonNullable<GameStateSnapshot["map_grid"]>=>{if(s.map_grid==null)throw new Error("no map grid");return s.map_grid;};
const contextOf=(s:GameStateSnapshot):NonNullable<GameStateSnapshot["world_context"]>=>{if(s.world_context==null)throw new Error("no context");return s.world_context;};
// A synthetic local window from rows: . floor, # wall, T floor with a matching trigger, @ player.
function ascii(rows:readonly string[],topology:{width:number;height:number}|null=null):GameStateSnapshot {
 const tiles=rows.flatMap((row,y)=>chars(row).map((c,x)=>({x,y,collision:c==="#"?1:0,behavior:0,elevation:3})));
 const at=rows.flatMap((row,y)=>chars(row).flatMap((c,x)=>c==="@"?[{x,y}]:[]))[0]??{x:0,y:0};
 const triggers=rows.flatMap((row,y)=>chars(row).flatMap((c,x)=>c==="T"?[{x,y,elevation:3,variable:0x4002,required_value:0,current_value:0,condition_met:true,script_pointer:0x08100000}]:[]));
 return {screen:"overworld",started:true,name:"A",location:"ROUTE",map_id:[0,9],position:at,facing:"down",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:{elevation:3,tiles,objects:[],warps:[]},world_context:{objects:[],triggers,dialogue:null},...(topology===null?{}:{topology:{...topology,connections:[]}})};
}

describe("navigation-truth-v1: talk offers only for objects with a script (sh02 T260 seq 5861)",()=>{
 const birch=recorded("sh02:5860");
 it("PROF_BIRCH on Route 101 has script 0x0 and is not an interaction target, so no 'press A' offer",async()=>{
  expect(birch.interaction_targets?.some(t=>t.x===4&&t.y===13)).toBe(false);
  expect((await walk(birch,{x:4,y:13},TRUTH)).status).toBe("(4,13) is a person or object (sprite PROF_BIRCH), which navigate_to cannot stand on; it is not listed as something you can talk to or use, so navigate_to offers no tile to talk to it from");
 });
 it("counter-talk-v1 offers to talk across a counter only to someone with a script",async()=>{
  const counter:GameStateSnapshot={...ascii(["...","...","@.."]),navigation_grid:{elevation:3,tiles:[0,1,2].flatMap(y=>[0,1,2].map(x=>({x,y,collision:y===1?1:0,behavior:y===1?0x80:0,elevation:3}))),objects:[{x:1,y:0}],warps:[]},position:{x:0,y:2}};
  const clerk={kind:"object",x:1,y:0,elevation:3,activation:"A",availability:"available",facing:null,local_id:1,destination:null,name:"MART_EMPLOYEE"};
  const TALK="target is behind a counter; walk to (1,2), face UP toward the counter at (1,1) and press A to talk across it";
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:0},{...TRUTH,counters:true})).status).toBe(TALK);
  expect((await walk({...counter,interaction_targets:[]},{x:1,y:0},{...CONTROL,counters:true})).status).toBe(TALK);
  expect((await walk({...counter,interaction_targets:[]},{x:1,y:0},{...TRUTH,counters:true})).status).toBe("(1,0) is a person or object, which navigate_to cannot stand on; it is not listed as something you can talk to or use, so navigate_to offers no tile to talk to it from");
  expect((await walk({...counter,interaction_targets:null},{x:1,y:0},{...TRUTH,counters:true})).status).toBe(TALK);
  // The counter itself as the target: talk is offered only when someone with a script stands behind it.
  const BEHIND="target is a counter or behind one; you cannot stand on a counter, but you can face it from a reachable adjacent tile and press A to talk to someone behind it";
  const lone={...counter,navigation_grid:{...gridOf(counter),objects:[]},interaction_targets:[]};
  expect((await walk(lone,{x:1,y:1},{...CONTROL,counters:true})).status).toBe(BEHIND);
  expect((await walk(lone,{x:1,y:1},{...TRUTH,counters:true})).status).not.toContain("press A");
  expect((await walk({...counter,interaction_targets:[]},{x:1,y:1},{...TRUTH,counters:true})).status).not.toContain("press A");
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:1},{...TRUTH,counters:true})).status).toBe(TALK);
 });
 it("a scriptless object on a tile that also lists another A target: no talk offer; the other target is named as listed, without a promise (its elevation, facing and flags decide)",async()=>{
  // pokeemerald GetInteractionScript tries the object's script first, then background events and metatiles, each
  // under its own conditions (elevation, facing, a hidden item's flag, a secret base's check).
  const live=[{local_id:2,map_id:[0,9] as [number,number],graphics_id:7,sprite_kind:"BOY_1",x:2,y:1}];
  const item=ascii(["...","@..","..."]);
  const on=(kind:string,elevation:number,facing:string|null,name:string|null=null,base:GameStateSnapshot=item):GameStateSnapshot=>({...base,navigation_grid:{...gridOf(base),objects:[{x:2,y:1}]},world_context:{...contextOf(base),objects:live},interaction_targets:[{kind,x:2,y:1,elevation,activation:"A",availability:"conditional",facing,local_id:null,destination:null,name}]});
  const solid=(state:GameStateSnapshot):GameStateSnapshot=>({...state,navigation_grid:{...gridOf(state),tiles:gridOf(state).tiles.map(t=>t.x===2&&t.y===1?{...t,collision:1}:t)}});
  const NONE="(2,1) is a person or object (sprite BOY_1), which navigate_to cannot stand on; it is not listed as something you can talk to or use, so navigate_to offers no tile to talk to it from";
  const ALSO=(what:string)=>`(2,1) is a person or object (sprite BOY_1), which navigate_to cannot stand on; it is not listed as something you can talk to, so navigate_to offers no tile to talk to it from; the state also lists ${what} on that tile, which pressing A may use if the game's own conditions for it are met`;
  const OFFER="(2,1) is a person or object, which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: (2,0) facing DOWN; (2,2) facing UP; (1,1) facing RIGHT";
  expect((await walk(on("hidden_item",3,null),{x:2,y:1},CONTROL)).status).toBe(OFFER);
  expect((await walk(on("hidden_item",3,null),{x:2,y:1},TRUTH)).status).toBe(ALSO("a hidden item"));
  expect((await walk(on("hidden_item",4,null),{x:2,y:1},TRUTH)).status).toBe(ALSO("a hidden item"));
  expect((await walk(on("background",3,"up"),{x:2,y:1},TRUTH)).status).toBe(ALSO("a background"));
  expect((await walk(solid(on("background",3,"up")),{x:2,y:1},CONTROL)).status).toBe("(2,1) is a background, which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: (2,0) facing DOWN; (2,2) facing UP; (1,1) facing RIGHT");
  expect((await walk(solid(on("background",3,"up")),{x:2,y:1},TRUTH)).status).toBe(ALSO("a background"));
  expect((await walk(solid(on("metatile_television",3,"up","television")),{x:2,y:1},TRUTH)).status).toBe(ALSO("television (metatile television)"));
  expect((await walk(solid(on("metatile_secret_base_pc",4,null,"secret base pc")),{x:2,y:1},TRUTH)).status).toBe(ALSO("secret base pc (metatile secret base pc)"));
  // No reachable neighbour: the same facts.
  const walled=ascii(["###","@#.","###"]);
  expect((await walk(on("hidden_item",3,null,null,walled),{x:2,y:1},CONTROL)).status).toBe("(2,1) is a person or object, which navigate_to cannot stand on, and none of its free neighbouring tiles can be reached from here; choose a reachable waypoint nearer to it");
  expect((await walk(on("hidden_item",3,null,null,walled),{x:2,y:1},TRUTH)).status).toBe(ALSO("a hidden item"));
  // Nothing else listed on the tile: the no-script text.
  expect((await walk({...on("hidden_item",3,null),interaction_targets:[]},{x:2,y:1},TRUTH)).status).toBe(NONE);
  expect((await walk(solid({...on("hidden_item",3,null),interaction_targets:[]}),{x:2,y:1},TRUTH)).status).toBe(NONE);
 });
 it("stacked objects: A reaches only the object at the player's elevation (Route 120 Kecleon (12,16): scripted at 4, a scriptless shadow at 3)",async()=>{
  const base=ascii(["...","@..","..."]);
  const kecleon={kind:"object",x:2,y:1,elevation:4,activation:"A",availability:"available",facing:null,local_id:1,destination:null,name:"KECLEON"};
  const live=[{local_id:1,map_id:[0,9] as [number,number],graphics_id:180,sprite_kind:"KECLEON",x:2,y:1},{local_id:2,map_id:[0,9] as [number,number],graphics_id:180,sprite_kind:"KECLEON",x:2,y:1}];
  const state:GameStateSnapshot={...base,navigation_grid:{...gridOf(base),objects:[{x:2,y:1}]},world_context:{...contextOf(base),objects:live},interaction_targets:[kecleon]};
  const OFFER="(2,1) is KECLEON (person or object), which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: (2,0) facing DOWN; (2,2) facing UP; (1,1) facing RIGHT";
  expect((await walk(state,{x:2,y:1},CONTROL)).status).toBe(OFFER);
  expect((await walk(state,{x:2,y:1},TRUTH)).status).toBe("(2,1) is KECLEON (person or object), which navigate_to cannot stand on; it is at elevation 4, and every free neighbouring tile navigate_to can reach puts you at another elevation, where facing it and pressing A does not reach it; choose a waypoint at its elevation");
  // At the player's elevation, or at elevation 0 (matches any), the offer stays.
  expect((await walk({...state,interaction_targets:[{...kecleon,elevation:3}]},{x:2,y:1},TRUTH)).status).toBe(OFFER);
  expect((await walk({...state,interaction_targets:[{...kecleon,elevation:0}]},{x:2,y:1},TRUTH)).status).toBe(OFFER);
  expect((await walk({...state,interaction_targets:[kecleon,{...kecleon,elevation:5,local_id:2}]},{x:2,y:1},TRUTH)).status).toContain("it is at elevation 4 or 5, and every free neighbouring tile");
  // Two scripted objects stacked: the offer names the one at the stand tiles' elevation.
  expect((await walk({...state,interaction_targets:[kecleon,{...kecleon,elevation:3,local_id:2,name:"BOY_1"}]},{x:2,y:1},TRUTH)).status).toBe(OFFER.replace("KECLEON","BOY_1"));
 });
 it("stacked objects behind a counter: no talk offer to a scripted person at another elevation",async()=>{
  const counter:GameStateSnapshot={...ascii(["...","...","@.."]),navigation_grid:{elevation:3,tiles:[0,1,2].flatMap(y=>[0,1,2].map(x=>({x,y,collision:y===1?1:0,behavior:y===1?0x80:0,elevation:3}))),objects:[{x:1,y:0}],warps:[]},position:{x:0,y:2}};
  const clerk={kind:"object",x:1,y:0,elevation:4,activation:"A",availability:"available",facing:null,local_id:1,destination:null,name:"MART_EMPLOYEE"};
  const TALK="target is behind a counter; walk to (1,2), face UP toward the counter at (1,1) and press A to talk across it";
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:0},{...CONTROL,counters:true})).status).toBe(TALK);
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:0},{...TRUTH,counters:true})).status).not.toContain("press A");
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:1},{...TRUTH,counters:true})).status).not.toContain("press A");
  expect((await walk({...counter,interaction_targets:[{...clerk,elevation:3}]},{x:1,y:0},{...TRUTH,counters:true})).status).toBe(TALK);
 });
 it("counter talk uses the elevation the route brings to the stand tile (3 -> 0 -> 4), not the start elevation",async()=>{
  // y=0 the clerk's row (elevation 4), y=1 counters, y=2 (0,2) elevation 0 and the stand (1,2) elevation 4, y=3 the player at (0,3) elevation 3.
  const elevation=(x:number,y:number):number=>y===0?4:y===2?(x===0?0:4):3;
  const solid=(x:number,y:number):boolean=>y===1||(y===2&&x===2)||(y===3&&x>0);
  const tiles=[0,1,2,3].flatMap(y=>[0,1,2].map(x=>({x,y,collision:solid(x,y)?1:0,behavior:y===1?0x80:0,elevation:elevation(x,y)})));
  const base=ascii(["@"]);
  const counter:GameStateSnapshot={...base,position:{x:0,y:3},navigation_grid:{elevation:3,tiles,objects:[{x:1,y:0}],warps:[]}};
  const clerk={kind:"object",x:1,y:0,elevation:4,activation:"A",availability:"available",facing:null,local_id:1,destination:null,name:"MART_EMPLOYEE"};
  const TALK="target is behind a counter; walk to (1,2), face UP toward the counter at (1,1) and press A to talk across it";
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:0},{...CONTROL,counters:true})).status).toBe(TALK);
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:0},{...TRUTH,counters:true})).status).toBe(TALK);
  expect((await walk({...counter,interaction_targets:[clerk]},{x:1,y:1},{...TRUTH,counters:true})).status).toBe(TALK);
  // A clerk at the start elevation (3) is not reached from the elevation-4 stand.
  const low={...counter,interaction_targets:[{...clerk,elevation:3}]};
  expect((await walk(low,{x:1,y:0},{...CONTROL,counters:true})).status).toBe(TALK);
  expect((await walk(low,{x:1,y:0},{...TRUTH,counters:true})).status).not.toContain("press A");
  expect((await walk(low,{x:1,y:1},{...TRUTH,counters:true})).status).not.toContain("press A");
 });
 it("counter talk never names a stand tile with a matching trigger",async()=>{
  const counter:GameStateSnapshot={...ascii(["...","...","@.."]),navigation_grid:{elevation:3,tiles:[0,1,2].flatMap(y=>[0,1,2].map(x=>({x,y,collision:y===1?1:0,behavior:y===1?0x80:0,elevation:3}))),objects:[{x:1,y:0}],warps:[]},position:{x:0,y:2}};
  const clerk={kind:"object",x:1,y:0,elevation:3,activation:"A",availability:"available",facing:null,local_id:1,destination:null,name:"MART_EMPLOYEE"};
  const trigger={x:1,y:2,elevation:3,variable:0x4002,required_value:0,current_value:0,condition_met:true,script_pointer:0x08100000};
  const state:GameStateSnapshot={...counter,interaction_targets:[clerk],world_context:{...contextOf(counter),triggers:[trigger]}};
  const TALK="target is behind a counter; walk to (1,2), face UP toward the counter at (1,1) and press A to talk across it";
  expect((await walk(state,{x:1,y:0},{...CONTROL,counters:true})).status).toBe(TALK);
  expect((await walk(state,{x:1,y:0},{...TRUTH,counters:true})).status).not.toContain("walk to (1,2)");
  expect((await walk(state,{x:1,y:1},{...TRUTH,counters:true})).status).not.toContain("walk to (1,2)");
 });
 it("stacked scripted objects reached from different stand tiles are named per tile",async()=>{
  // (0,0) 3, (1,0) 0, (2,0) 4: a route to (2,0) arrives at 4; (1,1) is reached at 3. HIGH (4) and LOW (3) share (2,1).
  const elevation=(x:number,y:number):number=>y===0?[3,0,4][x]??3:3;
  const tiles=[0,1,2].flatMap(y=>[0,1,2].map(x=>({x,y,collision:y===2?1:0,behavior:0,elevation:elevation(x,y)})));
  const base=ascii(["@"]);
  const high={kind:"object",x:2,y:1,elevation:4,activation:"A",availability:"available",facing:null,local_id:1,destination:null,name:"HIGH"};
  const state:GameStateSnapshot={...base,position:{x:0,y:1},navigation_grid:{elevation:3,tiles,objects:[{x:2,y:1}],warps:[]},interaction_targets:[high,{...high,elevation:3,local_id:2,name:"LOW"}]};
  expect((await walk(state,{x:2,y:1},CONTROL)).status).toBe("(2,1) is HIGH (person or object), which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: (2,0) facing DOWN; (1,1) facing RIGHT");
  expect((await walk(state,{x:2,y:1},TRUTH)).status).toBe("(2,1) is HIGH or LOW (persons or objects stacked at different elevations), which navigate_to cannot stand on; to talk to one, walk to one of these free tiles, face it and press A: (2,0) facing DOWN (reaches HIGH); (1,1) facing RIGHT (reaches LOW)");
 });
 it("an object with a script keeps the offer",async()=>{
  const bag=await walk(birch,{x:7,y:14},TRUTH);
  expect(bag.status).toContain("(7,14) is BIRCHS_BAG (person or object), which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: ");
 });
 it("off keeps today's offer byte for byte",async()=>{
  expect((await walk(birch,{x:4,y:13},CONTROL)).status).toBe("(4,13) is a person or object, which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: (4,12) facing DOWN; (4,14) facing UP");
 });
});

describe("navigation-truth-v1: matching coordinate triggers are not walked across",()=>{
 const birch=recorded("sh02:5860");
 it("sh02 T261: (4,12) is reachable only across the active PreventExit triggers, and the refusal names the first one",async()=>{
  const on=await walk(birch,{x:4,y:12},TRUTH);
  expect(on.presses).toBe(0);
  expect(on.status).toBe("every route navigate_to sees to (4,12) crosses a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (6,15) (variable 0x4060=2, needs 2); stepping on such a tile runs a script that can stop you or send you back, so navigate_to does not walk across one; target (6,15) itself to step on it on purpose");
 });
 it("the claim is that every route crosses some matching trigger, not one named tile",()=>{
  const plan={ledges:true,oneWay:true,elevation:"game" as const};
  const all=matchingTriggers(birch);
  expect(planNavigation(birch,{x:4,y:12},{...plan,triggers:all})).toBeNull();
  // Blocking only the tile the refusal names leaves a route through its neighbour (6,16), so no single tile is claimed.
  expect(planNavigation(birch,{x:4,y:12},{...plan,triggers:all.filter(t=>t.x===6&&t.y===15)})).not.toBeNull();
  const town=recorded("3f21:2373");
  expect(planNavigation(town,{x:10,y:0},{...plan,triggers:matchingTriggers(town)})).toBeNull();
  expect(planNavigation(town,{x:10,y:0},{...plan,triggers:matchingTriggers(town).filter(t=>t.x===11)})).not.toBeNull();
 });
 it("off plans straight through the trigger, as the run did",async()=>{
  const step=recorded("sh02:5860");
  const off=await walk(birch,{x:4,y:12},{...CONTROL,maxCommands:1},[{...step,position:{x:10,y:15}}]);
  expect(off.presses).toBe(1);
 });
 it("the trigger tile itself stays a valid destination",async()=>{
  const step=recorded("sh02:5860");
  const on=await walk(birch,{x:6,y:15},{...TRUTH,maxCommands:1},[{...step,position:{x:10,y:15}}]);
  expect(on.presses).toBe(1);
 });
 it("3f21 T123 seq 2374: the nearest walkable suggestion skips (10,0) behind the NeedPokemon triggers",async()=>{
  const town=recorded("3f21:2373");
  expect((await walk(town,{x:7,y:0},CONTROL)).status).toBe("(7,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (10,0)");
  expect((await walk(town,{x:7,y:0},TRUTH)).status).toBe("(7,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (6,2); (10,0) is as close, but every route navigate_to sees to it crosses a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (11,1) (variable 0x4050=0, needs 0)");
 });
 it("connection-edge-tiles-v1 no longer points the model at the gated north exit",async()=>{
  const town=recorded("3f21:2373");
  const edges={...town,topology:{width:20,height:20,connections:[{direction:"NORTH" as const,offset:0,destination:[0,16] as [number,number],destination_name:"ROUTE101",edges:[{x:10,y:0},{x:11,y:0}]}]}};
  expect((await walk(edges,{x:7,y:0},{...CONTROL,connectionEdges:true})).status).toContain("the nearest walkable tile navigate_to can reach is (10,0), an edge tile of this map");
  const on=(await walk(edges,{x:7,y:0},{...TRUTH,connectionEdges:true})).status;
  expect(on).toContain("the nearest walkable tile navigate_to can reach is (6,2);");
  expect(on).not.toContain("edge tile");
 });
 it("a trigger that runs immediately (variable 0) or does not match is still walkable",async()=>{
  const town=recorded("3f21:2373");
  const ctx=town.world_context;if(ctx==null)throw new Error("no context");
  const open={...town,world_context:{...ctx,triggers:ctx.triggers.map(t=>t.condition_met===true?{...t,variable:0}:t)}};
  expect((await walk(open,{x:7,y:0},TRUTH)).status).toBe("(7,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (10,0)");
  const unmatched={...town,world_context:{...ctx,triggers:ctx.triggers.map(t=>({...t,condition_met:false}))}};
  expect((await walk(unmatched,{x:7,y:0},TRUTH)).status).toBe("(7,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (10,0)");
  const otherElevation={...town,world_context:{...ctx,triggers:ctx.triggers.map(t=>({...t,elevation:5}))}};
  expect((await walk(otherElevation,{x:7,y:0},TRUTH)).status).toBe("(7,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (10,0)");
 });
 it("a ledge hop that lands on a matching trigger is not planned, and the refusal names the landing tile",async()=>{
  const tile=(x:number,behavior=0)=>({x,y:0,collision:0,behavior,elevation:3});
  const trigger={x:2,y:0,elevation:0,variable:0x4001,required_value:1,current_value:1,condition_met:true,script_pointer:0x08100000};
  const row:GameStateSnapshot={screen:"overworld",started:true,name:"A",location:"ROUTE",map_id:[0,9],position:{x:0,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:{elevation:3,tiles:[tile(0),tile(1,0x38),tile(2),tile(3)],objects:[],warps:[]},world_context:{objects:[],triggers:[trigger],dialogue:null}};
  expect((await walk(row,{x:3,y:0},TRUTH)).status).toBe("every route navigate_to sees to (3,0) crosses a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (2,0) (variable 0x4001=1, needs 1); stepping on such a tile runs a script that can stop you or send you back, so navigate_to does not walk across one; target (2,0) itself to step on it on purpose");
  expect((await walk(row,{x:2,y:0},{...TRUTH,maxCommands:1},[{...row,position:{x:2,y:0}}])).status).toBe("arrived at requested coordinate");
  expect((await walk({...row,world_context:{objects:[],triggers:[{...trigger,current_value:null,condition_met:true}],dialogue:null}},{x:3,y:0},TRUTH)).status).toContain("(variable 0x4001=unknown, needs 1)");
 });
 it("names a gated tile that is closer, one that is itself a trigger, and one when no free tile is in range",async()=>{
  // Goal (2,0) is a wall; (2,1) is closer but only reachable through the trigger at (1,1); (4,0) is free.
  const closer=ascii(["@##..","#T.##","#####"]);
  expect((await walk({...closer,navigation_grid:{...gridOf(closer),tiles:gridOf(closer).tiles.map(t=>t.x===0&&t.y===1?{...t,collision:0}:t)},position:{x:0,y:0}},{x:2,y:0},TRUTH)).status).toBe("(2,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (0,0); (2,1) is closer, but every route navigate_to sees to it crosses a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (1,1) (variable 0x4002=0, needs 0)");
  // The only walkable tile beside the wall goal is a trigger itself.
  const itself=ascii(["#####","##T##","..@.."]);
  expect((await walk(itself,{x:2,y:0},TRUTH)).status).toBe("(2,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (2,2); (2,1) is closer, but it is (2,1), a script-trigger tile whose condition matches now (variable 0x4002=0, needs 0)");
  // No free tile within 3 steps of the goal; the gated one is named.
  const none=ascii(["@#####","#T.#..","######"]);
  const open={...none,navigation_grid:{...gridOf(none),tiles:gridOf(none).tiles.map(t=>t.x===0&&t.y===1?{...t,collision:0}:t)}};
  expect((await walk(open,{x:4,y:0},TRUTH)).status).toBe("(4,0) is a wall or other solid tile, not a walkable tile; no walkable tile navigate_to can reach lies within 3 steps of it; (2,1) is within 3 steps, but every route navigate_to sees to it crosses a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (1,1) (variable 0x4002=0, needs 0)");
 });
 it("plans around a matching trigger on the whole map (full-map-navigation-v1) and names a blocker there",async()=>{
  const row="0300".repeat(3),trig="030003000300";
  const full:GameStateSnapshot={...ascii(["@.."]),navigation_grid:null,position:{x:0,y:0},map_grid:{width:3,height:2,elevation:3,rows:[trig,row],objects:[],warps:[]},world_context:{objects:[],triggers:[{x:1,y:0,elevation:3,variable:0x4003,required_value:2,current_value:2,condition_met:true,script_pointer:0x08100000}],dialogue:null}};
  const first=await walk(full,{x:2,y:0},{...TRUTH,fullMap:true,maxCommands:1},[{...full,position:{x:0,y:1}}]);
  expect(first.presses).toBe(1);
  const blocked={...full,map_grid:{...mapOf(full),objects:[{x:0,y:1}]},world_context:{...contextOf(full),objects:[{local_id:3,map_id:[0,9] as [number,number],graphics_id:7,sprite_kind:"BOY_1",x:0,y:1}]}};
  expect((await walk(full,{x:2,y:0},{...TRUTH,fullMap:true,maxCommands:1},[blocked])).status).toBe("blocked: a person or object (sprite BOY_1) is now on (0,1), the next tile of the route; wait for it to move or choose another approach");
  expect((await walk({...full,map_grid:{...mapOf(full),rows:[trig,"130013001300"]}},{x:2,y:0},{...TRUTH,fullMap:true,windowReasons:true})).status).toBe("every route navigate_to sees to (2,0) crosses a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (1,0) (variable 0x4003=2, needs 2); stepping on such a tile runs a script that can stop you or send you back, so navigate_to does not walk across one; target (1,0) itself to step on it on purpose");
  expect((await walk({...full,world_context:{objects:[],triggers:[],dialogue:null},map_grid:{...mapOf(full),rows:["030013000300","130013001300"]}},{x:2,y:0},{...TRUTH,fullMap:true,windowReasons:true})).status).toBe("no supported path on the current map; choose a reachable waypoint");
 });
 it("needs coordinate-script-conditions-v1: without the trigger switch the plan is unchanged",async()=>{
  const town=recorded("3f21:2373");
  expect((await walk(town,{x:7,y:0},{...TRUTH,triggers:false})).status).toBe("(7,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (10,0)");
 });
});

describe("navigation-truth-v1: a trigger on a multi-level tile matches the elevation the route brings",()=>{
 it("3 -> 0 -> 4 -> 15: the elevation-4 trigger on the multi-level tile (3,2) is not suggested as the nearest walkable tile",async()=>{
  // Row 2 only; walls around. (4,2) is a wall goal; (3,2) is multi-level (15) with an elevation-4 trigger.
  const elevations=[3,0,4,15];
  const tiles=[1,2,3].flatMap(y=>[0,1,2,3,4,5].map(x=>({x,y,collision:y===2&&x<4?0:1,behavior:0,elevation:y===2&&x<4?elevations[x]??3:3})));
  const trigger={x:3,y:2,elevation:4,variable:0x4002,required_value:0,current_value:0,condition_met:true,script_pointer:0x08100000};
  const base=ascii(["@"]);
  const state:GameStateSnapshot={...base,position:{x:0,y:2},navigation_grid:{elevation:3,tiles,objects:[],warps:[]},world_context:{...contextOf(base),triggers:[trigger]}};
  expect((await walk(state,{x:4,y:2},CONTROL)).status).toBe("(4,2) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (3,2)");
  const on=(await walk(state,{x:4,y:2},TRUTH)).status;
  expect(on).toBe("(4,2) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (2,2); (3,2) is closer, but it is (3,2), a script-trigger tile whose condition matches now (variable 0x4002=0, needs 0)");
 });
});

describe("navigation-truth-v1: a blocked step names who now stands on the route (54a7 T169 seq 3790)",()=>{
 it("FAT_MAN stepped from (13,14) to (14,14), directly below the player",async()=>{
  const plan=recorded("54a7:3784"),after=recorded("54a7:3788");
  expect((await walk(plan,{x:7,y:16},{...TERRAIN,truth:true},[after])).status).toBe("blocked: FAT_MAN (person or object) is now on (14,14), the next tile of the route; wait for it to move or choose another approach");
  expect((await walk(plan,{x:7,y:16},TERRAIN,[after])).status).toBe("blocked; inspect obstacle and choose another approach");
 });
 it("stacked objects on the next tile: the one at the player's elevation is named",async()=>{
  const plan=recorded("54a7:3784"),after=recorded("54a7:3788");
  const fat=(after.interaction_targets??[]).find(t=>t.name==="FAT_MAN");if(fat===undefined)throw new Error("no FAT_MAN");
  const stacked={...after,interaction_targets:[{...fat,elevation:4,local_id:9,name:"LOW"},fat]};
  expect((await walk(plan,{x:7,y:16},{...TERRAIN,truth:true},[stacked])).status).toBe("blocked: FAT_MAN (person or object) is now on (14,14), the next tile of the route; wait for it to move or choose another approach");
  expect((await walk(plan,{x:7,y:16},TERRAIN,[stacked])).status).toBe("blocked; inspect obstacle and choose another approach");
 });
 it("an unlisted sprite is named by its sprite kind, and an empty tile keeps the generic text",async()=>{
  const plan=recorded("54a7:3784"),after=recorded("54a7:3788");
  expect((await walk(plan,{x:7,y:16},{...TERRAIN,truth:true},[{...after,interaction_targets:[]}])).status).toBe("blocked: a person or object (sprite FAT_MAN) is now on (14,14), the next tile of the route; wait for it to move or choose another approach");
  const ctx=after.world_context;if(ctx==null)throw new Error("no context");
  const grid=after.navigation_grid;if(grid==null)throw new Error("no grid");
  expect((await walk(plan,{x:7,y:16},{...TERRAIN,truth:true},[{...after,interaction_targets:[],world_context:{...ctx,objects:[]}}])).status).toBe("blocked: a person or object is now on (14,14), the next tile of the route; wait for it to move or choose another approach");
  expect((await walk(plan,{x:7,y:16},{...TERRAIN,truth:true},[{...after,interaction_targets:[],world_context:{...ctx,objects:[]},navigation_grid:{...grid,objects:[]}}])).status).toBe("blocked; inspect obstacle and choose another approach");
 });
});

describe("navigation-truth-v1: a partial walk says where it stopped and why (sh02 T806 seq 13284)",()=>{
 it("walked (12,6) -> (13,7), then the target came into view as a wall",async()=>{
  const start=recorded("sh02:13273"),mid=recorded("sh02:13278"),end=recorded("sh02:13283");
  const on=await walk(start,{x:20,y:6},{...CONTROL,truth:true,triggers:true},[mid,end]);
  expect(on.presses).toBe(2);
  expect(on.status).toBe("walked from (12,6) to (13,7), then stopped: (20,6) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (19,7)");
  expect((await walk(start,{x:20,y:6},CONTROL,[mid,end])).status).toBe("(20,6) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (19,7)");
 });
 it("the press limit text follows the observation returned with it",async()=>{
  const tile=(x:number)=>({x,y:0,collision:0,behavior:0,elevation:3});
  const at=(x:number):GameStateSnapshot=>({screen:"overworld",started:true,name:"A",location:"ROUTE",map_id:[0,9],position:{x,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:{elevation:3,tiles:[0,1,2,3].map(tile),objects:[],warps:[]}});
  const run=async(final:GameStateSnapshot)=>{let current=at(0);const tool=navigationTool({maxCommands:1,truth:true,read:()=>Promise.resolve(current),press:()=>{current=at(1);return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(final))});
   const out=await tool.execute("n",{x:3,y:0,map_id:[0,9]},new AbortController().signal);return out.details as {state:GameStateSnapshot;navigation:{status:string}};};
  expect((await run(at(1))).navigation.status).toBe("command limit: stopped at (1,0) after 1 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (3,0)");
  const battle=await run({...at(1),screen:"battle",in_battle:true});
  expect(battle.state.screen).toBe("battle");
  expect(battle.navigation.status).toBe("command limit: stopped after 1 ordinary button attempts, the most one navigate_to call makes; the field is no longer free to walk, so inspect the new state");
  expect((await run({...at(1),map_id:[0,10]})).navigation.status).toContain("the field is no longer free to walk");
 });
 it("the per-call press limit says where it stopped",async()=>{
  const tile=(x:number)=>({x,y:0,collision:0,behavior:0,elevation:3});
  const at=(x:number):GameStateSnapshot=>({screen:"overworld",started:true,name:"A",location:"ROUTE",map_id:[0,9],position:{x,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:{elevation:3,tiles:[0,1,2,3,4,5].map(tile),objects:[],warps:[]}});
  expect((await walk(at(0),{x:5,y:0},{maxCommands:2,truth:true},[at(1),at(2)])).status).toBe("command limit: stopped at (2,0) after 2 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (5,0)");
  expect((await walk(at(0),{x:5,y:0},{maxCommands:2},[at(1),at(2)])).status).toBe("command limit");
 });
});

describe("navigation-refusal-reasons-v2: a route that leaves the 15x15 local map",()=>{
 const V2={...TERRAIN,windowReasons:true} as const;
 it("show T800: Route 101 north is reachable only around the window's east side",async()=>{
  const state=recorded("show:19866");
  expect((await walk(state,{x:6,y:4},TERRAIN)).status).toBe("no supported local path; choose a reachable local waypoint");
  expect((await walk(state,{x:6,y:4},V2)).status).toBe("no route to (6,4) lies inside the 15x15 local map navigate_to plans over, so any route leaves it; reachable tiles on its edge, nearest (6,4) first: (6,16) on the south edge, (14,9) on the east edge; walk to one, then call navigate_to (6,4) again");
 });
 it("e588 seq 21335: (11,3) beside MAY from (14,10)",async()=>{
  const state=recorded("e588:21334");
  const status=(await walk(state,{x:11,y:3},V2)).status;
  expect(status).toBe("no route to (11,3) lies inside the 15x15 local map navigate_to plans over, so any route leaves it; reachable tiles on its edge, nearest (11,3) first: (7,6) on the west edge, (11,17) on the south edge, (21,8) on the east edge; walk to one, then call navigate_to (11,3) again");
 });
 it("says when no edge tile can be reached, and keeps the generic text for a target outside the window",async()=>{
  const boxed=ascii(["#####","#@#.#","#####"],{width:20,height:20});
  expect((await walk(boxed,{x:3,y:1},{...TERRAIN,windowReasons:true})).status).toBe("no route to (3,1) lies inside the 15x15 local map navigate_to plans over, and navigate_to can reach no tile on that local map's edge from here; choose another target");
  expect((await walk(boxed,{x:10,y:10},{...TERRAIN,windowReasons:true})).status).toBe("no supported local path; choose a reachable local waypoint");
  // An edge tile with someone on it, or a matching trigger, is not listed.
  const edge=ascii(["@..#.","...#.","T..##"],{width:20,height:20});
  const occupied={...edge,navigation_grid:{...gridOf(edge),objects:[{x:2,y:2}]}};
  expect((await walk(occupied,{x:4,y:0},{...TRUTH,windowReasons:true})).status).toBe("no route to (4,0) lies inside the 15x15 local map navigate_to plans over, so any route leaves it; reachable tiles on its edge, nearest (4,0) first: (1,2) on the south edge; walk to one, then call navigate_to (4,0) again");
 });
 it("54a7 T213: (10,0) from (7,7) lists the east edge first",async()=>{
  expect((await walk(recorded("54a7:5216"),{x:10,y:0},V2)).status).toBe("no route to (10,0) lies inside the 15x15 local map navigate_to plans over, so any route leaves it; reachable tiles on its edge, nearest (10,0) first: (14,9) on the east edge, (10,14) on the south edge; walk to one, then call navigate_to (10,0) again");
 });
 it("only a goal the player could stand on: a wall, a person or a warp keeps the generic text with v2 alone",async()=>{
  const GENERIC="no supported local path; choose a reachable local waypoint";
  // 3f21 T123: (7,0) is a wall; the pending experiment runs v2 with refusal reasons v1 off.
  expect((await walk(recorded("3f21:2373"),{x:7,y:0},V2)).status).toBe(GENERIC);
  const edge=ascii(["@..#.","...#.","T..##"],{width:20,height:20});
  expect((await walk(edge,{x:3,y:0},V2)).status).toBe(GENERIC);
  const grid=gridOf(edge);
  expect((await walk({...edge,navigation_grid:{...grid,objects:[{x:4,y:0}]}},{x:4,y:0},V2)).status).toBe(GENERIC);
  expect((await walk({...edge,navigation_grid:{...grid,warps:[{x:4,y:0}]}},{x:4,y:0},V2)).status).toBe(GENERIC);
  expect((await walk({...edge,world_context:{...contextOf(edge),objects:[{local_id:1,map_id:[0,9],graphics_id:7,sprite_kind:"BOY_1",x:4,y:0}]}},{x:4,y:0},V2)).status).toBe(GENERIC);
  expect((await walk({...edge,interaction_targets:[{kind:"object",x:4,y:0,elevation:3,activation:"A",availability:"available",facing:null,local_id:1,destination:null,name:"BOY_1"}]},{x:4,y:0},V2)).status).toBe(GENERIC);
  expect((await walk(edge,{x:4,y:0},V2)).status).toContain("so any route leaves it");
 });
 it("a route inside the window that only the configured terrain switches miss (a ledge with ledge-hops-v1 off) keeps the generic text",async()=>{
  // A corridor at x=6: player (6,5), a south ledge (6,6), the goal (6,7); walls at x=5 and x=7; map 20x20.
  const tiles=[4,5,6,7].flatMap(y=>[5,6,7].map(x=>({x,y,collision:x===6?0:1,behavior:x===6&&y===6?0x3b:0,elevation:3})));
  const state:GameStateSnapshot={...ascii(["@"],{width:20,height:20}),position:{x:6,y:5},navigation_grid:{elevation:3,tiles,objects:[],warps:[]}};
  expect(planNavigation(state,{x:6,y:7},{ledges:true})).toEqual(["DOWN"]);
  expect(planNavigation(state,{x:6,y:7},{})).toBeNull();
  expect((await walk(state,{x:6,y:7},{windowReasons:true,elevation:"game"})).status).toBe("no supported local path; choose a reachable local waypoint");
 });
 it("a route inside the window that only the legacy elevation rule misses (elevation-transitions-v1 off) keeps the generic text",async()=>{
  // Corridor y=0: (0,0) elevation 3 (player), (1,0) 0, (2,0) 4, (3,0) 4 (goal); walls below; map 20x20.
  const elevations=[3,0,4,4];
  const tiles=[0,1].flatMap(y=>[0,1,2,3].map(x=>({x,y,collision:y===0?0:1,behavior:0,elevation:elevations[x]??3})));
  const state:GameStateSnapshot={...ascii(["@"],{width:20,height:20}),position:{x:0,y:0},navigation_grid:{elevation:3,tiles,objects:[],warps:[]}};
  expect(planNavigation(state,{x:3,y:0},{elevation:"game"})).toEqual(["RIGHT","RIGHT","RIGHT"]);
  expect(planNavigation(state,{x:3,y:0},{elevation:"legacy"})).toBeNull();
  expect((await walk(state,{x:3,y:0},{windowReasons:true,elevation:"legacy"})).status).toBe("no supported local path; choose a reachable local waypoint");
 });
 it("a route inside the window across a matching trigger that only walkable floor finds keeps the generic text",async()=>{
  // (0,0) player, (1,0) sand-like behavior 0x21 (walkable only with walkable-floor-v1), (2,0) a matching trigger, (3,0) the goal; map 20x20.
  const base=ascii(["@.T.","####"],{width:20,height:20});
  const state:GameStateSnapshot={...base,navigation_grid:{...gridOf(base),tiles:gridOf(base).tiles.map(t=>t.x===1&&t.y===0?{...t,behavior:0x21}:t)}};
  expect(planNavigation(state,{x:3,y:0},{floor:true})).toEqual(["RIGHT","RIGHT","RIGHT"]);
  expect((await walk(state,{x:3,y:0},{...TRUTH,windowReasons:true})).status).toBe("no supported local path; choose a reachable local waypoint");
  expect((await walk(state,{x:3,y:0},{...TERRAIN,windowReasons:true})).status).toBe("no supported local path; choose a reachable local waypoint");
  expect((await walk(state,{x:3,y:0},{...TRUTH,windowReasons:true,floor:true})).status).toBe("every route navigate_to sees to (3,0) crosses a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (2,0) (variable 0x4002=0, needs 0); stepping on such a tile runs a script that can stop you or send you back, so navigate_to does not walk across one; target (2,0) itself to step on it on purpose");
 });
 it("off keeps the generic text; full-map mode and unknown map bounds keep it too",async()=>{
  const state=recorded("e588:21334");
  expect((await walk(state,{x:11,y:3},TERRAIN)).status).toBe("no supported local path; choose a reachable local waypoint");
  expect((await walk({...state,topology:null},{x:11,y:3},V2)).status).toBe("no supported local path; choose a reachable local waypoint");
 });
});

describe("navigation-truth-v1: the loop guard mentions a reopened message only when one reopened",()=>{
 const field=(message:boolean):GameStateSnapshot=>({screen:"overworld",started:true,name:"RED",location:"TOWN",map_id:[0,0],position:{x:10,y:8},facing:"up",field_controls_locked:message,in_battle:false,party:[],money:0,badges:[],play_time_s:0,world_context:{objects:[],triggers:[],dialogue:message?"Hello!":null,...(message?{message:{phase:"dismiss_wait" as const,cursor:6,ready:true}}:{})}});
 const press=(state:GameStateSnapshot):CompletedCall=>({name:"press",args:{buttons:["A"]},isError:false,text:"ok",state,beforeState:state});
 const warn=(truth:boolean,state:GameStateSnapshot):string|undefined=>{
  const notices:LoopNotice[]=[];
  const detector=new LoopDetector(n=>notices.push(n),{...LOOP_POLICY,ineffective:2,cycleRepeats:2},"enforced",true,undefined,false,false,false,truth);
  for(let i=0;i<4;i++)detector.complete(press(state));
  return notices.find(n=>n.phase==="warning")?.message;
 };
 it("54a7 T125 seq 2745: four A presses on an empty tile opened no message",()=>{
  expect(warn(true,field(false))).toBe("The same interaction or input pattern is repeating without new game information. Use a single input, inspect the resulting interface, and choose an evidence-supported different approach.");
  expect(warn(false,field(false))).toBe("The same interaction or input pattern is repeating without new game information. Use a single input, inspect the resulting interface, and choose an evidence-supported different approach. Reopening the same message is not story progress.");
 });
 it("a navigate_to cycle that ends on a waiting message keeps the sentence",()=>{
  const nav=(state:GameStateSnapshot,x:number):CompletedCall=>({name:"navigate_to",args:{map_id:[0,0],x,y:8},isError:false,text:"ok",state,beforeState:state,acted:true});
  const notices:LoopNotice[]=[];
  const detector=new LoopDetector(n=>notices.push(n),{...LOOP_POLICY,ineffective:9,cycleRepeats:2},"enforced",true,undefined,false,false,false,true);
  for(let i=0;i<4;i++)detector.complete(nav(field(true),i%2===0?9:11));
  expect(notices.find(n=>n.phase==="warning")?.message).toContain("Reopening the same message is not story progress.");
 });
 it("an A press that reopens the same message keeps the sentence",()=>{
  expect(warn(true,field(true))).toBe("The same interaction or input pattern is repeating without new game information. Use a single input, inspect the resulting interface, and choose an evidence-supported different approach. Reopening the same message is not story progress.");
 });
});

// A recorded conversation replayed: a press moves to the next recorded state; reads move past states
// that do not accept input. The last state is held.
class Replay {
 private i=0;private pressed=false;
 constructor(private readonly states:readonly GameStateSnapshot[]){}
 private ready(s:GameStateSnapshot):boolean{return s.world_context?.message?.ready===true||s.active_ui!=null||(s.field_controls_locked===false&&this.pressed&&this.i===this.states.length-1);}
 current():GameStateSnapshot{const s=this.states[this.i];if(s===undefined)throw new Error("replay ended");return s;}
 private tick():GameStateSnapshot{const s=this.current();if(this.pressed&&!this.ready(s)&&this.i<this.states.length-1)this.i++;return s;}
 press(buttons:readonly Button[]){for(let n=0;n<buttons.length;n++){this.pressed=true;if(this.i<this.states.length-1)this.i++;}}
 read={read:()=>Promise.resolve(this.tick())};
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");this.press((JSON.parse(init.body) as {buttons:Button[]}).buttons);body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation")){const s=this.tick();body={state_text:"observed",screenshot_base64:PNG,state:s};}
  else{body=this.tick();}
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
}
const PNG=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
const DIALOGUE:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-auto-advance-v1":true};
function later(state:GameStateSnapshot,frames:number):GameStateSnapshot{const raw=state.raw_ram;if(raw==null)throw new Error("no raw ram");return {...state,raw_ram:{...raw,frame:raw.frame+frames}};}
async function pages(states:readonly GameStateSnapshot[],buttons:Button[],truth:boolean){
 const game=new Replay(states);const events:RunEvent[]=[];const subs:((e:RunEvent)=>void)[]=[];let seq=0;
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-10-16T05:00:00.000-04:00",turn:7,...body} as RunEvent;events.push(e);for(const s of subs)s(e);return {seq:e.seq,turn:7};};
 const recorder:AutoAdvanceRecorder={recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:o=>{subs.push(o);}};
 const clock:Clock&{t:number}={t:0,now:()=>clock.t,sleep:(ms:number)=>{clock.t+=ms;return Promise.resolve();}};
 const base=[observeTool("http://127.0.0.1",game.fetch),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()})];
 const tools:AgentTool[]=withDialogueAutoAdvance(base,{...DIALOGUE,"navigation-truth-v1":truth},{state:game.read,recorder,clock});
 const press=tools.find(t=>t.name==="press");if(press===undefined)throw new Error("no press");
 await press.execute("c",{buttons});
 return events.flatMap(e=>e.type==="dialogue_auto_advance"?e.pages:[]).map(p=>[p.speaker,p.speaker_source,p.text]);
}

describe("navigation-truth-v1: dialogue pages end where the game clears the box, not at a scroll (54a7 seq 3032)",()=>{
 const free=recorded("54a7:3009");
 const states=[free,...[3013,3014,3019,3020,3025,3026].map(s=>recorded(`54a7:${String(s)}`)),later(free,200),later(free,201)];
 it("one whole page from the SCIENTIST_1 conversation",async()=>{
  expect(await pages(states,["A"],true)).toEqual([["SCIENTIST_1","faced_sprite","The PROF isn't one for doing desk work.\nHe's the type of person who would\nrather go outside and experience\nthings than read about them here."]]);
 });
 it("off keeps the three scroll-line pages the run showed",async()=>{
  expect(await pages(states,["A"],false)).toEqual([
   ["SCIENTIST_1","faced_sprite","The PROF isn't one for doing desk work.\nHe's the type of person who would"],
   ["SCIENTIST_1","faced_sprite","rather go outside and experience"],
   ["SCIENTIST_1","faced_sprite","things than read about them here."]]);
 });
});

describe("navigation-truth-v1: speakers across a conversation",()=>{
 it("sh02 T922: MAY named on page 1 stays MAY while the player faces the same object",async()=>{
  const free=recorded("sh02:15706");
  const states=[free,...[15710,15711,15716,15717,15722,15723,15728,15729,15734,15735].map(s=>recorded(`sh02:${String(s)}`)),later(free,400),later(free,401)];
  const on=await pages(states,["A"],true);
  expect(on.map(p=>[p[0],p[1]])).toEqual([["MAY","name_prefix"],["MAY","name_prefix"],["MAY","name_prefix"],["MAY","name_prefix"],["MAY","name_prefix"]]);
  const off=await pages(states,["A"],false);
  expect(off.slice(1).every(p=>p[0]==="RIVAL_MAY_NORMAL"&&p[1]==="faced_sprite")).toBe(true);
 });
 it("the named speaker follows the faced object, by object, by listed target, or not at all",async()=>{
  const free=recorded("sh02:15706");
  const seqs=[15710,15711,15716,15717,15722,15723,15728,15729,15734,15735];
  const run=async(change:(s:GameStateSnapshot,seq:number)=>GameStateSnapshot)=>(await pages([free,...seqs.map(n=>change(recorded(`sh02:${String(n)}`),n)),later(free,400),later(free,401)],["A"],true)).map(p=>p[0]);
  const ctx=(s:GameStateSnapshot)=>{if(s.world_context==null)throw new Error("no context");return s.world_context;};
  // Only the interaction target identifies MAY's tile.
  expect(await run(s=>({...s,world_context:{...ctx(s),objects:[]}}))).toEqual(["MAY","MAY","MAY","MAY","MAY"]);
  // Only the listed targets identify who is faced: identity is the target's map-local id, not its tile.
  const target=(s:GameStateSnapshot)=>(s.interaction_targets??[]).find(t=>t.kind==="object");
  const as=(s:GameStateSnapshot,id:number,x:number)=>{const t=target(s);if(t===undefined)throw new Error("no target");return {...s,world_context:{...ctx(s),objects:[]},position:{x:x-1,y:3},interaction_targets:[{...t,local_id:id,x}]};};
  expect(await run((s,n)=>n>=15716?as(s,9,10):{...s,world_context:{...ctx(s),objects:[]}})).toEqual(["MAY","RIVAL_MAY_NORMAL","RIVAL_MAY_NORMAL","RIVAL_MAY_NORMAL","RIVAL_MAY_NORMAL"]);
  expect(await run((s,n)=>n>=15716?as(s,2,11):{...s,world_context:{...ctx(s),objects:[]}})).toEqual(["MAY","MAY","MAY","MAY","MAY"]);
  // Nothing known to be faced after the name, or an empty tile: the name is not carried (off carried it).
  expect(await run((s,n)=>n>=15716?{...s,facing:null}:s)).toEqual(["MAY",null,null,null,null]);
  expect(await run((s,n)=>n>=15716?{...s,facing:"up"}:s)).toEqual(["MAY",null,null,null,null]);
  // Another object (id 9) stands on the faced tile for the second message: the name is not carried; the faced target is used.
  expect(await run((s,n)=>n>=15716?{...s,world_context:{...ctx(s),objects:[{local_id:9,map_id:[0,18],graphics_id:20,sprite_kind:"BOY_1",x:10,y:3}]}}:s)).toEqual(["MAY","RIVAL_MAY_NORMAL","RIVAL_MAY_NORMAL","RIVAL_MAY_NORMAL","RIVAL_MAY_NORMAL"]);
 });
 it("a named speaker is not carried to an object at another elevation on the faced tile",async()=>{
  const free=recorded("sh02:15706");
  const seqs=[15710,15711,15716,15717,15722,15723,15728,15729,15734,15735];
  const ctx=(s:GameStateSnapshot)=>{if(s.world_context==null)throw new Error("no context");return s.world_context;};
  // From the second message, only a shadow (local id 7, elevation 4) is on MAY's tile (10,3); the player is at elevation 3.
  const shadow=(s:GameStateSnapshot):GameStateSnapshot=>{const t=(s.interaction_targets??[]).find(x=>x.kind==="object");if(t===undefined)throw new Error("no target");return {...s,world_context:{...ctx(s),objects:[{local_id:7,map_id:[0,18],graphics_id:105,sprite_kind:"RIVAL_MAY_NORMAL",x:10,y:3}]},interaction_targets:[{...t,local_id:7,elevation:4}]};};
  const states=[free,...seqs.map(n=>n>=15716?shadow(recorded(`sh02:${String(n)}`)):recorded(`sh02:${String(n)}`)),later(free,400),later(free,401)];
  expect((await pages(states,["A"],true)).map(p=>p[0])).toEqual(["MAY",null,null,null,null]);
  expect((await pages(states,["A"],false)).slice(1).every(p=>p[0]==="RIVAL_MAY_NORMAL")).toBe(true);
 });
 it("a line that starts with the player's name but does not narrate an action keeps its speaker",async()=>{
  const states=[7733,7740,7741,7746,7747,7752,7753,7758,7759,7764,7765,7770,7776,7778].map(s=>recorded(`sh02:${String(s)}`)).map(s=>{const w=s.world_context;return w?.dialogue==null?s:{...s,world_context:{...w,dialogue:w.dialogue.replace("GMREEN received the TORCHIC!","GMREEN is the type to rush in!")}};});
  expect((await pages(states,["B"],true)).at(-1)).toEqual(["PROF. BIRCH","name_prefix","GMREEN is the type to rush in!"]);
  const unnamed=states.map(s=>({...s,name:null}));
  expect((await pages(unnamed,["B"],true)).at(-1)?.[0]).toBe("PROF. BIRCH");
 });
 it("a page in a character's voice that starts with the player's name and a narration verb keeps its speaker (apprentice.inc: '{PLAYER} turned me down…')",async()=>{
  const states=[7733,7740,7741,7746,7747,7752,7753,7758,7759,7764,7765,7770,7776,7778].map(s=>recorded(`sh02:${String(s)}`)).map(s=>{const w=s.world_context;return w?.dialogue==null?s:{...s,world_context:{...w,dialogue:w.dialogue.replace("GMREEN received the TORCHIC!","GMREEN turned me down…")}};});
  expect((await pages(states,["B"],true)).at(-1)).toEqual(["PROF. BIRCH","name_prefix","GMREEN turned me down…"]);
 });
 it("a player named like a pronoun ('I') still gets narration without a speaker",async()=>{
  const states=[7733,7740,7741,7746,7747,7752,7753,7758,7759,7764,7765,7770,7776,7778].map(s=>recorded(`sh02:${String(s)}`)).map(s=>{const w=s.world_context;return {...(w?.dialogue==null?s:{...s,world_context:{...w,dialogue:w.dialogue.replaceAll("GMREEN","I")}}),name:"I"};});
  expect((await pages(states,["B"],true)).at(-1)).toEqual([null,null,"I received the TORCHIC!"]);
 });
 it("sh02 T334: the narration 'GMREEN received the TORCHIC!' has no speaker, and the scroll page is whole",async()=>{
  const states=[7733,7740,7741,7746,7747,7752,7753,7758,7759,7764,7765,7770,7776,7778].map(s=>recorded(`sh02:${String(s)}`));
  const on=await pages(states,["B"],true);
  expect(on.at(-1)).toEqual([null,null,"GMREEN received the TORCHIC!"]);
  expect(on.at(-2)).toEqual(["PROF. BIRCH","name_prefix","Oh, yes. As thanks for rescuing me,\nI'd like you to have the POKéMON you\nused earlier."]);
  const off=await pages(states,["B"],false);
  expect(off.at(-1)).toEqual(["PROF. BIRCH","name_prefix","GMREEN received the TORCHIC!"]);
 });
});

describe("production wiring",()=>{
 it("both switches are registered with their intended defaults",()=>{
  expect(featureInfo("navigation-truth-v1").description).toContain(" Off: ");
  expect(featureInfo("navigation-refusal-reasons-v2").needs).toBe("bounded-navigation-v1");
  const preset=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(preset["navigation-truth-v1"]).toBe(false);
  expect(preset["navigation-refusal-reasons-v2"]).toBe(false);
 });
 it("withNavigation reads navigation-truth-v1, coordinate-script-conditions-v1 and navigation-refusal-reasons-v2 from the FeatureSet",async()=>{
  let state=recorded("sh02:5860");
  const fetchFn:typeof fetch=(input)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;const body:unknown=url.endsWith("/action")?{status:"success"}:url.endsWith("/pokebench/observation")?{state,state_text:"observed",screenshot_base64:PNG}:url.endsWith("/queue_status")?{queue_empty:true}:state;return Promise.resolve(new Response(JSON.stringify(body)));};
  const status=async(features:Partial<FeatureSet>,goal:{x:number;y:number}):Promise<string>=>{
   const all:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"ledge-hops-v1":true,"one-way-tiles-v1":true,"navigation-refusal-reasons-v1":true,...features};
   const tools=withNavigation([observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})],all,{read:()=>Promise.resolve(state)});
   const nav=tools.find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("no navigation");
   return ((await nav.execute("n",{...goal,map_id:[state.map_id?.[0]??0,state.map_id?.[1]??0]})).details as {navigation:{status:string}}).navigation.status;
  };
  expect(await status({"navigation-truth-v1":true,"coordinate-script-conditions-v1":true},{x:4,y:13})).toContain("it is not listed as something you can talk to or use");
  expect(await status({"navigation-truth-v1":false,"coordinate-script-conditions-v1":true},{x:4,y:13})).toContain("to talk to it or use it");
  expect(await status({"navigation-truth-v1":true,"coordinate-script-conditions-v1":true},{x:4,y:12})).toContain("the first one on the route it would take without avoiding them is (6,15)");
  expect(await status({"navigation-truth-v1":true,"coordinate-script-conditions-v1":false},{x:4,y:12})).not.toContain("crosses");
  state=recorded("show:19866");
  expect(await status({"navigation-refusal-reasons-v2":true},{x:6,y:4})).toContain("so any route leaves it");
  expect(await status({"navigation-refusal-reasons-v2":false,"low-hp-trainer-warning-v2":false},{x:6,y:4})).toBe("no supported local path; choose a reachable local waypoint");
 });
});

describe("navigation-truth-v1 in the decision probe's replayed loop guard",()=>{
 // Four turns of A, A on a free tile with no message, recorded as a run; the probe replays the guard.
 const features=(truth:boolean):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-safe-batches-v1":true,"interaction-loop-detection-v1":true,"navigation-truth-v1":truth});
 const free:GameStateSnapshot={screen:"overworld",started:true,name:"RED",location:"LITTLEROOT TOWN",map_id:[0,9],position:{x:10,y:8},facing:"up",field_controls_locked:false,in_battle:false,party:[],money:0,badges:[],play_time_s:0,world_context:{objects:[],triggers:[],dialogue:null}};
 const log=(truth:boolean):string=>{
  let seq=0;const t="2026-10-16T05:00:00.000-04:00";
  const e=(turn:number,body:Record<string,unknown>)=>JSON.stringify({v:1,run:"probe",seq:++seq,t,turn,...body});
  const lines=[e(0,{type:"run_start",...RUN_START_META,tools:["observe","press"],harness_features:playHarnessFeatures(features(truth),null)})];
  for(let turn=1;turn<=4;turn++){
   const id=`call_${String(turn)}`;
   lines.push(e(turn,{type:"turn_start",context:{messages:1,images:0,est_tokens:10}}));
   lines.push(e(turn,{type:"assistant",thinking:"",text:"",tool_calls:[{id,name:"press",args:{buttons:["A","A"]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"}));
   lines.push(e(turn,{type:"tool_call",id,name:"press",args:{buttons:["A","A"]}}));
   lines.push(e(turn,{type:"state",...free}));
   const before=seq;
   lines.push(e(turn,{type:"button_press",tool_call_id:id,buttons:["A","A"],before_state_seq:before}));
   lines.push(e(turn,{type:"state",...free}));
   lines.push(e(turn,{type:"tool_result",state_seq:seq,id,name:"press",is_error:false,duration_ms:1,text:"pressed A, A",frames:[]}));
  }
  lines.push(e(5,{type:"turn_start",context:{messages:1,images:0,est_tokens:10}}));
  return lines.join("\n");
 };
 const ports={thinkingSignature:"reasoning_content",frame:()=>"",rerender:()=>Promise.reject(new Error("no rerender"))};
 const warning=async(truth:boolean):Promise<string>=>{
  const context=await decisionContext(parseRun(log(truth)),5,features(truth),ports);
  const last=context.messages.at(-1);
  if(last?.role!=="user"||typeof last.content!=="string")throw new Error("no guard text in the rebuilt context");
  return last.content;
 };
 it("drops the reopened-message sentence only with the switch on",async()=>{
  expect(await warning(true)).toContain("Use a single input");
  expect(await warning(true)).not.toContain("Reopening the same message");
  expect(await warning(false)).toContain("Reopening the same message is not story progress.");
 });
});
