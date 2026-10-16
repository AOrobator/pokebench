// people-ledger-v1: right under the readout's Location/Position lines, every live object on the
// current map with when the model last talked to it (turns and story milestones since), and the
// story characters character-presence-v1 names. Facts only, derived from recorded events.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Facing=Pick<GameStateSnapshot,"position"|"facing"|"world_context"|"navigation_grid">;
type LiveObject=NonNullable<GameStateSnapshot["world_context"]>["objects"][number];
interface Talk {readonly turn:number;readonly seq:number}

export const PEOPLE_HEADER="People and objects here (this map's live objects; a sprite kind is a graphic, not a name):";
const STEP:Readonly<Record<string,readonly[number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
// pokeemerald 731ad5bf MB_COUNTER: GetInteractedObjectEventScript talks to the object beyond a counter.
const COUNTER=0x80;
const PRESENCE=/^Story characters here \(from this map's own object list\): (.+?)\. Not on this map: (.+?)\. Sprite kinds such as /m;

const keyOf=(o:Pick<LiveObject,"map_id"|"local_id">)=>`${o.map_id.join("/")}#${String(o.local_id)}`;

// The object an A press talks to: the one on the faced tile, else the one beyond a faced counter tile.
export function facedObject(s:Facing):LiveObject|null {
 const step=s.facing===null?undefined:STEP[s.facing.toLowerCase()];
 if(s.position===null||step===undefined)return null;
 const objects=s.world_context?.objects??[];
 const at=(x:number,y:number)=>objects.find(o=>o.x===x&&o.y===y)??null;
 const x=s.position.x+step[0],y=s.position.y+step[1];
 const adjacent=at(x,y);
 if(adjacent!==null)return adjacent;
 const counter=s.navigation_grid?.tiles.some(t=>t.x===x&&t.y===y&&t.behavior===COUNTER)===true;
 return counter?at(x+step[0],y+step[1]):null;
}

interface Presence {readonly here:readonly string[];readonly absent:string;readonly placed:ReadonlyMap<string,string>}
// character-presence-v1's own line: who it places here (with live positions) and who is not on this map.
function presence(readout:string):Presence|null {
 const match=PRESENCE.exec(readout);
 if(match===null)return null;
 const [,hereText="",absent=""]=match;
 const here=hereText==="none"?[]:hereText.split(", ");
 const placed=new Map<string,string>();
 for(const item of here){const at=/^(.+) at (-?\d+),(-?\d+)$/.exec(item);if(at!==null)placed.set(`${at[2] ?? ""},${at[3] ?? ""}`,at[1] ?? "");}
 return {here,absent,placed};
}

const plural=(n:number,word:string)=>`${String(n)} ${word}${n===1?"":"s"}`;

export class PeopleLedger {
 private turn=0;
 private readonly states=new Map<number,State>();
 private readonly talks=new Map<string,Talk>();
 private readonly pending=new Map<string,{readonly key:string;readonly talk:Talk}>();
 private readonly story:number[]=[];
 observe(event:RunEvent):void {
  this.turn=Math.max(this.turn,event.turn);
  if(event.type==="state"&&"started" in event){this.states.set(event.seq,event);return;}
  if(event.type==="milestone"){if(event.kind==="story")this.story.push(event.seq);return;}
  if(event.type==="dialogue_auto_advance"){
   const first=event.pages[0];
   const state=first?.state_seq==null?undefined:this.states.get(first.state_seq);
   const object=state===undefined?null:facedObject(state);
   const pressed=event.tool==="press"&&event.sent.at(-1)==="A";
   if(object!==null&&(pressed||first?.speaker_source==="faced_sprite"))this.pending.set(event.tool_call_id,{key:keyOf(object),talk:{turn:event.turn,seq:event.seq}});
   return;
  }
  if(event.type!=="tool_result")return;
  const talk=this.pending.get(event.id);this.pending.delete(event.id);
  if(talk!==undefined&&!event.is_error)this.talks.set(talk.key,talk.talk);
  // Pages cite states recorded during their own call.
  this.states.clear();
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
  const objects=state.world_context?.objects;
  if(!state.started||state.screen!=="overworld"||state.in_battle||state.map_id===null||objects==null)return null;
  const here=state.map_id.join("/");
  const characters=presence(readout);
  const lines=objects.map(o=>{
   const map=o.map_id.join("/")===here?"":` of map ${o.map_id.join("/")}`;
   const sprite=o.sprite_kind??"unknown";
   const name=characters?.placed.get(`${String(o.x)},${String(o.y)}`);
   const talk=this.last(keyOf(o),callId);
   return `- object ${String(o.local_id)}${map}, ${name===undefined?`sprite ${sprite}`:`${name} (sprite ${sprite})`}, at (${String(o.x)},${String(o.y)}): ${talk===undefined?"not talked to this run":this.since(talk)}`;
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
