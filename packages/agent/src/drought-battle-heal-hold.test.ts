import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
// drought-battle-heal-hold-v1: GLM runs got "the game is not moving forward" drought briefings mid-battle
// (2026-10-21T01-16-23_glm53-mac_e9ee seq 8331, 10741, 11218) and on heal trips a heal warning had asked for
// (2026-10-21T07-17-35_glm53-mac_acfa seq 4962, 5790, 6035, 7262).
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"milestone-drought-suppression-v1":false,"turn-drought-clock-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {STALL_DROUGHT_MS,StallBriefing} from "./stall-briefing.js";
import {stallBriefing} from "./play-wiring.js";
import type {LoopNotice} from "./loop-detection.js";
import {loopEvidence} from "./loop/types.js";

const ID="drought-battle-heal-hold-v1" as const;
const BASE:FeatureSet={...LEGACY_ALL_ON,"stall-briefing-v1":true,"positive-supervisor-v1":false,"progress-aware-cycles-v1":false,"story-character-stall-gate-v1":false,"same-plan-breaker-v1":false};
const MON=(hp:number)=>({species:"TORCHIC",level:9,hp,max_hp:21});
// Recorded heal warnings: acfa's heal_first_line (seq 3857), story_battle_warning (seq 4811) and
// heal_before_trainers_warning (seq 6838), run 8892's gym_heal_warning (seq 12979) and run 9f27's refused
// story_battle_heal_gate (seq 22046).
const WARNINGS=JSON.parse(readFileSync(new URL("../test-support/drought-hold-warnings.json",import.meta.url),"utf8")) as Record<"heal_first_line"|"story_battle_warning"|"heal_before_trainers_warning"|"gym_heal_warning"|"story_battle_heal_gate",Record<string,unknown>>;
const body=(e:Record<string,unknown>)=>Object.fromEntries(Object.entries(e).filter(([k])=>!["v","run","seq","t","turn"].includes(k)));

