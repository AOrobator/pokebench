import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {Button} from "./events.js";
import {isCheckedPress,type BeforePressCheck} from "./game-tools.js";
import type {FeatureSet} from "./features.js";
import {parseGameState,type StateSource,type GameStateSnapshot} from "./game-state.js";

type Direction="UP"|"DOWN"|"LEFT"|"RIGHT";
type Point={readonly x:number;readonly y:number};
type Tile={readonly collision:number;readonly behavior:number;readonly elevation:number};
export type NavigationMode="local"|"full";
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
// pokeemerald 731ad5b MB_JUMP_EAST/WEST/NORTH/SOUTH: collision tiles that one press
// in their direction jumps over, landing two tiles on (GetLedgeJumpDirection).
const LEDGES:ReadonlyMap<number,Direction>=new Map([[0x38,"RIGHT"],[0x39,"LEFT"],[0x3a,"UP"],[0x3b,"DOWN"]]);
// pokeemerald 731ad5b MetatileBehavior_Is*Blocked: collision-free tiles whose listed sides
// IsMetatileDirectionallyImpassable refuses to cross, leaving the current tile or entering the next.
const EDGE_WALLS:ReadonlyMap<number,readonly Direction[]>=new Map([[0x30,["RIGHT"]],[0x31,["LEFT"]],[0x32,["UP"]],[0x33,["DOWN"]],[0x34,["UP","RIGHT"]],[0x35,["UP","LEFT"]],[0x36,["DOWN","RIGHT"]],[0x37,["DOWN","LEFT"]],[0xbe,["LEFT","RIGHT"]],[0xc0,["UP","DOWN"]],[0xc1,["LEFT","RIGHT"]]]);
const COUNTER=0x80;
const OPPOSITE:Readonly<Record<Direction,Direction>>={UP:"DOWN",DOWN:"UP",LEFT:"RIGHT",RIGHT:"LEFT"};
const walled=(tile:Tile|undefined,side:Direction):boolean=>tile!==undefined&&(EDGE_WALLS.get(tile.behavior)?.includes(side)??false);
const key=(p:Point):string=>`${String(p.x)},${String(p.y)}`;
const distance=(a:Point,b:Point):number=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
// pokeemerald IsElevationMismatchAt / ObjectEventUpdateElevation: 0 is a
// transition (stairs) and 15 is multi-level (bridges); neither ever mismatches.
// A finished step or jump re-reads only its final tile, which sets the walker's
// height unless that tile is 15. A jump also updates mid-air on the ledge tile
// (InitJump, then JUMP_HALFWAY), and a 15 landing keeps that update.
const MULTI_LEVEL=15;
interface ElevationRule {readonly mismatch:(walker:number,tile:number)=>boolean;readonly entered:(walker:number,tile:number)=>number;readonly jumped:(walker:number,takeoff:number,ledge:number,landing:number)=>number}
const GAME_RULE:ElevationRule={
 mismatch:(walker,tile)=>walker!==0&&tile!==0&&tile!==MULTI_LEVEL&&tile!==walker,
 entered:(walker,tile)=>tile===MULTI_LEVEL?walker:tile,
 jumped:(walker,takeoff,ledge,landing)=>landing!==MULTI_LEVEL?landing:takeoff===MULTI_LEVEL?walker:GAME_RULE.entered(walker,ledge),
};
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

