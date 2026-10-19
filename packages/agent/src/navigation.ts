import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {Button} from "./events.js";
import {isCheckedPress,type BeforePressCheck,type CheckedPressOptions} from "./game-tools.js";
import type {FeatureSet} from "./features.js";
import {parseGameState,type StateSource,type GameStateSnapshot} from "./game-state.js";
import {COMMAND_LIMIT_HINT,NAVIGATE_FIRST_DESCRIPTION} from "./navigate-first.js";
import {COUNTER,EDGE_WALLS,GAME_RULE,LEDGES,OPPOSITE,WATER,type Direction,type ElevationRule} from "./tile-rules.js";
import {edgeNote} from "./connection-edges.js";
import {exitBlock,type ReachSwitches} from "./surf-gate.js";
import {BlackoutCarry} from "./blackout-receipt.js";

type Point={readonly x:number;readonly y:number};
type Tile={readonly collision:number;readonly behavior:number;readonly elevation:number};
export type NavigationMode="local"|"visited"|"full";
const DIRECTIONS:readonly [Direction,number,number][]=[["UP",0,-1],["DOWN",0,1],["LEFT",-1,0],["RIGHT",1,0]];
// pokeemerald 731ad5b: on foot, a collision-free tile is enterable unless its behavior is one of
// these (GetCollisionAtCoords, CheckForObjectEventCollision). Everything else, including sand,
// cave and mountain-top floor, is walkable.
const UNWALKABLE=new Set([
 0x10,0x11,0x12,0x13,0x14,0x15,0x19,0x22,0x2a,0x50,0x51,0x52,0x53,0x6c,0x6d,0x6f, // TILE_FLAG_SURFABLE water
 0x20,0x26,0x27,0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0xbb,0xbc,0xd0,0xd2, // ice, walk/slide, jump/spin mats, muddy slope, cracked floor
 0x0d,0x0e,0x0f,0x29,0x66, // MB_BATTLE_PYRAMID_WARP, MOSSDEEP_GYM_WARP, MT_PYRE_HOLE, LAVARIDGE_GYM_B1F_WARP, CRACKED_FLOOR_HOLE
 0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0xbe,0xc0,0xc1, // MB_IMPASSABLE_* one-way tiles, MB_SECRET_BASE_BREAKABLE_DOOR
 0x38,0x39,0x3a,0x3b,0x3c,0x3d,0x3e,0x3f, // MB_JUMP_* ledges
 0xd1,0xd3,0xd4,0xd5,0xd6, // CheckAcroBikeCollision: bumpy slope, rails
]);
// NUM_METATILE_BEHAVIORS is 0xF0; higher bytes (0xFF is MB_INVALID) are not game terrain.
const FLOOR=new Set(Array.from({length:0xf0},(_,behavior)=>behavior).filter(behavior=>!UNWALKABLE.has(behavior)));
// Before walkable-floor-v1: plain ground, grass and doors/warps only.
const LEGACY_WALKING=new Set([0,2,3,0x60,0x61,0x62,0x63,0x64,0x65,0x67,0x68,0x69,0x6a,0x6b,0x6c,0x6d,0x6e]);
const walled=(tile:Tile|undefined,side:Direction):boolean=>tile!==undefined&&(EDGE_WALLS.get(tile.behavior)?.includes(side)??false);
const key=(p:Point):string=>`${String(p.x)},${String(p.y)}`;
const distance=(a:Point,b:Point):number=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
// The rule before elevation-transitions-v1: 0 keeps the walker's layer, 15 is an ordinary layer.
const LEGACY_RULE:ElevationRule={
 mismatch:(walker,tile)=>walker!==0&&tile!==0&&tile!==walker,
 entered:(walker,tile)=>tile||walker,
 jumped:(walker,_takeoff,_ledge,landing)=>landing||walker,
};
export type ElevationMode="game"|"legacy";
const ready=(s:GameStateSnapshot,mode:NavigationMode="local"):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.field_controls_locked===false&&s.position!==null&&s.map_id!==null&&(mode==="full"?s.map_grid!=null:s.navigation_grid!=null)&&(s.active_ui==null||(s.active_ui.ready===true&&s.active_ui.diagnostic===null));
export const MAX_NAVIGATION_COMMANDS=8;
// Safety bound for whole-map routes; the longest Emerald routes need a few hundred steps.
export const MAX_FULL_ROUTE_COMMANDS=512;
// Whole-map walks stop when the planned route has not shortened for this many presses.
export const NO_PROGRESS_PRESSES=16;

// PokeAgent's GRASS_TILE_COST_MULTIPLIER: entering grass costs more, so routes avoid wild encounters when a detour is cheap.
export const GRASS_STEP_COST=1.5;
const GRASS=new Set([2,3]);
const terrainStepCost=(tile:Tile,options:NavigationOptions):number=>options.grassCost===true&&GRASS.has(tile.behavior)?GRASS_STEP_COST:1;

// navigation-truth-v1: a coordinate trigger whose condition matches now (world_context.triggers,
// read from the map's coord events and the save's variables). pokeemerald 731ad5b
// GetCoordEventScriptAtPosition runs it on entry when its elevation is 0 or the player's;
// TryRunCoordEventScript returns no script for TRIGGER_RUN_IMMEDIATELY (variable 0).
export interface MatchingTrigger {readonly x:number;readonly y:number;readonly elevation:number;readonly variable:number;readonly required:number;readonly current:number|null}
export interface NavigationOptions {readonly mode?:NavigationMode;readonly ledges?:boolean;readonly oneWay?:boolean;readonly grassCost?:boolean;readonly floor?:boolean;readonly elevation?:ElevationMode;readonly triggers?:readonly MatchingTrigger[]}
export function matchingTriggers(state:GameStateSnapshot):MatchingTrigger[] {
 return (state.world_context?.triggers??[]).filter(t=>t.condition_met===true&&t.variable!==0).map(t=>({x:t.x,y:t.y,elevation:t.elevation,variable:t.variable,required:t.required_value,current:t.current_value}));
}
// pokeemerald ObjectEventDoesElevationMatch: elevation 0 (transition) matches any; otherwise they must be equal.
export const elevationsMatch=(a:number,b:number):boolean=>a===0||b===0||a===b;
const triggerAt=(triggers:readonly MatchingTrigger[]|undefined,p:Point,elevation:number):MatchingTrigger|undefined=>triggers?.find(t=>t.x===p.x&&t.y===p.y&&(t.elevation===0||t.elevation===elevation));
const condition=(t:MatchingTrigger):string=>`variable 0x${t.variable.toString(16).toUpperCase().padStart(4,"0")}=${t.current===null?"unknown":String(t.current)}, needs ${String(t.required)}`;
const triggerText=(t:MatchingTrigger):string=>`(${String(t.x)},${String(t.y)}), a script-trigger tile whose condition matches now (${condition(t)})`;
// Every route crosses some matching trigger (the planner found none without one); the first on one such route is named.
const crossingText=(t:MatchingTrigger):string=>`a script-trigger tile whose condition matches now; the first one on the route it would take without avoiding them is (${String(t.x)},${String(t.y)}) (${condition(t)})`;
interface Geometry {readonly elevation:number;readonly tile:(p:Point)=>Tile|undefined;readonly objects:readonly Point[];readonly warps:readonly Point[];readonly bounds:{readonly width:number;readonly height:number}|null}

function localGeometry(state:GameStateSnapshot):Geometry|null {
 const grid=state.navigation_grid;if(grid==null)return null;
 const tiles=new Map<string,Tile>();
 for(const tile of grid.tiles){if(tiles.has(key(tile)))return null;tiles.set(key(tile),tile);}
 const topology=state.topology;
 if(topology!=null&&grid.tiles.some(t=>t.x>=topology.width||t.y>=topology.height||t.x<0||t.y<0))return null;
 return {elevation:grid.elevation,tile:p=>tiles.get(key(p)),objects:grid.objects,warps:grid.warps,bounds:topology==null?null:{width:topology.width,height:topology.height}};
}

