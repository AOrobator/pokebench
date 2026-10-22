import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {featuresOf,type FeatureSet} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {playGameTools} from "./play-wiring.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";

const ID="coherent-healing-feedback-v1";
const recorded=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:{seq:number;text:string;state:unknown}[]};
const row=recorded.results.find(r=>r.seq===14882);
if(row===undefined)throw new Error("missing recorded gym entry");
const state=parseGameState(row.state);
const places=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as {places:{display:string}[]};
const BASE:FeatureSet={...featuresOf(recorded.harness_features),"harness-trust-v1":false,"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"battle-move-tool-v1":false,"heal-before-trainers-v2":true,"story-battle-heal-first-v1":true,"gym-heal-warning-v1":true};
const hp=(n:number):GameStateSnapshot=>({...state,party:state.party.map((p,i)=>i===0?{...p,hp:n,max_hp:33}:p)});
async function replay(on:boolean,states:readonly GameStateSnapshot[],overrides:Partial<FeatureSet>={},placeSource:()=>Promise<unknown>=()=>Promise.resolve(places)){
 const root=mkdtempSync(join(tmpdir(),"coherent-heal-"));
 try{
  const log=RunLog.create(root,"replay");
  const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)}});
  await recorder.start(RUN_START_META);
  let index=0;
  const press:AgentTool={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"recorded state"}],details:{state:states[index++]}})};
  const tool=playGameTools([press],{...BASE,...overrides,[ID]:on},{read:()=>Promise.resolve(state),places:placeSource},recorder).find(t=>t.name==="press");
  if(tool===undefined)throw new Error("missing production tool");
  const texts:string[]=[];
  for(const [i] of states.entries()){const r=await tool.execute(`r${String(i)}`,{});texts.push(r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n"));}
  recorder.end("budget");
  const events:RunEvent[]=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l)));
  return {texts,warnings:events.filter(e=>["heal_first_line","gym_heal_warning","heal_before_trainers_warning","story_battle_warning","low_hp_trainer_warning"].includes(e.type))};
 }finally{rmSync(root,{recursive:true,force:true});}
}
it("production treatment removes full-heal commands for the ledger's 30/33 gym entry while OFF retains them",async()=>{
 const off=await replay(false,[hp(30)]),on=await replay(true,[hp(30)]);
 expect(off.texts[0]).toContain("heal before talking");
 expect(off.warnings.length).toBeGreaterThan(1);
 expect(on.texts).toEqual(["recorded state"]);
 expect(on.warnings).toEqual([]);
});
it("preserves dangerous rival HP when only the original v1 warning dependency is enabled",async()=>{
 const context=state.world_context,object=context?.objects[0];
 if(context==null||object===undefined||state.story==null)throw new Error("fixture needs world and story facts");
 const rival:GameStateSnapshot={...hp(3),map_id:[0,18],story:{...state.story,rival_battle_won:false},world_context:{...context,objects:[{...object,map_id:[0,18],sprite_kind:"RIVAL_MAY_NORMAL",x:10,y:3}]}};
 const on=await replay(true,[rival],{"low-hp-trainer-warning-v2":false,"heal-before-trainers-v1":false,"gym-heal-warning-v1":false});
 expect(on.warnings).toHaveLength(1);
 expect(on.warnings[0]?.type).toBe("low_hp_trainer_warning");
 expect(on.texts[0]).toContain("below half");
 expect(on.texts[0]).not.toContain("Heal before");
});
it("consolidates dangerous HP into one recorded factual warning and deduplicates unchanged observations",async()=>{
 const on=await replay(true,[hp(3),hp(3),hp(30),hp(3)]);
 expect(on.warnings).toHaveLength(2);
 expect(on.texts[0]).toContain("below half");
 expect(on.texts[0]).toContain("3/33");
 expect(on.texts[0]).not.toMatch(/Heal to full|heal before talking|Heal before you battle/);
 expect(on.texts[1]).toBe("recorded state");
 expect(on.texts[3]).toContain("below half");
});
it("keeps justified 14/35 healing evidence and does not guess through unreadable ownership or HP",async()=>{
 const low={...hp(14),party:hp(14).party.map((p,i)=>i===0?{...p,max_hp:35}:p)};
 const on=await replay(true,[low,{...low,party_owner:"tutorial"},{...low,party:low.party.map(p=>({...p,hp:null}))}]);
 expect(on.texts[0]).toContain("14/35");
 expect(on.texts[0]).toContain("below half");
 expect(on.texts.slice(1)).toEqual(["recorded state","recorded state"]);
});
it("preserves full-HP damaging-PP and fainted-party risks without stacking heal commands",async()=>{
 const lead=state.party[0],facts=state.heal_before_trainers;
 if(lead?.moves==null||facts==null)throw new Error("fixture needs native move and trainer facts");
 const noPP:GameStateSnapshot={...hp(33),party:[{...lead,hp:33,max_hp:33,moves:lead.moves.map(m=>({...m,pp:0}))}]};
 const fainted:GameStateSnapshot={...hp(33),party:[{...lead,hp:33,max_hp:33},{...lead,identity:"fixture-fainted-member",species:"WURMPLE",hp:0,max_hp:15}]};
 const pp=await replay(true,[noPP]),party=await replay(true,[fainted]);
 expect(pp.warnings).toHaveLength(1);
 expect(pp.texts[0]).toContain("no PP left");
 expect(party.warnings).toHaveLength(1);
 expect(party.texts[0]).toContain("WURMPLE has fainted");
 for(const result of [pp,party])expect(result.texts[0]).not.toMatch(/Heal to full|heal before talking|Heal before you battle/);
});
it("qualifies exact ea04 healing observations while preserving their missing context",async()=>{
 const actual=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/frontier-ea04-healing.json.gz",import.meta.url))).toString("utf8")) as {rows:{episode:string;state:unknown;original_warning:{seq:number}}[]};
 for(const row of actual.rows){
  const observed=parseGameState(row.state);
  const on=await replay(true,[observed]);
  if(row.episode!=="E4"){
   expect(on.warnings,row.episode).toEqual([]);
   expect(on.texts,row.episode).toEqual(["recorded state"]);
   // Final recorder snapshots omit richer trainer/heal facts used by the historical warning.
   // Retain that gap; a replay must not fabricate them from a nearby locked state.
   if(row.episode==="E12")expect(observed.heal_before_trainers).toBeUndefined();
  }else{
   expect(on.warnings,row.episode).toHaveLength(1);
   expect(on.texts[0],row.episode).toContain("3/21");
   expect(on.texts[0]).not.toMatch(/Heal to full|heal before talking|Heal before you battle/);
  }
 }
});
it("keeps a verified risk when healing-place evidence is unavailable without inventing a destination",async()=>{
 const on=await replay(true,[hp(3)],{},()=>Promise.reject(new Error("place source unavailable")));
 expect(on.warnings).toHaveLength(1);
 expect(on.texts[0]).toContain("3/33");
 expect(on.texts[0]).not.toContain("POKéMON CENTER in");
});
it("does not repeat an unchanged risk after a map detour without new party or healing evidence",async()=>{
 const outside:GameStateSnapshot={...hp(3),map_id:[0,9],location:"ROUTE 101",world_context:null,heal_before_trainers:{trainers:[],move_power:[],last_heal:null,home:[1,0],mom_heals:false}};
 const on=await replay(true,[hp(3),outside,hp(3)]);
 expect(on.warnings).toHaveLength(1);
 expect(on.texts[2]).toBe("recorded state");
});
