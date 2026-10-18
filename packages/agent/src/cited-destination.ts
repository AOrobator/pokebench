// cited-destination-v1: navigate_to takes a required `because`, the readout line or dialogue, quoted, that makes the
// destination the place to go. Before the walk it is looked up, as plain text, in every tool result the model has been
// shown this run. When it is not there (or is too short to be a quote) the result starts with one line saying so; the
// walk runs either way. Every check is recorded.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type TObject} from "typebox";
import type {RunEvent} from "./events.js";

export type CitationVerdict="found"|"not_found"|"too_short";
export interface DestinationCitationFacts {
 readonly tool_call_id:string;readonly because:string;readonly verdict:CitationVerdict;
 readonly found_turn:number|null;readonly x:number;readonly y:number;readonly map_id:readonly [number,number];
}
export interface CitationRecorder {
 subscribe(listener:(event:RunEvent)=>void):void;
 destinationCitation?(facts:DestinationCitationFacts,text:string|null):void;
}
export interface CitationOptions {readonly fullMap:boolean;readonly exitReach:boolean;readonly silenceMiss?:boolean}

// Fewer words than this is a name, not a quote of a line.
export const MIN_QUOTE_WORDS=2;

export function becauseDescription(options:CitationOptions):string {
 const where=options.fullMap?"a readout line that shows the destination on this map (a door, a person's position, an exit or a Map connections line)":"a readout line that shows the destination (a door, a person's position, an exit or a Map connections line)";
 return [
  `Required. Quote, word for word, what the game showed you that makes this the place to go: a person's words, the Story goal line, or ${where}. Copy it; do not paraphrase or add to it.`,
  ...(options.exitReach?["An exit the readout says cannot be reached on foot from where you stand is not a reason to walk to it."]:[]),
 ].join(" ");
}

// Compared as plain text: case, curly quotes, line breaks and runs of spaces do not matter.
export function normalise(text:string):string {
 return text.toLowerCase().replace(/[“”„]/g,"\"").replace(/[‘’]/g,"'").replace(/\s+/g," ").trim();
}
function quoteBody(because:string):string {
 return normalise(because).replace(/^["'\s]+|["'\s]+$/g,"");
}

export class Citations {
 private readonly shown:{readonly turn:number;readonly text:string}[]=[];
 private readonly seen=new Set<string>();
 // The lines this wrapper wrote echo the model's own words (line breaks included); each is cut out whole before a
 // result counts as shown.
 private readonly echoes=new Set<string>();
 echoed(line:string):void {this.echoes.add(line);}
 observe(event:RunEvent):void {
  if(event.type!=="tool_result"||event.is_error)return;
  let raw=event.text;
  for(const echo of this.echoes)raw=raw.split(echo).join("\n");
  const text=normalise(raw);
  if(text===""||this.seen.has(text))return;
  this.seen.add(text);this.shown.push({turn:event.turn,text});
 }
 check(because:string):{readonly verdict:CitationVerdict;readonly turn:number|null} {
  const body=quoteBody(because);
  if(body.split(" ").filter(w=>/[\p{L}\p{N}]/u.test(w)).length<MIN_QUOTE_WORDS)return {verdict:"too_short",turn:null};
  for(let i=this.shown.length-1;i>=0;i--){const s=this.shown[i];if(s!==undefined&&s.text.includes(body))return {verdict:"found",turn:s.turn};}
  return {verdict:"not_found",turn:null};
 }
}

export function citationText(verdict:CitationVerdict,because:string):string|null {
 if(verdict==="found")return null;
 if(verdict==="too_short")return `Because: "${because}" is too short to be a quote, so it was not checked; quote the whole line the game showed you. navigate_to walked anyway.`;
 return `Because: "${because}" is not in anything the game has shown you this run (results, readouts and dialogue). navigate_to walked anyway; nothing the game showed you supports this destination as you quoted it.`;
}

interface Goal {readonly x:number;readonly y:number;readonly map_id:readonly [number,number]}
function isGoal(value:unknown):value is Goal&{readonly because?:unknown} {
 if(typeof value!=="object"||value===null)return false;
 const v=value as Record<string,unknown>;
 return typeof v.x==="number"&&typeof v.y==="number"&&Array.isArray(v.map_id)&&v.map_id.length===2&&v.map_id.every(n=>typeof n==="number");
}

export function withCitedDestination(tools:readonly AgentTool[],on:boolean,recorder:CitationRecorder,options:CitationOptions):AgentTool[] {
 if(!on)return [...tools];
 const record=recorder.destinationCitation?.bind(recorder);
 if(record===undefined)throw new Error("cited-destination-v1 needs a recorder for destination_citation events");
 const citations=new Citations();recorder.subscribe(event=>{citations.observe(event);});
 return tools.map(tool=>{
  if(tool.name!=="navigate_to")return tool;
  const base=tool.parameters as TObject;
  const parameters=Type.Object({...base.properties,because:Type.String({minLength:1,description:becauseDescription(options)})},{additionalProperties:false});
  const execute=async(id:string,params:unknown,signal?:AbortSignal,update?:Parameters<AgentTool["execute"]>[3]):Promise<AgentToolResult<unknown>>=>{
   if(!isGoal(params)||typeof params.because!=="string")return tool.execute(id,params,signal,update);
   const {because,...goal}=params;
   const {verdict,turn}=citations.check(because);
   const line=options.silenceMiss===true&&verdict==="not_found"?null:citationText(verdict,because);
   if(line!==null)citations.echoed(line);
   record({tool_call_id:id,because,verdict,found_turn:turn,x:goal.x,y:goal.y,map_id:[goal.map_id[0],goal.map_id[1]]},line);
   const result=await tool.execute(id,goal,signal,update);
   if(line===null)return result;
   const index=result.content.findIndex(part=>part.type==="text");
   const part=result.content[index];
   const content=[...result.content];
   if(part?.type==="text")content[index]={...part,text:`${line}\n${part.text}`};else content.unshift({type:"text",text:line});
   return {...result,content};
  };
  return {...tool,description:`${tool.description} Give because: the line the game showed you, quoted, that makes this the place to go.`,parameters,execute} as AgentTool;
 });
}
