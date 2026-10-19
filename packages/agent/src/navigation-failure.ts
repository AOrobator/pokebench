import type {CompletedCall} from "./loop-detection.js";
import type {GameStateSnapshot} from "./game-state.js";

export const NAVIGATION_FAILURE_LIMIT=3;
export const NAVIGATION_RECOVERY_TILES=4;
interface FailureStatus {readonly active:boolean;readonly evidence:readonly number[]}
// Only qualified free-field evidence can establish failure or recovery.
function qualified(s:GameStateSnapshot|undefined):s is GameStateSnapshot & {position:{x:number;y:number}} {
 return s!==undefined&&s.started&&s.screen==="overworld"&&!s.in_battle&&s.map_id!==null&&s.position!==null&&s.field_controls_locked===false&&s.active_ui==null&&!s.world_context?.dialogue;
}
// Optional readouts may disappear, including individual nullable members. Compare only evidence
// known on both sides; retain the anchor so an unknown gap cannot erase the last known condition.
function knownChanged(a:unknown,b:unknown):boolean {
 if(a==null||b==null)return false;
 if(Array.isArray(a)&&Array.isArray(b))return a.length!==b.length||a.some((v,i)=>knownChanged(v,b[i]));
 if(typeof a==="object"&&typeof b==="object"){
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  return Object.keys(left).some(k=>knownChanged(left[k],right[k]));
 }
 return a!==b;
}
function conditions(s:GameStateSnapshot):unknown[] {
 return [s.map_id,s.story,s.party,s.money,s.badges,s.resources,s.navigation_grid?.elevation,s.exit_reach?.warps,s.exit_reach?.connections,s.topology,s.interaction_targets];
}
// Nearby objects/triggers are clipped to +/-7 tiles by the native reader. A list entry appearing
// or disappearing proves nothing. Only changed fields of the same observed entity qualify.
function nearbyChanged(a:GameStateSnapshot,b:GameStateSnapshot):boolean {
 const objects=a.world_context?.objects??[],triggers=a.world_context?.triggers??[];
 return objects.some(o=>b.world_context?.objects.some(n=>n.local_id===o.local_id&&knownChanged(o,n)))||
  triggers.some(t=>b.world_context?.triggers.some(n=>n.x===t.x&&n.y===t.y&&n.variable===t.variable&&n.script_pointer===t.script_pointer&&knownChanged(t,n)));
}
function changed(a:GameStateSnapshot,b:GameStateSnapshot):boolean {return knownChanged(conditions(a),conditions(b))||nearbyChanged(a,b);}

// Bounded evidence owned by LoopDetector. This supplies facts; the coordinator owns notices and stopping.
export class NavigationFailure {
 private anchor:{x:number;y:number;state:GameStateSnapshot}|null=null;
 private evidence:number[]=[];
 private active=false;
 private readonly tiles=new Map<string,string>();
 reset():void {this.anchor=null;this.evidence=[];this.active=false;this.tiles.clear();}
 observe(call:CompletedCall):FailureStatus|null {
  const wasActive=this.active;
  const state=call.state;
  if(call.isError||!qualified(state)){
   // An unknown/transition snapshot is no proof of recovery. A known ready interface or battle is a new interaction.
   if(!call.isError&&state!==undefined&&(state.in_battle||(state.active_ui?.ready===true&&state.active_ui.diagnostic===null))){this.reset();return wasActive?{active:false,evidence:[]}:null;}
   return null;
  }
  const p=state.position;
  let geometryChanged=false;
  for(const tile of state.navigation_grid?.tiles??[]){
   const at=`${String(tile.x)},${String(tile.y)}`,value=JSON.stringify([tile.collision,tile.behavior,tile.elevation]);
   const prior=this.tiles.get(at);if(prior!==undefined&&prior!==value)geometryChanged=true;
   this.tiles.delete(at);this.tiles.set(at,value);
   if(this.tiles.size>512)this.tiles.delete(this.tiles.keys().next().value??"");
  }
  if(this.anchor!==null&&(geometryChanged||changed(this.anchor.state,state)||Math.abs(p.x-this.anchor.x)+Math.abs(p.y-this.anchor.y)>=NAVIGATION_RECOVERY_TILES)){
   this.reset();if(wasActive)return {active:false,evidence:[]};
  }
  const before=call.beforeState;
  const unchanged=qualified(before)&&before.position.x===p.x&&before.position.y===p.y&&!changed(before,state);
  // Failed outcomes need no text parsing. A completed free-field call at an unchanged position is the evidence;
  // a successful partial walk does not contribute. Explicit observe never increments the count.
  if(call.name==="navigate_to"&&unchanged){
   this.anchor??={...p,state};
   this.evidence.push(call.seq??0);this.evidence=this.evidence.slice(-NAVIGATION_FAILURE_LIMIT);
   if(this.evidence.length===NAVIGATION_FAILURE_LIMIT)this.active=true;
  }
  return this.active?{active:true,evidence:[...this.evidence]}:null;
 }
}
