import type {GameStateSnapshot} from "./game-state.js";
import {exitBlock} from "./surf-gate.js";

// map_sections.py details are source-derived terrain facts already delivered in this state,
// not a guarantee that temporary objects or scripts allow the onward journey.
export function reachableSectionAlternatives(state:GameStateSnapshot,goal:{readonly x:number;readonly y:number}):string|null {
 if(state.active_ui!=null||state.world_context?.dialogue!=null||state.world_context?.message!=null||state.world_context?.field_activity!=null||!state.started||state.screen!=="overworld"||state.in_battle||state.field_controls_locked!==false||state.exit_sections===undefined)return null;
 const reach=exitBlock({surf:true,reach:true,gates:true},state);
 if(reach.foot(goal.x,goal.y)!==false)return null;
 const alternatives=state.exit_sections.warps.filter(w=>
  w.detail.startsWith("Arrives at (")&&w.detail.includes("Terrain exits after arrival:")&&
  state.exit_reach?.warps.some(r=>r.x===w.x&&r.y===w.y&&r.reach==="foot")===true&&
  reach.footNear(w.x,w.y)===true&&!reach.warp(w.x,w.y)&&
  !(state.world_context?.triggers??[]).some(t=>t.x===w.x&&t.y===w.y&&t.condition_met===true&&t.variable!==0)
 ).sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,4);
 if(alternatives.length===0)return null;
 return `Reachable departure alternatives (terrain facts; do not establish a route to (${String(goal.x)},${String(goal.y)})): ${alternatives.map(w=>`(${String(w.x)},${String(w.y)}) -> ${w.label}. ${w.detail}`).join(" | ")} Choose whether to inspect an exit; no input was sent by this feedback.`;
}
