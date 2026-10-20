// Loop recovery measurement (no model-facing change): for each loop-guard or stall intervention in a recorded run,
// whether the loop it named was recovered from, by a test specific to the kind of loop, and whether that was safe.
// Replaces the single "story milestone or new map within 30 turns" test. Each test is also applied to every other
// turn of the same loop type, so a rate can be read against the run's own base rate.
import type {RunEvent} from "./events.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {storyCharacters} from "./people-ledger.js";

export const RECOVERY_TURNS=30;
// A navigation loop is left once the player stands on a tile it did not stand on in this many turns before the fire.
export const FIXED_POINT_LOOKBACK=20;

export type LoopType="navigation"|"dialogue"|"battle_menu"|"interface"|"story_character";
export interface Intervention {readonly seq:number;readonly turn:number;readonly source:string;readonly type:LoopType;readonly recovered:boolean;readonly safe:boolean;readonly relapsed:boolean;readonly detail:string}
export interface Rate {readonly type:LoopType;readonly source:string;readonly n:number;readonly recovered:number;readonly safe:number;readonly relapsed:number;readonly baseN:number;readonly baseRecovered:number}

type State=Extract<RunEvent,{type:"state";started:boolean}>;
// The few facts of a recorded state the tests read, so a long log is held compactly.
interface Facts {readonly tile:string|null;readonly battle:boolean;readonly battleTurn:number|null;readonly dialogue:boolean;readonly locked:boolean;readonly ui:boolean;readonly naming:boolean}
interface Snapshot {readonly turn:number;readonly seq:number;readonly state:Facts;readonly characters:readonly string[]}
interface Fire {readonly seq:number;readonly turn:number;readonly source:string}

const STORY=(e:Extract<RunEvent,{type:"milestone"}>):boolean=>e.kind==="story"&&e.origin!=="present_at_start"&&!MEASUREMENT_ONLY_MILESTONES.has(e.name);
export function factsOf(s:State):Facts {
 return {tile:s.map_id===null||s.position===null?null:`${s.map_id.join("/")}@${String(s.position.x)},${String(s.position.y)}`,
  battle:s.in_battle||s.screen==="battle",battleTurn:s.battle?.turn??null,dialogue:(s.world_context?.dialogue??"")!=="",
  locked:s.field_controls_locked===true,ui:s.active_ui!=null&&s.active_ui.ready===true,naming:s.screen==="naming"};
}

// The kind of loop a state is in: battle, dialogue, an open interface, a map whose readout names a story character, else navigation.
export function loopType(s:Facts,characters:readonly string[]):LoopType {
 if(s.battle)return "battle_menu";
 if(s.dialogue)return "dialogue";
 if(s.ui||s.naming)return "interface";
 if(characters.length>0)return "story_character";
 return "navigation";
}

// Which recorded events are interventions: a loop-guard episode's first notice, a stall briefing (sent or, retired, would-warn),
// a held stall briefing, a fixed-point breaker note and an auto-talk attempt.
function fireOf(e:RunEvent):Fire|null {
 if(e.type==="loop_guard"){
  const stall=["map_cycle","milestone_drought","interface_dwell","same_plan"].includes(e.kind);
  if(e.phase==="warning"||e.phase==="would_warn"||(stall&&e.phase==="supervisor"))return {seq:e.seq,turn:e.turn,source:`loop_guard:${e.kind}`};
  return null;
 }
 if(e.type==="stall_gate")return {seq:e.seq,turn:e.turn,source:`stall_gate:${e.kind}`};
 if(e.type==="loop_breaker"&&e.stage===2)return {seq:e.seq,turn:e.turn,source:`loop_breaker:${e.trigger}`};
 if(e.type==="auto_talk"&&e.outcome!=="not_free")return {seq:e.seq,turn:e.turn,source:`auto_talk:${e.outcome}`};
 return null;
}

export interface Recoveries {readonly interventions:readonly Intervention[];readonly rates:readonly Rate[]}
export function loopRecoveries(events:Iterable<RunEvent>,window:number=RECOVERY_TURNS):Recoveries {
 const collector=recoveryCollector(window);
 for(const e of events)collector.observe(e);
 return collector.result();
}

