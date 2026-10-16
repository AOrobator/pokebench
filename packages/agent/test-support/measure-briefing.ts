// Measurement replay (not a test): each recorded supervisor note of a run, rebuilt with
// briefing-battle-outcomes-v1 OFF (must equal the recorded message) and ON (its two added lines).
// Usage: npx tsx test-support/measure-briefing.ts <events.jsonl> [opponents.json]
import {readFileSync} from "node:fs";
import {featuresOf} from "../src/features.js";
import {SupervisorBriefing,type Stall} from "../src/loop-supervisor.js";
import type {LoopKind} from "../src/loop-detection.js";
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
const base=featuresOf(start.harness_features);
const off=new SupervisorBriefing({...base,"briefing-battle-outcomes-v1":false}),on=new SupervisorBriefing({...base,"briefing-battle-outcomes-v1":true});
function brief(b:SupervisorBriefing,message:string,kind:string,calls:number):string|null {
 const cycle=/You have walked between (.+) and (.+) (\d+) times(, out and back,| \(with other maps in between\),)/.exec(message);
 if(cycle!==null){const stall:Stall={kind:"map_cycle",from:cycle[1]??"",to:cycle[2]??"",roundTrips:Number(cycle[3]),consecutive:cycle[4]===", out and back,"};return b.stallText(stall,calls);}
 const drought=/no new story milestone for (\d+) minutes of play/.exec(message);
 if(drought!==null)return b.stallText({kind:"milestone_drought",minutes:Number(drought[1])},calls);
 const dwell=/You have made (\d+) calls in the (.+) without leaving it/.exec(message);
 if(dwell!==null)return b.stallText({kind:"interface_dwell",name:dwell[2]??"",calls:Number(dwell[1])},calls);
 if(message.startsWith("SUPERVISOR: You are currently looping."))return b.text(kind as LoopKind,calls);
 return null;
}
for(const e of events){
 if(e.type==="loop_guard"&&e.phase==="supervisor"){
  const was=brief(off,e.message,e.kind,e.calls),now=brief(on,e.message,e.kind,e.calls);
  const added=now===null?[]:now.split("\n").filter(l=>l.startsWith("- Latest battle against")||l.startsWith("- Latest whiteout"));
  console.log(JSON.stringify({seq:e.seq,turn:e.turn,kind:e.kind,offIdentical:was===e.message,added}));
  continue;
 }
 if(e.type==="text_only_supervisor")continue;
 off.observe(e);on.observe(e);
}
