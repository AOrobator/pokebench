// blocked-exit-fact-v1: when the run has seen a coordinate trigger on (or next to) an exit turn the player
// back, and that trigger's condition still matches in the result's own RAM, say so plainly, with the map's
// other exits. Names no flag, story step or destination advice.
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";

type Snapshot=Pick<GameStateSnapshot,"started"|"screen"|"in_battle"|"map_id"|"position"|"field_controls_locked"|"world_context"|"interaction_targets"|"topology">;
type Trigger=NonNullable<NonNullable<Snapshot["world_context"]>["triggers"]>[number];
type Tile={readonly x:number;readonly y:number};
interface Exit {readonly key:string;readonly label:(names:ReadonlyMap<string,string>)=>string;readonly tiles:readonly Tile[]}
interface Call {readonly name:string;readonly args:Record<string,unknown>;before:Snapshot|null;script:boolean;offMap:boolean}
interface Refusal {readonly map:string;readonly trigger:Tile;readonly id:string;readonly exit:string;turn:number}

const STEP:Readonly<Record<string,readonly[number,number]>>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
const at=(t:Tile):string=>`(${String(t.x)},${String(t.y)})`;
const same=(a:Tile,b:Tile):boolean=>a.x===b.x&&a.y===b.y;
const near=(a:Tile,b:Tile):boolean=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=1;
const mapOf=(s:Snapshot):string=>s.map_id===null?"":s.map_id.join("/");
const field=(s:Snapshot):boolean=>s.started&&!s.in_battle&&s.screen==="overworld"&&s.map_id!==null&&s.position!==null;
// VarGet returns an id below VARS_START (0x4000) itself, so such a trigger's condition is a constant, not
// saved game state (pokeemerald src/field_control_avatar.c TryRunCoordEventScript, src/event_data.c VarGet).
const readable=(t:Trigger):boolean=>t.variable>=0x4000&&t.current_value!==null&&t.condition_met===true;
// One coordinate event: a tile can hold several (Littleroot (11,1) has one for town state 0 and one for 1).
const identity=(t:Trigger):string=>`${at(t)}|${String(t.variable)}=${String(t.required_value)}|${String(t.script_pointer)}`;
const scripted=(s:Snapshot):boolean=>s.field_controls_locked===true||s.world_context?.dialogue!=null||s.world_context?.message!=null;
// The readout's own warp names: "Warp destination at (5,7): OLDALE TOWN HOUSE1".
function readoutNames(text:string):Map<string,string>{
 const names=new Map<string,string>();
 for(const m of text.matchAll(/^Warp destination at \((\d+),(\d+)\): (.+)$/gm))names.set(`${m[1]??""},${m[2]??""}`,m[3]??"");
 return names;
}

export class BlockedExits {
 private readonly calls=new Map<string,Call>();
 private readonly states=new Map<number,Snapshot>();
 private readonly refused=new Map<string,Refusal>();
 // The latest recorded turn: a refusal is dated by the call it happened in.
 private turn=0;
 // An exit trigger the player stood on when a call ended inside its script.
 private pending:{readonly trigger:Trigger;readonly map:string}|null=null;
 constructor(private readonly features:FeatureSet){}

 begin(id:string,name:string,args:unknown):void {
  this.calls.set(id,{name,args:typeof args==="object"&&args!==null?Object.fromEntries(Object.entries(args)):{},before:null,script:false,offMap:false});
  if(this.calls.size>16)this.calls.delete(this.calls.keys().next().value??"");
 }

 observe(event:RunEvent):void {
  this.turn=Math.max(this.turn,event.turn);
  if(event.type==="state"&&"started" in event){
   this.states.set(event.seq,event);if(this.states.size>64)this.states.delete(this.states.keys().next().value??-1);
   for(const call of this.calls.values()){
    if(call.before===null)continue;
    if(scripted(event))call.script=true;
    if(event.started&&event.map_id!==null&&mapOf(event)!==mapOf(call.before))call.offMap=true;
   }
   return;
  }
  if(event.type==="button_press"){
   const call=this.calls.get(event.tool_call_id),before=event.before_state_seq===undefined?undefined:this.states.get(event.before_state_seq);
   if(call!==undefined&&call.before===null&&before!==undefined)call.before=before;
   return;
  }
  if(event.type==="dialogue_auto_advance"){
   const call=this.calls.get(event.tool_call_id);
   if(call!==undefined&&event.pages.length>0)call.script=true;
  }
 }

 // The call's result, with its own state and readout text: record a refusal it shows, then the line.
 settle(id:string,after:Snapshot|undefined,text:string):string|null {
  const call=this.calls.get(id);this.calls.delete(id);
  if(after===undefined||!field(after))return null;
  if(call!==undefined)this.refusal(call,after);
  return this.line(after,text);
 }

