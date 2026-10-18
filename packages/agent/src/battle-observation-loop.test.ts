import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {attachLoopGuard,Governor} from "./harness.js";
import {ALL_ON,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures} from "./features.js";
import {flagFeatures} from "./play-preset.js";
import {checkEvent,type RunEvent} from "./events.js";
import {LOOP_POLICY,LoopDetector,type LoopNotice} from "./loop-detection.js";
import type {GameStateSnapshot} from "./game-state.js";

// Recorded events of run 2026-10-16T02-23-17_qwen36-gpu1_sh02, seq 9850-11960, as the recorder wrote them, trimmed only where the
// event schema leaves a field optional (navigation grid, interaction targets, local map, raw RAM, berry/storage
// resources, map triggers; tool result text cut at its first blank line). Every row passes checkEvent.
function recorded(name:string):RunEvent[]{
 const path=fileURLToPath(new URL(`./fixtures/${name}`,import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
}
type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Seen {readonly turn:number;readonly seq:number;readonly kind:string;readonly phase:string;readonly message:string}

// The production path: attachLoopGuard on a recorder fan-out with the run's own switches and a supervisor.
function replay(events:readonly RunEvent[],battle:boolean):{seen:Seen[];contexts:{turn:number;text:string|null}[]}{
 const observers:((e:RunEvent)=>void)[]=[];const seen:Seen[]=[];const contexts:{turn:number;text:string|null}[]=[];
 let current:RunEvent|undefined;
 const start=events.find(e=>e.type==="run_start");
 if(start?.type!=="run_start")throw new Error("fixture has no run_start");
 const features=featuresOf(start.harness_features);
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{checkEvent({v:1,run:"replay",seq:current?.seq??0,t:"2026-10-16T03:00:00.000-04:00",turn:current?.turn??0,type:"loop_guard",...n,evidence:[...n.evidence]});seen.push({turn:current?.turn??-1,seq:current?.seq??-1,kind:n.kind,phase:n.phase,message:n.message});}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],(kind,calls)=>`SUPERVISOR: ${kind} at ${String(calls)} calls`,features["transition-loop-detection-v1"],false,battle);
 for(const e of events){
  if(e.type==="loop_guard")continue;
  current=e;
  for(const o of observers)o(e);
  if(e.type==="turn_start")contexts.push({turn:e.turn,text:detector.context()});
 }
 return {seen,contexts};
}

const events=recorded("battle-observe-sh02.jsonl.gz");
const STATIC_BATTLE=(()=>{const s=events.find(e=>e.type==="state"&&e.seq===10056);if(s?.type!=="state"||!("started"in s))throw new Error("no battle state at seq 10056");return s;})();
const staticBattle=():State=>STATIC_BATTLE;

describe("battle-observation-loop-v1 on recorded run sh02: 270 observes in a wild battle waiting for A (T445-T716)",()=>{
 it("the fixture is the loop: the battle state never changes between the observes",()=>{
  const observes=events.filter(e=>e.type==="tool_call"&&e.name==="observe"&&e.turn>=449&&e.turn<=716);
  expect(observes.length).toBeGreaterThanOrEqual(260);
  const battles=new Set(events.filter((e):e is State=>e.type==="state"&&"started"in e&&e.seq>=10056&&e.seq<=11928).map(e=>JSON.stringify(e.battle)));
  expect(battles.size).toBe(1);
 });
 it("OFF: reproduces today's silence",()=>{
  expect(replay(events,false).seen).toEqual([]);
 });
 it("ON: the fourth identical observe raises an observation warning and the supervisor briefing, delivered at the next call",()=>{
  const {seen,contexts}=replay(events,true);
  const warning=seen.find(n=>n.phase==="warning");
  expect(warning).toMatchObject({kind:"observation"});
  // The receipt: the fourth identical observe (T449-T452), 264 turns before today's milestone_drought (T716).
  expect(warning).toMatchObject({turn:452,seq:10079});
  expect(seen.filter(n=>n.phase==="supervisor").length).toBe(45);
  expect(seen.find(n=>n.phase==="supervisor")).toMatchObject({kind:"observation",seq:warning?.seq});
  expect(contexts.find(c=>c.turn>(warning?.turn??Infinity))?.text).toMatch(/^SUPERVISOR: observation at \d+ calls$/);
  expect(seen.some(n=>n.phase==="stop")).toBe(false);
 });
 it("ON: the episode recovers when a press finally moves the battle on (T717)",()=>{
  const {seen}=replay(events,true);
  expect(seen.find(n=>n.phase==="recovered")).toMatchObject({turn:717,seq:11945});
 });
});