function fullGeometry(state:GameStateSnapshot):Geometry|null {
 const grid=state.map_grid;if(grid==null||grid.rows.length!==grid.height||grid.rows.some(row=>row.length!==grid.width*4))return null;
 const topology=state.topology;
 if(topology!=null&&(topology.width!==grid.width||topology.height!==grid.height))return null;
 return {elevation:grid.elevation,objects:grid.objects,warps:grid.warps,bounds:{width:grid.width,height:grid.height},tile:p=>{
  if(p.x<0||p.y<0||p.x>=grid.width||p.y>=grid.height)return undefined;
  const cell=Number.parseInt(grid.rows[p.y]?.slice(p.x*4,p.x*4+4)??"",16);
  return {collision:cell>>12,elevation:(cell>>8)&15,behavior:cell&0xff};
 }};
}

// pokeemerald GetInteractedObjectEventScript talks across a faced counter to the object beyond it.
// A stand tile is named only when the planner itself would reach it.
function counterHint(state:GameStateSnapshot,goal:Point,options:NavigationOptions,truth=false):string|null {
 const geometry=options.mode==="full"?fullGeometry(state):localGeometry(state);if(geometry===null)return null;
 const at=(p:Point)=>(t:Point):boolean=>t.x===p.x&&t.y===p.y;
 const counter=(p:Point):boolean=>{const tile=geometry.tile(p);return tile!==undefined&&tile.behavior===COUNTER&&tile.collision!==0;};
 const occupied=(p:Point):boolean=>geometry.objects.some(at(p));
 // navigation-truth-v1: with the interaction targets known, only a scripted person behind a counter counts.
 let involved=counter(goal)&&!(truth&&state.interaction_targets!=null);
 for(const [direction,dx,dy] of DIRECTIONS){
  const across=occupied(goal)?{counter:{x:goal.x-dx,y:goal.y-dy},person:goal}:{counter:goal,person:{x:goal.x+dx,y:goal.y+dy}};
  if(!counter(across.counter)||!occupied(across.person))continue;
  // navigation-truth-v1: someone behind a counter is talked to only if it has a script (a listed interaction target).
  // The game finds that person at the player's elevation on the stand tile (GetObjectEventIdByPosition), so with the
  // targets known only a scripted person whose elevation matches the arrival elevation there counts, and the counter
  // fallback text (which also says to press A) is used only without targets.
  const scripted=truth&&state.interaction_targets!=null?state.interaction_targets.filter(t=>t.kind==="object"&&at(across.person)(t)):null;
  if(scripted!==null&&scripted.length===0)continue;
  if(scripted===null)involved=true;
  const stand={x:across.counter.x-dx,y:across.counter.y-dy};
  const path=geometry.tile(stand)===undefined?null:planNavigation(state,stand,options);
  if(path===null)continue;
  const arrived=scripted!==null||options.triggers!==undefined?walked(state,path,options)?.elevation??geometry.elevation:geometry.elevation;
  if(scripted!==null&&!scripted.some(t=>elevationsMatch(t.elevation,arrived)))continue;
  // navigation-truth-v1: a stand tile is never a matching trigger.
  if(triggerAt(options.triggers,stand,arrived)!==undefined)continue;
  return `target is behind a counter; walk to (${String(stand.x)},${String(stand.y)}), face ${direction} toward the counter at (${String(across.counter.x)},${String(across.counter.y)}) and press A to talk across it`;
 }
 return involved?"target is a counter or behind one; you cannot stand on a counter, but you can face it from a reachable adjacent tile and press A to talk to someone behind it":null;
}
// navigation-refusal-reasons-v1: say why navigate_to cannot walk, from the same state and grid the planner uses.
const NEAREST_RADIUS=3;
export const MESSAGE_WAITING="a message is waiting for A or B; dismiss it with B, then call navigate_to again";
const at=(p:Point):string=>`(${String(p.x)},${String(p.y)})`;
function unreadyReason(state:GameStateSnapshot):string {
 if(state.in_battle)return "a battle is in progress; navigate_to walks only on the field";
 if(!state.started)return "the game has not started yet; navigate_to walks only on the field";
 if(state.screen!=="overworld")return `the game is not on the field (screen: ${state.screen}); navigate_to walks only on the field`;
 const context=state.world_context;
 if(context!=null&&(context.message!=null||Boolean(context.dialogue)))return MESSAGE_WAITING;
 const ui=state.active_ui;
 if(ui!=null)return `a menu or other interface is open (${ui.phase}); close it before calling navigate_to`;
 if(state.field_controls_locked===true)return "field controls are locked by a script and no message is open; the game is acting on its own, so inspect the new state before calling navigate_to again";
 if(state.field_controls_locked!==false)return "field control state is unavailable; inspect the new state before calling navigate_to again";
 return "this map's navigation geometry is unavailable; inspect the new state before calling navigate_to again";
}
function targetReason(state:GameStateSnapshot,goal:Point,options:NavigationOptions,edges=false,truth=false,switches:ReachSwitches|null=null):string|null {
 const geometry=options.mode==="full"?fullGeometry(state):localGeometry(state);if(geometry===null)return null;
 const bounds=geometry.bounds;
 if(bounds!==null&&(goal.x>=bounds.width||goal.y>=bounds.height))return `${at(goal)} is outside this map; its tiles run from (0,0) to (${String(bounds.width-1)},${String(bounds.height-1)}); to reach another map, use a listed warp or a map connection`;
 const same=(p:Point):boolean=>p.x===goal.x&&p.y===goal.y;
 if(geometry.warps.some(same))return warpReason(state,geometry,goal,options);
 const tile=geometry.tile(goal);if(tile===undefined)return null;
 const standable=standableTile(options);
 // navigation-truth-v1: a stand tile is never a trigger that would run a script on arrival.
 const reach=(p:Point,plan:NavigationOptions):Direction[]|null=>standable(geometry.tile(p))&&!geometry.objects.some(o=>o.x===p.x&&o.y===p.y)&&!geometry.warps.some(w=>w.x===p.x&&w.y===p.y)?planNavigation(state,p,plan):null;
 const loose=(p:Point,plan:NavigationOptions):boolean=>reach(p,plan)!==null;
 // The walker's elevation on arriving at a reachable tile (multi-level tiles keep the elevation the route brought).
 const arrival=(p:Point):number|null=>{const path=reach(p,options);return path===null?null:walked(state,path,options)?.elevation??geometry.elevation;};
 const free=(p:Point):boolean=>{const elevation=arrival(p);return elevation!==null&&triggerAt(options.triggers,p,elevation)===undefined;};
 const targets=(state.interaction_targets??[]).filter(same);
 const person=targets.find(t=>t.kind==="object");
 // navigation-truth-v1: A reaches an object only from a tile whose elevation matches the object's (stacked objects).
 const scripted=truth&&state.interaction_targets!=null?targets.filter(t=>t.kind==="object"):null;
 const talker=(p:Point):typeof person=>{if(scripted===null)return person;const elevation=arrival(p);return elevation===null?undefined:scripted.find(t=>elevationsMatch(t.elevation,elevation));};
 const live=(state.world_context?.objects??[]).find(o=>same(o)&&o.map_id[0]===state.map_id?.[0]&&o.map_id[1]===state.map_id[1]);
 const occupied=geometry.objects.some(same)||person!==undefined||live!==undefined;
 const thing=person??(standable(tile)?undefined:targets.find(t=>t.activation==="A"&&t.kind!=="warp"));
 if(occupied||thing!==undefined){
  const reachable=DIRECTIONS.flatMap(([side,dx,dy])=>{const stand={x:goal.x+dx,y:goal.y+dy};return free(stand)?[{stand,side}]:[];});
  // navigation-truth-v1: an object with no script (absent from the listed interaction targets) cannot be talked to.
  // GetInteractionScript then tries the tile's background event or metatile, each under its own conditions
  // (elevation, facing, a hidden item's flag, a secret base's check); those are named as listed, not promised.
  if(truth&&state.interaction_targets!=null&&person===undefined&&(live!==undefined||geometry.objects.some(same))){
   const others=targets.filter(t=>t.activation==="A"&&t.kind!=="warp"&&t.kind!=="object").map(t=>{const kind=t.kind.replaceAll("_"," ");return t.name!=null?`${t.name} (${kind})`:`a ${kind}`;});
   const sprite=live?.sprite_kind!=null?` (sprite ${live.sprite_kind})`:"";
   return others.length===0?`${at(goal)} is a person or object${sprite}, which navigate_to cannot stand on; it is not listed as something you can talk to or use, so navigate_to offers no tile to talk to it from`:`${at(goal)} is a person or object${sprite}, which navigate_to cannot stand on; it is not listed as something you can talk to, so navigate_to offers no tile to talk to it from; the state also lists ${others.join(" and ")} on that tile, which pressing A may use if the game's own conditions for it are met`;
  }
  const kind=thing===undefined||thing.kind==="object"?"person or object":thing.kind.replaceAll("_"," ");
  const name=thing?.name;
  const label=name!=null?`${name} (${kind})`:`a ${kind}`;
  const usable=scripted===null||scripted.length===0||thing?.kind!=="object"?reachable:reachable.filter(({stand})=>talker(stand)!==undefined);
  if(scripted!==null&&scripted.length>0&&reachable.length>0&&usable.length===0)return `${at(goal)} is ${label}, which navigate_to cannot stand on; it is at elevation ${[...new Set(scripted.map(t=>String(t.elevation)))].join(" or ")}, and every free neighbouring tile navigate_to can reach puts you at another elevation, where facing it and pressing A does not reach it; choose a waypoint at its elevation`;
  // Each usable stand reaches the scripted object at its arrival elevation; stacked objects can differ per stand.
  const reached=scripted!==null&&scripted.length>0&&thing?.kind==="object"?usable.map(({stand})=>talker(stand)):[];
  const call=(t:typeof person):string=>t?.name??"an unnamed person or object";
  const several=new Set(reached.map(t=>t?.local_id)).size>1;
  const first=reached[0];
  const named=several?`${[...new Set(reached.map(call))].join(" or ")} (persons or objects stacked at different elevations)`:first===undefined?label:first.name!=null?`${first.name} (person or object)`:"a person or object";
  const stands=usable.map(({stand,side},i)=>`${at(stand)} facing ${OPPOSITE[side]}${several?` (reaches ${call(reached[i])})`:""}`);
  // exit-reachability-v1: the whole-map flood decides whether "cannot be reached" is true.
  const cut=stands.length===0&&switches!==null?personCut(state,geometry,goal,options,switches):null;
  if(cut!==null)return `${at(goal)} is ${label}, which navigate_to cannot stand on${cut}`;
  return stands.length===0?`${at(goal)} is ${label}, which navigate_to cannot stand on, and none of its free neighbouring tiles can be reached from here; choose a reachable waypoint nearer to it`:`${at(goal)} is ${named}, which navigate_to cannot stand on; to talk to ${several?"one":"it or use it"}, walk to one of these free tiles, face it and press A: ${stands.join("; ")}`;
 }
 if(standable(tile))return null;
 const what=LEDGES.has(tile.behavior)?"a ledge, which you can only hop over in its arrow direction":WATER.has(tile.behavior)?"water":tile.collision!==0?"a wall or other solid tile":`terrain navigate_to does not walk on (metatile behavior 0x${tile.behavior.toString(16).padStart(2,"0")})`;
 const candidates:Point[]=[];
 for(let d=1;d<=NEAREST_RADIUS;d++)for(let dy=-d;dy<=d;dy++)for(const dx of new Set([-(d-Math.abs(dy)),d-Math.abs(dy)]))candidates.push({x:goal.x+dx,y:goal.y+dy});
 const sorted=candidates.sort((a,b)=>distance(a,goal)-distance(b,goal)||a.y-b.y||a.x-b.x);
 const nearest=sorted.find(free);
 // connection-edge-tiles-v1: an edge tile also says which map it leads to and how to cross.
 // exit-reachability-v1: no note for a connection the reachability check leaves out.
 const edge=nearest!==undefined&&edges?edgeNote(state.topology,nearest,switches===null?undefined:exitBlock(switches,state).connection)??"":"";
 return `${at(goal)} is ${what}, not a walkable tile; ${nearest===undefined?`no walkable tile navigate_to can reach lies within ${String(NEAREST_RADIUS)} steps of it`:`the nearest walkable tile navigate_to can reach is ${at(nearest)}${edge}`}${gatedNearer(state,geometry,goal,sorted,nearest,loose,options)}`;
}
const standableTile=(options:NavigationOptions)=>{
 const walkable=options.floor===true?FLOOR:LEGACY_WALKING;
 return (t:Tile|undefined):boolean=>t!==undefined&&t.collision===0&&t.behavior!==0x69&&(walkable.has(t.behavior)||(options.oneWay===true&&EDGE_WALLS.has(t.behavior)));
};
// Replays the planner's moves along a path: the first matching trigger stepped on before its last tile, and the
// walker's elevation at its end (a multi-level tile keeps the elevation the route brought, GAME_RULE.entered).
function walked(state:GameStateSnapshot,path:readonly Direction[],options:NavigationOptions):{readonly crossed:MatchingTrigger|null;readonly elevation:number;readonly cost:number}|null {
 const geometry=options.mode==="full"?fullGeometry(state):localGeometry(state);
 const start=state.position;if(geometry===null||start===null)return null;
 let first:MatchingTrigger|null=null;
 const {entered,jumped}=options.elevation==="legacy"?LEGACY_RULE:GAME_RULE;
 let p=start,here=geometry.tile(start)?.elevation??geometry.elevation,elevation=geometry.elevation,cost=0;
 for(const [i,direction] of path.entries()){
  const delta=DIRECTIONS.find(([d])=>d===direction);if(delta===undefined)return null;
  const next={x:p.x+delta[1],y:p.y+delta[2]},tile=geometry.tile(next);if(tile===undefined)return null;
  if(options.ledges===true&&LEDGES.get(tile.behavior)===direction&&!geometry.warps.some(w=>w.x===next.x&&w.y===next.y)){
   const landing={x:next.x+delta[1],y:next.y+delta[2]},land=geometry.tile(landing);if(land===undefined)return null;
   elevation=jumped(elevation,here,tile.elevation,land.elevation);here=land.elevation;p=landing;cost+=1+terrainStepCost(land,options);
  }else{elevation=entered(elevation,tile.elevation);here=tile.elevation;p=next;cost+=terrainStepCost(tile,options);}
  const crossed=i<path.length-1?triggerAt(options.triggers,p,elevation):undefined;
  first??=crossed??null;
 }
 return {crossed:first,elevation,cost};
}
// navigation-truth-v1: a nearer walkable tile the planner could reach only by crossing a matching trigger.
function gatedNearer(state:GameStateSnapshot,geometry:Geometry,goal:Point,sorted:readonly Point[],nearest:Point|undefined,loose:(p:Point,plan:NavigationOptions)=>boolean,options:NavigationOptions):string {
 if(options.triggers===undefined||options.triggers.length===0)return "";
 const open:NavigationOptions={...options,triggers:[]};
 const gated=sorted.slice(0,nearest===undefined?sorted.length:sorted.indexOf(nearest)).find(p=>loose(p,open));
 if(gated===undefined)return "";
 const path=planNavigation(state,gated,open);
 const walk=path===null?null:walked(state,path,options);
 const crossed=walk?.crossed??triggerAt(options.triggers,gated,walk?.elevation??geometry.elevation)??null;
 if(crossed===null)return "";
 const near=nearest===undefined?`within ${String(NEAREST_RADIUS)} steps`:distance(gated,goal)<distance(nearest,goal)?"closer":"as close";
 return crossed.x===gated.x&&crossed.y===gated.y?`; ${at(gated)} is ${near}, but it is ${triggerText(crossed)}`:`; ${at(gated)} is ${near}, but every route navigate_to sees to it crosses ${crossingText(crossed)}`;
}
// navigation-truth-v1: the goal is reachable only across a matching trigger.
function triggerReason(state:GameStateSnapshot,goal:Point,options:NavigationOptions):string|null {
 if(options.triggers===undefined||options.triggers.length===0)return null;
 const open=planNavigation(state,goal,{...options,triggers:[]});
 const crossed=open===null?null:walked(state,open,options)?.crossed??null;
 if(crossed===null)return null;
 return `every route navigate_to sees to ${at(goal)} crosses ${crossingText(crossed)}; stepping on such a tile runs a script that can stop you or send you back, so navigate_to does not walk across one; target ${at(crossed)} itself to step on it on purpose`;
}
// navigation-refusal-reasons-v2: an in-window goal with no route inside the local window. The tiles named are
// reachable window-edge tiles with an unseen neighbour inside the map, one per side, nearest the goal first.
// Only a goal the player could stand on: walkable, with no person, object or warp on it.
const SIDES:Readonly<Record<Direction,string>>={UP:"north",DOWN:"south",LEFT:"west",RIGHT:"east"};
function windowReason(state:GameStateSnapshot,goal:Point,options:NavigationOptions):string|null {
 if(options.mode!==undefined&&options.mode!=="local")return null;
 const geometry=localGeometry(state),grid=state.navigation_grid;
 if(geometry===null||grid==null||geometry.bounds===null)return null;
 const standable=standableTile(options);
 const same=(p:Point):boolean=>p.x===goal.x&&p.y===goal.y;
 // Only when no route lies inside the window even with every terrain rule the game has (ledge hops, one-way tiles,
 // walkable floor, the game's elevation rule, matching triggers ignored): a route the configured switches miss is not a route that leaves the window.
 if(planNavigation(state,goal,{...options,ledges:true,oneWay:true,floor:true,elevation:"game",triggers:[]})!==null)return null;
 if(!standable(geometry.tile(goal))||geometry.objects.some(same)||geometry.warps.some(same)||(state.interaction_targets??[]).some(t=>t.kind==="object"&&same(t))||(state.world_context?.objects??[]).some(o=>same(o)&&o.map_id[0]===state.map_id?.[0]&&o.map_id[1]===state.map_id[1]))return null;
 const listed=windowEdges(state,goal,options);
 const inside=`no route to ${at(goal)} lies inside the 15x15 local map navigate_to plans over`;
 return listed.length===0?`${inside}, and navigate_to can reach no tile on that local map's edge from here; choose another target`:`${inside}, so any route leaves it; reachable tiles on its edge, nearest ${at(goal)} first: ${listed.map(([side,p])=>`${at(p)} on the ${SIDES[side]} edge`).join(", ")}; walk to one, then call navigate_to ${at(goal)} again`;
}
// Reachable local-window edge tiles with an unseen neighbour inside the map, one per side, nearest the goal first.
function windowEdges(state:GameStateSnapshot,goal:Point,options:NavigationOptions):[Direction,Point][] {
 const geometry=localGeometry(state),grid=state.navigation_grid;
 if(geometry===null||grid==null||geometry.bounds===null)return [];
 const bounds=geometry.bounds,standable=standableTile(options);
 const best=new Map<Direction,Point>();
 for(const t of grid.tiles){
  const sides=DIRECTIONS.filter(([,dx,dy])=>{const n={x:t.x+dx,y:t.y+dy};return n.x>=0&&n.y>=0&&n.x<bounds.width&&n.y<bounds.height&&geometry.tile(n)===undefined;});
  if(sides.length===0||!standable(t)||geometry.objects.some(o=>o.x===t.x&&o.y===t.y)||geometry.warps.some(w=>w.x===t.x&&w.y===t.y))continue;
  const path=planNavigation(state,t,options);
  if(path===null||triggerAt(options.triggers,t,walked(state,path,options)?.elevation??geometry.elevation)!==undefined)continue;
  for(const [side] of sides){const held=best.get(side);if(held===undefined||distance(t,goal)<distance(held,goal)||(distance(t,goal)===distance(held,goal)&&(t.y<held.y||(t.y===held.y&&t.x<held.x))))best.set(side,{x:t.x,y:t.y});}
 }
 return [...best.entries()].sort(([,a],[,b])=>distance(a,goal)-distance(b,goal)||a.y-b.y||a.x-b.x);
}
// exit-reachability-v1: the server's flood rules (env/pokebench_env/surf_gate.py reachable) over the tiles one geometry
// holds: no collision, no water, a ledge hops one tile on in its arrow direction. A superset of walking.
function flood(geometry:Geometry,start:Point):Set<string> {
 const seen=new Set([key(start)]),queue=[start];
 for(let p=queue.shift();p!==undefined;p=queue.shift()){
  for(const [direction,dx,dy] of DIRECTIONS){
   let next={x:p.x+dx,y:p.y+dy},tile=geometry.tile(next);
   if(tile===undefined)continue;
   if(tile.collision!==0&&LEDGES.get(tile.behavior)===direction){next={x:next.x+dx,y:next.y+dy};tile=geometry.tile(next);if(tile===undefined)continue;}
   if(seen.has(key(next))||tile.collision!==0||WATER.has(tile.behavior))continue;
   seen.add(key(next));queue.push(next);
  }
 }
 return seen;
}
// exit-reachability-v1: a person or object none of whose free neighbouring tiles navigate_to can reach. With the
// server's foot area: none of its neighbours on it means it cannot be walked to at all; one on it means the plan, not
// the map, is what failed: in the local window because the way leaves it (named by the nearest window-edge tile);
// otherwise only the fact is stated, no guessed cause (pokebench-game-state skill). Null when the foot area is unknown.
function personCut(state:GameStateSnapshot,geometry:Geometry,goal:Point,options:NavigationOptions,reach:ReachSwitches):string|null {
 const block=exitBlock(reach,state);
 const sides=DIRECTIONS.map(([,dx,dy])=>({x:goal.x+dx,y:goal.y+dy}));
 const known=sides.map(p=>block.foot(p.x,p.y));
 if(known.some(k=>k===null))return null;
 // A neighbour nobody stands on first, then the one nearest the player.
 const start=state.position;
 const taken=(p:Point):boolean=>geometry.objects.some(o=>o.x===p.x&&o.y===p.y)||(state.interaction_targets??[]).some(t=>t.kind==="object"&&t.x===p.x&&t.y===p.y);
 const near=sides.filter((_,i)=>known[i]===true).sort((a,b)=>Number(taken(a))-Number(taken(b))||(start===null?0:distance(a,start)-distance(b,start)))[0];
 if(near===undefined)return ", and none of its neighbouring tiles can be reached on foot from where you stand: no walkable way on this map leads there; choose another target";
 if(options.mode==="visited")return `; navigate_to finds no route through terrain shown this run to a free tile next to it right now, though this map's walkable area reaches ${at(near)} next to it; explore until more terrain has been shown, then choose a waypoint nearer to it`;
 if(options.mode==="full"||start===null||flood(geometry,start).has(key(near)))return `; navigate_to finds no route ${options.mode==="full"?"on this map":"on the 15x15 local map it plans over"} to a free tile next to it right now, though this map's walkable area reaches ${at(near)} next to it; choose a waypoint nearer to it`;
 const edge=windowEdges(state,goal,options)[0];
 const inside=`; none of its free neighbouring tiles can be reached inside the 15x15 local map navigate_to plans over, but this map's walkable area reaches ${at(near)} next to it, so the way there leaves that local map`;
 return edge===undefined?`${inside}; navigate_to can reach no tile on that local map's edge from here, so choose another target`:`${inside}; walk to ${at(edge[1])} on its ${SIDES[edge[0]]} edge first, then call navigate_to ${at(goal)} again`;
}
// navigation-truth-v1: who now stands on the route tile a blocked step would have entered.
function blocker(state:GameStateSnapshot,mode:NavigationMode,tiles:readonly Point[]):string|null {
 const geometry=mode==="full"?fullGeometry(state):localGeometry(state);
 for(const p of tiles){
  const same=(o:Point):boolean=>o.x===p.x&&o.y===p.y;
  // Collision compares the player's and the object's elevations (DoesObjectCollideWithObjectAt): a listed object at
  // another elevation is not the one in the way.
  const listed=(state.interaction_targets??[]).filter(t=>t.kind==="object"&&same(t));
  const elsewhere=new Set(geometry===null?[]:listed.filter(t=>!elevationsMatch(t.elevation,geometry.elevation)).map(t=>t.local_id));
  const named=listed.find(t=>!elsewhere.has(t.local_id))?.name;
  const here=(state.world_context?.objects??[]).filter(o=>same(o)&&o.map_id[0]===state.map_id?.[0]&&o.map_id[1]===state.map_id[1]);
  const live=here.find(o=>!elsewhere.has(o.local_id));
  const who=named!=null?`${named} (person or object)`:live?.sprite_kind!=null?`a person or object (sprite ${live.sprite_kind})`:live!==undefined||(here.length===0&&geometry?.objects.some(same)===true)?"a person or object":null;
  if(who!==null)return `blocked: ${who} is now on ${at(p)}, the next tile of the route; wait for it to move or choose another approach`;
 }
 return null;
}
// A warp the planner cannot reach: someone stands on it, or (pokeemerald TryDoorWarp) a door is
// entered only by walking north into it from the tile below, and that tile is not usable from here.
function warpReason(state:GameStateSnapshot,geometry:Geometry,goal:Point,options:NavigationOptions):string|null {
 const walkable=options.floor===true?FLOOR:LEGACY_WALKING;
 const same=(p:Point)=>(t:Point):boolean=>t.x===p.x&&t.y===p.y;
 const listed=(state.interaction_targets??[]).filter(t=>t.kind==="warp");
 const destination=listed.find(same(goal))?.destination??null;
 const map=destination===null?null:`map ${String(destination[0])}/${String(destination[1])}`;
 const tile=geometry.tile(goal);
 const door=tile?.behavior===0x69;
 const what=`${at(goal)} is ${door?"a door":"a warp"}${map===null?"":` to ${map}`}`;
 const onMap=(p:Point):boolean=>geometry.objects.some(same(p))||(state.world_context?.objects??[]).some(o=>same(p)(o)&&o.map_id[0]===state.map_id?.[0]&&o.map_id[1]===state.map_id[1]);
 const occupant=(p:Point):string=>{const name=(state.interaction_targets??[]).find(t=>t.kind==="object"&&same(p)(t))?.name;return name!=null?`${name} (person or object)`:"a person or object";};
 if(onMap(goal)){
  const others=destination===null?[]:listed.filter(t=>!same(goal)(t)&&t.destination?.[0]===destination[0]&&t.destination[1]===destination[1]).map(at);
  return `${what}, but ${occupant(goal)} is standing on it, so navigate_to cannot walk onto it; wait for it to move${others.length===0||map===null?"":`, or use another listed warp to ${map}: ${others.join(", ")}`}`;
 }
 if(!door)return null;
 const from={x:goal.x,y:goal.y+1};
 const entry=`${what}; the game enters a door only when you walk UP into it from the tile below, ${at(from)}`;
 const bounds=geometry.bounds;
 if(bounds!==null&&from.y>=bounds.height)return `${entry}, which is outside this map, so this door cannot be entered from this map`;
 if(onMap(from))return `${entry}, and ${occupant(from)} is standing on ${at(from)}; wait for it to move`;
 const below=geometry.tile(from);
 if(below!==undefined&&(below.collision!==0||!walkable.has(below.behavior)))return `${entry}, which is not a tile navigate_to can stand on, so this door cannot be entered from here`;
 if(below===undefined)return `${entry}, which is outside the local map navigate_to can see from here; ${planNavigation(state,from,options)===null?`no route toward ${at(from)} is known from here; choose a reachable waypoint nearer it`:`call navigate_to ${at(from)} first, then navigate_to ${at(goal)} again`}`;
 return planNavigation(state,from,options)===null?`${entry}, which navigate_to cannot reach from here; choose a reachable waypoint nearer it`:null;
}
const hopAhead=(state:GameStateSnapshot,mode:NavigationMode,from:Point,direction:Direction,dx:number,dy:number):boolean=>{
 const tile=(mode==="full"?fullGeometry(state):localGeometry(state))?.tile({x:from.x+dx,y:from.y+dy});
 return tile!==undefined&&LEDGES.get(tile.behavior)===direction;
};

