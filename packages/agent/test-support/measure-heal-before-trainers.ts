// Measurement replay (not a test) for heal-before-trainers-v1: runs the production HealBeforeTrainers arm over a
// recorded run's game-tool result states, each carrying the heal_before_trainers field the server would have added
// (replayed from the state's raw-RAM archive), with the ROM's map table as GET /pokebench/places serves it.
// For every warning it prints the facts and what happened next; for every trainer battle, whether the party was
// weak when it started, whether a warning named that trainer first, and the outcome.
// Usage: npx tsx test-support/measure-heal-before-trainers.ts <states.jsonl> <places.json>
// Each line of states.jsonl after the first ({harness_features,run}) is {seq,turn,tool,state}.
import {readFileSync} from "node:fs";
import {HealBeforeTrainers,healBeforeTrainersText,weakParty} from "../src/low-hp-trainer-warning.js";
import {parseGameState,type GameStateSnapshot} from "../src/game-state.js";
import type {PlacesBody} from "../src/story-destinations.js";

const [path,table]=process.argv.slice(2);
if(path===undefined||table===undefined)throw new Error("usage: <states.jsonl> <places.json>");
const places=(JSON.parse(readFileSync(table,"utf8")) as PlacesBody).places;
const [head,...rest]=readFileSync(path,"utf8").trim().split("\n");
const meta=JSON.parse(head??"{}") as {run:string;harness_features:string[]};
const rows=rest.map(line=>{const r=JSON.parse(line) as {seq:number;turn:number;tool:string;state:unknown};return {...r,state:parseGameState(r.state)};});
const watch=new HealBeforeTrainers({skipStory:meta.harness_features.includes("low-hp-trainer-warning-v2"),places:()=>Promise.resolve(places)});
const free=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.field_controls_locked===false&&s.party_owner==="player";
const trainerBattle=(s:GameStateSnapshot):number|null=>s.in_battle&&s.trainer_opponent?.battle_active===true?s.trainer_opponent.trainer_id:null;

interface Fire {seq:number;turn:number;map:string|null;trainers:number[];text:string}
const fires:Fire[]=[];
const warnedTrainerIds=new Set<number>();
for(const r of rows){
 const f=await watch.observe(r.state);
 if(f===null)continue;
 const ids=f.trainers.map(t=>r.state.heal_before_trainers?.trainers.find(x=>x.local_id===t.local_id)?.trainer_id??-1);
 for(const id of ids)warnedTrainerIds.add(id);
 fires.push({seq:r.seq,turn:r.turn,map:r.state.location,trainers:ids,text:healBeforeTrainersText(f)});
}

// Trainer battles: the first in-battle state of each, the last free-field state before it and the first field state after.
interface Battle {start:number;turn:number;trainer:number;name:string|null;map:string|null;weak:string;warned:boolean;won:boolean|null}
const battles:Battle[]=[];
let lastField:GameStateSnapshot|null=null;
// One battle per stretch of battle states: a new one starts only after a free-field state.
let fieldSince=true;
for(let i=0;i<rows.length;i++){
 const r=rows[i];if(r===undefined)continue;
 const id=trainerBattle(r.state);
 if(id!==null&&fieldSince){
  fieldSince=false;
  const after=rows.slice(i+1).find(x=>!x.state.in_battle&&x.state.started&&x.state.screen==="overworld");
  const weak=lastField===null?null:weakParty(lastField);
  const firedBefore=fires.some(f=>f.seq<r.seq&&f.trainers.includes(id));
  battles.push({start:r.seq,turn:r.turn,trainer:id,name:r.state.trainer_opponent?.name??null,map:r.state.location,weak:weak===null?"unknown":weak.length===0?"no":weak.map(w=>w.kind).join("+"),warned:firedBefore,won:after?.state.trainer_opponent?.trainer_id===id?after.state.trainer_opponent.defeated:null});
 }
 if(free(r.state)){lastField=r.state;fieldSince=true;}
}
// What followed each warning: the next trainer battle (any), whether the party was healed (read not weak) before it.
const followed=fires.map(f=>{
 const next=battles.find(b=>b.start>f.seq);
 const healedFirst=rows.some(r=>r.seq>f.seq&&(next===undefined||r.seq<next.start)&&free(r.state)&&weakParty(r.state)?.length===0);
 return {...f,next:next===undefined?null:{trainer:next.trainer,name:next.name,map:next.map,warnedTrainer:f.trainers.includes(next.trainer),won:next.won,turnsLater:next.turn-f.turn},healedFirst};
});
console.log(JSON.stringify({run:meta.run,toolResults:rows.length,fires:followed,battles}));