// Direct completions with the recorded battle state, varied field by field.
function detector(battle:boolean){
 const notices:LoopNotice[]=[];
 const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",true,undefined,true,false,battle);
 const observe=(state:GameStateSnapshot)=>{d.complete({name:"observe",args:{},isError:false,text:"ok",state});};
 return {d,notices,observe};
}
const withBattle=(base:State,change:(b:NonNullable<State["battle"]>)=>Partial<NonNullable<State["battle"]>>):State=>{
 const b=base.battle;if(b==null)throw new Error("no battle");
 return {...base,battle:{...b,...change(b)}};
};

describe("battle-observation-loop-v1 unchanged versus advancing battles",()=>{
 it("ON: four observes of an unchanged battle warn; OFF never",()=>{
  const on=detector(true),off=detector(false);
  for(let i=0;i<4;i++){on.observe(staticBattle());off.observe(staticBattle());}
  expect(on.notices.map(n=>[n.kind,n.phase])).toEqual([["observation","warning"]]);
  for(let i=0;i<20;i++)off.observe(staticBattle());
  expect(off.notices).toEqual([]);
 });
 it.each([
  ["the script advances",(b:NonNullable<State["battle"]>)=>({script_pc:(b.script_pc??0)+4})],
  ["an HP bar drains",(b:NonNullable<State["battle"]>)=>({battlers:(b.battlers??[]).map((x,i)=>i===0?{...x,hp:x.hp-1}:x)})],
  ["the battle turn changes",(b:NonNullable<State["battle"]>)=>({turn:(b.turn??0)+1})],
  ["the controller flags change",(b:NonNullable<State["battle"]>)=>({controller_exec_flags:(b.controller_exec_flags??0)+1})],
 ] as const)("ON: a battle that advances on its own between observes never counts (%s)",(_label,step)=>{
  const on=detector(true);
  let s=staticBattle();
  for(let i=0;i<10;i++){on.observe(s);s=withBattle(s,step);}
  expect(on.notices).toEqual([]);
 });
 it("ON: a press between observes restarts the count",()=>{
  const on=detector(true);
  for(let i=0;i<4;i++){
   on.observe(staticBattle());on.observe(staticBattle());
   on.d.complete({name:"press",args:{buttons:["B"]},isError:false,text:"ok",beforeState:staticBattle(),state:staticBattle(),acted:true});
  }
  expect(on.notices.filter(n=>n.kind==="observation")).toEqual([]);
 });
 it("ON: an unreadable battle (decoder diagnostic) or no battle readout never counts",()=>{
  const on=detector(true);
  const broken=withBattle(staticBattle(),()=>({diagnostic:"battle decoder: unknown controller"}));
  for(let i=0;i<6;i++)on.observe(broken);
  for(let i=0;i<6;i++)on.observe({...staticBattle(),battle:null});
  expect(on.notices).toEqual([]);
 });
 it("ON: after the warning, a new battle state recovers the episode",()=>{
  const on=detector(true);
  for(let i=0;i<4;i++)on.observe(staticBattle());
  on.observe(withBattle(staticBattle(),b=>({script_pc:(b.script_pc??0)+4})));
  expect(on.notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
 });
});

describe("battle-observation-loop-v1 registry",()=>{
 it("is a default-off guard with no dependency, recorded last",()=>{
  expect(featureInfo("battle-observation-loop-v1")).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo("battle-observation-loop-v1").description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null).at(-36)).toBe("battle-observation-loop-v1");
  expect(playHarnessFeatures({...ALL_ON,"battle-observation-loop-v1":false},null)).not.toContain("battle-observation-loop-v1");
  expect(dependencyProblems({...ALL_ON,"deterministic-loop-guard-v1":false})).not.toContainEqual(expect.stringContaining("battle-observation-loop-v1"));
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["battle-observation-loop-v1"]).toBe(false);
 });
});
