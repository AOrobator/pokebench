import type {CompletedCall} from "./loop-detection.js";
import type {GameStateSnapshot} from "./game-state.js";

export const NAVIGATION_FAILURE_LIMIT=3;
export const NAVIGATION_RECOVERY_TILES=4;
interface FailureStatus {readonly active:boolean;readonly evidence:readonly number[]}
// Only a qualified, free field can prove that navigation did nothing. The fingerprint deliberately
// excludes facing, position, clocks and ASCII renderings, while retaining conditions that can open a path.
function conditions(s:GameStateSnapshot|undefined):string|null {
 if(s===undefined||!s.started||s.screen!=="overworld"||s.in_battle||s.map_id===null||s.position===null||s.field_controls_locked!==false||s.active_ui!=null||s.world_context?.dialogue)return null;
 return JSON.stringify([s.map_id,s.story,s.party,s.money,s.badges,s.resources,s.navigation_grid?.elevation,s.exit_reach?.warps,s.exit_reach?.connections,s.topology,s.interaction_targets,s.world_context?.objects,s.world_context?.triggers]);
}

// Bounded evidence owned by LoopDetector. This supplies facts; the coordinator owns notices and stopping.
export class NavigationFailure {
 private anchor:{x:number;y:number;key:string}|null=null;
 private evidence:number[]=[];
 private active=false;
 private readonly tiles=new Map<string,string>();
 reset():void {this.anchor=null;this.evidence=[];this.active=false;this.tiles.clear();}
 observe(call:CompletedCall):FailureStatus|null {
  const wasActive=this.active;
  const state=call.state,key=conditions(state);
  if(call.isError||key===null||state?.position==null){
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
  if(this.anchor!==null&&(geometryChanged||this.anchor.key!==key||Math.abs(p.x-this.anchor.x)+Math.abs(p.y-this.anchor.y)>=NAVIGATION_RECOVERY_TILES)){
   this.reset();if(wasActive)return {active:false,evidence:[]};
  }
  const before=call.beforeState;
  const unchanged=before?.position!=null&&before.position.x===p.x&&before.position.y===p.y&&conditions(before)===key;
  // Failed outcomes need no text parsing. A completed free-field call at an unchanged position is the evidence;
  // a successful partial walk does not contribute. Explicit observe never increments the count.
  if(call.name==="navigate_to"&&unchanged){
   this.anchor??={...p,key};
   this.evidence.push(call.seq??0);this.evidence=this.evidence.slice(-NAVIGATION_FAILURE_LIMIT);
   if(this.evidence.length===NAVIGATION_FAILURE_LIMIT)this.active=true;
  }
  return this.active?{active:true,evidence:[...this.evidence]}:null;
 }
}
