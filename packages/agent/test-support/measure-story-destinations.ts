// Measurement replay (not a test): every overworld game tool result of a recorded run with the block
// story-destinations-v1 would have added, resolved against a map table served by /pokebench/places.
// Usage: npx tsx test-support/measure-story-destinations.ts <events.jsonl> <places.json>
// The table's player-house names are rewritten to the run's own player name, as the server names them.
import {readFileSync} from "node:fs";
import {StoryDestinations,type Place,type PlacesBody} from "../src/story-destinations.js";
import {parseGameState} from "../src/game-state.js";
import type {RunEvent} from "../src/events.js";

const [path,table]=process.argv.slice(2);
if(path===undefined||table===undefined)throw new Error("usage: <events.jsonl> <places.json>");
const body=JSON.parse(readFileSync(table,"utf8")) as PlacesBody;
const events=readFileSync(path,"utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
const story=new StoryDestinations();
const states=new Map<number,Extract<RunEvent,{type:"state";started:boolean}>>();
let places:readonly Place[]=body.places,player:string|null=null;
const envelope=new Set(["v","run","seq","t","type","turn"]);
for(const e of events){
 story.observe(e);
 if(e.type==="state"&&"started" in e){
  states.set(e.seq,e);
  if(e.name!==null&&e.name!==player){player=e.name;const name=player;places=body.places.map(p=>({...p,display:p.display.replace(/^RAED's /,`${name}'s `)}));}
 }
 if(e.type!=="tool_result"||e.state_seq===undefined||!["observe","press","navigate_to"].includes(e.name))continue;
 const recorded=states.get(e.state_seq);
 if(recorded===undefined)continue;
 const state=parseGameState(Object.fromEntries(Object.entries(recorded).filter(([key])=>!envelope.has(key))));
 const overworld=state.started&&state.screen==="overworld"&&!state.in_battle;
 const block=story.block(state,e.id,places);
 console.log(JSON.stringify({seq:e.seq,turn:e.turn,map:state.location,overworld,block}));
}
