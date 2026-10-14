import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {Button} from "./events.js";
import {isCheckedPress,type BeforePressCheck} from "./game-tools.js";
import type {FeatureSet} from "./features.js";
import {parseGameState,type StateSource,type GameStateSnapshot} from "./game-state.js";

type Direction="UP"|"DOWN"|"LEFT"|"RIGHT";
type Point={readonly x:number;readonly y:number};
type Grid=NonNullable<GameStateSnapshot["navigation_grid"]>;
type Tile=Grid["tiles"][number];
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
const key=(p:Point):string=>`${String(p.x)},${String(p.y)}`;
const distance=(a:Point,b:Point):number=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const ready=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.field_controls_locked===false&&s.position!==null&&s.map_id!==null&&s.navigation_grid!=null&&(s.active_ui==null||(s.active_ui.ready===true&&s.active_ui.diagnostic===null));
export const MAX_NAVIGATION_COMMANDS=8;

export interface NavigationOptions {readonly ledges?:boolean}
const hopAhead=(state:GameStateSnapshot,from:Point,direction:Direction,dx:number,dy:number):boolean=>{
 const tile=state.navigation_grid?.tiles.find(t=>t.x===from.x+dx&&t.y===from.y+dy);
 return tile!==undefined&&LEDGES.get(tile.behavior)===direction;
};

