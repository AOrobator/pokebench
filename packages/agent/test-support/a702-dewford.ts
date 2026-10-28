// Bundle run 2026-10-27T17-35-16_qwen36-gpu0_a702, read-only extract (a702-dewford.json.gz):
// field dialogue_auto_advance calls and their results at turns 312 (DAD), 578 (ROXANNE), 621 (MR. BRINEY), 630 (MR. STONE),
// 634 and 663 (MATCH CALL), every milestone to turn 705, the map arrivals, and one overworld state at turns 630 and 690.
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {checkEvent,type RunEvent} from "../src/events.js";
import {parseGameState,type GameStateSnapshot} from "../src/game-state.js";
import type {FeatureSet} from "../src/features.js";
import {Value} from "typebox/value";
import {FeatureSetSchema,normalizeFeatures} from "../src/play-preset.js";
import type {PlacesBody} from "../src/story-destinations.js";

interface A702Extract {
 readonly run:string;
 readonly dialogues:readonly unknown[];
 readonly results:readonly unknown[];
 readonly milestones:readonly unknown[];
 readonly arrivals:readonly (readonly [number,number,readonly [number,number],string|null])[];
 readonly states:Readonly<Record<"630"|"690",Record<string,unknown>>>;
 readonly features:unknown;
}
type StateEvent=Extract<RunEvent,{type:"state";started:boolean}>;

const RAW=JSON.parse(gunzipSync(readFileSync(new URL("./a702-dewford.json.gz",import.meta.url))).toString("utf8")) as A702Extract;
export const A702_PLACES=(JSON.parse(readFileSync(new URL("./story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody).places;

const stateEvent=(turn:"630"|"690"):StateEvent=>{const e=checkEvent(RAW.states[turn]);if(e.type!=="state"||!("started" in e))throw Error("not a state");return e;};
export function a702State(turn:"630"|"690"):GameStateSnapshot {
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(RAW.states[turn]).filter(([key])=>!envelope.has(key))));
}
// The state at turn 690 (ROUTE116), moved to another map and turn.
export function a702StateAt(map:readonly [number,number],location:string):GameStateSnapshot {
 return {...a702State("690"),map_id:[map[0],map[1]],location};
}
const DIALOGUE_IDS=new Map<number,string>(RAW.dialogues.map(d=>{const e=checkEvent(d);if(e.type!=="dialogue_auto_advance")throw Error("not dialogue");return [e.turn,e.tool_call_id];}));
export const callAt=(turn:number):string=>{const id=DIALOGUE_IDS.get(turn);if(id===undefined)throw Error(`no call at turn ${String(turn)}`);return id;};

// Every extracted event, validated and ordered once. Arrivals are the turn-690 state moved to each recorded arrival.
const TEMPLATE=stateEvent("690");
const ALL:readonly RunEvent[]=[
 ...RAW.arrivals.map(([seq,t,map,location]):RunEvent=>({...TEMPLATE,seq,turn:t,map_id:[map[0],map[1]],location:location??TEMPLATE.location})),
 ...[...RAW.dialogues,...RAW.results,...RAW.milestones].map(e=>checkEvent(e)),
].sort((a,b)=>a.seq-b.seq);
const MILESTONES=new Map(ALL.flatMap(e=>e.type==="milestone"?[[e.name,e] as const]:[]));
// The recorded events to `turn` inclusive, in recorded order (a prefix of the one ordered list).
export function a702Events(turn:number):RunEvent[] {
 const end=ALL.findIndex(e=>e.turn>turn);
 return ALL.slice(0,end<0?ALL.length:end);
}
export const A702_RUN=RAW.run;
// The turn-690 state recorded as an arrival on `map` at `seq`/`turn`.
export function a702Arrival(seq:number,turn:number,map:readonly [number,number],location:string):RunEvent {
 return {...TEMPLATE,seq,turn,map_id:[map[0],map[1]],location};
}
// A recorded a702 auto-advanced call and its result, moved to `seq` (its pages shown at `seq`) and `turn`.
export function a702CallMoved(recordedTurn:number,seq:number,turn:number):RunEvent[] {
 const call=ALL.find(e=>e.type==="dialogue_auto_advance"&&e.turn===recordedTurn);
 const result=ALL.find(e=>e.type==="tool_result"&&call?.type==="dialogue_auto_advance"&&e.id===call.tool_call_id);
 if(call?.type!=="dialogue_auto_advance"||result?.type!=="tool_result")throw Error(`no call at turn ${String(recordedTurn)}`);
 return [{...call,seq,turn,pages:call.pages.map(p=>({...p,state_seq:seq}))},{...result,seq:seq+1,turn}];
}
// A recorded a702 milestone moved to `seq`/`turn`.
export function a702Milestone(name:string,seq:number,turn:number):RunEvent {
 const found=MILESTONES.get(name);
 if(found===undefined)throw Error(`no milestone ${name}`);
 return {...found,seq,turn};
}
// The feature set a702 recorded at run_start (harness 5940bc2fb); switches registered later are OFF.
export const A702_FEATURES:FeatureSet=normalizeFeatures(Value.Parse(FeatureSetSchema,RAW.features));
