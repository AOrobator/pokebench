// no-story-foreknowledge-v1: the model-facing copy names a story character only once the game has shown that name in
// this run. The Story characters line keeps its place and its "here" list; its "Not on this map" list keeps only shown
// names. The heal warnings keep their advice and say a role word (your rival, the Gym Leader) until the name is shown.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {DialoguePage} from "./dialogue-auto-advance.js";
import type {RunEvent} from "./events.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {pageShowsName} from "./people-id-cards.js";
import {storyCharacters} from "./people-ledger.js";
import {STORY_CHARACTERS} from "./script-line-presence.js";

export type Shows=(name:string)=>boolean;

// A name is shown once a delivered dialogue page (field or battle) shows it (people-id-cards-v1's rule). The pages of the
// call whose result is being written count for that call: its result delivers them.
export class ShownStoryNames {
 private readonly pending=new Map<string,readonly DialoguePage[]>();
 private readonly delivered:DialoguePage[]=[];
 private readonly shown=new Set<string>();
 private readonly scanned=new Map<string,number>();
 observe(event:RunEvent):void {
  if(event.type==="dialogue_auto_advance"){this.pending.set(event.tool_call_id,event.pages);return;}
  if(event.type!=="tool_result")return;
  const pages=this.pending.get(event.id);this.pending.delete(event.id);
  if(pages!==undefined&&!event.is_error)this.delivered.push(...pages);
 }
 shows(name:string,callId:string|null=null):boolean {
  if(this.shown.has(name))return true;
  const from=this.scanned.get(name)??0;
  this.scanned.set(name,this.delivered.length);
  if(this.delivered.slice(from).some(page=>pageShowsName(page,name))){this.shown.add(name);return true;}
  return callId!==null&&(this.pending.get(callId)??[]).some(page=>pageShowsName(page,name));
 }
}

// character-presence-v1's line and the people ledger's copy of it; the "here" list is never touched.
const CAST_LINE=/^(Story characters here(?: \(from this map's own object list\))?: .*?\. Not on this map: )(.+?)(\.(?: Sprite kinds such as .+)?)$/gm;
export const NONE_NAMED="none named in dialogue yet";
export function shownCast(text:string,shows:Shows):string {
 return text.replace(CAST_LINE,(_,head:string,absent:string,tail:string)=>{
  if(absent==="none")return `${head}${absent}${tail}`;
  const named=absent.split(", ").filter(name=>shows(name));
  return `${head}${named.length===0?NONE_NAMED:named.join(", ")}${tail}`;
 });
}

// The whole absent list, as the game server builds it: the cast table in order, less every character here.
export function absentCast(readout:string):string[]|null {
 const here=storyCharacters(readout);
 if(here===null)return null;
 const names=new Set(here.map(c=>c.name));
 return STORY_CHARACTERS.map(c=>c.name).filter(name=>!names.has(name));
}

// Outermost of the game tools, so every line the wrappers add is filtered and the recorded result is what the model saw.
export function withShownCast(tools:readonly AgentTool[],names:ShownStoryNames|null):AgentTool[] {
 if(names===null)return [...tools];
 const rewrite=<T>(id:string,result:AgentToolResult<T>):AgentToolResult<T>=>({...result,content:result.content.map(part=>part.type==="text"?{...part,text:shownCast(part.text,name=>names.shows(name,id))}:part)});
 return tools.map(tool=>{
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>rewrite(id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>rewrite(id,await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}

// A story opponent's name, or its role word while the game has not shown it. TEAM AQUA's grunt is shown with TEAM AQUA.
export type OpponentKind="rival"|"gym_leader"|"aqua_grunt";
const ROLE:Readonly<Record<OpponentKind,string>>={rival:"your rival",gym_leader:"the Gym Leader",aqua_grunt:"the trainer"};
export const opponentShown=(kind:OpponentKind,opponent:string,shows:Shows|undefined):boolean=>shows===undefined||shows(kind==="aqua_grunt"?"TEAM AQUA":opponent);
export const roleWord=(kind:OpponentKind):string=>ROLE[kind];
export const capital=(s:string):string=>`${s.charAt(0).toUpperCase()}${s.slice(1)}`;
