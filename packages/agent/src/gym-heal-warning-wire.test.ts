// gym-heal-warning-v1 through the production factory: playGameTools with a real RunRecorder, on run b300's results
// 14717 (RUSTBORO CITY, gym door at (27,19)) and 14882 (entering the gym at 25/33), heal-before-trainers-v2 on. ON, both
// results carry the gym paragraph last and the run log holds both events; OFF, neither.
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

const ID="gym-heal-warning-v1";
const GYM="SUPERVISOR: You are in RUSTBORO CITY GYM (map 11/3), and your party is not at full HP: TORCHIC 25/33.";
const CITY="SUPERVISOR: An exit on this map at (27,19) leads to RUSTBORO CITY GYM (map 11/3), and your party is not at full HP: TORCHIC 25/33.";
const B300=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:{seq:number;text:string;state:unknown}[]};
const PLACES={places:(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as {places:{display:string}[]}).places.map(p=>({...p,display:p.display.replace("RAED's","RED's")}))};
const rows=[14717,14882].map(seq=>{const r=B300.results.find(x=>x.seq===seq);if(r===undefined)throw new Error("missing");return {text:r.text,state:parseGameState(r.state)};});
// The run's switches, minus the ones whose tool wrappers need the real game server.
const BASE:FeatureSet={...featuresOf(B300.harness_features),"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"battle-move-tool-v1":false,"heal-before-trainers-v2":true};

it("playGameTools adds the gym paragraph last and records it with the switch on, and nothing with it off",async()=>{
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
   const warnings=events.flatMap(e=>e.type==="gym_heal_warning"?[e]:[]);
   if(on){
    expect(texts[0]?.split("\n").at(-1)?.startsWith(CITY)).toBe(true);
    expect(texts[1]?.split("\n").at(-1)?.startsWith(GYM)).toBe(true);
    expect(warnings.map(w=>w.text.slice(0,GYM.length))).toEqual([CITY.slice(0,GYM.length),GYM]);
   }else{
    expect(texts.join("\n")).not.toContain("whited out");
    expect(warnings).toHaveLength(0);
   }
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