 private refusal(call:Call,after:Snapshot):void {
  const before=call.before,q=after.position;
  // A call that pressed nothing (observe, a refused navigate_to) leaves a pending try as it was.
  if(before===null)return;
  if(!field(before)||before.position===null||q===null||call.offMap||mapOf(before)!==mapOf(after)){this.pending=null;return;}
  const exitTriggers=(s:Snapshot)=>(s.world_context?.triggers??[]).filter(t=>readable(t)&&this.exitAt(after,t)!==null);
  // The call ended standing on an exit trigger with its script still running: that script is the one the
  // next call may finish (it began when the player stepped on), and no other trigger is blamed.
  const standing=scripted(after)?exitTriggers(after).find(t=>same(q,t)):undefined;
  if(standing!==undefined){this.pending={trigger:standing,map:mapOf(after)};return;}
  if(scripted(before)){
   // A call inside a running script finishes the try a previous call started on the trigger.
   const pending=this.pending;
   if(pending!==null&&pending.map===mapOf(after)&&!same(q,pending.trigger))this.record(after,pending.trigger);
   if(!scripted(after))this.pending=null;
   return;
  }
  this.pending=null;
  // From free controls: the script ran during this call, aimed at the trigger, and the player ended off it.
  if(!call.script)return;
  const seen=new Map([...exitTriggers(before),...exitTriggers(after)].map(t=>[identity(t),t]));
  for(const t of seen.values()){
   const exit=this.exitAt(after,t);
   if(exit!==null&&!same(q,t)&&this.aimed(call,before.position,t,exit))this.record(after,t);
  }
 }
 private record(after:Snapshot,t:Trigger):void {
  const exit=this.exitAt(after,t);
  if(exit===null)return;
  const key=`${mapOf(after)}|${identity(t)}`;
  const known=this.refused.get(key);
  if(known!==undefined)known.turn=this.turn;else this.refused.set(key,{map:mapOf(after),trigger:{x:t.x,y:t.y},id:identity(t),exit:exit.key,turn:this.turn});
 }

 // Standing on the trigger, a direction-only press whose first direction faces it, or navigate_to aimed at it or its exit tiles.
 private aimed(call:Call,from:Tile,t:Tile,exit:Exit):boolean {
  if(same(from,t))return true;
  if(call.name==="navigate_to"){
   const x=call.args["x"],y=call.args["y"];
   return typeof x==="number"&&typeof y==="number"&&(same({x,y},t)||exit.tiles.some(e=>same(e,{x,y})));
  }
  // Direction presses only: with A or B in the batch the script that ran may be a conversation (review round 1).
  const buttons=call.args["buttons"];
  if(!Array.isArray(buttons)||buttons.length===0||!buttons.every(b=>typeof b==="string"&&b in STEP))return false;
  const step=STEP[String(buttons[0])];
  return step!==undefined&&from.x+step[0]===t.x&&from.y+step[1]===t.y;
 }

 // The map's exits: each connection's walk-off edge tiles, and each warp; shown per the run's switches.
 private exits(s:Snapshot):Exit[] {
  const connections=this.features["world-destinations-v1"]?(s.topology?.connections??[]).flatMap(c=>c.edges===undefined?[]:[{key:`edge:${c.direction}`,label:()=>`${c.direction} -> ${c.destination_name} (map ${c.destination.join("/")})`,tiles:c.edges}]):[];
  const warps=this.features["world-targets-v1"]?(s.interaction_targets??[]).flatMap(w=>w.kind!=="warp"||w.destination==null?[]:[{key:`warp:${at(w)}`,label:(names:ReadonlyMap<string,string>)=>{const name=names.get(`${String(w.x)},${String(w.y)}`),map=`map ${String(w.destination?.[0])}/${String(w.destination?.[1])}`;return `${at(w)} -> ${name===undefined?map:`${name} (${map})`}`;},tiles:[{x:w.x,y:w.y}]}]):[];
  return [...connections,...warps];
 }
 // The exit whose tile the trigger is on, else one next to it.
 private exitAt(s:Snapshot,t:Tile):Exit|null {
  const all=this.exits(s);
  return all.find(e=>e.tiles.some(x=>same(x,t)))??all.find(e=>e.tiles.some(x=>near(x,t)))??null;
 }

 private line(after:Snapshot,text:string):string|null {
  const p=after.position;
  if(p===null)return null;
  const map=mapOf(after);
  const live=new Set((after.world_context?.triggers??[]).filter(readable).map(identity));
  const blocked=[...this.refused.values()].filter(r=>r.map===map&&live.has(r.id));
  const here=blocked.find(r=>near(p,r.trigger));
  if(here===undefined)return null;
  const names=readoutNames(text);
  const exits=this.exits(after);
  const exit=exits.find(e=>e.key===here.exit);
  if(exit===undefined)return null;
  const closed=new Set(blocked.map(r=>r.exit));
  const others=exits.filter(e=>!closed.has(e.key)).map(e=>e.label(names));
  return `Blocked exit: ${exit.label(names)}. When you last tried it, at turn ${String(here.turn)}, the game ran a script at ${at(here.trigger)} and kept you on this map. This exit is blocked by a script that runs while a value the game saves still has the setting that script checks for; it has that setting now, so this exit stays blocked for now. Other exits from this map: ${others.length===0?"none listed":others.join("; ")}.`;
 }
}
