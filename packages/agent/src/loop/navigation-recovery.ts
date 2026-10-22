import {loopEvidence} from "./types.js";
import type {GameStateSnapshot} from "../game-state.js";
import type {CompletedCall,LoopMode,LoopNotice} from "./types.js";

export const NAVIGATION_RECOVERY_CALLS=12;
const mapKey=(s:GameStateSnapshot|undefined):string|null=>s?.started===true&&s.map_id!==null?s.map_id.join("/"):null;
function qualified(s:GameStateSnapshot|undefined):s is GameStateSnapshot {
 return s?.started===true&&s.screen==="overworld"&&!s.in_battle&&s.map_id!==null&&s.position!==null&&s.field_controls_locked===false&&s.active_ui==null&&!s.world_context?.dialogue;
}
interface Episode {kind:"map_cycle"|"rejection";text:string;evidence:number[];exposed:boolean;calls:number;maps:Set<string>}
export class NavigationRecovery {
 stopped=false;
 private seen=new Set<string>();
 private latest:GameStateSnapshot|undefined;
 private stale:number[]=[];
 private staleMap:string|null=null;
 private episode:Episode|null=null;
 constructor(private readonly notify:(n:LoopNotice)=>void,private readonly mode:LoopMode,private readonly semanticTargets=false){}
 state(state:GameStateSnapshot):void {this.latest=state;if(qualified(state)){const key=mapKey(state);if(key!==null)this.seen.add(key);}}
 unavailable():void {this.latest=undefined;}
 progress(seq:number,calls:number):void {if(this.episode!==null)this.notice("recovered",seq,calls);this.episode=null;this.stale=[];this.seen.clear();if(this.latest!==undefined)this.state(this.latest);}
 cycle(_text:string,evidence:readonly number[],calls:number):boolean {
  if(this.episode!==null||!qualified(this.latest))return false;
  this.open("map_cycle",`NAVIGATION RECOVERY: The repeated map cycle remains unresolved. Backtracking is allowed. Choose an observed alternative or gather new evidence. A previously visited detour or another lap does not establish recovery. No destination is selected for you.`,evidence,calls);
  return true;
 }
 context():string|null {if(this.episode===null||this.mode==="diagnostic")return null;this.episode.exposed=true;return `${this.episode.text}\n${this.bearings()}`;}
 get active():boolean{return this.episode!==null;}
 complete(call:CompletedCall,calls:number):boolean {
  const seq=call.seq??calls,state=call.state,episode=this.episode;
  const requested=call.requested??call.args,requestMap=requested["map_id"];
  const navigation=call.name==="navigate_to_target"||call.name==="navigate_to";
  const current=mapKey(state);
  const requestedKey=Array.isArray(requestMap)&&requestMap.length===2&&requestMap.every(v=>typeof v==="number")?requestMap.join("/"):null;
  const stale=navigation&&!call.isError&&call.acted===false&&qualified(state)&&requestedKey!==null&&requestedKey!==current;
  const correctAction=navigation&&!call.isError&&call.acted===true&&requestedKey!==null&&requestedKey===mapKey(call.beforeState)&&qualified(state);
  if(episode!==null){
   const recovered=qualified(state)&&((episode.kind==="map_cycle"&&current!==null&&!episode.maps.has(current))||(episode.kind==="rejection"&&(correctAction||(call.acted===true&&current!==this.staleMap))));
   if(recovered){this.notice("recovered",seq,calls);this.episode=null;this.stale=[];return true;}
   const budgetState=state??this.latest;
   if(episode.exposed&&budgetState?.in_battle!==true&&budgetState?.active_ui==null&&++episode.calls===NAVIGATION_RECOVERY_CALLS){this.notice("stop",seq,calls);this.stopped=this.mode==="enforced";}
   return true;
  }
  if(stale){
   if(this.staleMap!==current)this.stale=[];
   this.staleMap=current;
   this.stale.push(seq);this.stale=this.stale.slice(-2);
   if(this.stale.length===2){this.open("rejection",`NAVIGATION RECOVERY: Two navigation requests used a different map identity and sent no input. Re-read the current map and issue a request for that map. Do not retry the previous map identity. No buttons were pressed by this guard.`,this.stale,calls);return true;}
  }else if(qualified(state)&&correctAction)this.stale=[];
  return false;
 }
 private bearings():string {
  const s=this.latest;if(s===undefined)return "Current map unavailable.";
  const connections=s.exit_reach?.connections??[];
  return `Current map: ${mapKey(s)??"unavailable"}. Position: ${String(s.position?.x??"unavailable")},${String(s.position?.y??"unavailable")}. Observed walking exits: ${connections.filter(c=>c.reach==="foot").sort((a,b)=>Number(this.seen.has(a.destination.join("/")))-Number(this.seen.has(b.destination.join("/")))).map(c=>`${c.direction} -> ${c.destination.join("/")} (${this.seen.has(c.destination.join("/"))?"visited since last native story progress":"not visited since last native story progress"})${this.semanticTargets?` [navigate_to_target ${JSON.stringify({map_id:s.map_id,target:{kind:"connection",direction:c.direction}})}]`:""}`).join("; ")||"none qualified"}.`;
 }
 private open(kind:Episode["kind"],text:string,evidence:readonly number[],calls:number):void {
  this.episode={kind,text,evidence:[...evidence],exposed:false,calls:0,maps:new Set(this.seen)};
  this.notice("warning",evidence.at(-1)??0,calls);
 }
 private notice(phase:"warning"|"recovered"|"stop",seq:number,calls:number):void {
  const e=this.episode;if(e===null)return;
  const fields={kind:e.kind,message:`${e.text}\n${this.bearings()}${phase==="stop"?"\nBounded navigation recovery ended without verified recovery.":phase==="recovered"?"\nVerified navigation recovery.":""}`,calls,evidence:loopEvidence([...e.evidence,seq])};
  if(this.mode==="enforced")this.notify({...fields,mode:this.mode,phase});
  else this.notify({...fields,mode:this.mode,phase:phase==="warning"?"would_warn":phase==="stop"?"would_stop":"would_recover"});
 }
}
