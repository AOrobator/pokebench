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
const at=(p:{x:number;y:number},q:{x:number;y:number}):boolean=>p.x===q.x&&p.y===q.y;
// map-cycle-recovery-v1: the exit a departure used, from the last position recorded on the map it left: a warp tile the
// player stood on, else a connection edge tile (connection-edge-tiles-v1), else the single map border the player stood on.
function exitUsed(s:GameStateSnapshot|null):string|null {
 const p=s?.position;if(s==null||p==null)return null;
 const warp=[...(s.interaction_targets??[]).filter(t=>t.kind==="warp"),...(s.exit_reach?.warps??[])].find(w=>at(w,p));
 if(warp!==undefined)return `warp:${String(warp.x)},${String(warp.y)}`;
 const connections=s.topology?.connections??[];
 const edge=connections.find(c=>c.edges?.some(e=>at(e,p))===true);
 if(edge!==undefined)return `edge:${edge.direction}`;
 const t=s.topology;if(t==null)return null;
 const sides=[p.x===0?"WEST":null,p.x===t.width-1?"EAST":null,p.y===0?"NORTH":null,p.y===t.height-1?"SOUTH":null].filter((d):d is string=>d!==null&&connections.some(c=>c.direction===d));
 return sides.length===1&&sides[0]!==undefined?`edge:${sides[0]}`:null;
}
export class NavigationRecovery {
 stopped=false;
 // map-cycle-recovery-v1 (collected only with the switch on): map visits since the last native story progress, the exits
 // the player left each map by (warp tile or connection direction, from the last position recorded on that map), departures
 // whose exit could not be identified, and the readout's label for each map the run has stood on. Each is keyed per map or
 // per exit, so it is bounded by the game's map table: 518 maps in 34 groups (MAP_GROUP_SIZES, env/pokebench_env/menu_prelude.py),
 // each with at most 64 warps (MAX_WARPS, env/pokebench_env/places.py) and four walking directions. Nothing is clipped.
 private here:string|null=null;
 private lastOnMap:GameStateSnapshot|null=null;
 private readonly visits=new Map<string,number>();
 private readonly used=new Set<string>();
 private readonly unmatched=new Map<string,number>();
 private readonly labels=new Map<string,string>();
 private briefing:{text:string;exposed:boolean}|null=null;
 private window=0;
 private seen=new Set<string>();
 private latest:GameStateSnapshot|undefined;
 private stale:number[]=[];
 private staleMap:string|null=null;
 private episode:Episode|null=null;
 constructor(private readonly notify:(n:LoopNotice)=>void,private readonly mode:LoopMode,private readonly semanticTargets=false,private readonly mapCycleRecovery=false,private readonly fieldOnly=false){}
 state(state:GameStateSnapshot):void {
  this.latest=state;
  if(this.mapCycleRecovery)this.track(state);
  if(qualified(state)){const key=mapKey(state);if(key!==null)this.seen.add(key);}
 }
 // map-cycle-recovery-v1: sizes of the switch's history, for the bound tests.
 historySize():{visits:number;exits:number;unmatched:number;labels:number} {return {visits:this.visits.size,exits:this.used.size,unmatched:this.unmatched.size,labels:this.labels.size};}
 private track(state:GameStateSnapshot):void {
  const at=mapKey(state);if(at===null)return;
  if(at!==this.here){
   if(this.here!==null){const exit=exitUsed(this.lastOnMap);if(exit===null)this.unmatched.set(this.here,(this.unmatched.get(this.here)??0)+1);else this.used.add(`${this.here}|${exit}`);}
   this.visits.set(at,(this.visits.get(at)??0)+1);this.here=at;this.lastOnMap=null;
  }
  if(state.position!==null)this.lastOnMap=state;
  const label=state.exit_sections?.current;
  if(qualified(state)&&label!==undefined)this.labels.set(at,label);
 }
 unavailable():void {this.latest=undefined;}
 progress(seq:number,calls:number):void {if(this.episode!==null)this.notice("recovered",seq,calls);this.episode=null;this.stale=[];this.seen.clear();this.visits.clear();this.used.clear();this.unmatched.clear();this.here=null;this.lastOnMap=null;this.briefing=null;if(this.latest!==undefined)this.state(this.latest);}
 // map-cycle-recovery-v1: advances each time a briefing replaces a stop; stall-briefing-v1 restarts its map-pair counts.
 mapCycleWindow():number {return this.window;}
 cycle(_text:string,evidence:readonly number[],calls:number):boolean {
  if(this.episode!==null||!qualified(this.latest))return false;
  this.open("map_cycle",`NAVIGATION RECOVERY: The repeated map cycle remains unresolved. Backtracking is allowed. Choose an observed alternative or gather new evidence. A previously visited detour or another lap does not establish recovery. No destination is selected for you.`,evidence,calls);
  return true;
 }
 context():string|null {
  if(this.mode==="diagnostic")return null;
  // recovery-note-field-only-v1: a battle request carries no field note; the episode and any due briefing wait for the field.
  if(this.fieldOnly&&this.latest?.in_battle===true)return null;
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
    this.brief(episode,seq,calls);
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
  const reach=s.exit_reach;
  const target=(t:object):string=>this.semanticTargets?` [navigate_to_target ${JSON.stringify({map_id:s.map_id,target:t})}]`:"";
  const exits=reach===undefined?null:[
   ...reach.warps.filter(w=>w.reach==="foot").map(w=>`warp (${String(w.x)},${String(w.y)})${target({kind:"warp",x:w.x,y:w.y})}`),
   ...reach.connections.filter(c=>c.reach==="foot").sort((a,b)=>Number(this.seen.has(a.destination.join("/")))-Number(this.seen.has(b.destination.join("/")))).map(c=>`${c.direction} -> ${c.destination.join("/")} (${this.seen.has(c.destination.join("/"))?"visited since last native story progress":"not visited since last native story progress"})${target({kind:"connection",direction:c.direction})}`),
  ];
  return `Current map: ${mapKey(s)??"unavailable"}. Position: ${String(s.position?.x??"unavailable")},${String(s.position?.y??"unavailable")}. Observed walking exits: ${exits===null?"unknown (exit reachability was not read)":exits.join("; ")||"none qualified"}.`;
 }
 // Every exhausted navigation episode briefs without ending the run.
 private brief(episode:Episode,seq:number,calls:number):void {
  const text=this.mapCycleRecovery&&episode.kind==="map_cycle"?this.recoveryText():`NAVIGATION RECOVERY BRIEFING: ${episode.kind==="map_cycle"?"The repeated map cycle":"Stale-map navigation"} was not resolved within ${String(NAVIGATION_RECOVERY_CALLS)} calls. The run continues. Backtracking is allowed. No destination is selected for you.\n${this.bearings()}`;
  if(this.mode==="enforced"){
   this.briefing={text,exposed:false};
   if(this.mapCycleRecovery&&episode.kind==="map_cycle")this.window++;
   this.notify({kind:episode.kind,message:text,calls,evidence:loopEvidence([...episode.evidence,seq]),mode:"enforced",phase:"supervisor"});
  }
  this.episode=null;this.stale=[];
 }
 private label(key:string):string {const label=this.labels.get(key);return label===undefined?`map ${key}`:name(label);}
 private recoveryText():string {
  const s=this.latest,here=mapKey(s);
  const where=s===undefined||here===null?"unavailable":`${s.exit_sections?.current??this.label(here)}, position ${String(s.position?.x??"unavailable")},${String(s.position?.y??"unavailable")}`;
  const visits=[...this.visits].sort((a,b)=>b[1]-a[1]).map(([key,count])=>`${this.label(key)} ${String(count)}`).join("; ");
  const target=(t:object):string=>this.semanticTargets&&s!==undefined?` [navigate_to_target ${JSON.stringify({map_id:s.map_id,target:t})}]`:"";
  // An exit is taken only when the player left this map by that exact warp tile or edge.
  const taken=(exit:string):boolean=>this.used.has(`${here??""}|${exit}`);
  const reach=s?.exit_reach;
  const exits=reach===undefined||here===null?null:[
   ...reach.warps.filter(w=>w.reach==="foot").map(w=>{
    const d=s?.interaction_targets?.find(t=>t.kind==="warp"&&t.x===w.x&&t.y===w.y)?.destination;
    const dest=d==null?null:`${String(d[0])}/${String(d[1])}`;
    return {exit:`warp:${String(w.x)},${String(w.y)}`,text:`(${String(w.x)},${String(w.y)}) -> ${dest===null?"destination not read":this.label(dest)}${target({kind:"warp",x:w.x,y:w.y})}`};
   }),
   ...reach.connections.filter(c=>c.reach==="foot").map(c=>({exit:`edge:${c.direction}`,text:`${c.direction} edge -> ${this.label(c.destination.join("/"))}${target({kind:"connection",direction:c.direction})}`})),
  ].filter(e=>!taken(e.exit)).map(e=>e.text);
  const unknown=here===null?0:this.unmatched.get(here)??0;
  const caveat=unknown===0?"":` ${unknown===1?"One departure":`${String(unknown)} departures`} from this map since then ${unknown===1?"was":"were"} not matched to an exit, so an exit listed here may have been used.`;
  return [
   `NAVIGATION RECOVERY BRIEFING: The repeated map cycle was not resolved within ${String(NAVIGATION_RECOVERY_CALLS)} calls. The run continues instead of stopping, and the map-cycle count starts again from here. Backtracking is allowed. No destination is selected for you.`,
   `Where you are: ${where}.`,
   `Maps visited since your last native story progress (visits): ${visits||"none recorded"}.`,
   `Walking exits of this map you have not left by since your last native story progress: ${exits===null?"unknown (exit reachability was not read for this map)":exits.length===0?"none (since then you have left this map by every exit you can walk to from here)":exits.join("; ")}.${caveat}`,
   `If the maps cycle again before new story progress, the NAVIGATION RECOVERY note returns. Each unresolved window produces another briefing; this guard never ends the run.`,
  ].join("\n");
 }
 private open(kind:Episode["kind"],text:string,evidence:readonly number[],calls:number):void {
  this.episode={kind,text,evidence:[...evidence],exposed:false,calls:0,maps:new Set(this.seen)};
  this.notice("warning",evidence.at(-1)??0,calls);
 }
 private notice(phase:"warning"|"recovered",seq:number,calls:number):void {
  const e=this.episode;if(e===null)return;
  const fields={kind:e.kind,message:`${e.text}\n${this.bearings()}${phase==="recovered"?"\nVerified navigation recovery.":""}`,calls,evidence:loopEvidence([...e.evidence,seq])};
  if(this.mode==="enforced")this.notify({...fields,mode:this.mode,phase});
  else this.notify({...fields,mode:this.mode,phase:phase==="warning"?"would_warn":"would_recover"});
 }
}
