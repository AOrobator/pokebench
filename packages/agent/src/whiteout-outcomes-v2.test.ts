import type {StreamFn} from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,type Message,type Model} from "@mariozechner/pi-ai";
import {assistant,userText} from "../test-support/pi.js";
import {Governor,piLoop,play} from "./harness.js";
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {BattleOutcomes} from "./battle-outcomes.js";
import {checkEvent,type RunEvent} from "./events.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";
import {ALL_ON,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="whiteout-outcomes-v2";
type State=Extract<RunEvent,{type:"state";started:boolean}>;
const states=gunzipSync(readFileSync(new URL("./fixtures/same-map-whiteout-0d5d.jsonl.gz",import.meta.url))).toString().trim().split("\n").map(line=>checkEvent(JSON.parse(line))).map(e=>{
 if(e.type!=="state"||!("started" in e))throw new Error("fixture must contain started states");
 return e;
});
const features=(on:boolean)=>normalizeFeatures({...LEGACY_ALL_ON,[ID]:on,"briefing-battle-outcomes-v1":true,"battle-loss-recap-v1":true,"whiteout-healed-v1":true});
function fold(events:readonly RunEvent[],on=true):BattleOutcomes {
 const b=new BattleOutcomes(features(on));for(const e of events)b.observe(e);return b;
}
const loss=states[0]!,field=states[1]!;
const change=(s:State,fields:Partial<State>):State=>({...s,...fields});
const receipt={frame:120,money_before:3615,notice:"Whited out"};

describe(ID,()=>{
 it("registers an optional default-OFF switch with independent both-arm applicability",()=>{
  const older=Object.fromEntries(Object.entries(LEGACY_ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null});
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
  expect(playHarnessFeatures(features(false),null)).not.toContain(ID);
 });
 it("records all three retained Rustboro same-map losses; OFF retains exact existing output",()=>{
  expect(states.map(s=>s.seq)).toEqual([65354,65369,72982,72984,77543,77545]);
  const on=fold(states),off=fold(states,false);
  expect(on.battles().map(b=>({turn:b.turn,whiteout:b.whiteout}))).toEqual([642,716,754].map((turn,i)=>({turn,whiteout:{place:"RUSTBORO CITY (map 0/3)",turn,party:[{species:"MARSHTOMP",hp:i===0?53:56,max_hp:i===0?53:56},{species:"TAILLOW",hp:20,max_hp:20}]}})));
  expect(on.briefingLines()).toContain("Latest whiteout: at turn 754");
  expect(on.recap(states[5]!)).toContain("Whiting out restored your whole party: MARSHTOMP 56/56 HP, TAILLOW 20/20 HP.");
  expect(off.battles().map(b=>b.whiteout)).toEqual([null,null,null]);
  expect(off.briefingLines()).toBe("- Latest battle against a story character: you lost to MAY (trainer 600) on RUSTBORO CITY (map 0/3) at turn 754\n- Latest whiteout: none recorded in this run\n");
 });
 it.each([
  ["heal only",{money:loss.money}],
  ["money only",{party:loss.party}],
  ["wrong money decrease",{money:1806}],
  ["unknown money",{money:null}],
  ["no displacement",{position:loss.position}],
  ["unknown position",{position:null}],
  ["empty party",{party:[]}],
  ["partial healing",{party:field.party.map((m,i)=>i===0?{...m,hp:1}:m)}],
  ["changed identity",{party:field.party.map((m,i)=>i===0?{...m,identity:"other"}:m)}],
  ["unknown identity",{party:field.party.map(m=>({...m,identity:null}))}],
  ["unknown egg status",{party:field.party.map(m=>({...m,is_egg:null}))}],
 ] satisfies [string,Partial<State>][]) ("refuses %s",(_label,fields)=>{
  expect(fold([loss,change(field,fields)]).battles()[0]?.whiteout).toBeNull();
 });
 it("requires complete loss evidence, stable party identities and positive max HP",()=>{
  for(const fields of [{money:null},{money:0},{position:null},{party:[]},{party:loss.party.map(m=>({...m,identity:null}))},{party:loss.party.map(m=>({...m,max_hp:null}))},{party:loss.party.map(m=>({...m,max_hp:0}))},{party:loss.party.map(m=>({...m,identity:"duplicate"}))}] satisfies Partial<State>[]){
   expect(fold([change(loss,fields),field]).battles()[0]?.whiteout).toBeNull();
  }
  expect(fold([loss,change(field,{party:[field.party[0]!]})]).battles()[0]?.whiteout).toBeNull();
  const egg={...loss.party[0]!,is_egg:true};
  expect(fold([change(loss,{party:[...loss.party,egg]}),change(field,{party:[...field.party,egg]})]).battles()[0]?.whiteout).not.toBeNull();
 });
 it("does not infer a whiteout from a win, escape, surviving party or ordinary map change",()=>{
  for(const outcome of ["won","ran","ongoing"]){
   expect(fold([change(loss,{battle:{...loss.battle!,outcome}}),field]).battles()[0]?.whiteout).toBeNull();
  }
  expect(fold([change(loss,{party:field.party}),field]).battles()[0]?.whiteout).toBeNull();
  expect(fold([loss,change(field,{map_id:[2,2],party:loss.party,money:loss.money})]).battles()[0]?.whiteout).toBeNull();
 });
 it("accepts the existing native callback or fresh receipt when sampling misses money/healing",()=>{
  const unknown=change(field,{money:null,party:[]});
  const callback=change(loss,{screen:"field_transition",in_battle:false,blackout_active:true});
  expect(fold([loss,callback,unknown]).battles()[0]?.whiteout?.turn).toBe(642);
  expect(fold([loss,change(unknown,{blackout_receipt:receipt})]).battles()[0]?.whiteout?.turn).toBe(642);
  expect(fold([loss,change(unknown,{blackout_receipts:[receipt]})]).battles()[0]?.whiteout?.turn).toBe(642);
  expect(fold([loss,change(callback,{blackout_active:false,blackout_receipt:receipt}),unknown]).battles()[0]?.whiteout?.turn).toBe(642);
  expect(fold([change(loss,{battle:{...loss.battle!,outcome:"ongoing"}}),change(unknown,{blackout_receipt:receipt})]).battles()[0]?.outcome).toBe("lost");
 });
 it("does not reuse a carried receipt from before the battle, or let later healing rewrite its first field result",()=>{
  const unknown=change(field,{money:null,party:[],blackout_receipt:receipt});
  expect(fold([change(field,{seq:1,blackout_receipt:receipt}),loss,unknown]).battles()[0]?.whiteout).toBeNull();
  expect(fold([loss,change(field,{money:loss.money}),field]).battles()).toHaveLength(1);
  expect(fold([loss,change(field,{money:loss.money}),field]).battles()[0]?.whiteout).toBeNull();
 });
 it("preserves OFF native-callback and receipt behavior, including old map-change inference",()=>{
  const noEffects=change(field,{party:[],money:null});
  expect(fold([loss,change(noEffects,{blackout_receipt:receipt})],false).battles()[0]?.whiteout).toBeNull();
  expect(fold([loss,change(noEffects,{blackout_active:true})],false).battles()[0]?.whiteout).toBeNull();
  expect(fold([loss,change(noEffects,{map_id:[2,2]})],false).battles()[0]?.whiteout).not.toBeNull();
  const b=new BattleOutcomes({...features(true),"whiteout-healed-v1":false});b.observe(loss);b.observe(field);
  expect(b.battles()[0]?.whiteout?.party).toEqual([]);
  expect(b.recap(field)).not.toContain("restored your whole party");
 });
 it("keeps recap previews read-only and commits the same evidence once",()=>{
  const b=fold([loss]);
  expect(b.recap(field)).toContain("and whited out");
  expect(b.recap(field)).toContain("and whited out");
  expect(b.battles()).toHaveLength(0);
  b.observe(field);b.observe(field);
  expect(b.battles()).toHaveLength(1);
  expect(b.recap(field)).toContain("and whited out");
 });
 it.each([false,true])("delivers the corrected recorded note through pinned pi before the next decision, v2=%s",async on=>{
  const observers:((e:RunEvent)=>void)[]=[],recorded:string[]=[],sent:string[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},textOnlySupervisor:(_replies:number,_note:number,_limit:number,text:string)=>{recorded.push(text);}};
  const supervisor=textOnlySupervisor(features(on),recorder);
  if(supervisor===undefined)throw new Error("text-only supervisor must be enabled");
  for(const state of states)for(const observe of observers)observe(state);
  const model:Model<"openai-completions">={id:"offline-fixture",name:"offline fixture",api:"openai-completions",provider:"test",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:100};
  const controller=new AbortController();
  const governor=new Governor({limits:{maxTurns:4,maxWallMs:60000,failureLimit:3,replyFailuresEndRun:false},now:()=>0,retry:()=>undefined,abort:()=>{controller.abort();},textOnlySupervisor:supervisor});
  const streamFn:StreamFn=(_model,context)=>{
   sent.push(context.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[m.content]:m.content.flatMap(p=>p.type==="text"?[p.text]:[])).join("\n"));
   const stream=createAssistantMessageEventStream();stream.push({type:"done",reason:"stop",message:assistant({text:"Offline fixture response."})});return stream;
  };
  const loop=piLoop({systemPrompt:"Offline delivery proof.",tools:[],base:{model,convertToLlm:m=>m as Message[]},governor,transformContext:m=>Promise.resolve(m),emit:()=>undefined,signal:controller.signal,streamFn});
  expect(await play(userText("Replay loss evidence."),governor,loop)).toBe("budget");
  expect(sent).toHaveLength(4);expect(recorded).toHaveLength(1);
  expect(sent[3]).toContain(recorded[0]);
  expect(sent[3]).toContain(on?"Latest whiteout: at turn 754":"Latest whiteout: none recorded in this run");
  expect(sent.slice(0,3).every(text=>!text.includes("Latest whiteout"))).toBe(true);
 });
 it("reaches existing supervisor briefings through both production factories, independent of blackout-transition-v1",()=>{
  for(const on of [false,true]){
   const observers:((e:RunEvent)=>void)[]=[];
   const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},textOnlySupervisor:()=>undefined};
   const f={...features(on),"blackout-transition-v1":false};
   const loop=loopSupervisor(f,recorder),text=textOnlySupervisor(f,recorder);
   for(const s of states)for(const observe of observers)observe(s);
   for(const briefing of [loop?.("cycle",755),text?.(3,1)]){
    expect(briefing).toBeDefined();
    expect(briefing).toContain(on?"Latest whiteout: at turn 754":"Latest whiteout: none recorded in this run");
   }
  }
 });
});
