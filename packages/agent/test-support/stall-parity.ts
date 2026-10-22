// turn-drought-clock-v1 OFF parity: production-shaped event traces run through the production stall factory
// (stallBriefing) with the real loop guard and supervisor. The golden (stall-parity-golden.json.gz) was produced
// by running this same module against the pre-change code (main 632089f43); see the turn-drought-clock worklog.
// Uses only APIs that existed before the switch, so it runs unchanged on both trees.
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {checkEvent,type RunEvent} from "../src/events.js";
import {featuresOf,type FeatureSet} from "../src/features.js";
import {attachLoopGuard,Governor} from "../src/harness.js";
import type {LoopNotice} from "../src/loop-detection.js";
import {loopSupervisor,stallBriefing} from "../src/play-wiring.js";
import {LEGACY_ALL_ON} from "./legacy-features.js";
import {IN_GAME} from "./events.js";

type Guard=Extract<RunEvent,{type:"loop_guard"}>;
type Held=Extract<RunEvent,{type:"stall_gate"}>;
export interface ParityTrace {readonly name:string;readonly features:FeatureSet;readonly events:readonly RunEvent[]}
export interface ParityResult {readonly name:string;readonly guards:readonly Guard[];readonly held:readonly Held[];readonly contexts:readonly {readonly seq:number;readonly text:string}[]}

const OFF={"turn-drought-clock-v1":false};
const BASE:FeatureSet={...LEGACY_ALL_ON,...OFF,"stall-briefing-v1":true,"positive-supervisor-v1":false,"progress-aware-cycles-v1":false,"story-character-stall-gate-v1":false,"same-plan-breaker-v1":false,"drought-battle-heal-hold-v1":false,"milestone-drought-suppression-v1":false};
const WARNINGS=JSON.parse(readFileSync(new URL("./drought-hold-warnings.json",import.meta.url),"utf8")) as Record<string,Record<string,unknown>>;

// One synthetic run: 160 actions 15 s apart, with level-ups, a trainer battle won, heals, a heal warning,
// a map back-and-forth, a bag-menu dwell, a story milestone and a story character on the map.
function synthetic():RunEvent[] {
 const out:RunEvent[]=[];let seq=0,turn=0;
 const pad=(n:number)=>String(n).padStart(2,"0");
 const at=(ms:number)=>{const sec=Math.floor(ms/1000);return `2026-10-22T${pad(8+Math.floor(sec/3600))}:${pad(Math.floor(sec/60)%60)}:${pad(sec%60)}.000-04:00`;};
 let clock=0;
 const emit=(body:Record<string,unknown>)=>{out.push(checkEvent({v:1,run:"parity",t:at(clock),turn,seq:++seq,...body}));return seq;};
 const mon=(hp:number,level:number)=>({species:"TORCHIC",identity:"0000abcd:00001234",level,hp,max_hp:21});
 const trainer=(defeated:boolean,battle_active:boolean)=>({trainer_id:300,trainer_class:5,name:"CALVIN",defeated,battle_active});
 const characters="Story characters here: MAY at 3,3. Not on this map: none.";
 for(let i=0;i<160;i++){
  turn++;clock+=15_000;
  emit({type:"turn_start",context:{messages:1,images:0,est_tokens:1}});
  let level=9,hp=21;if(i>=10)level=10;if(i>=50)level=11;
  if(i>=30&&i<60)hp=12;
  if(i>=70&&i<80)hp=15;
  const state:Record<string,unknown>={type:"state",...IN_GAME,location:"ROUTE 103",map_id:[0,18],position:{x:1+(i%5),y:1},field_controls_locked:false,interaction_targets:[],party:[mon(hp,level)]};
  if(i>=40&&i<46)Object.assign(state,{in_battle:true,screen:"battle",trainer_opponent:trainer(false,true)});
  if(i===46)Object.assign(state,{trainer_opponent:trainer(true,false)});
  if(i>=90&&i<100)Object.assign(state,{map_id:[0,i%2===0?18:19],location:i%2===0?"ROUTE 103":"ROUTE 110"});
  if(i>=100&&i<132)Object.assign(state,{screen:"bag_menu",world_context:null,active_ui:{phase:"bag_menu",ready:true,selected:"POTION",controls:"A chooses; B exits",diagnostic:null,value:null,details:{}}});
  const s=emit(state);
  if(i===70){const w=WARNINGS["heal_first_line"]??{};emit(Object.fromEntries(Object.entries(w).filter(([k])=>!["v","run","seq","t","turn"].includes(k))));}
  if(i===140)emit({type:"milestone",name:"ROUTE_103_REACHED",server_timestamp:0,kind:"story",origin:"observed"});
  emit({type:"tool_result",id:`c${String(i)}`,name:"press",is_error:i%7===3,duration_ms:1,text:i%7===3?"refused":`pressed\n${characters}`,frames:[],state_seq:s});
 }
 return out;
}

export function parityTraces():ParityTrace[] {
 const events=synthetic();
 const f28d=(JSON.parse(gunzipSync(readFileSync(new URL("./stall-gate-f28d.json.gz",import.meta.url))).toString("utf8")) as {events:RunEvent[]}).events;
 const run={...featuresOf(f28d.flatMap(e=>e.type==="run_start"?e.harness_features:[])),...OFF} as FeatureSet;
 return [
  {name:"ordinary drought",features:BASE,events},
  {name:"suppression on",features:{...BASE,"milestone-drought-suppression-v1":true},events},
  {name:"battle and heal hold",features:{...BASE,"drought-battle-heal-hold-v1":true},events},
  {name:"story-character gate hold",features:{...BASE,"story-character-stall-gate-v1":true},events},
  {name:"positive supervisor",features:{...BASE,"positive-supervisor-v1":true},events},
  {name:"hold and suppression",features:{...BASE,"drought-battle-heal-hold-v1":true,"milestone-drought-suppression-v1":true},events},
  {name:"recorded f28d",features:run,events:f28d},
  {name:"recorded f28d, suppression on",features:{...run,"milestone-drought-suppression-v1":true},events:f28d},
 ];
}

// The recorder's fan-out, the real loop guard and supervisor, and the production stall factory over one trace.
export function runParity(trace:ParityTrace):ParityResult {
 const {features,events}=trace;
 const subscribers:((e:RunEvent)=>void)[]=[];const guards:Guard[]=[];const held:Held[]=[];const contexts:{seq:number;text:string}[]=[];
 let current=events[0] as RunEvent;
 const stamp=(body:Record<string,unknown>)=>({v:1,run:current.run,seq:current.seq,t:current.t,turn:current.turn,...body});
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{guards.push(checkEvent(stamp({type:"loop_guard",...n,evidence:[...n.evidence]})) as Guard);},recordStallGate:(b:Omit<Held,"v"|"run"|"seq"|"t"|"turn"|"type">)=>{held.push(checkEvent(stamp({type:"stall_gate",...b})) as Held);}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:1e12,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],loopSupervisor(features,recorder),features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"],features["ineffective-loops-v1"],features["battle-menu-loop-v1"],features["clock-view-loop-v1"],features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"]);
 const t0=Date.parse(current.t);
 stallBriefing(features,recorder,detector,{pausedMs:()=>0},()=>Date.parse(current.t)-t0);
 for(const e of events){
  if(e.type==="loop_guard"||e.type==="text_only_supervisor"||e.type==="stall_gate")continue;
  current=e;
  if(e.type==="turn_start"){const text=detector.context();if(text!==null)contexts.push({seq:e.seq,text});}
  for(const s of subscribers)s(e);
 }
 return {name:trace.name,guards,held,contexts};
}
