import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {roomKey,roomOf,speakerLabel} from "./dialogue-log.js";
import type {BodyOf,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

// disproved-beliefs-v1: what the model pursued that the game already contradicted, with the game's own evidence.
// Both sides come from the recorded run: tool arguments, positions, dialogue pages, readout lines and the model's
// own sentence. Entries leave when the game state changes so that they may no longer hold. Nothing is clipped.

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Page=Advance["pages"][number];
interface Point {readonly x:number;readonly y:number}
interface Shown {readonly turn:number;readonly seq:number;readonly text:string}
interface Conversation {readonly turn:number;readonly seq:number;readonly pages:readonly Page[]}
interface Base {readonly key:string;readonly map:string;readonly room:string;readonly story:string|null;readonly order:number;readonly turns:number[];readonly seqs:number[]}
interface PushBack extends Base {readonly kind:"push_back";readonly from:Point;readonly to:Point;readonly direction:string;action:string;conversation:Conversation}
interface Absent extends Base {readonly kind:"absent";readonly name:string;claim:Shown;readout:Readout;conversation:Conversation|null}
type Entry=PushBack|Absent;
interface Readout {readonly turn:number;readonly seq:number;readonly map:string;readonly room:string;readonly absent:readonly string[];readonly line:string}

const GAME_TOOLS=new Set(["observe","press","navigate_to"]);
const STEP:Readonly<Record<string,Point>>={UP:{x:0,y:-1},DOWN:{x:0,y:1},LEFT:{x:-1,y:0},RIGHT:{x:1,y:0}};
const CHARACTERS=/^Story characters here \(from this map's own object list\): .*\. Not on this map: (.*?)\. Sprite kinds .*$/m;
// A sentence that negates or hedges anywhere is not a claim the model is acting on.
const NEGATION=/\b(?:not|cannot|never|no longer|away|might|maybe|perhaps|probably|possibly|likely|if|whether|unsure|unclear|can|could|would|should)\b|n't|\?|^\s*(?:is|are|was|were|where|does|do|did|will)\b/i;
// "may" is a hedge only in lower case: May and MAY are the rival's name.
const MODAL=/\bmay\b/;
const at=(p:Point):string=>`(${String(p.x)},${String(p.y)})`;
const same=(a:Point,b:Point):boolean=>a.x===b.x&&a.y===b.y;
const distance=(a:Point,b:Point):number=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const storyKey=(state:State):string|null=>state.story==null?null:JSON.stringify(state.story);
const quotePages=(c:Conversation):string=>c.pages.map(p=>{const s=speakerLabel(p);return `${s===null?"":`${s}: `}"${p.text}"`;}).join(" | ");

// A story character's readout name as the model may write it: each word in the readout's spelling or in title case
// (MAY or May, never the word "may"), the game's "PROF." also as "Prof." or "Professor"; never inside a longer word or
// symbol (RIVAL_MAY_NORMAL), never possessive (Birch's lab).
const title=(word:string):string=>`${word.charAt(0)}${word.slice(1).toLowerCase()}`;
export function nameMatcher(name:string):RegExp {
 const words=name.split(" ").map(word=>{
  if(word==="PROF.")return "(?:PROF\\.?|Prof\\.?|PROFESSOR|Professor)";
  const escape=(w:string)=>w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return title(word)===word?escape(word):`(?:${escape(word)}|${escape(title(word))})`;
 });
 return new RegExp(`(?<![A-Za-z0-9_])${words.join(" ")}(?![A-Za-z0-9_'’])`,"g");
}

// The model's sentences that place `name` on a tile, as a plain assertion: the sentence opens with the name (or "The"
// and the name) as its subject, the verb is is/stands/sits/waits/was (an appositive between commas may come first),
// then "at (x,y)", and nothing in the sentence negates, hedges or asks. Returns each whole sentence.
export function locatingClaims(text:string,name:string):string[] {
 const claims:string[]=[];
 // Where each sentence ends: after . ! or ? followed by a space (not the "." of "Prof."), or before a line break.
 const ends=[...text.matchAll(/(?<!\bprof)[.!?](?=\s|$)|\n/gi)].map(m=>m[0]==="\n"?m.index:m.index+1);
 for(const match of text.matchAll(nameMatcher(name))){
  const start=match.index,after=start+match[0].length;
  const opened=text.lastIndexOf("(",start),closed=text.lastIndexOf(")",start);
  if(opened>closed&&!text.slice(opened,start).includes("\n"))continue;
  const sentenceStart=Math.max(0,...ends.filter(e=>e<=start));
  const sentenceEnd=ends.find(e=>e>after)??text.length;
  const rest=text.slice(after,sentenceEnd);
  const coordinate=/\bat \(\s*-?\d+\s*,\s*-?\d+\s*\)/.exec(rest);
  const sentence=text.slice(sentenceStart,sentenceEnd).trim();
  if(!/^(?:the)?$/i.test(text.slice(sentenceStart,start).trim()))continue;
  if(coordinate===null||!/^(?:,[^,]*,)?\s*(?:is|stands|sits|waits|was)\b/.test(rest.slice(0,coordinate.index)))continue;
  if(NEGATION.test(sentence)||MODAL.test(sentence))continue;
  if(!claims.includes(sentence))claims.push(sentence);
 }
 return claims;
}

export class DisprovedBeliefs {
 private readonly states=new Map<number,State>();
 private readonly calls=new Map<string,{name:string;args:Record<string,unknown>;before:State|null;pressed:boolean;seq:number;last:string|null}>();
 private readonly pages=new Map<string,Advance>();
 private readonly entries=new Map<string,Entry>();
 // The latest conversation shown on each map, by map key, for evidence that names a character.
 private readonly conversations=new Map<string,Conversation[]>();
 private readout:Readout|null=null;
 private story:string|null=null;
 private order=0;
 constructor(private readonly features:FeatureSet){}

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started"in event){
   this.states.set(event.seq,event);
   if(this.states.size>64)this.states.delete(this.states.keys().next().value??-1);
   return;
  }
  if(event.type==="tool_call"&&(event.name==="press"||event.name==="navigate_to")){
   this.calls.set(event.id,{name:event.name,args:event.args,before:null,pressed:false,seq:event.seq,last:null});
   if(this.calls.size>16)this.calls.delete(this.calls.keys().next().value??"");
   return;
  }
  if(event.type==="button_press"){
   const call=this.calls.get(event.tool_call_id);
   if(call!==undefined&&!call.pressed){call.pressed=true;call.before=event.before_state_seq===undefined?null:this.states.get(event.before_state_seq)??null;}
   // The latest direction the harness sent for this call (auto-advance presses are A or B).
   const step=[...event.buttons].reverse().find(b=>STEP[b]!==undefined);
   if(call!==undefined&&step!==undefined)call.last=step;
   return;
  }
  if(event.type==="dialogue_auto_advance"){
   this.pages.set(event.tool_call_id,event);
   if(this.pages.size>16)this.pages.delete(this.pages.keys().next().value??"");
   return;
  }
  if(event.type==="assistant"){this.claims(event.turn,event.seq,[event.thinking,event.text].filter(t=>t!=="").join("\n"));return;}
  if(event.type==="tool_result")this.result(event);
 }

 private result(event:Extract<RunEvent,{type:"tool_result"}>):void {
  const call=this.calls.get(event.id);this.calls.delete(event.id);
  const advance=this.pages.get(event.id);this.pages.delete(event.id);
  if(event.is_error||!GAME_TOOLS.has(event.name)||event.state_seq===undefined)return;
  const state=this.states.get(event.state_seq);
  if(state===undefined||!state.started)return;
  this.restory(state);
  const map=roomKey(state);
  if(advance!==undefined&&advance.pages.length>0)this.remember(advance);
  const presence=CHARACTERS.exec(event.text);
  if(presence!==null){
   const absent=(presence[1]??"").split(",").map(n=>n.trim()).filter(n=>n!==""&&n!=="none");
   this.readout={turn:event.turn,seq:event.seq,map,room:roomOf(state,this.features),absent,line:presence[0]};
   for(const entry of this.entries.values())if(entry.kind==="absent"&&entry.map===map&&!absent.includes(entry.name))this.entries.delete(entry.key);
  } else if(this.readout?.map!==map)this.readout=null;
  if(state.position!==null)for(const entry of this.entries.values())if(entry.kind==="push_back"&&entry.map===map&&same(state.position,{x:entry.from.x+(STEP[entry.direction]?.x??0),y:entry.from.y+(STEP[entry.direction]?.y??0)}))this.entries.delete(entry.key);
  if(call!==undefined&&advance!==undefined)this.pushBack(event,call,advance,state);
  for(const entry of this.entries.values())if(entry.kind==="absent"&&entry.conversation===null)entry.conversation=this.naming(entry.map,entry.name);
 }

 // A story flag changed: every entry recorded under the old story may no longer hold.
 private restory(state:State):void {
  const story=storyKey(state);
  if(story===null)return;
  if(this.story!==null&&story!==this.story){
   for(const entry of this.entries.values())if(entry.story!==story)this.entries.delete(entry.key);
   // Dialogue shown under the old story is not evidence for an entry made under the new one.
   this.conversations.clear();
  }
  this.story=story;
 }

 private remember(advance:Advance):void {
  const byMap=new Map<string,Page[]>();
  for(const page of advance.pages){const key=roomKey({location:page.map,map_id:page.map_id});byMap.set(key,[...(byMap.get(key)??[]),page]);}
  for(const [key,pages] of byMap){
   const list=this.conversations.get(key)??[];
   list.push({turn:advance.turn,seq:advance.seq,pages});
   if(list.length>16)list.shift();
   this.conversations.set(key,list);
  }
 }

 private naming(map:string,name:string):Conversation|null {
  const matcher=nameMatcher(name);
  return [...(this.conversations.get(map)??[])].reverse().find(c=>c.pages.some(p=>{matcher.lastIndex=0;return matcher.test(p.text);}))??null;
 }

 // A script showed dialogue that began with the player on tile Q, and the call ended one tile away on the same map,
 // back against the way the model was going. While a message is open the harness presses only A or B, so the move
 // is the game's.
 private pushBack(event:Extract<RunEvent,{type:"tool_result"}>,call:{name:string;args:Record<string,unknown>;before:State|null;seq:number;last:string|null},advance:Advance,state:State):void {
  const first=advance.pages[0];
  if(first===undefined||first.position===null||first.map_id===null||state.position===null||state.map_id===null)return;
  if(first.map_id.join("/")!==state.map_id.join("/"))return;
  const from:Point=first.position,to:Point=state.position;
  if(distance(from,to)!==1)return;
  const direction=Object.keys(STEP).find(d=>{const s=STEP[d];return s!==undefined&&s.x===from.x-to.x&&s.y===from.y-to.y;});
  if(direction===undefined)return;
  let action:string;
  if(call.name==="press"){
   const buttons=Array.isArray(call.args["buttons"])?call.args["buttons"].map(String):[];
   // Bound to the first direction the harness actually sent (requested inputs after a message opened are dropped),
   // taken from where the call began: either the script met that first step on the starting tile, or the first step
   // landed on the tile where the script began.
   const first=advance.sent.find(b=>STEP[b]!==undefined);
   const start=call.before?.position??null,step=STEP[direction];
   if(first!==direction||step===undefined||start===null||call.before?.map_id?.join("/")!==state.map_id.join("/"))return;
   if(!same(start,from)&&!same({x:start.x+step.x,y:start.y+step.y},from))return;
   action=`press ${buttons.join(",")}`;
  } else {
   // Bound to the walk's last step before the script, which must be the direction the script pushed back.
   const start=call.before?.position??null;
   if(call.last!==direction||start===null||call.before?.map_id?.join("/")!==state.map_id.join("/")||distance(to,start)>=distance(from,start))return;
   action=`navigate_to (${String(call.args["x"])},${String(call.args["y"])})`;
  }
  const map=roomKey(state),key=`push|${map}|${at(from)}|${direction}`;
  const conversation={turn:advance.turn,seq:advance.seq,pages:advance.pages};
  const existing=this.entries.get(key);
  if(existing?.kind==="push_back"){existing.turns.push(event.turn);existing.seqs.push(call.seq,event.seq);existing.action=action;existing.conversation=conversation;return;}
  this.entries.set(key,{kind:"push_back",key,map,room:roomOf(state,this.features),story:storyKey(state),order:this.order++,turns:[event.turn],seqs:[call.seq,event.seq],from,to,direction,action,conversation});
 }

 private claims(turn:number,seq:number,text:string):void {
  const readout=this.readout;
  if(readout===null||text==="")return;
  for(const name of readout.absent){
   const claims=locatingClaims(text,name);
   const latest=claims.at(-1);
   if(latest===undefined)continue;
   const key=`absent|${readout.map}|${name}`;
   const claim={turn,seq,text:latest};
   const existing=this.entries.get(key);
   if(existing?.kind==="absent"){existing.turns.push(turn);existing.seqs.push(seq);existing.claim=claim;existing.readout=readout;existing.conversation=this.naming(readout.map,name)??existing.conversation;continue;}
   this.entries.set(key,{kind:"absent",key,map:readout.map,room:readout.room,story:this.story,order:this.order++,turns:[turn],seqs:[seq],name,claim,readout,conversation:this.naming(readout.map,name)});
  }
 }

 size():number {return this.entries.size;}

 evidence():number[] {
  const seqs=new Set<number>();
  for(const entry of this.entries.values()){
   for(const seq of entry.seqs)seqs.add(seq);
   if(entry.kind==="absent"){seqs.add(entry.readout.seq);if(entry.conversation!==null)seqs.add(entry.conversation.seq);}
   else seqs.add(entry.conversation.seq);
  }
  return [...seqs].sort((a,b)=>a-b);
 }

 text():string|null {
  if(this.entries.size===0)return null;
  const lines=[...this.entries.values()].sort((a,b)=>a.order-b.order).map(entry=>{
   const turns=entry.turns.map(String).join(", ");
   if(entry.kind==="push_back")return `- Moving ${entry.direction} from ${at(entry.from)} in ${entry.room}: you tried it ${String(entry.turns.length)} time${entry.turns.length===1?"":"s"}, at turn${entry.turns.length===1?"":"s"} ${turns} (latest: ${entry.action}). Each time a script moved you back to ${at(entry.to)}; the latest time (turn ${String(entry.conversation.turn)}) it showed: ${quotePages(entry.conversation)}`;
   const said=entry.conversation===null?"":` On that map at turn ${String(entry.conversation.turn)} you were shown: ${quotePages(entry.conversation)}`;
   return `- ${entry.name} on ${entry.room}: you wrote at turn ${String(entry.claim.turn)}: "${entry.claim.text}"${entry.turns.length>1?` (you placed ${entry.name} on this map at turns ${turns})`:""}. The readout on that map said at turn ${String(entry.readout.turn)}: "${entry.readout.line}"${said}`;
  });
  return `Things the game has contradicted (from this run's own readouts and dialogue; an entry is dropped when a story flag changes or the game shows otherwise):\n${lines.join("\n")}`;
 }
}

type BeliefRecorder=Pick<RunRecorder,"subscribe"|"recordBeliefLedger">;
export function disprovedBeliefs(features:FeatureSet,recorder:BeliefRecorder,transform:(messages:AgentMessage[])=>Promise<AgentMessage[]>):{transformContext:(messages:AgentMessage[])=>Promise<AgentMessage[]>}|null {
 if(!features["disproved-beliefs-v1"])return null;
 const ledger=new DisprovedBeliefs(features);recorder.subscribe(event=>{ledger.observe(event);});
 return {transformContext:messages=>{
  const text=ledger.text();
  if(text===null)return transform(messages);
  const body:Omit<BodyOf<"belief_ledger">,"type"|"turn">={text,entries:ledger.size(),evidence:ledger.evidence()};recorder.recordBeliefLedger(body);
  return transform([...messages,{role:"user",content:text,timestamp:Date.now()}]);
 }};
}
