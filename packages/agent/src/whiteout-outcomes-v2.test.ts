import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {BattleOutcomes} from "./battle-outcomes.js";
import {checkEvent,type RunEvent} from "./events.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";
import {normalizeFeatures} from "./play-preset.js";

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
  ["unknown egg status",{party:field.party.map(m=>({...m,is_egg:undefined}))}],
 ] satisfies [string,Partial<State>][]) ("refuses %s",(_label,fields)=>{
  expect(fold([loss,change(field,fields)]).battles()[0]?.whiteout).toBeNull();
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
 });
 it("does not reuse a carried receipt from before the battle, or let later healing rewrite its first field result",()=>{
  const unknown=change(field,{money:null,party:[],blackout_receipt:receipt});
  expect(fold([change(field,{seq:1,blackout_receipt:receipt}),loss,unknown]).battles()[0]?.whiteout).toBeNull();
  expect(fold([loss,change(field,{money:loss.money}),field]).battles()).toHaveLength(1);
  expect(fold([loss,change(field,{money:loss.money}),field]).battles()[0]?.whiteout).toBeNull();
 });
 it("keeps recap previews read-only and commits the same evidence once",()=>{
  const b=fold([loss]);
  expect(b.recap(field)).toContain("and whited out");
  expect(b.battles()).toHaveLength(0);
  b.observe(field);b.observe(field);
  expect(b.battles()).toHaveLength(1);
  expect(b.recap(field)).toContain("and whited out");
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
