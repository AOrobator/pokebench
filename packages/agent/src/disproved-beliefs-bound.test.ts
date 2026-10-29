import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {BELIEF_LEDGER_CHARS,BELIEF_TURNS_SHOWN,DisprovedBeliefs} from "./disproved-beliefs.js";
import {checkEvent,type RunEvent} from "./events.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";

const ID="disproved-beliefs-bound-v1";
interface Fixture {readonly source:string;readonly events:readonly RunEvent[]}
// Real events of run sh02: at turn 146 a TWIN script pushed the player back from (11,1) to (11,2) in LITTLEROOT TOWN.
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/beliefs-sh02.json",import.meta.url),"utf8")) as Fixture;
const RUN:FeatureSet=featuresOf(FIXTURE.events.flatMap(e=>e.type==="run_start"?e.harness_features:[]));
const OFF:FeatureSet={...RUN,"disproved-beliefs-v1":true,[ID]:false};
const ON:FeatureSet={...RUN,"disproved-beliefs-v1":true,[ID]:true};
const SLICE=FIXTURE.events.filter(e=>e.turn===146&&e.type!=="turn_start"&&e.type!=="assistant");

// The recorded push-back, replayed once per entry in `columns` (shifted that many tiles east), turn after turn.
function pushes(columns:readonly number[],text?:string):RunEvent[] {
 const out:RunEvent[]=[];let seq=0;
 columns.forEach((dx,i)=>{
  const ids=new Map<number,number>();
  for(const e of SLICE){ids.set(e.seq,++seq);}
  for(const e of SLICE){
   const shift=(p:unknown)=>p!==null&&typeof p==="object"&&"x"in p&&"y"in p?{...p,x:(p as {x:number}).x+dx}:p;
   const body:Record<string,unknown>={...e,seq:ids.get(e.seq),turn:1000+i};
   if("id"in e)body["id"]=`${String(e.id)}-${String(i)}`;
   if("tool_call_id"in e)body["tool_call_id"]=`${e.tool_call_id}-${String(i)}`;
   if(e.type==="tool_result"&&e.state_seq!==undefined)body["state_seq"]=ids.get(e.state_seq);
   if(e.type==="button_press"&&e.before_state_seq!==undefined)body["before_state_seq"]=ids.get(e.before_state_seq);
   if("position"in e)body["position"]=shift(e.position);
   if(e.type==="dialogue_auto_advance")body["pages"]=e.pages.map(p=>({...p,...(text===undefined?{}:{text}),position:shift(p.position),state_seq:p.state_seq===null?null:ids.get(p.state_seq)??null}));
   out.push(checkEvent(body));
  }
 });
 return out;
}
function pushedBack(features:FeatureSet,columns:readonly number[],text?:string):DisprovedBeliefs {
 const ledger=new DisprovedBeliefs(features);
 for(const e of pushes(columns,text))ledger.observe(e);
 return ledger;
}
// Header, then the count line when there is one, then one item per entry (quoted pages keep their own newlines).
// Six entries of three 400-char pages each cross the 4,000 budget, so the fixtures stay small.
const LONG="a long page that keeps going ".repeat(14);
const lines=(t:string|null)=>(t??"").split(/\n(?=- Moving |\d+ older entries)/);

describe("disproved-beliefs-bound-v1",()=>{
 it("the replayed slice makes one push-back entry per column, as recorded",()=>{
  const off=pushedBack(OFF,[0]).text()??"";
  expect(off).toContain("- Moving UP from (11,1) in LITTLEROOT TOWN (map 0/9): you tried it 1 time, at turn 1000 (latest: press UP). Each time a script moved you back to (11,2);");
  expect(lines(pushedBack(OFF,[0,1,2,3,4]).text())).toHaveLength(6);
 });
 it("ON keeps whole entries, newest first, within the budget, in their usual order, and counts the rest",()=>{
  const cols=[0,1,2,3,4,5];
  const off=pushedBack(OFF,cols,LONG).text()??"",on=pushedBack(ON,cols,LONG).text()??"";
  const [header,count,...kept]=lines(on);
  expect(header).toBe(lines(off)[0]);
  const m=/^(\d+) older entries are left out\.$/.exec(count??"");
  expect(m).not.toBeNull();
  expect(Number(m?.[1])+kept.length).toBe(6);
  expect(kept.at(-1)).toContain("from (16,1)");
  expect(kept.join("\n").length).toBeLessThanOrEqual(BELIEF_LEDGER_CHARS);
  expect(off.endsWith(kept.join("\n"))).toBe(true);
  expect(kept.every(k=>k.startsWith("- Moving UP from "))).toBe(true);
 });
 it("ON lists the latest turns of a repeated push-back and counts the earlier ones",()=>{
  const same=Array.from({length:25},()=>0);
  const on=pushedBack(ON,same).text()??"",off=pushedBack(OFF,same).text()??"";
  expect(off).toContain(`you tried it 25 times, at turns ${Array.from({length:25},(_,i)=>String(1000+i)).join(", ")} (latest`);
  expect(on).toContain(`you tried it 25 times, at turns ${Array.from({length:BELIEF_TURNS_SHOWN},(_,i)=>String(1025-BELIEF_TURNS_SHOWN+i)).join(", ")} (and ${String(25-BELIEF_TURNS_SHOWN)} earlier turns) (latest`);
 });
 it("ON is byte-identical when nothing is over a bound",()=>{
  const few=[0,1,1,2];
  expect(pushedBack(ON,few).text()).toBe(pushedBack(OFF,few).text());
 });
 it("ON keeps an entry repeated last as the newest, even though it was created first",()=>{
  const cols=[0,1,2,3,4,5,0];
  const [,count,...kept]=lines(pushedBack(ON,cols,LONG).text());
  expect(count).toMatch(/older entries are left out\.$/);
  expect(kept.some(k=>k.startsWith("- Moving UP from (11,1) in LITTLEROOT TOWN (map 0/9): you tried it 2 times"))).toBe(true);
 });
 it("counts code points, not UTF-16 units: two astral entries that fit by code points both stay",()=>{
  const text=pushedBack(ON,[0,1],"😀".repeat(500)).text()??"";
  expect(text).not.toContain("left out");
  expect(text).toContain("from (11,1)");
 });
 it("contextTools delivers the bounded list only when the switch is on",async()=>{
  const delivered=async(features:FeatureSet)=>{
   const subs:((e:RunEvent)=>void)[]=[];const bodies:{text:string|null}[]=[];
   const context=contextTools(features,{subscribe:fn=>{subs.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:body=>{bodies.push(body);}},m=>Promise.resolve(m));
   for(const e of pushes([0,1,2,3,4,5],LONG))for(const fn of subs)fn(e);
   await context.transformContext([{role:"user",content:"Play.",timestamp:0}]);
   return bodies.at(-1)?.text??"";
  };
  expect(await delivered(ON)).toMatch(/\n\d+ older entries are left out\.\n/);
  expect(await delivered(OFF)).not.toContain("left out");
 });
 it("is registered after refusal-ledger-bound-v1, default off, needs disproved-beliefs-v1, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(300);
  expect(featureInfo(ID)).toMatchObject({needs:"disproved-beliefs-v1"});
  expect(featureInfo(ID).description).toContain(" Off: every entry and every turn is listed.");
  const {[ID]:value,...omitted}={...ALL_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"disproved-beliefs-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });
});
