import type {BodyOf,RunEvent} from "./events.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {facedObject,mapObjects,storyCharacters} from "./people-ledger.js";

// story-character-stall-gate-v1: a stall briefing waits while a named story character on this map has not been
// talked to since the latest story milestone, or while the player's latest step on this map went toward one.
type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Body=Omit<BodyOf<"stall_gate">,"type"|"turn">;
export interface StallGateRecorder {recordStallGate(body:Body):void}
export interface Hold {readonly reason:"untalked"|"closer";readonly character:string;readonly map_id:readonly [number,number]}
interface Here {readonly map:string;readonly mapId:readonly [number,number];readonly characters:readonly {readonly name:string;readonly key:string|null;readonly tile:{readonly x:number;readonly y:number}|null;readonly text:string}[]}

const GAME_TOOLS=new Set(["observe","press","navigate_to"]);
const mapOf=(id:readonly number[]):string=>id.join("/");
const distance=(a:{x:number;y:number},b:{x:number;y:number}):number=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

export class StoryCharacterGate {
 private readonly states=new Map<number,State>();
 private readonly faced=new Map<number,string>();
 private readonly talked=new Set<string>();
 private readonly spoke=new Set<string>();
 private readonly pending=new Map<string,{readonly key:string|null;readonly speakers:readonly string[]}>();
 private here:Here|null=null;
 private position:{readonly map:string;readonly x:number;readonly y:number}|null=null;
 private previous:{readonly map:string;readonly x:number;readonly y:number}|null=null;
 private readonly reported=new Set<string>();
 constructor(private readonly recorder:StallGateRecorder){}

 observe(event:RunEvent):void {
  if(event.type==="milestone"){
   if(event.kind!=="story"||event.origin==="present_at_start"||MEASUREMENT_ONLY_MILESTONES.has(event.name))return;
   this.talked.clear();this.spoke.clear();
   return;
  }
  if(event.type==="state"&&"started"in event){
   this.states.set(event.seq,event);
   if(this.states.size>64)this.states.delete(this.states.keys().next().value??-1);
   const object=facedObject(event);if(object!==null)this.faced.set(event.seq,object.key);
   if(this.faced.size>64)this.faced.delete(this.faced.keys().next().value??-1);
   const p=event.position;
   if(!event.started||event.screen!=="overworld"||event.in_battle||event.map_id===null||p===null)return;
   const map=mapOf(event.map_id);
   if(this.position!==null&&(this.position.map!==map||this.position.x!==p.x||this.position.y!==p.y))this.previous=this.position.map===map?this.position:null;
   this.position={map,x:p.x,y:p.y};
   return;
  }
  // The people ledger's rule: the first field page's state faced that object, after an A press or attributed to the faced sprite.
  if(event.type==="dialogue_auto_advance"){
   const pages=event.pages.filter(page=>page.battle_message_id===undefined&&page.battle_turn===undefined);
   const first=pages[0];
   const key=first?.state_seq==null?undefined:this.faced.get(first.state_seq);
   const pressed=event.tool==="press"&&event.sent.at(-1)==="A";
   const speakers=pages.flatMap(page=>page.speaker===null?[]:[page.speaker]);
   this.pending.set(event.tool_call_id,{key:key!==undefined&&(pressed||first?.speaker_source==="faced_sprite")?key:null,speakers});
   return;
  }
  if(event.type!=="tool_result")return;
  const talk=this.pending.get(event.id);this.pending.delete(event.id);
  if(talk!==undefined&&!event.is_error){if(talk.key!==null)this.talked.add(talk.key);for(const name of talk.speakers)this.spoke.add(name);}
  if(event.is_error||!GAME_TOOLS.has(event.name))return;
  const state=event.state_seq===undefined?undefined:this.states.get(event.state_seq);
  if(state===undefined||state.map_id===null)return;
  // A result without the line (a battle) keeps the last one; leaving the map ends it.
  const characters=storyCharacters(event.text);
  if(characters===null)return;
  const objects=mapObjects(state)??[];
  this.here={map:mapOf(state.map_id),mapId:[state.map_id[0],state.map_id[1]],characters:characters.map(c=>{
   const object=c.tile===null?undefined:objects.find(o=>o.x===c.tile?.x&&o.y===c.tile.y);
   return {name:c.name,key:object?.key??null,tile:c.tile,text:c.text};
  })};
 }

 // The story characters on the player's map not talked to since the latest story milestone, in the readout's own words.
 untalked():string[] {
  const here=this.here,now=this.position;
  if(here===null||now===null||now.map!==here.map)return [];
  return here.characters.filter(c=>!this.spoke.has(c.name)&&(c.key===null||!this.talked.has(c.key))).map(c=>c.text);
 }

 holds():Hold|null {
  const here=this.here,now=this.position;
  if(here===null||now===null||now.map!==here.map)return null;
  for(const c of here.characters)if(!this.spoke.has(c.name)&&(c.key===null||!this.talked.has(c.key)))return {reason:"untalked",character:c.name,map_id:here.mapId};
  const before=this.previous;
  if(before===null||before.map!==now.map)return null;
  for(const c of here.characters)if(c.tile!==null&&distance(now,c.tile)<distance(before,c.tile))return {reason:"closer",character:c.name,map_id:here.mapId};
  return null;
 }

 // Recorded once for each briefing it holds back.
 held(kind:"map_cycle"|"milestone_drought",level:number,id:string,hold:Hold):void {
  const key=`${kind}\n${id}\n${String(level)}`;
  if(this.reported.has(key))return;
  this.reported.add(key);
  this.recorder.recordStallGate({kind,level,reason:hold.reason,character:hold.character,map_id:[hold.map_id[0],hold.map_id[1]]});
 }
}
