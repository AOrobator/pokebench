import {recipeText} from "../../viewer/test-support/recipe-text.js";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {checkEvent,type RunEvent,type BodyOf} from "./events.js";
import {ConversationLedger} from "./instruction-ledger-v2.js";
import {parseGameState} from "./game-state.js";
import {ObservedInstructions} from "./observed-instructions.js";
import {featuresOf,SWITCHABLE_FEATURES} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {IN_GAME} from "../test-support/events.js";

interface Fixture {run:string;cutoff:number;expected_keep:number[];expected_drop:number[];original_chars:number;events:unknown[]}
const fixture=(id:string):Fixture=>JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/milestone-memory-${id}.json.gz`,import.meta.url))).toString("utf8")) as Fixture;
const evt=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"memory",seq:1,t:"2026-10-21T12:00:00.000-04:00",turn:1,...body});

it.each(["ea04","d548","1331","fd95","8892","acfa"])("replays %s: exact audited keep/drop, whole quotes and full archive",id=>{
 const f=fixture(id),legacy=new ObservedInstructions(id==="ea04"),memory=new ObservedInstructions(id==="ea04",true);
 for(const raw of f.events){const e=checkEvent(raw);legacy.observe(e);memory.observe(e);}
 expect(legacy.text()?.length).toBe(f.original_chars);
 const selection=memory.retention();
 const retained=id==="ea04"?[...f.expected_keep,5006,11212].sort((a,b)=>a-b):f.expected_keep;
 expect(selection?.kept.map(e=>e.result_event)).toEqual(retained);
 expect(selection?.retired.map(e=>e.result_event)).toEqual(f.expected_drop.filter(x=>!retained.includes(x)));
 expect(memory.archive()).toEqual(legacy.archive());
 const text=memory.text()??"";expect(text.length).toBeLessThan(f.original_chars*.6);
 const payload=JSON.parse(text.slice(text.indexOf("\n")+1)) as {episodes:{result:number;pages:unknown[][]}[]};
 expect(payload.episodes.map(e=>e.result)).toEqual(retained);
 for(const e of memory.archive()){
  const shown=payload.episodes.find(x=>x.result===e.result_event);
  if(retained.includes(e.result_event))expect(shown?.pages.map(p=>p[2])).toEqual(e.pages.map(p=>p.text));
  else expect(shown).toBeUndefined();
 }
});
it("defaults OFF, records the switch and enables only the bundle treatment",()=>{
 const id="milestone-instruction-memory-v1";
 expect(SWITCHABLE_FEATURES).toContain(id);
 expect(normalizeFeatures(featuresOf([]))[id]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
 const bundle=JSON.parse(recipeText(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
 expect(bundle.base.features[id]).toBe(false);expect(bundle.switches).toContain(id);
});
it("production chain delivers and records the selected compact text; OFF is byte-identical",async()=>{
 const f=fixture("ea04");
 for(const enabled of [false,true]){
  const subscribers:((e:RunEvent)=>void)[]=[],recorded:Omit<BodyOf<"ledger_context">,"type"|"turn">[]=[];
  const features={...featuresOf(["observed-instructions-v1","observed-field-dialogue-v1"]),"milestone-instruction-memory-v1":enabled};
  const wired=contextTools(features,{subscribe:fn=>subscribers.push(fn),recordLedgerContext:b=>recorded.push(b),recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
  const baseline=new ObservedInstructions(true);
  for(const raw of f.events){const e=checkEvent(raw);baseline.observe(e);for(const s of subscribers)s(e);}
  const sent=await wired.transformContext([]),text=recorded[0]?.text;
  expect(sent.at(-1)?.content).toBe(text);
  if(enabled){expect(recorded[0]?.retention?.retired).toHaveLength(24);expect(recorded[0]?.retention?.kept).toHaveLength(27);expect(checkEvent({...evt({type:"ledger_context",text:"",evidence:[]}),...recorded[0]}).type).toBe("ledger_context");expect(text).not.toBe(baseline.text());expect(text).not.toContain("observed_locations");}
  else {expect(text).toBe(baseline.text());expect(recorded[0]?.retention).toBeUndefined();}
 }
});
it("arrival, unrelated milestones, missing native proof, unknown dialogue and a mixed future page cannot retire evidence",()=>{
 const f=fixture("ea04"),dialogue=f.events.map(checkEvent).find(e=>e.type==="dialogue_auto_advance");
 if(dialogue?.type!=="dialogue_auto_advance")throw Error("fixture missing");
 const first=dialogue.pages[0];if(first===undefined)throw Error("missing page");
 for(const extra of [[],[{...first,text:"Do this later when you become stronger."}]]){
  const memory=new ObservedInstructions(true,true);
  memory.observe({...dialogue,run:"memory",seq:2,tool_call_id:"call",pages:[...dialogue.pages,...extra]});
  memory.observe(evt({type:"tool_result",seq:3,id:"call",name:"press",is_error:false,text:"Location: RUSTBORO CITY",duration_ms:1,frames:[]}));
  memory.observe(evt({type:"milestone",seq:4,name:"RUSTBORO_CITY_GYM",kind:"navigation",origin:"observed",evidence:[1],server_timestamp:1}));
  memory.observe(evt({type:"state",seq:5,...IN_GAME,location:"RUSTBORO CITY GYM",story:undefined}));
  memory.observe(evt({type:"tool_result",seq:6,id:"observe",name:"observe",state_seq:5,is_error:false,text:"Location: RUSTBORO CITY GYM",duration_ms:1,frames:[]}));
  expect(memory.retention()?.retired).toEqual([]);expect(memory.archive()).toHaveLength(1);
 }
});
it("a mixed future page stays even after all native completion evidence is delivered",()=>{
 const f=fixture("ea04"),memory=new ObservedInstructions(true,true);
 let changed=false;
 for(const raw of f.events){let e=checkEvent(raw);if(!changed&&e.type==="dialogue_auto_advance"){const first=e.pages[0];if(first===undefined)throw Error("missing page");e={...e,pages:[...e.pages,{...first,text:"Come back when you are stronger."}]};changed=true;}memory.observe(e);}
 expect(memory.retention()?.kept.some(e=>e.result_event===888&&e.reason==="unknown")).toBe(true);
 expect(memory.archive()[0]?.pages.at(-1)?.text).toBe("Come back when you are stronger.");
});
it("failed delivery cannot advance a chapter, and a repeated retired episode is reactivated without losing its first source",()=>{
 const f=fixture("ea04"),memory=new ObservedInstructions(true,true);
 for(const raw of f.events)memory.observe(checkEvent(raw));
 const chapter=memory.retention()?.chapter;
 expect(memory.retention()?.retired.some(e=>e.result_event===888)).toBe(true);
 const dialogue=checkEvent(f.events.find(raw=>checkEvent(raw).type==="dialogue_auto_advance"));
 if(dialogue.type!=="dialogue_auto_advance")throw Error("missing dialogue");
 const state=checkEvent(f.events.findLast(raw=>checkEvent(raw).type==="state"));
 if(state.type!=="state"||!("started" in state)||state.story===undefined)throw Error("missing state");
 memory.observe(evt({...state,seq:30000,story:{...state.story,stone_badge:true,rustboro_gym_complete:true}}));
 memory.observe(evt({run:f.run,type:"tool_result",seq:30001,id:"failed",name:"observe",state_seq:30000,text:"Location: X",is_error:true,duration_ms:1,frames:[]}));
 expect(memory.retention()?.chapter).toEqual(chapter);
 memory.observe({...dialogue,seq:30002,tool_call_id:"repeat"});
 memory.observe(evt({run:f.run,type:"tool_result",seq:30003,id:"repeat",name:"press",text:"Location: X",is_error:false,duration_ms:1,frames:[]}));
 expect(memory.retention()?.kept.some(e=>e.result_event===888&&e.reason==="current_chapter")).toBe(true);
 expect(memory.archive().filter(e=>e.result_event===888)).toHaveLength(1);
});
it("only delivered native completion closes the matching task, independent of model turn count",()=>{
 const f=fixture("ea04");
 for(const turn of [1,10000]){
  const memory=new ObservedInstructions(true,true);
  for(const raw of f.events){const e=checkEvent(raw);memory.observe({...e,turn});}
  expect(memory.retention()?.retired.map(e=>e.result_event)).toEqual(f.expected_drop.filter(x=>x!==5006&&x!==11212));
 }
});
it("missing task completion retains a recognized old episode as unresolved after later chapter progress",()=>{
 const f=fixture("ea04"),memory=new ObservedInstructions(true,true);
 for(const raw of f.events){const e=checkEvent(raw);memory.observe(e.type==="state"&&"started" in e&&e.story!=null?{...e,story:{...e.story,clock_set:null}}:e);}
 expect(memory.retention()?.chapter?.name).toBe("TEAM_AQUA_WOODS_EVENT_COMPLETE");
 expect(memory.retention()?.kept.find(e=>e.result_event===888)).toMatchObject({reason:"unresolved",rule:"home-clock"});
 expect(memory.retention()?.kept.find(e=>e.result_event===973)).toMatchObject({reason:"unresolved",rule:"clock-request"});
});
it("transition and unmatched native states cannot qualify completion",()=>{
 for(const mode of ["transition","unmatched"]){
  const f=fixture("ea04"),memory=new ObservedInstructions(true,true);
  for(const raw of f.events){const e=checkEvent(raw);memory.observe(e.type==="state"&&"started" in e?{...e,...(mode==="transition"?{screen:"field_transition" as const}:{seq:e.seq+100000})}:e);}
  expect(memory.retention()?.chapter).toBeNull();expect(memory.retention()?.retired).toEqual([]);
 }
});

it("the companion ledger is byte-identical OFF, avoids duplicate full-field quotes ON, and preserves story-only latest dialogue",()=>{
 const f=fixture("ea04"),base=featuresOf(["instruction-ledger-v2","observed-instructions-v1","observed-field-dialogue-v1"]);
 const old=new ConversationLedger(base),off=new ConversationLedger({...base,"milestone-instruction-memory-v1":false}),on=new ConversationLedger({...base,"milestone-instruction-memory-v1":true}),storyOnly=new ConversationLedger({...base,"milestone-instruction-memory-v1":true,"observed-field-dialogue-v1":false});
 for(const raw of f.events){const e=checkEvent(raw);for(const ledger of [old,off,on,storyOnly])ledger.observe(e);}
 const state={...parseGameState(IN_GAME),screen:"overworld" as const,in_battle:false,location:"RUSTBORO CITY GYM",map_id:[11,3] as [number,number]};
 expect(off.block(state,"next")).toBe(old.block(state,"next"));
 expect(off.block(state,"next")).toContain("Rooms visited");expect(on.block(state,"next")).toBeNull();
 expect(storyOnly.block(state,"next")).toContain("Latest conversation");expect(storyOnly.block(state,"next")).not.toContain("Rooms visited");
});
