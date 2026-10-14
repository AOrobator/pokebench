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
const WALKING=new Set(Array.from({length:0xf0},(_,behavior)=>behavior).filter(behavior=>!UNWALKABLE.has(behavior)));
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
const mismatch=(walker:number,tile:number):boolean=>walker!==0&&tile!==0&&tile!==MULTI_LEVEL&&tile!==walker;
const entered=(walker:number,tile:number):number=>tile===MULTI_LEVEL?walker:tile;
const jumped=(walker:number,takeoff:number,ledge:number,landing:number):number=>landing!==MULTI_LEVEL?landing:takeoff===MULTI_LEVEL?walker:entered(walker,ledge);
const ready=(s:GameStateSnapshot,mode:NavigationMode="local"):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.field_controls_locked===false&&s.position!==null&&s.map_id!==null&&(mode==="full"?s.map_grid!=null:s.navigation_grid!=null)&&(s.active_ui==null||(s.active_ui.ready===true&&s.active_ui.diagnostic===null));
export const MAX_NAVIGATION_COMMANDS=8;
// Safety bound for whole-map routes; the longest Emerald routes need a few hundred steps.
export const MAX_FULL_ROUTE_COMMANDS=512;
// Whole-map walks stop when the planned route has not shortened for this many presses.
export const NO_PROGRESS_PRESSES=16;

export interface NavigationOptions {readonly mode?:NavigationMode;readonly ledges?:boolean;readonly oneWay?:boolean}
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
 const mode=options.mode??"local";
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
    if(land===undefined||occupied.has(key(landing))||warps.has(key(landing))||land.collision!==0||land.behavior===0x69||!WALKING.has(land.behavior))continue;
    if(mismatch(node.elevation,land.elevation))continue;
    pending.push(node.cost+2+distance(landing,goal),{p:landing,here:land.elevation,elevation:jumped(node.elevation,node.here,tile.elevation,land.elevation),cost:node.cost+2,parent:node,direction});continue;
   }
   if(options.oneWay===true&&(walled(tile,OPPOSITE[direction])||walled(geometry.tile(node.p),direction)))continue;
   if(!(WALKING.has(tile.behavior)||(options.oneWay===true&&EDGE_WALLS.has(tile.behavior))))continue;
   const door=tile.behavior===0x69&&distance(next,goal)===0&&direction==="UP";
   if((tile.collision!==0&&!door)||(tile.behavior===0x69&&!door))continue;
   if(warps.has(key(next))&&distance(next,goal)!==0)continue;
   if(mismatch(node.elevation,tile.elevation))continue;
   pending.push(node.cost+1+distance(next,goal),{p:next,here:tile.elevation,elevation:entered(node.elevation,tile.elevation),cost:node.cost+1,parent:node,direction});
  }
 }
 return !goalKnown&&best!==start ? route(best) : null;
}
const Args=Type.Object({x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0}),map_id:Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]),walking:Type.Optional(Type.Boolean({description:"Walk deliberately without automatic running."}))},{additionalProperties:false});
export interface NavigationPorts {
 readonly counters?:boolean;
 readonly read:(signal?:AbortSignal)=>Promise<GameStateSnapshot>;
 readonly press:(id:string,params:{buttons:Button[];walking?:boolean},signal?:AbortSignal,check?:BeforePressCheck)=>Promise<AgentToolResult<unknown>>;
 readonly observe:(id:string,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>;
 readonly gate?:((signal?:AbortSignal)=>Promise<void>)|undefined;
 readonly maxCommands?:number;
 // Plan over the whole current map and walk the full route (full-map-navigation-v1).
 readonly fullMap?:boolean;
 readonly ledges?:boolean;
 readonly oneWay?:boolean;
}
function resultState(result:AgentToolResult<unknown>):GameStateSnapshot {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))throw new Error("Navigation observation lacks verified state");
 return parseGameState(details.state);
}
class NavigationPreconditionError extends Error {}
const LOCAL_DESCRIPTION="Walk toward a coordinate on the current map using bounded A*. Supply its map_id. Uses only known local tiles, advancing toward a reachable local frontier for distant in-bounds targets; avoids unsupported terrain and stops on locks, unexpected movement or map changes. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Maximum 8 ordinary button attempts; inspect the returned state before continuing.";
const FULL_DESCRIPTION="Walk to a coordinate on the current map using A* over the whole current map. Supply its map_id. Walks the full route one ordinary button at a time, re-planning before every press; avoids unsupported terrain and never crosses a warp unless it is the destination. Stops on blocked or unexpected movement, locks, map changes, or when the route stops getting shorter. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Inspect the returned state before continuing.";
const terrainRules=(ports:NavigationPorts):string=>{
 const rules=[...(ports.ledges===true?["hops a ledge only in its arrow direction"]:[]),...(ports.oneWay===true?["never crosses a walled side of a + tile"]:[])];
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
  let shortest=Infinity,stalled=0;
  const sameMap=():boolean=>state.map_id?.[0]===goal.map_id[0]&&state.map_id[1]===goal.map_id[1];
  while(commands<bound){
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   state=await ports.read(signal);signal?.throwIfAborted();
   if(!sameMap()){status="map changed; inspect destination";break;}
   if(!ready(state,mode)){status="field input or navigation geometry unavailable";break;}
   const options:NavigationOptions={mode,ledges:ports.ledges===true,oneWay:ports.oneWay===true};
   const path=planNavigation(state,goal,options);
   if(path===null){status=(ports.counters===true?counterHint(state,goal,options):null)??(mode==="full"?"no supported path on the current map; choose a reachable waypoint":"no supported local path; choose a reachable local waypoint");break;}
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
   if(!ready(state,mode)){status="field input locked or unavailable; inspect new state";break;}
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
  return {content:[{type:"text",text:`Navigation: ${status}; ${String(commands)} ordinary button attempts.`},...last.content],details:{state,navigation:{status,commands,target:goal}}};
 }};
}


// Reuse the actual ordinary tools, including objective guards and recorder hooks.
export function withNavigation(base:readonly AgentTool[],features:FeatureSet,state:StateSource,gate?:NavigationPorts["gate"]):AgentTool[] {
 const tools=[...base];if(!features["bounded-navigation-v1"])return tools;
 const press=base.find(tool=>tool.name==="press"),observe=base.find(tool=>tool.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press))throw new Error("Navigation requires ordinary game tools");
 tools.push(navigationTool({ledges:features["ledge-hops-v1"],oneWay:features["one-way-tiles-v1"],counters:features["counter-talk-v1"],read:signal=>state.read(signal),press:(id,params,signal,check)=>check===undefined?press.execute(id,params,signal):press.executeChecked(id,params,check,signal),observe:(id,signal)=>observe.execute(id,{},signal),gate,fullMap:features["full-map-navigation-v1"]}));return tools;
}
