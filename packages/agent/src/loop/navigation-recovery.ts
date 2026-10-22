import {loopEvidence} from "./types.js";
import type {GameStateSnapshot} from "../game-state.js";
import type {CompletedCall,LoopMode,LoopNotice} from "./types.js";

export const NAVIGATION_RECOVERY_CALLS=12;
const mapKey=(s:GameStateSnapshot|undefined):string|null=>s?.started===true&&s.map_id!==null?s.map_id.join("/"):null;
function qualified(s:GameStateSnapshot|undefined):s is GameStateSnapshot {
 return s?.started===true&&s.screen==="overworld"&&!s.in_battle&&s.map_id!==null&&s.position!==null&&s.field_controls_locked===false&&s.active_ui==null&&!s.world_context?.dialogue;
}
interface Episode {kind:"map_cycle"|"rejection";text:string;evidence:number[];exposed:boolean;calls:number;maps:Set<string>}
const name=(label:string):string=>label.split(" — ")[0]??label;
export class NavigationRecovery {
 stopped=false;
 // map-cycle-recovery-v1: map visits and departures since the last native story progress, the readout's label for each
 // map the run has stood on, the one briefing a story-progress window allows and the cycle-window generation.
 private here:string|null=null;
 private readonly visits=new Map<string,number>();
 private readonly departures=new Set<string>();
 private readonly labels=new Map<string,string>();
 private briefing:{text:string;exposed:boolean}|null=null;
 private briefed=false;
 private window=0;
 private seen=new Set<string>();
 private latest:GameStateSnapshot|undefined;
 private stale:number[]=[];
 private staleMap:string|null=null;
 private episode:Episode|null=null;
 constructor(private readonly notify:(n:LoopNotice)=>void,private readonly mode:LoopMode,private readonly semanticTargets=false,private readonly mapCycleRecovery=false){}
 state(state:GameStateSnapshot):void {
  this.latest=state;
  const at=mapKey(state);
  if(at!==null&&at!==this.here){if(this.here!==null)this.departures.add(`${this.here}>${at}`);this.visits.set(at,(this.visits.get(at)??0)+1);this.here=at;}
  if(qualified(state)){const key=mapKey(state);if(key!==null){this.seen.add(key);const label=state.exit_sections?.current;if(label!==undefined)this.labels.set(key,label);}}
 }
 unavailable():void {this.latest=undefined;}
 progress(seq:number,calls:number):void {if(this.episode!==null)this.notice("recovered",seq,calls);this.episode=null;this.stale=[];this.seen.clear();this.visits.clear();this.departures.clear();this.here=null;this.briefing=null;this.briefed=false;if(this.latest!==undefined)this.state(this.latest);}
 // map-cycle-recovery-v1: advances each time a briefing replaces a stop; stall-briefing-v1 restarts its map-pair counts.
 mapCycleWindow():number {return this.window;}
 cycle(_text:string,evidence:readonly number[],calls:number):boolean {
  if(this.episode!==null||!qualified(this.latest))return false;
  this.open("map_cycle",`NAVIGATION RECOVERY: The repeated map cycle remains unresolved. Backtracking is allowed. Choose an observed alternative or gather new evidence. A previously visited detour or another lap does not establish recovery. No destination is selected for you.`,evidence,calls);
  return true;
 }
 context():string|null {
  if(this.mode==="diagnostic")return null;
  if(this.episode===null){if(this.briefing===null)return null;this.briefing.exposed=true;return this.briefing.text;}
  this.episode.exposed=true;return `${this.episode.text}\n${this.bearings()}`;
 }
 get active():boolean{return this.episode!==null||this.briefing!==null;}
 complete(call:CompletedCall,calls:number):boolean {
  const seq=call.seq??calls,state=call.state,episode=this.episode;
  if(this.briefing?.exposed===true)this.briefing=null;
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
   if(episode.exposed&&budgetState?.in_battle!==true&&budgetState?.active_ui==null&&++episode.calls===NAVIGATION_RECOVERY_CALLS){
    if(this.mapCycleRecovery&&episode.kind==="map_cycle"&&!this.briefed&&this.mode==="enforced"){this.brief(episode,seq,calls);return true;}
    this.notice("stop",seq,calls);this.stopped=this.mode==="enforced";
   }
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
 // map-cycle-recovery-v1: the one briefing that replaces a map-cycle stop until new native story progress.
 private brief(episode:Episode,seq:number,calls:number):void {
  const text=this.recoveryText();
  this.briefing={text,exposed:false};this.briefed=true;this.window++;this.episode=null;
  this.notify({kind:"map_cycle",message:text,calls,evidence:loopEvidence([...episode.evidence,seq]),mode:"enforced",phase:"supervisor"});
 }
 private label(key:string):string {const label=this.labels.get(key);return label===undefined?`map ${key}`:name(label);}
 private recoveryText():string {
  const s=this.latest,here=mapKey(s);
  const where=s===undefined||here===null?"unavailable":`${s.exit_sections?.current??this.label(here)}, position ${String(s.position?.x??"unavailable")},${String(s.position?.y??"unavailable")}`;
  const visits=[...this.visits].sort((a,b)=>b[1]-a[1]).map(([key,count])=>`${this.label(key)} ${String(count)}`).join("; ");
  const target=(t:object):string=>this.semanticTargets&&s!==undefined?` [navigate_to_target ${JSON.stringify({map_id:s.map_id,target:t})}]`:"";
  const taken=(dest:string|null):boolean=>dest!==null&&this.departures.has(`${here??""}>${dest}`);
  const reach=s?.exit_reach;
  const exits=reach===undefined||here===null?null:[
   ...reach.warps.filter(w=>w.reach==="foot").map(w=>{
    const d=s?.interaction_targets?.find(t=>t.kind==="warp"&&t.x===w.x&&t.y===w.y)?.destination;
    const dest=d==null?null:`${String(d[0])}/${String(d[1])}`;
    return {dest,text:`(${String(w.x)},${String(w.y)}) -> ${dest===null?"destination not read":this.label(dest)}${target({kind:"warp",x:w.x,y:w.y})}`};
   }),
   ...reach.connections.filter(c=>c.reach==="foot").map(c=>{const dest=c.destination.join("/");return {dest,text:`${c.direction} edge -> ${this.label(dest)}${target({kind:"connection",direction:c.direction})}`};}),
  ].filter(e=>!taken(e.dest)).map(e=>e.text);
  return [
   `NAVIGATION RECOVERY BRIEFING: The repeated map cycle was not resolved within ${String(NAVIGATION_RECOVERY_CALLS)} calls. The run continues instead of stopping, and the map-cycle count starts again from here. Backtracking is allowed. No destination is selected for you.`,
   `Where you are: ${where}.`,
   `Maps visited since your last native story progress (visits): ${visits||"none recorded"}.`,
   `Walking exits of this map not taken since your last native story progress: ${exits===null?"unknown (exit reachability was not read for this map)":exits.length===0?"none (since then you have left this map toward the destination of every exit you can walk to from here)":exits.join("; ")}.`,
   `If the maps cycle again before new story progress, the NAVIGATION RECOVERY note returns, and the run ends if that cycle is not resolved within ${String(NAVIGATION_RECOVERY_CALLS)} calls.`,
  ].join("\n");
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