// Binary min-heap on (estimate, insertion order). The tie-break reproduces the
// stable re-sorted array this replaced, so routes are unchanged.
class OpenList<T> {
 private readonly items:{readonly priority:number;readonly order:number;readonly value:T}[]=[];
 private count=0;
 get size():number{return this.items.length;}
 push(priority:number,value:T):void{
  const items=this.items;items.push({priority,order:this.count++,value});
  let i=items.length-1;
  while(i>0){const parent=(i-1)>>1;if(!this.less(i,parent))break;this.swap(i,parent);i=parent;}
 }
 pop():T|undefined{
  const items=this.items,top=items[0],last=items.pop();
  if(top===undefined||last===undefined)return undefined;
  if(items.length>0){
   items[0]=last;let i=0;
   for(;;){const l=2*i+1,r=l+1;let m=i;if(l<items.length&&this.less(l,m))m=l;if(r<items.length&&this.less(r,m))m=r;if(m===i)break;this.swap(i,m);i=m;}
  }
  return top.value;
 }
 private less(a:number,b:number):boolean{const x=this.items[a],y=this.items[b];if(x===undefined||y===undefined)return false;return x.priority<y.priority||(x.priority===y.priority&&x.order<y.order);}
 private swap(a:number,b:number):void{const x=this.items[a],y=this.items[b];if(x===undefined||y===undefined)return;this.items[a]=y;this.items[b]=x;}
}

