// surf-gated-exits-v1: the server's surf_gate (env/pokebench_env/surf_gate.py) names the exits on this map that the
// player can reach only across water. While field Surf cannot be used, exit lists leave them out.
// exit-reachability-v1: the server's exit_reach (env/pokebench_env/exit_reach.py) labels every exit foot, water or none
// and ships the tiles reached on foot. exitReach is the one check every exit list and navigate_to message reads.
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
export interface ExitBlock extends SurfBlock {
 readonly warpCut:(x:number,y:number)=>Cut|null;
 readonly connectionCut:(direction:string)=>Cut|null;
 // Whether the server's flood reaches this tile on foot; null when the switch is off or the state carries no exit_reach.
 readonly foot:(x:number,y:number)=>boolean|null;
 // The tile or one of its four neighbours is reached on foot (how warps and people are reached); null when unknown.
 readonly footNear:(x:number,y:number)=>boolean|null;
}
export interface ReachSwitches {readonly surf:boolean;readonly reach:boolean}
export const reachSwitches=(features:FeatureSet):ReachSwitches=>({surf:features["surf-gated-exits-v1"],reach:features["exit-reachability-v1"]});
const NEIGHBOURS=[[0,0],[1,0],[-1,0],[0,1],[0,-1]] as const;

export function exitBlock(switches:ReachSwitches,state:Pick<GameStateSnapshot,"surf_gate"|"exit_reach">):ExitBlock {
 const surf=gated(switches.surf,state);
 const reach=switches.reach?state.exit_reach??null:null;
 const noneWarp=(x:number,y:number):boolean=>reach?.warps.some(w=>w.x===x&&w.y===y&&w.reach==="none")??false;
 const noneEdge=(direction:string):boolean=>reach?.connections.some(c=>c.direction===direction&&c.reach==="none")??false;
 const warpCut=(x:number,y:number):Cut|null=>surf.warp(x,y)?"water":noneWarp(x,y)?"none":null;
 const connectionCut=(direction:string):Cut|null=>surf.connection(direction)?"water":noneEdge(direction)?"none":null;
 const foot=(x:number,y:number):boolean|null=>{
  if(reach===null)return null;
  const {width,height,rows}=reach.foot;
  if(x<0||y<0||x>=width||y>=height)return false;
  const digit=Number.parseInt(rows[y]?.charAt(x>>2)??"0",16);
  return ((digit>>(3-(x&3)))&1)===1;
 };
 return {warp:(x,y)=>warpCut(x,y)!==null,connection:direction=>connectionCut(direction)!==null,warpCut,connectionCut,foot,
  footNear:(x,y)=>reach===null?null:NEIGHBOURS.some(([dx,dy])=>foot(x+dx,y+dy)===true)};
}

export function exitReach(features:FeatureSet,state:Pick<GameStateSnapshot,"surf_gate"|"exit_reach">):ExitBlock {
 return exitBlock(reachSwitches(features),state);
}