// Bounded A* over the current live 15x15 window. No outside-map guessing,
// surfing or puzzle policies; ledges only when enabled. Zero elevation preserves the layer.
export function planNavigation(state:GameStateSnapshot,goal:Point,options:NavigationOptions={}):Direction[]|null {
 if(!ready(state)||state.navigation_grid==null||state.position===null)return null;
 const grid=state.navigation_grid,tiles=new Map<string,Tile>();
 for(const tile of grid.tiles){if(tiles.has(key(tile)))return null;tiles.set(key(tile),tile);}
 if(!tiles.has(key(state.position)))return null;
 const topology=state.topology;
 if(topology!=null&&grid.tiles.some(t=>t.x>=topology.width||t.y>=topology.height||t.x<0||t.y<0))return null;
 if(topology!=null&&(goal.x>=topology.width||goal.y>=topology.height||goal.x<0||goal.y<0))return null;
 if(!tiles.has(key(goal))&&topology==null)return null;
 const occupied=new Set(grid.objects.map(key)),warps=new Set(grid.warps.map(key));
 if(occupied.has(key(goal)))return null;
 type Node={p:Point;elevation:number;cost:number;path:Direction[]};
 let best:Node={p:state.position,elevation:grid.elevation,cost:0,path:[]};
 const pending:Node[]=[{p:state.position,elevation:grid.elevation,cost:0,path:[]}],costs=new Map<string,number>();
 while(pending.length){
  pending.sort((a,b)=>(a.cost+distance(a.p,goal))-(b.cost+distance(b.p,goal)));
  const node=pending.shift();if(node===undefined)break;
  const identity=`${key(node.p)}:${String(node.elevation)}`;
  if((costs.get(identity)??Infinity)<=node.cost)continue;costs.set(identity,node.cost);
  if(distance(node.p,goal)<distance(best.p,goal)||(distance(node.p,goal)===distance(best.p,goal)&&node.cost<best.cost))best=node;
  if(distance(node.p,goal)===0)return node.path;
  for(const [direction,dx,dy] of DIRECTIONS){
   const next={x:node.p.x+dx,y:node.p.y+dy},tile=tiles.get(key(next));
   if(tile===undefined||occupied.has(key(next)))continue;
   if(options.ledges===true&&LEDGES.get(tile.behavior)===direction&&!warps.has(key(next))){
    const landing={x:next.x+dx,y:next.y+dy},land=tiles.get(key(landing));
    if(land===undefined||occupied.has(key(landing))||warps.has(key(landing))||land.collision!==0||land.behavior===0x69||!WALKING.has(land.behavior))continue;
    if(land.elevation!==0&&node.elevation!==0&&land.elevation!==node.elevation)continue;
    pending.push({p:landing,elevation:land.elevation||node.elevation,cost:node.cost+2,path:[...node.path,direction]});continue;
   }
   if(!WALKING.has(tile.behavior))continue;
   const door=tile.behavior===0x69&&distance(next,goal)===0&&direction==="UP";
   if((tile.collision!==0&&!door)||(tile.behavior===0x69&&!door))continue;
   if(warps.has(key(next))&&distance(next,goal)!==0)continue;
   if(tile.elevation!==0&&node.elevation!==0&&tile.elevation!==node.elevation)continue;
   pending.push({p:next,elevation:tile.elevation||node.elevation,cost:node.cost+1,path:[...node.path,direction]});
  }
 }
 return !tiles.has(key(goal))&&best.path.length>0 ? best.path : null;
}
const Args=Type.Object({x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0}),map_id:Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]),walking:Type.Optional(Type.Boolean({description:"Walk deliberately without automatic running."}))},{additionalProperties:false});
export interface NavigationPorts {
 readonly read:(signal?:AbortSignal)=>Promise<GameStateSnapshot>;
 readonly press:(id:string,params:{buttons:Button[];walking?:boolean},signal?:AbortSignal,check?:BeforePressCheck)=>Promise<AgentToolResult<unknown>>;
 readonly observe:(id:string,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>;
 readonly gate?:((signal?:AbortSignal)=>Promise<void>)|undefined;
 readonly maxCommands?:number;
 readonly ledges?:boolean;
}
function resultState(result:AgentToolResult<unknown>):GameStateSnapshot {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))throw new Error("Navigation observation lacks verified state");
 return parseGameState(details.state);
}
class NavigationPreconditionError extends Error {}
export function navigationTool(ports:NavigationPorts):AgentTool<typeof Args> {
 const bound=ports.maxCommands??MAX_NAVIGATION_COMMANDS;
 if(!Number.isInteger(bound)||bound<1||bound>MAX_NAVIGATION_COMMANDS)throw new Error("Navigation command bound must be 1..8");
 return {name:"navigate_to",label:"Walk to a coordinate",description:`Walk toward a coordinate on the current map using bounded A*. Supply its map_id. Uses only known local tiles, advancing toward a reachable local frontier for distant in-bounds targets; avoids unsupported terrain${ports.ledges===true?", hops a ledge only in its arrow direction,":""} and stops on locks, unexpected movement or map changes. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Maximum 8 ordinary button attempts; inspect the returned state before continuing.`,parameters:Args,
 execute:async(id,goal,signal)=>{
  signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
  let state=await ports.read(signal),commands=0,status="command limit",last:AgentToolResult<unknown>|undefined;
  const sameMap=():boolean=>state.map_id?.[0]===goal.map_id[0]&&state.map_id[1]===goal.map_id[1];
  while(commands<bound){
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   state=await ports.read(signal);signal?.throwIfAborted();
   if(!sameMap()){status="map changed; inspect destination";break;}
   if(!ready(state)){status="field input or navigation geometry unavailable";break;}
   const path=planNavigation(state,goal,{ledges:ports.ledges===true});
   if(path===null){status="no supported local path; choose a reachable local waypoint";break;}
   const direction=path[0];if(direction===undefined){status="arrived at requested coordinate";break;}
   const planned=state,previousFacing=state.facing; const before=state.position;if(before===null)throw new Error("Navigation position unavailable");
   try {
    last=await ports.press(id,{buttons:[direction],...(goal.walking===undefined?{}:{walking:goal.walking})},signal,actual=>{
     if(actual===undefined||!ready(actual)||actual.map_id?.[0]!==goal.map_id[0]||actual.map_id[1]!==goal.map_id[1]||actual.position?.x!==before.x||actual.position.y!==before.y)throw new NavigationPreconditionError("map, position or field input unavailable or changed before action; no command submitted");
    });
   } catch(error){if(!(error instanceof NavigationPreconditionError))throw error;status=error.message;break;}
   commands++;state=resultState(last);
   if(!sameMap()){status="map changed; inspect destination";break;}
   if(!ready(state)){status="field input locked or unavailable; inspect new state";break;}
   const after=state.position;if(after===null)throw new Error("Navigation position unavailable");
   const delta=DIRECTIONS.find(([d])=>d===direction);if(delta===undefined)throw new Error("Unknown navigation direction");
   const span=ports.ledges===true&&hopAhead(planned,before,direction,delta[1],delta[2])?2:1;
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
 tools.push(navigationTool({ledges:features["ledge-hops-v1"],read:signal=>state.read(signal),press:(id,params,signal,check)=>check===undefined?press.execute(id,params,signal):press.executeChecked(id,params,check,signal),observe:(id,signal)=>observe.execute(id,{},signal),gate}));return tools;
}