function rig(features:FeatureSet){
 let now=0,seq=0;const kinds:string[]=[];const held:{text:string;evidence:readonly number[]}[]=[];
 const b=new StallBriefing(features,()=>now,{stall:(kind)=>{kinds.push(kind);return true;}},()=>"",null,null,null,(text,evidence)=>{held.push({text,evidence});});
 const emit=(body:Record<string,unknown>)=>{b.observe(checkEvent({v:1,run:"m",t:"2026-10-21T08:00:00.000-04:00",turn:seq,seq:++seq,...body}));};
 const state=(extra:Record<string,unknown>={})=>{emit({type:"state",...IN_GAME,started:true,screen:"overworld",location:"ROUTE103",map_id:[0,18],position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[],in_battle:false,...extra});};
 // A tool result checks the stall briefing against the latest state.
 const call=()=>{emit({type:"tool_result",id:`c${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[]});};
 const step=(ms:number,extra:Record<string,unknown>={})=>{now+=ms;state(extra);call();};
 return {kinds,held,step,emit,state,call,advance:(ms:number)=>{now+=ms;}};
}
const healLine=(r:ReturnType<typeof rig>)=>{r.emit(body(WARNINGS.heal_first_line));};

describe("drought-battle-heal-hold-v1",()=>{
 it("OFF: the drought briefing fires in battle, as e9ee's did",()=>{
  const r=rig({...BASE,[ID]:false});
  r.step(STALL_DROUGHT_MS+1000,{in_battle:true});
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: no drought briefing while a battle is on screen; it is recorded as held, and the clock restarts when the battle ends",()=>{
  const r=rig({...BASE,[ID]:true});
  r.step(STALL_DROUGHT_MS+1000,{in_battle:true});
  r.step(60_000,{in_battle:true});
  expect(r.kinds).toEqual([]);
  expect(r.held).toHaveLength(1);
  expect(r.held[0]?.text).toBe("Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but a battle is on screen.");
  r.step(1000);
  expect(r.kinds).toEqual([]);
  r.step(STALL_DROUGHT_MS-2000);
  expect(r.kinds).toEqual([]);
  r.step(3000);
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: no drought briefing during a heal trip a heal warning asked for, until the party is at full HP",()=>{
  const r=rig({...BASE,[ID]:true});
  r.step(1000,{party:[MON(17)]});
  healLine(r);
  r.step(STALL_DROUGHT_MS,{party:[MON(17)]});
  expect(r.kinds).toEqual([]);
  expect(r.held.at(-1)?.text).toBe("Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but the party is on its way to heal after a heal warning (#3).");
  r.step(1000,{party:[MON(21)]});
  expect(r.kinds).toEqual([]);
  r.step(STALL_DROUGHT_MS+1000,{party:[MON(21)]});
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: a heal trip that never reaches full HP stops holding after 48 tool results",()=>{
  const r=rig({...BASE,[ID]:true});
  healLine(r);
  for(let i=0;i<48;i++)r.step(10_000,{party:[MON(17)]});
  expect(r.kinds).toEqual([]);
  r.step(10_000,{party:[MON(17)]});
  r.step(STALL_DROUGHT_MS,{party:[MON(17)]});
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: the other recorded heal warnings open a trip too",()=>{
  const types=[WARNINGS.story_battle_warning,WARNINGS.heal_before_trainers_warning,WARNINGS.gym_heal_warning].map(body);
  for(const warning of types){
   const r=rig({...BASE,[ID]:true});
   r.emit(warning);r.step(STALL_DROUGHT_MS+1000,{party:[MON(17)]});
   expect(r.kinds,String(warning["type"])).toEqual([]);
  }
 });
 it("ON: no drought briefing while an unbeaten trainer's sight script holds the field (e9ee seq 10444, RICK)",()=>{
  const r=rig({...BASE,[ID]:true});
  const rick={trainer_id:615,trainer_class:51,name:"RICK",defeated:false,battle_active:false};
  r.step(STALL_DROUGHT_MS+1000,{field_controls_locked:true,trainer_opponent:rick});
  expect(r.kinds).toEqual([]);
  expect(r.held.at(-1)?.text).toBe("Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but a trainer battle is starting.");
  // A beaten trainer's record with the field free is no hold.
  const free=rig({...BASE,[ID]:true});
  free.step(STALL_DROUGHT_MS+1000,{field_controls_locked:false,trainer_opponent:{...rick,defeated:true}});
  expect(free.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: a refused story-battle heal gate opens a trip; a confirmed one does not",()=>{
  const refused=rig({...BASE,[ID]:true});
  refused.emit(body(WARNINGS.story_battle_heal_gate));refused.step(STALL_DROUGHT_MS+1000,{party:[MON(17)]});
  expect(refused.kinds).toEqual([]);
  expect(refused.held.at(-1)?.text).toContain("on its way to heal");
  const confirmed=rig({...BASE,[ID]:true});
  confirmed.emit({...body(WARNINGS.story_battle_heal_gate),outcome:"confirmed",confirmed:true});confirmed.step(STALL_DROUGHT_MS+1000,{party:[MON(17)]});
  expect(confirmed.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: the trip ends at the 48th tool result, and a drought a full interval later fires (codex review round 1)",()=>{
  const r=rig({...BASE,[ID]:true});
  healLine(r);
  for(let i=0;i<48;i++)r.step(10_000,{party:[MON(17)]});
  expect(r.held).toHaveLength(1);
  r.step(STALL_DROUGHT_MS+1000,{party:[MON(17)]});
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: a battle that ends before any drought is due does not restart the clock",()=>{
  const r=rig({...BASE,[ID]:true});
  r.step(4*60_000);
  r.step(30_000,{in_battle:true});
  r.step(1000);
  r.step(31_000);
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("with positive-supervisor-v1 on, its retired diagnostics keep their schedule across a battle (codex review round 1)",()=>{
  const retired=(on:boolean)=>{
   let now=0,seq=0;const out:number[]=[];
   const b=new StallBriefing({...BASE,"positive-supervisor-v1":true,[ID]:on},()=>now,{stall:()=>true},()=>"",null,(kind)=>{if(kind==="milestone_drought")out.push(now);},null,()=>undefined);
   const emit=(body:Record<string,unknown>)=>{b.observe(checkEvent({v:1,run:"m",t:"2026-10-21T08:00:00.000-04:00",turn:seq,seq:++seq,...body}));};
   const at=(ms:number,battle:boolean)=>{now=ms;emit({type:"state",...IN_GAME,started:true,screen:"overworld",location:"ROUTE103",map_id:[0,18],position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[],in_battle:battle});emit({type:"tool_result",id:`c${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[]});};
   at(301_000,true);at(302_000,false);at(600_000,false);
   return out;
  };
  expect(retired(true)).toEqual(retired(false));
  // The heal path too (Claude review round 2): a heal warning, full HP at 200 s, then results at 310 s and 600 s.
  const healed=(on:boolean)=>{
   let now=0,seq=0;const out:number[]=[];
   const b=new StallBriefing({...BASE,"positive-supervisor-v1":true,[ID]:on},()=>now,{stall:()=>true},()=>"",null,(kind)=>{if(kind==="milestone_drought")out.push(now);},null,()=>undefined);
   const emit=(body:Record<string,unknown>)=>{b.observe(checkEvent({v:1,run:"m",t:"2026-10-21T08:00:00.000-04:00",turn:seq,seq:++seq,...body}));};
   const at=(ms:number,hp:number)=>{now=ms;emit({type:"state",...IN_GAME,started:true,screen:"overworld",location:"ROUTE103",map_id:[0,18],position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[],in_battle:false,party:[MON(hp)]});emit({type:"tool_result",id:`c${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[]});};
   emit(body(WARNINGS.heal_first_line));at(200_000,21);at(310_000,21);at(600_000,21);
   return out;
  };
  expect(healed(true)).toEqual(healed(false));
  expect(healed(false)).toEqual([310_000,600_000]);
 });
 it("ON: a finished heal (full HP) restarts the clock even when no drought was held during the trip (acfa seq 7261)",()=>{
  const r=rig({...BASE,[ID]:true});
  r.step(4*60_000,{party:[MON(17)]});
  healLine(r);
  r.step(30_000,{party:[MON(17)]});
  r.step(1000,{party:[MON(21)]});
  r.step(60_000,{party:[MON(21)]});
  expect(r.kinds).toEqual([]);
  r.step(STALL_DROUGHT_MS,{party:[MON(21)]});
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("ON: an ordinary drought with no battle and no heal trip still fires",()=>{
  const r=rig({...BASE,[ID]:true});
  r.step(STALL_DROUGHT_MS+1000,{party:[MON(17)]});
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
});

describe("production factory",()=>{
 it("stallBriefing records a held drought as a would_warn diagnostic only with the switch",()=>{
  const run=(on:boolean)=>{
   const observers:((e:RunEvent)=>void)[]=[];const notices:LoopNotice[]=[];const sent:string[]=[];
   let now=0,seq=0;
   stallBriefing({...BASE,[ID]:on},{subscribe:fn=>{observers.push(fn);},recordStallGate:()=>undefined,recordLoopGuard:n=>{notices.push(n);}},{stall:(kind)=>{sent.push(kind);return true;}},{pausedMs:()=>0},()=>now);
   const emit=(body:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"m",t:"2026-10-21T08:00:00.000-04:00",turn:seq,seq:++seq,...body});for(const o of observers)o(e);};
   now=STALL_DROUGHT_MS+1000;
   emit({type:"state",...IN_GAME,started:true,screen:"battle",location:"ROUTE102",map_id:[0,17],position:{x:1,y:1},facing:"up",field_controls_locked:true,interaction_targets:[],in_battle:true});
   emit({type:"tool_result",id:"c1",name:"battle_action",is_error:false,duration_ms:1,text:"SCRATCH",frames:[]});
   return {notices,sent};
  };
  const on=run(true),off=run(false);
  expect(on.sent).toEqual([]);
  expect(on.notices.map(n=>[n.kind,n.mode,n.phase])).toEqual([["milestone_drought","diagnostic","would_warn"]]);
  expect(on.notices[0]?.message).toBe("Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but a battle is on screen.");
  expect(off.sent).toEqual(["milestone_drought"]);
  expect(off.notices).toEqual([]);
 });
});

describe("recorded heal-trip hold",()=>{
 // Bundle runs 2026-10-21T18-07-08_qwen36-gpu0_4164, 19-29-00_8bb7, 19-42-05_de61, 19-57-21_e0e6 and 20-13-14_0b9a
 // ended "crash" at a drought step during a heal trip: "invalid loop_guard event at /evidence: must not have more than 2 items".
 it("records a heal-trip drought hold as a valid loop_guard event that names the heal warning",()=>{
  const observers:((e:RunEvent)=>void)[]=[];const recorded:RunEvent[]=[];
  let now=0,seq=0;
  stallBriefing({...BASE,[ID]:true},{subscribe:fn=>{observers.push(fn);},recordStallGate:()=>undefined,recordLoopGuard:n=>{recorded.push(checkEvent({v:1,run:"m",t:"2026-10-21T08:00:00.000-04:00",turn:seq,seq:++seq,type:"loop_guard",...n}));}},{stall:()=>true},{pausedMs:()=>0},()=>now);
  const emit=(body:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"m",t:"2026-10-21T08:00:00.000-04:00",turn:seq,seq:++seq,...body});for(const o of observers)o(e);};
  const step=(ms:number)=>{now+=ms;emit({type:"state",...IN_GAME,started:true,screen:"overworld",location:"ROUTE103",map_id:[0,18],position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[],in_battle:false,party:[MON(17)]});emit({type:"tool_result",id:`c${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[]});};
  emit({type:"milestone",name:"ROUTE_103",kind:"navigation",origin:"observed",server_timestamp:0});
  step(1000);
  emit(body(WARNINGS.heal_first_line));const warning=seq;
  step(STALL_DROUGHT_MS);
  const held=recorded.filter(e=>e.type==="loop_guard");
  expect(held).toHaveLength(1);
  expect(held[0]).toMatchObject({kind:"milestone_drought",mode:"diagnostic",phase:"would_warn",evidence:[1,seq-1]});
  expect(held[0]?.type==="loop_guard"&&held[0].message).toBe(`Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but the party is on its way to heal after a heal warning (#${String(warning)}).`);
 });
});

describe("loopEvidence",()=>{
 it("keeps one or two distinct ids, the first and the last, and needs at least one",()=>{
  expect(loopEvidence([7])).toEqual([7]);
  expect(loopEvidence([7,7])).toEqual([7]);
  expect(loopEvidence([3,9])).toEqual([3,9]);
  expect(loopEvidence([3,5,5,9,3])).toEqual([3,9]);
  expect(()=>loopEvidence([])).toThrow("loop_guard evidence needs an event id");
 });
});

describe("registry",()=>{
 it("is the last switch: a default-off guard that needs stall-briefing-v1, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-42)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-42)?.id).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-15)).toBe(ID);
  expect(playHarnessFeatures(LEGACY_ALL_ON,null)).not.toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"stall-briefing-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  const omitted=Object.fromEntries(Object.entries(ALL_ON).filter(([k])=>k!==ID));
  expect(normalizeFeatures(omitted as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
 });
});
