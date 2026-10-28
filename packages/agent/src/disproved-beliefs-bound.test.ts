import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {BELIEF_LEDGER_CHARS,BELIEF_TURNS_SHOWN,DisprovedBeliefs} from "./disproved-beliefs.js";
import {checkEvent,type RunEvent} from "./events.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="disproved-beliefs-bound-v1";
interface Fixture {readonly source:string;readonly events:readonly RunEvent[]}
// Real events of run sh02: at turn 146 a TWIN script pushed the player back from (11,1) to (11,2) in LITTLEROOT TOWN.
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/beliefs-sh02.json",import.meta.url),"utf8")) as Fixture;
const RUN:FeatureSet=featuresOf(FIXTURE.events.flatMap(e=>e.type==="run_start"?e.harness_features:[]));
const OFF:FeatureSet={...RUN,"disproved-beliefs-v1":true,[ID]:false};
const ON:FeatureSet={...RUN,"disproved-beliefs-v1":true,[ID]:true};
const SLICE=FIXTURE.events.filter(e=>e.turn===146&&e.type!=="turn_start"&&e.type!=="assistant");

// The recorded push-back, replayed once per entry in `columns` (shifted that many tiles east), turn after turn.
function pushedBack(features:FeatureSet,columns:readonly number[]):DisprovedBeliefs {
 const ledger=new DisprovedBeliefs(features);let seq=0;
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
   if(e.type==="dialogue_auto_advance")body["pages"]=e.pages.map(p=>({...p,position:shift(p.position),state_seq:p.state_seq===null?null:ids.get(p.state_seq)??null}));
   ledger.observe(checkEvent(body));
  }
 });
 return ledger;
}
// Header, then the count line when there is one, then one item per entry (quoted pages keep their own newlines).
const lines=(t:string|null)=>(t??"").split(/\n(?=- Moving |\d+ older entries)/);

describe("disproved-beliefs-bound-v1",()=>{
 it("the replayed slice makes one push-back entry per column, as recorded",()=>{
  const off=pushedBack(OFF,[0]).text()??"";
  expect(off).toContain("- Moving UP from (11,1) in LITTLEROOT TOWN (map 0/9): you tried it 1 time, at turn 1000 (latest: press UP). Each time a script moved you back to (11,2);");
  expect(lines(pushedBack(OFF,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]).text())).toHaveLength(21);
 });
 it("ON keeps whole entries, newest first, within the budget, in their usual order, and counts the rest",()=>{
  const cols=Array.from({length:40},(_,i)=>i);
  const off=pushedBack(OFF,cols).text()??"",on=pushedBack(ON,cols).text()??"";
  const [header,count,...kept]=lines(on);
  expect(header).toBe(lines(off)[0]);
  const m=/^(\d+) older entries are left out\.$/.exec(count??"");
  expect(m).not.toBeNull();
  expect(Number(m?.[1])+kept.length).toBe(40);
  expect(kept.at(-1)).toContain("from (50,1)");
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
 it("is registered after refusal-ledger-bound-v1, default off, needs disproved-beliefs-v1, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(297);
  expect(featureInfo(ID)).toMatchObject({needs:"disproved-beliefs-v1"});
  expect(featureInfo(ID).description).toContain(" Off: every entry and every turn is listed.");
  const {[ID]:value,...omitted}={...ALL_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"disproved-beliefs-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });
});
