import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {ObservedInstructions} from "./observed-instructions.js";
import {featuresOf,SWITCHABLE_FEATURES} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {IN_GAME} from "../test-support/events.js";

interface Fixture {run:string;cutoff:number;expected_keep:number[];expected_drop:number[];original_chars:number;events:unknown[]}
const fixture=(id:string):Fixture=>JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/milestone-memory-${id}.json.gz`,import.meta.url))).toString("utf8")) as Fixture;
const evt=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"memory",seq:1,t:"2026-10-21T12:00:00-04:00",turn:1,...body});

it.each(["ea04","d548","1331","fd95","8892","acfa"])("replays %s: exact audited keep/drop, whole quotes and full archive",id=>{
 const f=fixture(id),legacy=new ObservedInstructions(id==="ea04"),memory=new ObservedInstructions(id==="ea04",true);
 for(const raw of f.events){const e=checkEvent(raw);legacy.observe(e);memory.observe(e);}
 expect(legacy.text()?.length).toBe(f.original_chars);
 const selection=memory.retention();
 expect(selection?.kept.map(e=>e.result_event)).toEqual(f.expected_keep);
 expect(selection?.retired.map(e=>e.result_event)).toEqual(f.expected_drop);
 expect(memory.archive()).toEqual(legacy.archive());
 const text=memory.text()??"";expect(text.length).toBeLessThan(f.original_chars*.6);
 const payload=JSON.parse(text.slice(text.indexOf("\n")+1)) as {episodes:{result:number;pages:unknown[][]}[]};
 expect(payload.episodes.map(e=>e.result)).toEqual(f.expected_keep);
 for(const e of memory.archive()){
  const shown=payload.episodes.find(x=>x.result===e.result_event);
  if(f.expected_keep.includes(e.result_event))expect(shown?.pages.map(p=>p[2])).toEqual(e.pages.map(p=>p.text));
  else expect(shown).toBeUndefined();
 }
});
it("defaults OFF, records the switch and enables only the bundle treatment",()=>{
 const id="milestone-instruction-memory-v1";
 expect(SWITCHABLE_FEATURES).toContain(id);
 expect(normalizeFeatures(featuresOf([]))[id]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
 const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
 expect(bundle.base.features[id]).toBe(false);expect(bundle.switches).toContain(id);
});
it("production chain delivers and records the selected compact text; OFF is byte-identical",async()=>{
 const f=fixture("ea04");
 for(const enabled of [false,true]){
  const subscribers:((e:RunEvent)=>void)[]=[],recorded:{text:string}[]=[];
  const features={...featuresOf(["observed-instructions-v1","observed-field-dialogue-v1"]),"milestone-instruction-memory-v1":enabled};
  const wired=contextTools(features,{subscribe:fn=>subscribers.push(fn),recordLedgerContext:b=>recorded.push(b),recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
  const baseline=new ObservedInstructions(true);
  for(const raw of f.events){const e=checkEvent(raw);baseline.observe(e);for(const s of subscribers)s(e);}
  const sent=await wired.transformContext([]),text=recorded[0]?.text;
  expect(sent.at(-1)?.content).toBe(text);
  if(enabled){expect(text).not.toBe(baseline.text());expect(text).not.toContain("observed_locations");}
  else expect(text).toBe(baseline.text());
 }
});
it("arrival, unrelated milestones, missing native proof, unknown dialogue and a mixed future page cannot retire evidence",()=>{
 const f=fixture("ea04"),dialogue=f.events.map(checkEvent).find(e=>e.type==="dialogue_auto_advance");
 if(dialogue?.type!=="dialogue_auto_advance")throw Error("fixture missing");
 for(const extra of [[],[{...dialogue.pages[0]!,text:"Do this later when you become stronger."}]]){
  const memory=new ObservedInstructions(true,true);
  memory.observe({...dialogue,run:"memory",seq:2,tool_call_id:"call",pages:[...dialogue.pages,...extra]});
  memory.observe(evt({type:"tool_result",seq:3,id:"call",name:"press",is_error:false,text:"Location: RUSTBORO CITY",duration_ms:1,frames:[]}));
  memory.observe(evt({type:"milestone",seq:4,name:"RUSTBORO_CITY_GYM",kind:"navigation",origin:"observed",evidence:[1],server_timestamp:1}));
  memory.observe(evt({type:"state",seq:5,...IN_GAME,location:"RUSTBORO CITY GYM",story:undefined}));
  memory.observe(evt({type:"tool_result",seq:6,id:"observe",name:"observe",state_seq:5,is_error:false,text:"Location: RUSTBORO CITY GYM",duration_ms:1,frames:[]}));
  expect(memory.retention()?.retired).toEqual([]);expect(memory.archive()).toHaveLength(1);
 }
});
