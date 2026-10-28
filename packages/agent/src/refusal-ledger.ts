import {roomKey,roomOf} from "./dialogue-log.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Call {readonly seq:number;readonly name:string;readonly args:Record<string,unknown>}
type Result=Extract<RunEvent,{type:"tool_result"}>;
interface Target {readonly key:string;readonly label:string;readonly point:{readonly x:number;readonly y:number}|null}
interface Attempt {readonly turn:number;readonly seqs:readonly number[]}
interface Entry {readonly map:string;readonly target:Target;readonly room:string;readonly reason:string;line:string;readonly attempts:Attempt[]}
const integer=(value:unknown):value is number=>typeof value==="number"&&Number.isInteger(value);
const point=(x:number,y:number):Target=>({key:`tile:${String(x)},${String(y)}`,label:`(${String(x)},${String(y)})`,point:{x,y}});
function targetOf(call:Call,result:Result):Target|null {
 if(call.name==="navigate_to")return integer(call.args["x"])&&integer(call.args["y"])?point(call.args["x"],call.args["y"]):null;
 const target=result.semantic_navigation?.target;
 if(target===undefined)return null;
 if(target.kind==="warp"||target.kind==="interaction")return point(target.x,target.y);
 if(target.kind==="object")return {key:`object:${String(target.local_id)}`,label:`map object ${String(target.local_id)}`,point:null};
 return {key:`connection:${target.direction}`,label:`${target.direction} map connection`,point:null};
}
function refusalLine(result:Result):string|null {
 const lines=result.text.split("\n");
 const navigation=lines.find(line=>line.startsWith("Navigation: "));
 // Preserve whole delivered lines, but only retain explicit route failures. Input
 // locks, battle interruptions, bounded progress and arrival are not refusals.
 if(navigation!==undefined&&/(?:no supported|no route|cannot be reached|cannot stand|cannot be entered|not a walkable|not walkable|not reachable|every route|blocked|route not converging|route cycle:)/.test(navigation))return navigation;
 return lines.find(line=>/^Semantic navigation: .*?(?:no supported route|target is not listed|no valid approach)/.test(line))??null;
}
// refusal-ledger-bound-v1: room for the entry lines, and how many turns of a repeated refusal are listed.
export const REFUSAL_LEDGER_CHARS=4000;
export const REFUSAL_TURNS_SHOWN=10;
const reasonOf=(line:string):string=>line.replace(/^Navigation: walked from \([^)]*\) to \([^)]*\), then stopped: /,"Navigation: ").replace(/; \d+ (?:bounded movement actions|ordinary button attempts)\.$/,"");

// History of actual navigation failures; never a source of current-state advice.
export class RefusalLedger {
 private readonly states=new Map<number,State>();
 private readonly calls=new Map<string,{readonly call:Call;readonly before:State|null}>();
 private readonly entries=new Map<string,Entry>();
 private latest:State|null=null;
 private story:string|null=null;
 constructor(private readonly features:FeatureSet){}
 observe(event:RunEvent):void {
  if(event.type==="state"&&"started"in event){
   this.states.set(event.seq,event);
   if(this.states.size>64)this.states.delete(this.states.keys().next().value??-1);
   this.latest=event;
   const story=event.story==null?null:JSON.stringify(event.story);
   if(story!==this.story){this.entries.clear();this.story=story;}
   const map=roomKey(event);
   for(const [key,entry] of this.entries){
    const tile=entry.target.point;
    if(!event.started||event.map_id==null||entry.map!==map||(tile!==null&&event.position?.x===tile.x&&event.position.y===tile.y))this.entries.delete(key);
   }
   return;
  }
  if(event.type==="tool_call"&&(event.name==="navigate_to"||event.name==="navigate_to_target")){
   this.calls.set(event.id,{call:event,before:this.latest});
   if(this.calls.size>16)this.calls.delete(this.calls.keys().next().value??"");
   return;
  }
  if(event.type!=="tool_result")return;
  const pending=this.calls.get(event.id);this.calls.delete(event.id);
  if(pending===undefined||event.name!==pending.call.name||event.is_error||event.state_seq===undefined)return;
  const state=this.states.get(event.state_seq),before=pending.before;
  if(state===undefined||before===null||state.map_id==null||!state.started||this.latest?.seq!==state.seq)return;
  const map=roomKey(state),asked=pending.call.args["map_id"];
  if(!Array.isArray(asked)||asked.length!==2||asked.some((id,i)=>id!==before.map_id?.[i])||map!==roomKey(before))return;
  const target=targetOf(pending.call,event);if(target===null)return;
  const key=`${map}|${target.key}`,existing=this.entries.get(key);
  this.entries.delete(key);
  const tile=target.point;
  if(event.semantic_navigation?.activation_attempted===true||(tile!==null&&state.position?.x===tile.x&&state.position.y===tile.y)||state.in_battle||state.screen!=="overworld"||state.field_controls_locked!==false)return;
  const line=refusalLine(event);if(line===null)return;
  const reason=reasonOf(line);
  const entry=existing?.reason===reason?existing:{map,target,room:roomOf(state,this.features),reason,line,attempts:[]};
  entry.line=line;
  entry.attempts.push({turn:event.turn,seqs:[before.seq,pending.call.seq,state.seq,event.seq]});
  this.entries.set(key,entry);
 }
 size():number{return this.entries.size;}
 evidence():number[]{return [...new Set([...this.entries.values()].flatMap(entry=>entry.attempts.flatMap(attempt=>attempt.seqs)))].sort((a,b)=>a-b);}
 text():string|null {
  if(this.entries.size===0)return null;
  const bound=this.features["refusal-ledger-bound-v1"];
  const lines=[...this.entries.values()].map(entry=>{
   const attempts=entry.attempts,earlier=bound?Math.max(0,attempts.length-REFUSAL_TURNS_SHOWN):0;
   const turns=`${attempts.slice(earlier).map(a=>String(a.turn)).join(", ")}${earlier===0?"":` (and ${String(earlier)} earlier turns)`}`;
   return `- Target ${entry.target.label} in ${entry.room}: ${String(attempts.length)} time${attempts.length===1?"":"s"} navigation returned this reason, at turn${attempts.length===1?"":"s"} ${turns}. Latest result: "${entry.line}"`;
  });
  // refusal-ledger-bound-v1: whole entries, newest first, within the budget; the newest always stays.
  let kept=lines.length;
  if(bound){
   let used=0;kept=0;
   for(const line of [...lines].reverse()){
    const add=line.length+(kept===0?0:1);
    if(kept>0&&used+add>REFUSAL_LEDGER_CHARS)break;
    used+=add;kept++;
   }
  }
  const left=lines.length-kept;
  return ["Navigation refusal history (recorded harness results, not current reachability). Current observations take precedence; this history does not forbid another attempt or choose your next action.",...(left===0?[]:[`${String(left)} older refusal ${left===1?"entry on this map is":"entries on this map are"} left out.`]),...lines.slice(left)].join("\n");
 }
}
