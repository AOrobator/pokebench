import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {onMap,placesOnce} from "./low-hp-trainer-warning.js";
import type {RunRecorder} from "./recorder.js";
import type {Place,PlaceSource} from "./story-destinations.js";

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Result=Extract<RunEvent,{type:"tool_result"}>;
export interface TownCenterFacts {readonly town:string;readonly map:readonly [number,number];readonly x:number;readonly y:number}
const FREE=["Screen: overworld","Menu: none open","Field-message text: none (no message box is open).","Field-message phase: no message is open and no script is running."];
// pokeemerald data/maps/{OldaleTown,RustboroCity}_PokemonCenter_1F/scripts.inc: OnTransition setrespawn.
// Nurse recovery is separate: data/text/pkmn_center_nurse.inc, gText_WouldYouLikeToRestYourPkmn.
export function townCenterFacts(s:GameStateSnapshot,places:readonly Place[],text:string):TownCenterFacts|null {
 if(!s.started||s.screen!=="overworld"||s.in_battle||s.blackout_active===true||s.field_controls_locked!==false||s.party_owner!=="player"||s.map_id===null||s.active_ui!=null)return null;
 if(text.includes("STATE COVERAGE ERROR:")||["Screen:","Menu:","Field-message text:","Field-message phase:"].some(prefix=>text.split("\n").filter(line=>line.startsWith(prefix)).length!==1))return null;
 if(!s.party.some(p=>p.is_egg!==true)||!FREE.every(line=>text.split("\n").includes(line)))return null;
 const last=s.heal_before_trainers?.last_heal;
 if(last==null||onMap(last,s.map_id))return null;
 const here=s.map_id;
 const town=places.find(p=>onMap(p.map_id,here));
 if(town===undefined)return null;
 const center=places.find(p=>p.name===`${town.name} POKEMON CENTER 1F`);
 if(center===undefined)return null;
 const door=town.warps.find(w=>onMap(w.to,center.map_id));
 if(door===undefined||!text.includes(`navigate_to_target target {"kind":"warp","x":${String(door.x)},"y":${String(door.y)}}`))return null;
 const reach=s.exit_reach?.warps.find(w=>w.x===door.x&&w.y===door.y);
 if(reach?.reach!=="foot")return null;
 return {town:town.display,map:[s.map_id[0],s.map_id[1]],x:door.x,y:door.y};
}
export function townCenterText(f:TownCenterFacts):string {
 return `Enter ${f.town}’s Pokémon Center now, using the listed entrance warp at (${String(f.x)},${String(f.y)}) on map [${String(f.map[0])}, ${String(f.map[1])}]. Entry sets your blackout return point here even when your party is healthy. Heal with the nurse if needed, then resume your current objective.`;
}

export function isTownCenterText(text:string):boolean {
 return text.startsWith("Enter ")&&text.includes("’s Pokémon Center now, using the listed entrance warp at (")&&text.endsWith("Heal with the nurse if needed, then resume your current objective.");
}

export function townCenterContext(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform,source:PlaceSource):Transform {
 if(!features["town-center-checkpoint-v1"]||!features["heal-before-trainers-v1"]||!features["exit-reachability-v1"])return base;
 const table=placesOnce(source);
 let latest:State|null=null,result:Result|null=null,visit:string|null=null,sent=false,recorded:string|null=null;
 recorder.subscribe(e=>{
  if(e.type==="state"){
   latest="started" in e?e:null;result=null;recorded=null;
   const next=latest?.map_id==null?null:`${e.run}:${latest.map_id.join("/")}`;
   if(next!==null&&next!==visit){visit=next;sent=false;}
  }
  if(e.type==="assistant"&&e.stop_reason!=="error"&&e.stop_reason!=="aborted"&&e.tool_calls.length>0){result=null;recorded=null;}
  if(e.type==="tool_result"){result=latest!==null&&e.run===latest.run&&e.state_seq===latest.seq&&!e.is_error?e:null;recorded=null;}
  if(e.type==="ledger_context"&&result!==null&&e.evidence.includes(result.seq)&&isTownCenterText(e.text)){recorded=e.text;sent=true;}
 },false,true,true);
 const notice=async(messages:AgentMessage[]):Promise<string|null>=>{
  const state=latest,current=result;
  if(state===null||current===null||sent&&recorded===null)return null;
  let delivered:AgentMessage|undefined;
  for(const m of [...messages].reverse()){if(m.role==="assistant"&&m.stopReason!=="error"&&m.stopReason!=="aborted"&&m.content.some(p=>p.type==="toolCall"))break;if(m.role==="toolResult"){delivered=m;break;}}
  if(delivered?.role!=="toolResult"||delivered.isError||delivered.toolCallId!==current.id||delivered.toolName!==current.name)return null;
  const text=delivered.content.filter(p=>p.type==="text").map(p=>p.text).join("\n");
  if(text!==current.text)return null;
  const places=await table();
  if(places===null||latest!==state||result!==current)return null;
  const facts=townCenterFacts(state,places,text);
  if(facts===null)return null;
  const note=townCenterText(facts);
  if(recorded!==null&&recorded!==note)return null;
  if(recorded===null){recorded=note;sent=true;recorder.recordLedgerContext({text:note,evidence:[state.seq,current.seq]});}
  return note;
 };
 return async messages=>{
  // Ordinary ledger receipts belong to the upcoming decision, before the recorder advances it.
  const note=await notice(messages),out=await base(messages);
  return note===null?out:[...out,{role:"user",content:note,timestamp:Date.now()}];
 };
}