// A* over the live local 15x15 window, remembered delivered cells in "visited" mode, or the whole map in "full" mode.
// No outside-map guessing, surfing or puzzle policies; ledges and edge walls only when enabled.
// Elevation follows the game's rule. Warps are only ever goals.
export function planNavigation(state:GameStateSnapshot,goal:Point,options:NavigationOptions={}):Direction[]|null {
 const mode=options.mode??"local",walkable=options.floor===true?FLOOR:LEGACY_WALKING,{mismatch,entered,jumped}=options.elevation==="legacy"?LEGACY_RULE:GAME_RULE;
 const step=(tile:Tile):number=>terrainStepCost(tile,options);
 if(!ready(state,mode)||state.position===null)return null;
 const geometry=mode==="full"?fullGeometry(state):localGeometry(state);
 const here=geometry?.tile(state.position);
 if(geometry===null||here===undefined)return null;
 const bounds=geometry.bounds;
 if(bounds!==null&&(goal.x>=bounds.width||goal.y>=bounds.height||goal.x<0||goal.y<0))return null;
 const goalKnown=geometry.tile(goal)!==undefined;
 if(!goalKnown&&bounds===null)return null;
 const occupied=new Set(geometry.objects.map(key)),warps=new Set(geometry.warps.map(key));
 if(occupied.has(key(goal)))return null;
 type Node={p:Point;here:number;elevation:number;cost:number;parent:Node|null;direction:Direction|null};
 const route=(node:Node):Direction[]=>{const path:Direction[]=[];for(let n:Node|null=node;n!==null&&n.direction!==null;n=n.parent)path.push(n.direction);return path.reverse();};
 const start:Node={p:state.position,here:here.elevation,elevation:geometry.elevation,cost:0,parent:null,direction:null};
 let best=start;
 const pending=new OpenList<Node>(),costs=new Map<string,number>();
 pending.push(distance(start.p,goal),start);
 while(pending.size>0){
  const node=pending.pop();if(node===undefined)break;
  const identity=`${key(node.p)}:${String(node.elevation)}`;
  if((costs.get(identity)??Infinity)<=node.cost)continue;costs.set(identity,node.cost);
  if(distance(node.p,goal)<distance(best.p,goal)||(distance(node.p,goal)===distance(best.p,goal)&&node.cost<best.cost))best=node;
  if(distance(node.p,goal)===0)return route(node);
  for(const [direction,dx,dy] of DIRECTIONS){
   const next={x:node.p.x+dx,y:node.p.y+dy},tile=geometry.tile(next);
   if(tile===undefined||occupied.has(key(next)))continue;
   if(options.ledges===true&&LEDGES.get(tile.behavior)===direction&&!warps.has(key(next))){
    const landing={x:next.x+dx,y:next.y+dy},land=geometry.tile(landing);
    if(land===undefined||occupied.has(key(landing))||warps.has(key(landing))||land.collision!==0||land.behavior===0x69||!walkable.has(land.behavior))continue;
    if(mismatch(node.elevation,land.elevation))continue;
    const landed=jumped(node.elevation,node.here,tile.elevation,land.elevation);
    if(distance(landing,goal)!==0&&triggerAt(options.triggers,landing,landed)!==undefined)continue;
    pending.push(node.cost+1+step(land)+distance(landing,goal),{p:landing,here:land.elevation,elevation:landed,cost:node.cost+1+step(land),parent:node,direction});continue;
   }
   if(options.oneWay===true&&(walled(tile,OPPOSITE[direction])||walled(geometry.tile(node.p),direction)))continue;
   if(!(walkable.has(tile.behavior)||(options.oneWay===true&&EDGE_WALLS.has(tile.behavior))))continue;
   const door=tile.behavior===0x69&&distance(next,goal)===0&&direction==="UP";
   if((tile.collision!==0&&!door)||(tile.behavior===0x69&&!door))continue;
   if(warps.has(key(next))&&distance(next,goal)!==0)continue;
   if(mismatch(node.elevation,tile.elevation))continue;
   const arrived=entered(node.elevation,tile.elevation);
   if(distance(next,goal)!==0&&triggerAt(options.triggers,next,arrived)!==undefined)continue;
   pending.push(node.cost+step(tile)+distance(next,goal),{p:next,here:tile.elevation,elevation:arrived,cost:node.cost+step(tile),parent:node,direction});
  }
 }
 return !goalKnown&&best!==start ? route(best) : null;
}

