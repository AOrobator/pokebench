// drought-battle-heal-hold-v1: GLM runs got "the game is not moving forward" drought briefings mid-battle
// (2026-10-21T01-16-23_glm53-mac_e9ee seq 8331, 10741, 11218) and on heal trips a heal warning had asked for
// (2026-10-21T07-17-35_glm53-mac_acfa seq 4962, 5790, 6035, 7262).
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {STALL_DROUGHT_MS,StallBriefing} from "./stall-briefing.js";
import {stallBriefing} from "./play-wiring.js";
import type {LoopNotice} from "./loop-detection.js";

const ID="drought-battle-heal-hold-v1" as const;
const BASE:FeatureSet={...LEGACY_ALL_ON,"stall-briefing-v1":true,"positive-supervisor-v1":false,"progress-aware-cycles-v1":false,"story-character-stall-gate-v1":false,"same-plan-breaker-v1":false};
const MON=(hp:number)=>({species:"TORCHIC",level:9,hp,max_hp:21});
// Recorded heal warnings: acfa's heal_first_line (seq 3857), story_battle_warning (seq 4811) and
// heal_before_trainers_warning (seq 6838), and run 8892's gym_heal_warning (seq 12979).
const WARNINGS=JSON.parse(readFileSync(new URL("../test-support/drought-hold-warnings.json",import.meta.url),"utf8")) as Record<"heal_first_line"|"story_battle_warning"|"heal_before_trainers_warning"|"gym_heal_warning",Record<string,unknown>>;
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
  expect(r.held.at(-1)?.text).toBe("Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but the party is on its way to heal after a heal warning.");
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
  expect(on.notices).toEqual([expect.objectContaining({kind:"milestone_drought",mode:"diagnostic",phase:"would_warn",message:expect.stringContaining("Not sent (drought-battle-heal-hold-v1)")})]);
  expect(off.sent).toEqual(["milestone_drought"]);
  expect(off.notices).toEqual([]);
 });
});

describe("registry",()=>{
 it("is the last switch: a default-off guard that needs stall-briefing-v1, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-1)?.id).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
  expect(playHarnessFeatures(LEGACY_ALL_ON,null)).not.toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"stall-briefing-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  const omitted=Object.fromEntries(Object.entries(ALL_ON).filter(([k])=>k!==ID));
  expect(normalizeFeatures(omitted as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
 });
});
