// people-ledger-v1: right under the readout's Location/Position lines, every object the game has
// loaded on the current map with when the model last talked to it (turns and story milestones
// since), and the story characters character-presence-v1 names. Facts only, from recorded events.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";
import {COUNTER} from "./tile-rules.js";

type Snapshot=Pick<GameStateSnapshot,"map_id"|"position"|"facing"|"interaction_targets"|"navigation_grid">;
export interface MapObject {readonly key:string;readonly local_id:number;readonly sprite:string|null;readonly x:number;readonly y:number;readonly elevation:number}
interface Talk {readonly turn:number;readonly seq:number}

export const PEOPLE_HEADER="People and objects here (every object the game has loaded on this map; a sprite kind is a graphic, not a name):";
const STEP:Readonly<Record<string,readonly[number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const PRESENCE=/^Story characters here \(from this map's own object list\): (.+?)\. Not on this map: (.+?)\. Sprite kinds such as /m;

// The map's object targets: the game server reads all 16 object event slots of this map that have a
// script (env/pokebench_env/world.py read_targets), with live position and current elevation.
export function mapObjects(s:Snapshot):MapObject[]|null {
 if(s.map_id===null||s.interaction_targets==null)return null;
 const map=s.map_id.join("/");
 return s.interaction_targets.flatMap(t=>t.kind==="object"&&t.local_id!==null?[{key:`${map}#${String(t.local_id)}`,local_id:t.local_id,sprite:t.name??null,x:t.x,y:t.y,elevation:t.elevation}]:[]);
}

// The object an A press talks to, as pokeemerald 731ad5bf GetInteractedObjectEventScript picks it:
// the object on the faced tile, else, when that tile is a counter, the one beyond it; an object
// matches only at the player's elevation, unless either elevation is 0 (ELEVATION_TRANSITION).
export function facedObject(s:Snapshot):MapObject|null {
 const step=s.facing===null?undefined:STEP[s.facing.toLowerCase()];
 const objects=mapObjects(s);
 if(s.position===null||step===undefined||objects===null)return null;
 const {x:px,y:py}=s.position;
 const grid=s.navigation_grid;
 const standing=grid?.tiles.find(t=>t.x===px&&t.y===py)?.elevation;
 const elevation=grid==null?null:standing===0?0:grid.elevation;
 const level=(o:MapObject)=>elevation===null||elevation===0||o.elevation===0||o.elevation===elevation;
 const at=(x:number,y:number)=>objects.find(o=>o.x===x&&o.y===y&&level(o))??null;
 const x=px+step[0],y=py+step[1];
 const adjacent=at(x,y);
 if(adjacent!==null)return adjacent;
 const counter=grid?.tiles.some(t=>t.x===x&&t.y===y&&t.behavior===COUNTER)===true;
 return counter?at(x+step[0],y+step[1]):null;
}

interface Presence {readonly here:readonly string[];readonly absent:string;readonly placed:ReadonlyMap<string,string>}
// character-presence-v1's own line: who it places here (with live positions) and who is not on this map.
// ", "-separated entries, keeping commas inside parentheses with their entry.
function entries(text:string):string[] {
 const out:string[]=[];let depth=0,start=0;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==="(")depth++;else if(c===")")depth=Math.max(0,depth-1);
  else if(depth===0&&c===","&&text[i+1]===" "){out.push(text.slice(start,i));start=i+2;i++;}
 }
 out.push(text.slice(start));
 return out;
}
function presence(readout:string):Presence|null {
 const match=PRESENCE.exec(readout);
 if(match===null)return null;
 const [,hereText="",absent=""]=match;
 const here=hereText==="none"?[]:entries(hereText);
 const placed=new Map<string,string>();
 // A live position, or (offscreen-objects-v1) a loaded object's tile outside the view window.
 // A template tile ("it may have moved") is not where the object stands, so it names no one.
 for(const item of here){const at=/^(.+?) at (-?\d+),(-?\d+)(?: \(out of view\))?$/.exec(item);if(at!==null)placed.set(`${at[2] ?? ""},${at[3] ?? ""}`,at[1] ?? "");}
 return {here,absent,placed};
}

const plural=(n:number,word:string)=>`${String(n)} ${word}${n===1?"":"s"}`;