// field_control_avatar.c routes these metatile behaviors through an arrow-warp
// check. Unlike step-on warps and animated doors, they require one final move
// command while the player is already standing on the warp tile.
const DIRECTIONAL_WARP_PRESSES=new Map<number,Direction>([
 [0x62,"RIGHT"],[0x63,"LEFT"],[0x64,"UP"],[0x65,"DOWN"],
 [0x1b,"UP"],[0x1c,"DOWN"],[0x6d,"DOWN"],
]);
export function directionalWarpActivation(state:GameStateSnapshot,target:Point,mode:NavigationMode):Direction|null {
 const geometry=mode==="full"?fullGeometry(state):localGeometry(state);
 return geometry===null?null:DIRECTIONAL_WARP_PRESSES.get(geometry.tile(target)?.behavior??-1)??null;
}
// Exact-equivalence routing is deliberately limited to directional warps.
// Step-on warps, doors and unknown behaviors retain the requested coordinate
// and old stop semantics even if their destination tuples happen to match.
const knownWarpBehavior=(behavior:number):boolean=>DIRECTIONAL_WARP_PRESSES.has(behavior);
interface WarpIdentity {readonly destination:readonly number[];readonly behavior:number;readonly elevation:number}
type WarpPlan={readonly target:Point;readonly path:Direction[];readonly cost:number;readonly activation:Direction|null;readonly identity:WarpIdentity};
const samePoint=(a:Point,b:Point):boolean=>a.x===b.x&&a.y===b.y;
const sameDestination=(a:readonly number[],b:readonly number[]):boolean=>a.length===3&&b.length===3&&a.every((value,index)=>value===b[index]);
const sameWarpIdentity=(a:WarpIdentity,b:WarpIdentity):boolean=>a.behavior===b.behavior&&a.elevation===b.elevation&&sameDestination(a.destination,b.destination);
const dynamicDestination=(destination:readonly number[]):boolean=>destination.some(value=>value===0x7f);
function warpIdentityAt(state:GameStateSnapshot,target:Point,options:NavigationOptions):{readonly activation:Direction;readonly identity:WarpIdentity}|null {
 const geometry=options.mode==="full"?fullGeometry(state):localGeometry(state);
 if(geometry===null)return null;
 const listed=(state.interaction_targets??[]).filter(candidate=>candidate.kind==="warp"&&samePoint(candidate,target));
 if(listed.length!==1)return null;
 const event=listed[0],destination=event?.destination;
 if(event===undefined||destination===null||destination===undefined||dynamicDestination(destination))return null;
 if(event.elevation!==0&&event.elevation!==geometry.elevation)return null;
 const tile=geometry.tile(target),activation=tile===undefined?undefined:DIRECTIONAL_WARP_PRESSES.get(tile.behavior);
 if(tile===undefined||activation===undefined)return null;
 return {activation,identity:{destination:[...destination],behavior:tile.behavior,elevation:event.elevation}};
}
function deterministicWarpPlan(state:GameStateSnapshot,requested:Point,options:NavigationOptions):WarpPlan|null {
 const geometry=options.mode==="full"?fullGeometry(state):localGeometry(state);
 if(geometry===null)return null;
 const warps=(state.interaction_targets??[]).filter(target=>target.kind==="warp");
 const listed=warps.filter(target=>samePoint(target,requested));
 if(listed.length!==1)return null;
 const wanted=listed[0],destination=wanted?.destination;if(wanted===undefined||destination===null||destination===undefined||dynamicDestination(destination))return null;
 const wantedTile=geometry.tile(wanted);if(wantedTile===undefined||!knownWarpBehavior(wantedTile.behavior))return null;
 const candidates=warps.flatMap(target=>{
  if(target.destination===null||dynamicDestination(target.destination)||!sameDestination(target.destination,destination)||target.elevation!==wanted.elevation)return [];
  if(warps.filter(other=>samePoint(other,target)).length!==1)return [];
  const tile=geometry.tile(target);if(tile===undefined||tile.behavior!==wantedTile.behavior)return [];
  const path=planNavigation(state,target,options);if(path===null)return [];
  const route=walked(state,path,options);if(route===null||(target.elevation!==0&&target.elevation!==route.elevation))return [];
  return [{target:{x:target.x,y:target.y},path,cost:route.cost,activation:DIRECTIONAL_WARP_PRESSES.get(tile.behavior)??null,identity:{destination:[...target.destination],behavior:tile.behavior,elevation:target.elevation}}];
 });
 candidates.sort((a,b)=>a.cost-b.cost||a.target.y-b.target.y||a.target.x-b.target.x);
 return candidates[0]??null;
}
const Args=Type.Object({x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0}),map_id:Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]),walking:Type.Optional(Type.Boolean({description:"Walk deliberately without automatic running."}))},{additionalProperties:false});
const DeterministicRunningArgs=Type.Object({x:Args.properties.x,y:Args.properties.y,map_id:Args.properties.map_id},{additionalProperties:false});
export type NavigationStopCheck=(state:GameStateSnapshot)=>string|null;
export type CheckedNavigationTool=AgentTool<typeof Args>&{readonly executeChecked:(id:string,goal:{readonly x:number;readonly y:number;readonly map_id:readonly [number,number];readonly walking?:boolean},check:NavigationStopCheck,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>};
export function isCheckedNavigation(tool:AgentTool):tool is CheckedNavigationTool {return "executeChecked" in tool&&typeof tool.executeChecked==="function";}
export interface NavigationPorts {
 readonly automaticRunning?:boolean;
 readonly counters?:boolean;
 // Explain refusals (navigation-refusal-reasons-v1); off keeps the generic text.
 readonly refusalReasons?:boolean;
 // Name the map a nearest edge tile leads to (connection-edge-tiles-v1); needs refusalReasons.
 readonly connectionEdges?:boolean;
 // navigation-truth-v1: talk offers only for scripted objects, named blockers, where a partial walk stopped.
 readonly truth?:boolean;
 // With truth: plan around coordinate triggers whose condition matches now (coordinate-script-conditions-v1).
 readonly triggers?:boolean;
 // navigation-refusal-reasons-v2: say when an in-window goal's route leaves the local window.
 readonly windowReasons?:boolean;
 readonly read:(signal?:AbortSignal)=>Promise<GameStateSnapshot>;
 readonly press:(id:string,params:{buttons:Button[];walking?:boolean},signal?:AbortSignal,check?:BeforePressCheck,options?:CheckedPressOptions)=>Promise<AgentToolResult<unknown>>;
 readonly observe:(id:string,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>;
 readonly gate?:((signal?:AbortSignal)=>Promise<void>)|undefined;
 readonly maxCommands?:number;
 // Plan over the whole current map and walk the full route (full-map-navigation-v1).
 readonly fullMap?:boolean;
 // Plan only over local cells already delivered to the model this run (visited-terrain-navigation-v1).
 readonly visitedTerrain?:boolean;
 readonly ledges?:boolean;
 readonly oneWay?:boolean;
 readonly elevation?:ElevationMode;
 readonly grassCost?:boolean;
 readonly floor?:boolean;
 // navigate-first-prompt-v1: the description leads with when to use the tool.
 readonly navigateFirst?:boolean;
 // cross-map-goal-v1: a goal on another map, before any press, is refused as such, not as "map changed".
 readonly crossMapGoal?:boolean;
 // exit-reachability-v1: the server's foot area decides "call again" and person refusals; edge notes skip blocked
 // connections (water ones too with surf-gated-exits-v1).
 readonly exitReach?:boolean;
 readonly surfGate?:boolean;
 // deterministic-warp-navigation-v1: choose an exact equivalent warp and perform one verified arrow-warp press.
 readonly deterministicWarps?:boolean;
}
function resultState(result:AgentToolResult<unknown>):GameStateSnapshot {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))throw new Error("Navigation observation lacks verified state");
 return parseGameState(details.state);
}
class NavigationPreconditionError extends Error {}
const mapOf=(id:readonly [number,number]):string=>`map ${String(id[0])}/${String(id[1])}`;
function crossMapReason(state:GameStateSnapshot,here:readonly [number,number],goal:Point&{readonly map_id:readonly [number,number]}):string {
 const place=state.location_display??state.location;
 return `${at(goal)} on ${mapOf(goal.map_id)} is on another map; you are on ${mapOf(here)}${place===null?"":` (${place})`} and navigate_to only walks within the current map; to walk on this map, pass map_id [${String(here[0])},${String(here[1])}]; to reach ${mapOf(goal.map_id)}, use a listed warp or a map connection`;
}
export const NAVIGATE_RULES="To talk to a person or use an object, target the walkable tile next to it, face it and press A; the person's or object's own tile is not walkable. It cannot walk while a message is open: dismiss the message with B first. For a door, stairs or another listed warp, target the warp's own coordinates.";
const LOCAL_DESCRIPTION="Walk toward a coordinate on the current map using bounded A*. Supply its map_id. Uses only known local tiles, advancing toward a reachable local frontier for distant in-bounds targets; avoids unsupported terrain and stops on locks, unexpected movement or map changes. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Maximum 8 ordinary button attempts; inspect the returned state before continuing. "+NAVIGATE_RULES;
const FULL_DESCRIPTION="Walk to a coordinate on the current map using A* over the whole current map. Supply its map_id. Walks the full route one ordinary button at a time, re-planning before every press; avoids unsupported terrain and never crosses a warp unless it is the destination. Stops on blocked or unexpected movement, locks, map changes, or when the route stops getting shorter. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Inspect the returned state before continuing. "+NAVIGATE_RULES;
const VISITED_DESCRIPTION="Walk to a coordinate on the current map using A* only over terrain already shown to you this run. Supply its map_id. Walks across the stitched known terrain one ordinary button at a time, re-planning before every press; unknown cells are not routes, and a newly observed area becomes available only after this tool result is returned. Stops on blocked or unexpected movement, locks, map changes, or when the route stops getting shorter. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Inspect the returned state before continuing. "+NAVIGATE_RULES;
const terrainRules=(ports:NavigationPorts):string=>{
 const rules=[...(ports.ledges===true?["hops a ledge only in its arrow direction"]:[]),...(ports.oneWay===true?["never crosses a walled side of a + tile"]:[]),...(ports.floor===true?["walks sand, cave and other floor the game allows"]:[])];
 return rules.length===0?"avoids unsupported terrain":`avoids unsupported terrain, ${rules.join(", ")},`;
};
export function navigationTool(ports:NavigationPorts):CheckedNavigationTool {
 const mode:NavigationMode=ports.fullMap===true?"full":ports.visitedTerrain===true?"visited":"local",truth=ports.truth===true;
 const limit=mode==="local"?MAX_NAVIGATION_COMMANDS:MAX_FULL_ROUTE_COMMANDS;
 const bound=ports.maxCommands??limit;
 if(!Number.isInteger(bound)||bound<1||bound>limit)throw new Error(`Navigation command bound must be 1..${String(limit)}`);
 const incumbent=mode==="full"?FULL_DESCRIPTION:mode==="visited"?VISITED_DESCRIPTION:LOCAL_DESCRIPTION;
 const warpDescription=ports.deterministicWarps===true?"For a listed warp, it may choose a reachable equivalent warp with the same complete destination and known activation behavior; if already on a directional warp, it presses the required direction once and verifies the map changed. Does not press A.":"Does not press A, choose destinations, or activate a directional exit after arriving.";
 const described=(ports.automaticRunning===true?incumbent.replace(" Use walking=true for deliberate walking.",""):incumbent).replace("avoids unsupported terrain",terrainRules(ports)).replace("Does not press A, choose destinations, or activate a directional exit after arriving.",warpDescription);
 const description=ports.navigateFirst===true?`${NAVIGATE_FIRST_DESCRIPTION} ${described}${mode==="local"?COMMAND_LIMIT_HINT:""}`:described;
 const execute=async(id:string,goal:{readonly x:number;readonly y:number;readonly map_id:readonly [number,number];readonly walking?:boolean},signal?:AbortSignal,stop?:NavigationStopCheck):Promise<AgentToolResult<unknown>>=>{
  signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
  let state=await ports.read(signal),commands=0,status="command limit",last:AgentToolResult<unknown>|undefined;
  const blackout=new BlackoutCarry();
  let shortest=Infinity,stalled=0,unready=false,selectedTarget:Point={x:goal.x,y:goal.y},directionalWarpAttempted=false;
  const origin=state.position;
  const sameMap=():boolean=>state.map_id?.[0]===goal.map_id[0]&&state.map_id[1]===goal.map_id[1];
  while(commands<bound){
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   state=await ports.read(signal);signal?.throwIfAborted();
   const beforeStop=stop?.(state)??null;if(beforeStop!==null){status=beforeStop;break;}
   if(!sameMap()){
    if(ports.crossMapGoal!==true||commands>0){status="map changed; inspect destination";break;}
    if(state.map_id!==null){status=crossMapReason(state,state.map_id,goal);break;}
   }
   if(!ready(state,mode)){status=ports.refusalReasons===true?unreadyReason(state):"field input or navigation geometry unavailable";unready=true;break;}
   const options:NavigationOptions={mode,ledges:ports.ledges===true,oneWay:ports.oneWay===true,grassCost:ports.grassCost===true,floor:ports.floor===true,elevation:ports.elevation??"game",...(truth&&ports.triggers===true?{triggers:matchingTriggers(state)}:{})};
   const warpPlan=ports.deterministicWarps===true?deterministicWarpPlan(state,goal,options):null;
   selectedTarget=warpPlan?.target??{x:goal.x,y:goal.y};
   const path=warpPlan?.path??planNavigation(state,goal,options);
   if(path===null){
    status=(ports.counters===true?counterHint(state,goal,options,truth):null)??(ports.refusalReasons===true?targetReason(state,goal,options,ports.connectionEdges===true,truth,ports.exitReach===true?{surf:ports.surfGate===true,reach:true}:null):null)??(truth?triggerReason(state,goal,options):null)??(mode==="local"&&ports.windowReasons===true?windowReason(state,goal,options):null)??(mode==="full"?"no supported path on the current map; choose a reachable waypoint":mode==="visited"?"no supported path through terrain shown this run; explore until another area has been shown, then try again":"no supported local path; choose a reachable local waypoint");
    const here=state.position;
    if(truth&&commands>0&&origin!==null&&here!==null&&distance(origin,here)!==0)status=`walked from ${at(origin)} to ${at(here)}, then stopped: ${status}`;
    break;
   }
   const direction=path[0];
   if(direction===undefined){
    if(warpPlan?.activation!==null&&warpPlan?.activation!==undefined&&state.position!==null&&samePoint(state.position,warpPlan.target)){
     const before=state.position,activation=warpPlan.activation;
     try {
      last=await ports.press(id,{buttons:[activation]},signal,actual=>{
       if(actual===undefined||!ready(actual,mode)||actual.map_id?.[0]!==goal.map_id[0]||actual.map_id[1]!==goal.map_id[1]||actual.position?.x!==before.x||actual.position.y!==before.y)throw new NavigationPreconditionError("map, position or field input unavailable or changed before action; no command submitted");
       const current=warpIdentityAt(actual,warpPlan.target,options);
       if(current===null||current.activation!==activation||!sameWarpIdentity(current.identity,warpPlan.identity))throw new NavigationPreconditionError("warp identity or activation changed before action; no command submitted");
      },{automaticRunning:false});
     } catch(error){if(!(error instanceof NavigationPreconditionError))throw error;status=error.message;break;}
     commands++;directionalWarpAttempted=true;state=blackout.remember(resultState(last));
     const afterWarpStop=stop?.(state)??null;if(afterWarpStop!==null)status=afterWarpStop;
     break;
    }
    status="arrived at requested coordinate";break;
   }
   if(mode!=="local"){if(path.length<shortest){shortest=path.length;stalled=0;}else if(++stalled>=NO_PROGRESS_PRESSES){status="route not converging; inspect obstacles and choose another approach";break;}}
   const planned=state,previousFacing=state.facing; const before=state.position;if(before===null)throw new Error("Navigation position unavailable");
   try {
    last=await ports.press(id,{buttons:[direction],...(ports.automaticRunning===true||goal.walking===undefined?{}:{walking:goal.walking})},signal,actual=>{
     if(actual===undefined||!ready(actual,mode)||actual.map_id?.[0]!==goal.map_id[0]||actual.map_id[1]!==goal.map_id[1]||actual.position?.x!==before.x||actual.position.y!==before.y)throw new NavigationPreconditionError("map, position or field input unavailable or changed before action; no command submitted");
    });
   } catch(error){if(!(error instanceof NavigationPreconditionError))throw error;status=error.message;break;}
   commands++;state=blackout.remember(resultState(last));
   const afterStop=stop?.(state)??null;if(afterStop!==null){status=afterStop;break;}
   if(!sameMap()){status="map changed; inspect destination";break;}
   if(!ready(state,mode)){status=ports.refusalReasons===true?`walk interrupted: ${unreadyReason(state)}`:"field input locked or unavailable; inspect new state";unready=true;break;}
   const after=state.position;if(after===null)throw new Error("Navigation position unavailable");
   const delta=DIRECTIONS.find(([d])=>d===direction);if(delta===undefined)throw new Error("Unknown navigation direction");
   const span=ports.ledges===true&&hopAhead(planned,mode,before,direction,delta[1],delta[2])?2:1;
   if(distance(before,after)===0){
    if(state.facing===direction.toLowerCase()&&previousFacing!==state.facing){continue;}
    status=(truth?blocker(state,mode,Array.from({length:span},(_,k)=>({x:before.x+delta[1]*(k+1),y:before.y+delta[2]*(k+1)}))):null)??"blocked; inspect obstacle and choose another approach";break;
   }
   const crossed=delta[1]===0&&after.x===before.x?(after.y-before.y)/delta[2]:delta[2]===0&&after.y===before.y?(after.x-before.x)/delta[1]:0;
   // A held running press can finish more than one tile away. It is still the planned move only when every
   // crossed tile is the next collinear prefix of the route; pushbacks, teleports and off-route displacement stop.
   const runningPrefix=ports.automaticRunning===true&&Number.isInteger(crossed)&&crossed>0&&path.length>=crossed&&path.slice(0,crossed).every(step=>step===direction);
   if((after.x!==before.x+delta[1]*span||after.y!==before.y+delta[2]*span)&&!runningPrefix){status="unexpected movement; inspect new state";break;}
   if(distance(after,selectedTarget)===0){
    if(warpPlan?.activation!==null&&warpPlan?.activation!==undefined){if(commands<bound)continue;status="command limit";break;}
    status="arrived at requested coordinate";break;
   }
  }
  last=await ports.observe(id,signal);state=blackout.preserve(blackout.remember(resultState(last)));
  const finalStop=stop?.(state)??null;if(finalStop!==null)status=finalStop;
  if(directionalWarpAttempted){status=state.map_id===null?"directional warp transition unverified; inspect new state":sameMap()?"directional warp did not change map; inspect new state":"directional warp activated; inspect destination";}
  // A composite navigation call can consume the one-shot receipt in an internal
  // press and then replace that observation with a fresh one. Carry the event
  // and its exact notice into the outer result for both recording and the model.
  // The cap text describes the observation returned with it: "call again" only when the walk can go on.
  // exit-reachability-v1: "call again" only when the goal (or a tile next to it) is on the server's foot area.
  if(truth&&status==="command limit"){const here=state.position;const cut=ports.exitReach===true&&exitBlock({surf:false,reach:true},state).footNear(goal.x,goal.y)===false;status=here!==null&&sameMap()&&ready(state,mode)?`command limit: stopped at ${at(here)} after ${String(commands)} ordinary button attempts, the most one navigate_to call makes; ${cut?`${at(goal)} cannot be reached on foot from where you stand: no walkable way on this map leads from your tile to it or to a tile next to it, so calling navigate_to again will not get there`:`call navigate_to again to continue to ${at(goal)}`}`:`command limit: stopped after ${String(commands)} ordinary button attempts, the most one navigate_to call makes; the field is no longer free to walk, so inspect the new state`;}
  const notices=blackout.missingNotices(last.content.flatMap(part=>part.type==="text"?[part.text]:[]));
  return {content:[{type:"text",text:`Navigation: ${status}; ${String(commands)} ordinary button attempts.`},...notices.map(text=>({type:"text" as const,text})),...last.content],details:{state,navigation:{status,commands,target:goal,...(ports.deterministicWarps===true?{selected_target:selectedTarget}:{}),unready}}};
 };
 return {name:"navigate_to",label:"Walk to a coordinate",description,parameters:(ports.automaticRunning===true?DeterministicRunningArgs:Args) as typeof Args,execute:(id,goal,signal)=>execute(id,goal,signal),executeChecked:(id,goal,check,signal)=>execute(id,goal,signal,check)};
}