// Event by event, so a log too large to hold whole can be streamed through it.
export function recoveryCollector(window:number=RECOVERY_TURNS):{observe(e:RunEvent):void;result():Recoveries} {
 const snapshots:Snapshot[]=[];
 const fires:Fire[]=[];
 const stories:number[]=[];
 const talks:{turn:number;speaker:string}[]=[];
 const whiteouts:number[]=[];
 let characters:readonly string[]=[];
 let charactersMap:string|null=null;
 let blackout=false;
 let end:{turn:number;bad:boolean}|null=null;
 const maps=new Map<number,string|null>();
 const observe=(e:RunEvent):void=>{
  if(e.type==="state"&&"started"in e&&e.started){
   const here=e.map_id===null?null:e.map_id.join("/");
   maps.set(e.seq,here);if(maps.size>256)maps.delete(maps.keys().next().value??-1);
   if(e.blackout_active===true&&!blackout)whiteouts.push(e.turn);
   blackout=e.blackout_active===true;
   snapshots.push({turn:e.turn,seq:e.seq,state:factsOf(e),characters:here!==null&&here===charactersMap?characters:[]});
  }else if(e.type==="tool_result"&&!e.is_error){
   const found=storyCharacters(e.text);
   const map=e.state_seq===undefined?undefined:maps.get(e.state_seq);
   if(found!==null&&map!=null){characters=found.map(c=>c.name);charactersMap=map;}
  }else if(e.type==="milestone"&&STORY(e))stories.push(e.turn);
  else if(e.type==="dialogue_auto_advance"){for(const p of e.pages)if(p.speaker!==null)talks.push({turn:e.turn,speaker:p.speaker});}
  else if(e.type==="auto_talk"&&e.outcome==="talked"&&e.target?.character!=null)talks.push({turn:e.turn,speaker:e.target.character});
  else if(e.type==="run_end")end={turn:e.turn,bad:e.reason==="stuck"||e.reason==="model_error"||e.reason==="crash"};
  const fire=fireOf(e);
  if(fire!==null)fires.push(fire);
 };
 const result=():Recoveries=>{
 // Snapshots are in event order, so seq and turn both only grow: binary search bounds every window.
 const first=(test:(s:Snapshot)=>boolean):number=>{let lo=0,hi=snapshots.length;while(lo<hi){const mid=(lo+hi)>>1;if(test(snapshots[mid] as Snapshot))hi=mid;else lo=mid+1;}return lo;};
 const before=(seq:number):Snapshot|undefined=>snapshots[first(s=>s.seq>seq)-1];
 const between=(from:number,to:number):Snapshot[]=>snapshots.slice(first(s=>s.turn>from),first(s=>s.turn>to));
 const after=(turn:number,until:number):Snapshot[]=>between(turn,until);
 const recovered=(at:Snapshot,type:LoopType):{ok:boolean;detail:string}=>{
  const until=at.turn+window,next=after(at.turn,until);
  const story=stories.some(t=>t>at.turn&&t<=until);
  switch(type){
   case "battle_menu":{
    const t0=at.state.battleTurn;
    const ok=next.some(s=>!s.state.battle||(t0!==null&&(s.state.battleTurn??t0)>t0));
    return {ok,detail:ok?"a battle turn executed or the battle ended":"no battle turn executed"};
   }
   case "dialogue":{
    const ok=next.some(s=>!s.state.dialogue&&!s.state.locked);
    return {ok,detail:ok?"the dialogue closed with controls free":"the dialogue stayed open"};
   }
   case "interface":{
    const ok=next.some(s=>!s.state.ui&&!s.state.naming);
    return {ok,detail:ok?"the interface closed":"the interface stayed open"};
   }
   case "story_character":{
    const names=new Set(at.characters);
    const ok=story||talks.some(t=>t.turn>at.turn&&t.turn<=until&&names.has(t.speaker));
    return {ok,detail:ok?(story?"a story milestone":"talked to the story character"):"neither talked to the story character nor a story milestone"};
   }
   case "navigation":{
    const seen=new Set(between(at.turn-FIXED_POINT_LOOKBACK,at.turn).flatMap(s=>s.state.tile===null?[]:[s.state.tile]));
    const ok=story||next.some(s=>s.state.tile!==null&&!seen.has(s.state.tile));
    return {ok,detail:ok?"left the tiles of the fixed point":"stayed on the tiles of the fixed point"};
   }
  }
 };
 const interventions=fires.flatMap(f=>{
  const at=before(f.seq);
  if(at===undefined)return [];
  const type=loopType(at.state,at.characters);
  const {ok,detail}=recovered(at,type);
  const until=at.turn+window;
  const safe=!whiteouts.some(t=>t>at.turn&&t<=until)&&!(end!==null&&end.bad&&end.turn<=until);
  const relapsed=fires.some(g=>g.source===f.source&&g.turn>at.turn&&g.turn<=until);
  return [{seq:f.seq,turn:f.turn,source:f.source,type,recovered:ok,safe,relapsed,detail}];
 });
 // Base rate: the same test from one recorded state per turn, of the same loop type.
 const perTurn=new Map<number,Snapshot>();
 for(const s of snapshots)if(!perTurn.has(s.turn))perTurn.set(s.turn,s);
 const base=new Map<LoopType,{n:number;ok:number}>();
 for(const s of perTurn.values()){
  const type=loopType(s.state,s.characters);
  const b=base.get(type)??{n:0,ok:0};b.n++;if(recovered(s,type).ok)b.ok++;base.set(type,b);
 }
 const groups=new Map<string,Intervention[]>();
 for(const i of interventions){const k=`${i.type}\n${i.source}`;groups.set(k,[...(groups.get(k)??[]),i]);}
 const rates=[...groups.values()].map(list=>{
  const first=list[0] as Intervention;const b=base.get(first.type)??{n:0,ok:0};
  return {type:first.type,source:first.source,n:list.length,recovered:list.filter(i=>i.recovered).length,safe:list.filter(i=>i.safe).length,relapsed:list.filter(i=>i.relapsed).length,baseN:b.n,baseRecovered:b.ok};
 }).sort((a,b)=>a.type.localeCompare(b.type)||b.n-a.n);
 return {interventions,rates};
 };
 return {observe,result};
}

const pct=(a:number,n:number):string=>n===0?"-":`${String(Math.round(100*a/n))}%`;
export function recoveryLines(rates:readonly Rate[]):string[] {
 return [`loop type        intervention                        n  recovered  base  safe  relapsed`,
  ...rates.map(r=>`${r.type.padEnd(16)} ${r.source.padEnd(34)} ${String(r.n).padStart(3)}  ${pct(r.recovered,r.n).padStart(9)}  ${pct(r.baseRecovered,r.baseN).padStart(4)}  ${pct(r.safe,r.n).padStart(4)}  ${pct(r.relapsed,r.n).padStart(8)}`)];
}
