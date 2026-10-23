// surf-gated-exits-v1: the server's surf_gate (env/pokebench_env/surf_gate.py) names the exits on this map that the
// player can reach only across water. While field Surf cannot be used, exit lists leave them out.
// exit-reachability-v1: the server's exit_reach (env/pokebench_env/exit_reach.py) labels every exit foot, water or none
// and ships the tiles reached on foot. exitReach is the one check every exit list and navigate_to message reads.
// field-move-gates-v1: with that switch the server floods with closed field obstacles (env/pokebench_env/field_moves.py),
// so the same labels and foot mask already leave out what they cut off; obstacles() names them for a goal tile.
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";

export interface SurfBlock {readonly warp:(x:number,y:number)=>boolean;readonly connection:(direction:string)=>boolean}
const OPEN:SurfBlock={warp:()=>false,connection:()=>false};

export function surfBlock(features:FeatureSet,state:Pick<GameStateSnapshot,"surf_gate">):SurfBlock {
 return gated(features["surf-gated-exits-v1"],state);
}
function gated(on:boolean,state:Pick<GameStateSnapshot,"surf_gate">):SurfBlock {
 const gate=state.surf_gate;
 if(!on||gate?.can_surf!==false)return OPEN;
 return {warp:(x,y)=>gate.warps.some(w=>w.x===x&&w.y===y),connection:direction=>gate.connections.some(c=>c===direction)};
}

// Why an exit is left out: across water while Surf cannot be used, or reachable neither on foot nor across water.
export type Cut="water"|"none";
// One map connection as the readout lists it; a map can have two on one side (Route 111, Route 124).
export interface ConnectionRef {readonly direction:string;readonly destination:readonly number[];readonly offset:number}
export interface ExitBlock {
 readonly warp:(x:number,y:number)=>boolean;
 readonly connection:(connection:ConnectionRef)=>boolean;
 readonly warpCut:(x:number,y:number)=>Cut|null;
 readonly connectionCut:(connection:ConnectionRef)=>Cut|null;
 // Whether the server's flood reaches this tile on foot; null when the switch is off, the state carries no exit_reach,
 // or its foot mask is malformed.
 readonly foot:(x:number,y:number)=>boolean|null;
 // The tile or one of its four neighbours is reached on foot (how warps and people are reached); null when unknown.
 readonly footNear:(x:number,y:number)=>boolean|null;
 // field-move-gates-v1: for a tile neither it nor a neighbour of which is reached on foot, the closed obstacles every way
 // to it passes, in the readout's words with the game's own text; null when the switch is off or nothing names one.
 readonly obstacles:(x:number,y:number)=>string|null;
}
export interface ReachSwitches {readonly surf:boolean;readonly reach:boolean;readonly gates?:boolean}
export const reachSwitches=(features:FeatureSet):ReachSwitches=>({surf:features["surf-gated-exits-v1"],reach:features["exit-reachability-v1"],gates:features["field-move-gates-v1"]});
const NEIGHBOURS=[[0,0],[1,0],[-1,0],[0,1],[0,-1]] as const;

type Reach=NonNullable<GameStateSnapshot["exit_reach"]>;
type Mask=Reach["foot"];
type Obstacle=NonNullable<GameStateSnapshot["field_obstacles"]>["obstacles"][number];
// exactly height rows of ceil(width/4) hex digits, the size of the map the topology gives; anything else is unknown.
function wellFormed(mask:Mask,topology:GameStateSnapshot["topology"]):boolean {
 const {width,height,rows}=mask,digits=Math.ceil(width/4);
 return rows.length===height&&rows.every(r=>r.length===digits)&&(topology==null||(topology.width===width&&topology.height===height));
}
function masked(mask:Mask,x:number,y:number):boolean {
 const {width,height,rows}=mask;
 if(x<0||y<0||x>=width||y>=height)return false;
 const digit=Number.parseInt(rows[y]?.charAt(x>>2)??"",16);
 return ((digit>>(3-(x&3)))&1)===1;
}
const near=(mask:Mask,x:number,y:number):boolean=>NEIGHBOURS.some(([dx,dy])=>masked(mask,x+dx,y+dy));
const reading=(a:{x:number;y:number},b:{x:number;y:number}):number=>a.y-b.y||a.x-b.x;
const join=(items:readonly string[],word:string):string=>items.length<2?items.join(""):`${items.slice(0,-1).join(", ")} ${word} ${items.at(-1)??""}`;
// The obstacles every way to a tile passes, grouped by kind as the server's readout names them (field_moves._passes).
export function passesText(found:readonly Obstacle[]):string {
 const named=new Map<string,{x:number;y:number}[]>();
 for(const o of found)named.set(o.name,[...(named.get(o.name)??[]),...o.tiles]);
 const what=[...named].map(([name,tiles])=>`${name} at ${join([...tiles].sort(reading).map(t=>`(${String(t.x)},${String(t.y)})`),"or")}`).join(" or ");
 const needs=[...new Set(found.map(o=>o.needs))];
 const need=needs.length===1?needs[0]??"":needs.includes("special movement that walking navigation does not perform")?"a field move, an item, or special movement unavailable to walking navigation":"a field move or an item you cannot use yet";
 const texts=[...new Set(found.flatMap(o=>o.text===null?[]:[o.text]))].map(t=>`"${t}"`);
 const said=texts.length===0?"the game shows no message there":`the game says: ${join(texts,"and")}`;
 return `every way to it on this map passes ${what}, which needs ${need}; ${said}`;
}
export function exitBlock(switches:ReachSwitches,state:Pick<GameStateSnapshot,"surf_gate"|"exit_reach"|"topology"|"field_obstacles">):ExitBlock {
 const surf=gated(switches.surf,state);
 const given=switches.reach?state.exit_reach??null:null;
 const reach=given!==null&&wellFormed(given.foot,state.topology)?given:null;
 const noneWarp=(x:number,y:number):boolean=>reach?.warps.some(w=>w.x===x&&w.y===y&&w.reach==="none")??false;
 const noneEdge=(k:ConnectionRef):boolean=>reach?.connections.some(c=>c.direction===k.direction&&c.destination[0]===k.destination[0]&&c.destination[1]===k.destination[1]&&c.offset===k.offset&&c.reach==="none")??false;
 const warpCut=(x:number,y:number):Cut|null=>surf.warp(x,y)?"water":noneWarp(x,y)?"none":null;
 const connectionCut=(k:ConnectionRef):Cut|null=>surf.connection(k.direction)?"water":noneEdge(k)?"none":null;
 const foot=(x:number,y:number):boolean|null=>reach===null?null:masked(reach.foot,x,y);
 const footNear=(x:number,y:number):boolean|null=>reach===null?null:near(reach.foot,x,y);
 const field=switches.gates===true&&reach!==null?state.field_obstacles??null:null;
 const obstacles=(x:number,y:number):string|null=>{
  if(field===null||footNear(x,y)!==false)return null;
  const found=field.obstacles.filter(o=>o.open===false&&o.beyond!==null&&wellFormed(o.beyond,state.topology)&&near(o.beyond,x,y));
  return found.length===0?null:passesText(found);
 };
 return {warp:(x,y)=>warpCut(x,y)!==null,connection:direction=>connectionCut(direction)!==null,warpCut,connectionCut,foot,footNear,obstacles};
}

export function exitReach(features:FeatureSet,state:Pick<GameStateSnapshot,"surf_gate"|"exit_reach"|"topology"|"field_obstacles">):ExitBlock {
 return exitBlock(reachSwitches(features),state);
}