// Reuse the actual ordinary tools, including objective guards and recorder hooks.
export function withNavigation(base:readonly AgentTool[],features:FeatureSet,state:StateSource,gate?:NavigationPorts["gate"]):AgentTool[] {
 const tools=[...base];if(!features["bounded-navigation-v1"])return tools;
 const press=base.find(tool=>tool.name==="press"),observe=base.find(tool=>tool.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press))throw new Error("Navigation requires ordinary game tools");
 tools.push(navigationTool({automaticRunning:features["automatic-running-v1"],ledges:features["ledge-hops-v1"],oneWay:features["one-way-tiles-v1"],grassCost:features["grass-cost-navigation-v1"],counters:features["counter-talk-v1"],refusalReasons:features["navigation-refusal-reasons-v1"],connectionEdges:features["connection-edge-tiles-v1"],truth:features["navigation-truth-v1"],triggers:features["coordinate-script-conditions-v1"],windowReasons:features["navigation-refusal-reasons-v2"],floor:features["walkable-floor-v1"],elevation:features["elevation-transitions-v1"]?"game":"legacy",navigateFirst:features["navigate-first-prompt-v1"],crossMapGoal:features["cross-map-goal-v1"],exitReach:features["exit-reachability-v1"],surfGate:features["surf-gated-exits-v1"],deterministicWarps:features["deterministic-warp-navigation-v1"],read:signal=>state.read(signal),press:(id,params,signal,check,options)=>check===undefined?press.execute(id,params,signal):press.executeChecked(id,params,check,signal,undefined,options),observe:(id,signal)=>observe.execute(id,{},signal),gate,fullMap:features["full-map-navigation-v1"],visitedTerrain:features["visited-terrain-navigation-v1"]}));return tools;
}
