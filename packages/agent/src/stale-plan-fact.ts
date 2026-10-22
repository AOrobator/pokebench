import type {AgentTool} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";

// stale-plan-fact-v1: a reply whose thinking is byte for byte the previous reply's, answered by a game result that shows a
// different Interface line or game question than the result that thinking was first written after, gets one line
// saying so. Run 2026-10-21T13-33-54_qwen36-gpu0_ea04 repeated its thinking for 15 turns (seq 20494-20844) while the
// results cycled through four move-learning prompts. The line quotes only the readout; it recommends nothing.
const INTERFACE=/^Interface: .*$/m;
const QUESTION=/^The game asks: "([^"]*)"/m;

interface Shown {readonly line:string;readonly question:string|null}
const shownIn=(text:string):Shown|null=>{
 const line=INTERFACE.exec(text)?.[0];
 return line===undefined?null:{line,question:QUESTION.exec(text)?.[1]??null};
};
const same=(a:Shown|null,b:Shown):boolean=>a!==null&&a.line===b.line&&a.question===b.question;

export class StalePlanFact {
 private thinking:string|null=null;
 private repeated=false;
 private firstTurn=0;
 private firstShown:Shown|null=null;
 private lastShown:Shown|null=null;

 observe(event:RunEvent):void {
  if(event.type==="assistant"){
   this.repeated=event.thinking!==""&&event.thinking===this.thinking;
   if(!this.repeated){this.firstTurn=event.turn;this.firstShown=this.lastShown;}
   this.thinking=event.thinking;
   return;
  }
  if(event.type==="tool_result"&&!event.is_error)this.lastShown=shownIn(event.text)??this.lastShown;
 }

 fact(resultText:string):string|null {
  if(!this.repeated)return null;
  const now=shownIn(resultText);
  if(now===null||same(this.firstShown,now))return null;
  return `Your reasoning repeats turn ${String(this.firstTurn)} word for word; the game now shows: ${now.line}.${now.question===null?"":` The game asks: "${now.question}"`}`;
 }
}

// Outermost on the game tools, so the line is the last thing the result says and the recorded tool_result carries it.
export function withStalePlanFact(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(fn:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!features["stale-plan-fact-v1"])return [...tools];
 const fact=new StalePlanFact();
 recorder.subscribe(event=>{fact.observe(event);});
 return tools.map(tool=>({...tool,execute:async(id,args,signal,update)=>{
  const result=await tool.execute(id,args,signal,update);
  const line=fact.fact(result.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n"));
  return line===null?result:{...result,content:[...result.content,{type:"text" as const,text:line}]};
 }}));
}
