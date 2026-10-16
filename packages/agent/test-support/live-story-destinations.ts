// Live check (not a test): the production path against a running game server. Reads the map table
// through StateWatcher.places(), takes a real /pokebench/observation, and prints the readout the switch
// would hand the model after a recorded-shape MAY line ("Well, it's time to head back to the LAB.").
// Usage: npx tsx test-support/live-story-destinations.ts http://127.0.0.1:<port>
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {StateWatcher,parseGameState} from "../src/game-state.js";
import {checkEvent,type RunEvent} from "../src/events.js";
import {ALL_ON} from "../src/features.js";
import {withStoryDestinations} from "../src/story-destinations.js";

const url=process.argv[2];
if(url===undefined)throw new Error("game server url required");
const watcher=new StateWatcher(url);
const table=await watcher.places() as {places:unknown[]};
console.log(`map table: ${String(table.places.length)} maps`);
const body=await (await fetch(`${url}/pokebench/observation`)).json() as {state_text:string;state:unknown};
const state=parseGameState(body.state);
const observe:AgentTool={name:"observe",label:"o",description:"o",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:body.state_text}],details:{state}})};
const subs:((e:RunEvent)=>void)[]=[];
const [tool]=withStoryDestinations([observe],{...ALL_ON,"story-destinations-v1":true},{subscribe:fn=>{subs.push(fn);}},watcher);
const base={v:1,run:"2026-10-16T12-42-29_qwen36-gpu0_4caa",t:"2026-10-16T13:07:12.905-04:00",turn:1};
for(const fn of subs){
 fn(checkEvent({...base,seq:1,type:"dialogue_auto_advance",tool_call_id:"c",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"ROUTE103",map_id:[0,18],position:null,speaker:"MAY",speaker_source:"name_prefix",text:"Well, it's time to head back to\nthe LAB."}],stop:"field_free",detail:"d",duration_ms:1}));
 fn(checkEvent({...base,seq:2,type:"tool_result",id:"c",name:"press",is_error:false,duration_ms:1,text:"pressed A",frames:[]}));
}
const result=await tool?.execute("o",{});
const text=result?.content.map(c=>c.type==="text"?c.text:"").join("\n")??"";
console.log(text.split("\n").slice(0,16).join("\n"));