export interface NavigationOptions {readonly mode?:NavigationMode;readonly ledges?:boolean;readonly oneWay?:boolean;readonly grassCost?:boolean;readonly floor?:boolean;readonly elevation?:ElevationMode}
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
function counterHint(state:GameStateSnapshot,goal:Point,options:NavigationOptions):string|null {
 const geometry=options.mode==="full"?fullGeometry(state):localGeometry(state);if(geometry===null)return null;
 const at=(p:Point)=>(t:Point):boolean=>t.x===p.x&&t.y===p.y;
 const counter=(p:Point):boolean=>{const tile=geometry.tile(p);return tile!==undefined&&tile.behavior===COUNTER&&tile.collision!==0;};
 const occupied=(p:Point):boolean=>geometry.objects.some(at(p));
 let involved=counter(goal);
 for(const [direction,dx,dy] of DIRECTIONS){
  const across=occupied(goal)?{counter:{x:goal.x-dx,y:goal.y-dy},person:goal}:{counter:goal,person:{x:goal.x+dx,y:goal.y+dy}};
  if(!counter(across.counter)||!occupied(across.person))continue;
  involved=true;
  const stand={x:across.counter.x-dx,y:across.counter.y-dy};
  if(geometry.tile(stand)===undefined||planNavigation(state,stand,options)===null)continue;
  return `target is behind a counter; walk to (${String(stand.x)},${String(stand.y)}), face ${direction} toward the counter at (${String(across.counter.x)},${String(across.counter.y)}) and press A to talk across it`;
 }
 return involved?"target is a counter or behind one; you cannot stand on a counter, but you can face it from a reachable adjacent tile and press A to talk to someone behind it":null;
}
// navigation-refusal-reasons-v1: say why navigate_to cannot walk, from the same state and grid the planner uses.
const WATER=new Set([0x10,0x11,0x12,0x13,0x14,0x15,0x19,0x22,0x2a,0x50,0x51,0x52,0x53,0x6c,0x6d,0x6f]);
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
function targetReason(state:GameStateSnapshot,goal:Point,options:NavigationOptions):string|null {
 const geometry=options.mode==="full"?fullGeometry(state):localGeometry(state);if(geometry===null)return null;
 const bounds=geometry.bounds;
 if(bounds!==null&&(goal.x>=bounds.width||goal.y>=bounds.height))return `${at(goal)} is outside this map; its tiles run from (0,0) to (${String(bounds.width-1)},${String(bounds.height-1)}); to reach another map, use a listed warp or a map connection`;
 const same=(p:Point):boolean=>p.x===goal.x&&p.y===goal.y;
 if(geometry.warps.some(same))return warpReason(state,geometry,goal,options);
 const tile=geometry.tile(goal);if(tile===undefined)return null;
 const walkable=options.floor===true?FLOOR:LEGACY_WALKING;
 const standable=(t:Tile|undefined):boolean=>t!==undefined&&t.collision===0&&t.behavior!==0x69&&(walkable.has(t.behavior)||(options.oneWay===true&&EDGE_WALLS.has(t.behavior)));
 const free=(p:Point):boolean=>standable(geometry.tile(p))&&!geometry.objects.some(o=>o.x===p.x&&o.y===p.y)&&!geometry.warps.some(w=>w.x===p.x&&w.y===p.y)&&planNavigation(state,p,options)!==null;
 const targets=(state.interaction_targets??[]).filter(same);
 const person=targets.find(t=>t.kind==="object");
 const occupied=geometry.objects.some(same)||person!==undefined||(state.world_context?.objects??[]).some(o=>same(o)&&o.map_id[0]===state.map_id?.[0]&&o.map_id[1]===state.map_id[1]);
 const thing=person??(standable(tile)?undefined:targets.find(t=>t.activation==="A"&&t.kind!=="warp"));
 if(occupied||thing!==undefined){
  const kind=thing===undefined||thing.kind==="object"?"person or object":thing.kind.replaceAll("_"," ");
  const name=thing?.name;
  const label=name!=null?`${name} (${kind})`:`a ${kind}`;
  const stands=DIRECTIONS.flatMap(([side,dx,dy])=>{const stand={x:goal.x+dx,y:goal.y+dy};return free(stand)?[`${at(stand)} facing ${OPPOSITE[side]}`]:[];});
  return stands.length===0?`${at(goal)} is ${label}, which navigate_to cannot stand on, and none of its free neighbouring tiles can be reached from here; choose a reachable waypoint nearer to it`:`${at(goal)} is ${label}, which navigate_to cannot stand on; to talk to it or use it, walk to one of these free tiles, face it and press A: ${stands.join("; ")}`;
 }
 if(standable(tile))return null;
 const what=LEDGES.has(tile.behavior)?"a ledge, which you can only hop over in its arrow direction":WATER.has(tile.behavior)?"water":tile.collision!==0?"a wall or other solid tile":`terrain navigate_to does not walk on (metatile behavior 0x${tile.behavior.toString(16).padStart(2,"0")})`;
 const candidates:Point[]=[];
 for(let d=1;d<=NEAREST_RADIUS;d++)for(let dy=-d;dy<=d;dy++)for(const dx of new Set([-(d-Math.abs(dy)),d-Math.abs(dy)]))candidates.push({x:goal.x+dx,y:goal.y+dy});
 const sorted=candidates.sort((a,b)=>distance(a,goal)-distance(b,goal)||a.y-b.y||a.x-b.x);
 const nearest=sorted.find(free);
 return `${at(goal)} is ${what}, not a walkable tile; ${nearest===undefined?`no walkable tile navigate_to can reach lies within ${String(NEAREST_RADIUS)} steps of it`:`the nearest walkable tile navigate_to can reach is ${at(nearest)}`}`;
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

// A* over the live local 15x15 window, or the whole current map in "full" mode.
// No outside-map guessing, surfing or puzzle policies; ledges and edge walls only when enabled.
// Elevation follows the game's rule. Warps are only ever goals.
export function planNavigation(state:GameStateSnapshot,goal:Point,options:NavigationOptions={}):Direction[]|null {
 const mode=options.mode??"local",walkable=options.floor===true?FLOOR:LEGACY_WALKING,{mismatch,entered,jumped}=options.elevation==="legacy"?LEGACY_RULE:GAME_RULE;
 const step=(tile:Tile):number=>options.grassCost===true&&GRASS.has(tile.behavior)?GRASS_STEP_COST:1;
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
    pending.push(node.cost+1+step(land)+distance(landing,goal),{p:landing,here:land.elevation,elevation:jumped(node.elevation,node.here,tile.elevation,land.elevation),cost:node.cost+1+step(land),parent:node,direction});continue;
   }
   if(options.oneWay===true&&(walled(tile,OPPOSITE[direction])||walled(geometry.tile(node.p),direction)))continue;
   if(!(walkable.has(tile.behavior)||(options.oneWay===true&&EDGE_WALLS.has(tile.behavior))))continue;
   const door=tile.behavior===0x69&&distance(next,goal)===0&&direction==="UP";
   if((tile.collision!==0&&!door)||(tile.behavior===0x69&&!door))continue;
   if(warps.has(key(next))&&distance(next,goal)!==0)continue;
   if(mismatch(node.elevation,tile.elevation))continue;
   pending.push(node.cost+step(tile)+distance(next,goal),{p:next,here:tile.elevation,elevation:entered(node.elevation,tile.elevation),cost:node.cost+step(tile),parent:node,direction});
  }
 }
 return !goalKnown&&best!==start ? route(best) : null;
}
const Args=Type.Object({x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0}),map_id:Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]),walking:Type.Optional(Type.Boolean({description:"Walk deliberately without automatic running."}))},{additionalProperties:false});
export interface NavigationPorts {
 readonly counters?:boolean;
 // Explain refusals (navigation-refusal-reasons-v1); off keeps the generic text.
 readonly refusalReasons?:boolean;
 readonly read:(signal?:AbortSignal)=>Promise<GameStateSnapshot>;
 readonly press:(id:string,params:{buttons:Button[];walking?:boolean},signal?:AbortSignal,check?:BeforePressCheck)=>Promise<AgentToolResult<unknown>>;
 readonly observe:(id:string,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>;
 readonly gate?:((signal?:AbortSignal)=>Promise<void>)|undefined;
 readonly maxCommands?:number;
 // Plan over the whole current map and walk the full route (full-map-navigation-v1).
 readonly fullMap?:boolean;
 readonly ledges?:boolean;
 readonly oneWay?:boolean;
 readonly elevation?:ElevationMode;
 readonly grassCost?:boolean;
 readonly floor?:boolean;
}
function resultState(result:AgentToolResult<unknown>):GameStateSnapshot {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))throw new Error("Navigation observation lacks verified state");
 return parseGameState(details.state);
}
class NavigationPreconditionError extends Error {}
export const NAVIGATE_RULES="To talk to a person or use an object, target the walkable tile next to it, face it and press A; the person's or object's own tile is not walkable. It cannot walk while a message is open: dismiss the message with B first. For a door, stairs or another listed warp, target the warp's own coordinates.";
const LOCAL_DESCRIPTION="Walk toward a coordinate on the current map using bounded A*. Supply its map_id. Uses only known local tiles, advancing toward a reachable local frontier for distant in-bounds targets; avoids unsupported terrain and stops on locks, unexpected movement or map changes. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Maximum 8 ordinary button attempts; inspect the returned state before continuing. "+NAVIGATE_RULES;
const FULL_DESCRIPTION="Walk to a coordinate on the current map using A* over the whole current map. Supply its map_id. Walks the full route one ordinary button at a time, re-planning before every press; avoids unsupported terrain and never crosses a warp unless it is the destination. Stops on blocked or unexpected movement, locks, map changes, or when the route stops getting shorter. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Inspect the returned state before continuing. "+NAVIGATE_RULES;
const terrainRules=(ports:NavigationPorts):string=>{
 const rules=[...(ports.ledges===true?["hops a ledge only in its arrow direction"]:[]),...(ports.oneWay===true?["never crosses a walled side of a + tile"]:[]),...(ports.floor===true?["walks sand, cave and other floor the game allows"]:[])];
 return rules.length===0?"avoids unsupported terrain":`avoids unsupported terrain, ${rules.join(", ")},`;
};
export function navigationTool(ports:NavigationPorts):AgentTool<typeof Args> {
 const mode:NavigationMode=ports.fullMap===true?"full":"local";
 const limit=mode==="full"?MAX_FULL_ROUTE_COMMANDS:MAX_NAVIGATION_COMMANDS;
 const bound=ports.maxCommands??limit;
 if(!Number.isInteger(bound)||bound<1||bound>limit)throw new Error(`Navigation command bound must be 1..${String(limit)}`);
 return {name:"navigate_to",label:"Walk to a coordinate",description:(mode==="full"?FULL_DESCRIPTION:LOCAL_DESCRIPTION).replace("avoids unsupported terrain",terrainRules(ports)),parameters:Args,
 execute:async(id,goal,signal)=>{
  signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
  let state=await ports.read(signal),commands=0,status="command limit",last:AgentToolResult<unknown>|undefined;
  let shortest=Infinity,stalled=0,unready=false;
  const sameMap=():boolean=>state.map_id?.[0]===goal.map_id[0]&&state.map_id[1]===goal.map_id[1];
  while(commands<bound){
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   state=await ports.read(signal);signal?.throwIfAborted();
   if(!sameMap()){status="map changed; inspect destination";break;}
   if(!ready(state,mode)){status=ports.refusalReasons===true?unreadyReason(state):"field input or navigation geometry unavailable";unready=true;break;}
   const options:NavigationOptions={mode,ledges:ports.ledges===true,oneWay:ports.oneWay===true,grassCost:ports.grassCost===true,floor:ports.floor===true,elevation:ports.elevation??"game"};
   const path=planNavigation(state,goal,options);
   if(path===null){status=(ports.counters===true?counterHint(state,goal,options):null)??(ports.refusalReasons===true?targetReason(state,goal,options):null)??(mode==="full"?"no supported path on the current map; choose a reachable waypoint":"no supported local path; choose a reachable local waypoint");break;}
   const direction=path[0];if(direction===undefined){status="arrived at requested coordinate";break;}
   if(mode==="full"){if(path.length<shortest){shortest=path.length;stalled=0;}else if(++stalled>=NO_PROGRESS_PRESSES){status="route not converging; inspect obstacles and choose another approach";break;}}
   const planned=state,previousFacing=state.facing; const before=state.position;if(before===null)throw new Error("Navigation position unavailable");
   try {
    last=await ports.press(id,{buttons:[direction],...(goal.walking===undefined?{}:{walking:goal.walking})},signal,actual=>{
     if(actual===undefined||!ready(actual,mode)||actual.map_id?.[0]!==goal.map_id[0]||actual.map_id[1]!==goal.map_id[1]||actual.position?.x!==before.x||actual.position.y!==before.y)throw new NavigationPreconditionError("map, position or field input unavailable or changed before action; no command submitted");
    });
   } catch(error){if(!(error instanceof NavigationPreconditionError))throw error;status=error.message;break;}
   commands++;state=resultState(last);
   if(!sameMap()){status="map changed; inspect destination";break;}
   if(!ready(state,mode)){status=ports.refusalReasons===true?`walk interrupted: ${unreadyReason(state)}`:"field input locked or unavailable; inspect new state";unready=true;break;}
   const after=state.position;if(after===null)throw new Error("Navigation position unavailable");
   const delta=DIRECTIONS.find(([d])=>d===direction);if(delta===undefined)throw new Error("Unknown navigation direction");
   const span=ports.ledges===true&&hopAhead(planned,mode,before,direction,delta[1],delta[2])?2:1;
   if(distance(before,after)===0){
    if(state.facing===direction.toLowerCase()&&previousFacing!==state.facing){continue;}
    status="blocked; inspect obstacle and choose another approach";break;
   }
   if(after.x!==before.x+delta[1]*span||after.y!==before.y+delta[2]*span){status="unexpected movement; inspect new state";break;}
   if(distance(after,goal)===0){status="arrived at requested coordinate";break;}
  }
  last=await ports.observe(id,signal);state=resultState(last);
  return {content:[{type:"text",text:`Navigation: ${status}; ${String(commands)} ordinary button attempts.`},...last.content],details:{state,navigation:{status,commands,target:goal,unready}}};
 }};
}


// Reuse the actual ordinary tools, including objective guards and recorder hooks.
export function withNavigation(base:readonly AgentTool[],features:FeatureSet,state:StateSource,gate?:NavigationPorts["gate"]):AgentTool[] {
 const tools=[...base];if(!features["bounded-navigation-v1"])return tools;
 const press=base.find(tool=>tool.name==="press"),observe=base.find(tool=>tool.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press))throw new Error("Navigation requires ordinary game tools");
 tools.push(navigationTool({ledges:features["ledge-hops-v1"],oneWay:features["one-way-tiles-v1"],grassCost:features["grass-cost-navigation-v1"],counters:features["counter-talk-v1"],refusalReasons:features["navigation-refusal-reasons-v1"],floor:features["walkable-floor-v1"],elevation:features["elevation-transitions-v1"]?"game":"legacy",read:signal=>state.read(signal),press:(id,params,signal,check)=>check===undefined?press.execute(id,params,signal):press.executeChecked(id,params,check,signal),observe:(id,signal)=>observe.execute(id,{},signal),gate,fullMap:features["full-map-navigation-v1"]}));return tools;
}
