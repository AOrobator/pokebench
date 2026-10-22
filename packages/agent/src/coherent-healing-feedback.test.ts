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
async function replay(on:boolean,states:readonly GameStateSnapshot[]){
 const root=mkdtempSync(join(tmpdir(),"coherent-heal-"));
 try{
  const log=RunLog.create(root,"replay");
  const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)}});
  await recorder.start(RUN_START_META);
  let index=0;
  const press:AgentTool={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"recorded state"}],details:{state:states[index++]}})};
  const tool=playGameTools([press],{...BASE,[ID]:on},{read:()=>Promise.resolve(state),places:()=>Promise.resolve(places)},recorder).find(t=>t.name==="press");
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