export class PeopleLedger {
 private turn=0;
 // The key of the object each recorded state shows the player facing; pages cite their state by seq.
 private readonly faced=new Map<number,string>();
 private readonly talks=new Map<string,Talk>();
 private readonly pending=new Map<string,{readonly key:string;readonly talk:Talk}>();
 private readonly story:number[]=[];
 observe(event:RunEvent):void {
  this.turn=Math.max(this.turn,event.turn);
  if(event.type==="state"&&"started" in event){const object=facedObject(event);if(object!==null)this.faced.set(event.seq,object.key);return;}
  if(event.type==="milestone"){if(event.kind==="story")this.story.push(event.seq);return;}
  if(event.type==="dialogue_auto_advance"){
   // battle-text-auto-advance-v1 battle pages are no one's conversation; the first field page is.
   const first=event.pages.find(page=>page.battle_message_id===undefined);
   const key=first?.state_seq==null?undefined:this.faced.get(first.state_seq);
   const pressed=event.tool==="press"&&event.sent.at(-1)==="A";
   if(key!==undefined&&(pressed||first?.speaker_source==="faced_sprite"))this.pending.set(event.tool_call_id,{key,talk:{turn:event.turn,seq:event.seq}});
   return;
  }
  if(event.type!=="tool_result")return;
  const talk=this.pending.get(event.id);this.pending.delete(event.id);
  if(talk!==undefined&&!event.is_error)this.talks.set(talk.key,talk.talk);
 }
 private last(key:string,callId:string):Talk|undefined {
  const current=this.pending.get(callId);
  return current?.key===key?current.talk:this.talks.get(key);
 }
 private since(talk:Talk):string {
  const turns=this.turn-talk.turn,milestones=this.story.filter(seq=>seq>talk.seq).length;
  return `last talked to on turn ${String(talk.turn)} (${turns===0?"this turn":`${plural(turns,"turn")} ago`}; ${plural(milestones,"story milestone")} since)`;
 }
 // The block for this observation, or null outside a started overworld readout with live objects.
 block(state:GameStateSnapshot,readout:string,callId:string):string|null {
  const objects=mapObjects(state);
  if(!state.started||state.screen!=="overworld"||state.in_battle||objects===null)return null;
  const characters=presence(readout);
  const lines=objects.map(o=>{
   const sprite=o.sprite??"unknown";
   const name=characters?.placed.get(`${String(o.x)},${String(o.y)}`);
   const talk=this.last(o.key,callId);
   return `- object ${String(o.local_id)}, ${name===undefined?`sprite ${sprite}`:`${name} (sprite ${sprite})`}, at (${String(o.x)},${String(o.y)}): ${talk===undefined?"not talked to this run":this.since(talk)}`;
  });
  const out=lines.length===0?[`${PEOPLE_HEADER} none`]:[PEOPLE_HEADER,...lines];
  if(characters!==null)out.push(`Story characters here: ${characters.here.length===0?"none":characters.here.join(", ")}. Not on this map: ${characters.absent}.`);
  return out.join("\n");
 }
 // The readout with the block inserted after its Position line (or Location line when position is off).
 annotate(text:string,state:GameStateSnapshot,callId:string):string {
  const anchor=/^Location: .*$(?:\nPosition: .*$)?/m.exec(text);
  if(anchor===null)return text;
  const block=this.block(state,text,callId);
  if(block===null)return text;
  const end=anchor.index+anchor[0].length;
  return `${text.slice(0,end)}\n${block}${text.slice(end)}`;
 }
}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export function withPeopleLedger(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):AgentTool[] {
 if(!features["people-ledger-v1"])return [...tools];
 const ledger=new PeopleLedger();recorder.subscribe(event=>{ledger.observe(event);});
 const annotate=<T>(id:string,result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  // The readout is the last text part that carries a Location line.
  const index=result.content.findLastIndex(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const content=[...result.content];content[index]={...part,text:ledger.annotate(part.text,state,id)};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to")return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(id,await tool.execute(id,params,signal,update)),executeChecked:async(id,params,check,signal,update)=>annotate(id,await tool.executeChecked(id,params,check,signal,update))};
  return checked;
 });
}
