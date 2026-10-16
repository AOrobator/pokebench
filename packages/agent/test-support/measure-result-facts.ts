// Measurement replay (not a test): every game tool result of a recorded run (raw events.jsonl, optionally
// with trainer_opponent reparsed offline) with the blocked-exit-fact-v1 and battle-loss-recap-v1 lines.
// Usage: npx tsx test-support/measure-result-facts.ts <events.jsonl> [opponents.json]
import {readFileSync} from "node:fs";
import {featuresOf} from "../src/features.js";
import {BlockedExits} from "../src/blocked-exit-fact.js";
import {BattleOutcomes} from "../src/battle-outcomes.js";
import type {RunEvent} from "../src/events.js";

const [path,opponents]=process.argv.slice(2);
if(path===undefined)throw new Error("events.jsonl path required");
const reparsed:Record<string,unknown>=opponents===undefined?{}:JSON.parse(readFileSync(opponents,"utf8")) as Record<string,unknown>;
const events=readFileSync(path,"utf8").trim().split("\n").map(line=>{
 const e=JSON.parse(line) as RunEvent;
 return e.type==="state"&&String(e.seq) in reparsed?{...e,trainer_opponent:reparsed[String(e.seq)]} as RunEvent:e;
});
const start=events.find(e=>e.type==="run_start");
if(start?.type!=="run_start")throw new Error("no run_start");
const features={...featuresOf(start.harness_features),"blocked-exit-fact-v1":true,"battle-loss-recap-v1":true};
const exits=new BlockedExits(features),losses=new BattleOutcomes(features);
const states=new Map<number,Extract<RunEvent,{type:"state";started:boolean}>>();
for(const e of events){
 exits.observe(e);losses.observe(e);
 if(e.type==="state"&&"started" in e)states.set(e.seq,e);
 if(e.type==="tool_call")exits.begin(e.id,e.name,e.args);
 if(e.type==="tool_result"&&e.state_seq!==undefined&&["observe","press","navigate_to"].includes(e.name)){
  const s=states.get(e.state_seq);
  const exit=exits.settle(e.id,s,e.text),recap=s===undefined?null:losses.recap(s);
  console.log(JSON.stringify({seq:e.seq,turn:e.turn,map:s?.location??null,position:s?.position??null,exit,recap}));
 }
}
