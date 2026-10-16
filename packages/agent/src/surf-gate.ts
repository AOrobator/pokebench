// surf-gated-exits-v1: the server's surf_gate (env/pokebench_env/surf_gate.py) names the exits on this map that the
// player can reach only across water. While field Surf cannot be used, exit lists leave them out.
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";

export interface SurfBlock {readonly warp:(x:number,y:number)=>boolean;readonly connection:(direction:string)=>boolean}
const OPEN:SurfBlock={warp:()=>false,connection:()=>false};

export function surfBlock(features:FeatureSet,state:Pick<GameStateSnapshot,"surf_gate">):SurfBlock {
 const gate=state.surf_gate;
 if(!features["surf-gated-exits-v1"]||gate?.can_surf!==false)return OPEN;
 return {warp:(x,y)=>gate.warps.some(w=>w.x===x&&w.y===y),connection:direction=>gate.connections.some(c=>c===direction)};
}
