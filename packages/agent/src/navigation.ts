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
const WALKING=new Set([0,2,3,0x60,0x61,0x62,0x63,0x64,0x65,0x67,0x68,0x69,0x6a,0x6b,0x6c,0x6d,0x6e]);
// pokeemerald 731ad5b MB_JUMP_EAST/WEST/NORTH/SOUTH: collision tiles that one press
// in their direction jumps over, landing two tiles on (GetLedgeJumpDirection).
const LEDGES:ReadonlyMap<number,Direction>=new Map([[0x38,"RIGHT"],[0x39,"LEFT"],[0x3a,"UP"],[0x3b,"DOWN"]]);
// pokeemerald 731ad5b MetatileBehavior_Is*Blocked: collision-free tiles whose listed sides
// IsMetatileDirectionallyImpassable refuses to cross, leaving the current tile or entering the next.
const EDGE_WALLS:ReadonlyMap<number,readonly Direction[]>=new Map([[0x30,["RIGHT"]],[0x31,["LEFT"]],[0x32,["UP"]],[0x33,["DOWN"]],[0x34,["UP","RIGHT"]],[0x35,["UP","LEFT"]],[0x36,["DOWN","RIGHT"]],[0x37,["DOWN","LEFT"]],[0xbe,["LEFT","RIGHT"]],[0xc0,["UP","DOWN"]],[0xc1,["LEFT","RIGHT"]]]);
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
const ready=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.field_controls_locked===false&&s.position!==null&&s.map_id!==null&&s.navigation_grid!=null&&(s.active_ui==null||(s.active_ui.ready===true&&s.active_ui.diagnostic===null));
export const MAX_NAVIGATION_COMMANDS=8;
// PokeAgent's GRASS_TILE_COST_MULTIPLIER: entering grass costs more, so routes avoid wild encounters when a detour is cheap.
export const GRASS_STEP_COST=1.5;
const GRASS=new Set([2,3]);

export interface NavigationOptions {readonly ledges?:boolean;readonly oneWay?:boolean;readonly grassCost?:boolean}
const hopAhead=(state:GameStateSnapshot,from:Point,direction:Direction,dx:number,dy:number):boolean=>{
 const tile=state.navigation_grid?.tiles.find(t=>t.x===from.x+dx&&t.y===from.y+dy);
 return tile!==undefined&&LEDGES.get(tile.behavior)===direction;
};

// Bounded A* over the current live 15x15 window. No outside-map guessing,
// surfing or puzzle policies; ledges and edge walls only when enabled. Elevation follows the game's rule.
export function planNavigation(state:GameStateSnapshot,goal:Point,options:NavigationOptions={}):Direction[]|null {
 if(!ready(state)||state.navigation_grid==null||state.position===null)return null;
 const step=(tile:Tile):number=>options.grassCost===true&&GRASS.has(tile.behavior)?GRASS_STEP_COST:1;
 const grid=state.navigation_grid,tiles=new Map<string,Tile>();
 for(const tile of grid.tiles){if(tiles.has(key(tile)))return null;tiles.set(key(tile),tile);}
 const start=tiles.get(key(state.position));if(start===undefined)return null;
 const topology=state.topology;
 if(topology!=null&&grid.tiles.some(t=>t.x>=topology.width||t.y>=topology.height||t.x<0||t.y<0))return null;
 if(topology!=null&&(goal.x>=topology.width||goal.y>=topology.height||goal.x<0||goal.y<0))return null;
 if(!tiles.has(key(goal))&&topology==null)return null;
 const occupied=new Set(grid.objects.map(key)),warps=new Set(grid.warps.map(key));
 if(occupied.has(key(goal)))return null;
 type Node={p:Point;here:number;elevation:number;cost:number;path:Direction[]};
 let best:Node={p:state.position,here:start.elevation,elevation:grid.elevation,cost:0,path:[]};
 const pending:Node[]=[best],costs=new Map<string,number>();
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
    if(mismatch(node.elevation,land.elevation))continue;
    pending.push({p:landing,here:land.elevation,elevation:jumped(node.elevation,node.here,tile.elevation,land.elevation),cost:node.cost+1+step(land),path:[...node.path,direction]});continue;
   }
   if(options.oneWay===true&&(walled(tile,OPPOSITE[direction])||walled(tiles.get(key(node.p)),direction)))continue;
   if(!(WALKING.has(tile.behavior)||(options.oneWay===true&&EDGE_WALLS.has(tile.behavior))))continue;
   const door=tile.behavior===0x69&&distance(next,goal)===0&&direction==="UP";
   if((tile.collision!==0&&!door)||(tile.behavior===0x69&&!door))continue;
   if(warps.has(key(next))&&distance(next,goal)!==0)continue;
   if(mismatch(node.elevation,tile.elevation))continue;
   pending.push({p:next,here:tile.elevation,elevation:entered(node.elevation,tile.elevation),cost:node.cost+step(tile),path:[...node.path,direction]});
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
 readonly oneWay?:boolean;
 readonly grassCost?:boolean;
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
 return {name:"navigate_to",label:"Walk to a coordinate",description:`Walk toward a coordinate on the current map using bounded A*. Supply its map_id. Uses only known local tiles, advancing toward a reachable local frontier for distant in-bounds targets; avoids unsupported terrain${ports.ledges===true?", hops a ledge only in its arrow direction,":""}${ports.oneWay===true?", never crosses a walled side of a + tile,":""} and stops on locks, unexpected movement or map changes. Does not press A, choose destinations, or activate a directional exit after arriving. Use walking=true for deliberate walking. Maximum 8 ordinary button attempts; inspect the returned state before continuing.`,parameters:Args,
 execute:async(id,goal,signal)=>{
  signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
  let state=await ports.read(signal),commands=0,status="command limit",last:AgentToolResult<unknown>|undefined;
  const sameMap=():boolean=>state.map_id?.[0]===goal.map_id[0]&&state.map_id[1]===goal.map_id[1];
  while(commands<bound){
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   state=await ports.read(signal);signal?.throwIfAborted();
   if(!sameMap()){status="map changed; inspect destination";break;}
   if(!ready(state)){status="field input or navigation geometry unavailable";break;}
   const path=planNavigation(state,goal,{ledges:ports.ledges===true,oneWay:ports.oneWay===true,grassCost:ports.grassCost===true});
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
 tools.push(navigationTool({ledges:features["ledge-hops-v1"],oneWay:features["one-way-tiles-v1"],grassCost:features["grass-cost-navigation-v1"],read:signal=>state.read(signal),press:(id,params,signal,check)=>check===undefined?press.execute(id,params,signal):press.executeChecked(id,params,check,signal),observe:(id,signal)=>observe.execute(id,{},signal),gate}));return tools;
}
