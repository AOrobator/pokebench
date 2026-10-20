// heal-before-trainers-v2 through the production factory: playGameTools with a real RunRecorder, on run b300's
// results 14717 (RUSTBORO CITY, the POKéMON CENTER listed as an exit) and 14882 (entering the gym at 25/33). ON, the
// second result carries v2's paragraph and the run log holds its event; OFF, neither.
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {featuresOf,type FeatureSet} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState} from "./game-state.js";
import {playGameTools} from "./play-wiring.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";

const ID="heal-before-trainers-v2";
const GYM_TEXT="SUPERVISOR: A trainer you have not beaten is on this map: the Gym Leader ROXANNE, object 1, sprite ROXANNE, at (5,2) (not loaded now: the tile the map places it on). Your party is not at full HP: TORCHIC 25/33. Heal to full before a story battle. In a trainer battle the game says \"No! There's no running from a TRAINER battle!\" If your party faints, you black out: you lose half your money (₽3142 of ₽6284) and wake up back at the last POKéMON CENTER you entered, or at home. The nearest place you know of that heals your party is the POKéMON CENTER in RUSTBORO CITY (map 11/5), 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (16,38) in RUSTBORO CITY; its nurse says \"We restore your tired POKéMON to full health.\"";
const B300=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:{seq:number;text:string;state:unknown}[]};
const PLACES:unknown=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8"));
const rows=[14717,14882].map(seq=>{const r=B300.results.find(x=>x.seq===seq);if(r===undefined)throw new Error("missing");return {text:r.text,state:parseGameState(r.state)};});
// The run's switches, minus the ones whose tool wrappers need the real game server.
const BASE:FeatureSet={...featuresOf(B300.harness_features),"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"battle-move-tool-v1":false};

it("playGameTools adds v2's paragraph and records it with the switch on, and nothing with it off",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-heal-v2-wire-"));
 try{
  for(const on of [true,false]){
   const log=RunLog.create(root,on?"on":"off");
   const last=rows[1]?.state;
   if(last===undefined)throw new Error("missing");
   const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(last)}});
   await recorder.start(RUN_START_META);
   let i=0;
   const press:AgentTool={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>{const r=rows[i++];if(r===undefined)throw new Error("no more results");return Promise.resolve({content:[{type:"text" as const,text:r.text}],details:{state:r.state}});}};
   const tools=playGameTools([press],{...BASE,[ID]:on},{read:()=>Promise.resolve(last),places:()=>Promise.resolve(PLACES)},recorder);
   const tool=tools.find(t=>t.name==="press");
   if(tool===undefined)throw new Error("no press tool");
   const texts:string[]=[];
   for(let n=0;n<rows.length;n++){const r=await tool.execute(`c${String(n)}`,{});texts.push(r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n"));}
   recorder.end("budget");
   const events:RunEvent[]=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
   const warnings=events.flatMap(e=>e.type==="heal_before_trainers_warning"?[e]:[]);
   if(on){
    expect(texts[1]?.endsWith(`\n${GYM_TEXT}`)).toBe(true);
    expect(warnings.map(w=>w.text)).toEqual([GYM_TEXT]);
   }else{
    expect(texts[1]).not.toContain("SUPERVISOR: A trainer you have not beaten");
    expect(warnings).toHaveLength(0);
   }
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
