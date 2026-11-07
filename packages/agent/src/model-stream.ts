// What the server's raw chat stream carried, beside what pi made of it. pi-ai's openai-completions provider keeps
// only text, reasoning and tool-call deltas, and it builds its own client with no fetch option or chunk hook, so the
// one seam is the global fetch that client reads. The wrapper hands fetch its arguments untouched and returns the
// original response; it reads a clone. Nothing here reaches the model. A failure here must never reach the run.
import type {BodyOf,RunEvent} from "./events.js";

export type ModelStreamBody=Omit<BodyOf<"model_stream">,"type"|"turn">;
type StreamFacts=Omit<ModelStreamBody,"visible"|"output_tokens"|"raw">;
type Visible=NonNullable<ModelStreamBody["visible"]>;
type UnknownField=ModelStreamBody["unknown_fields"][number];
type ToolStream=ModelStreamBody["tool_calls"][number];

export const RAW_CAP_BYTES=16*1024*1024;
export const RAW_FILE_CAP=100;
export const RAW_MIN_OUTPUT_TOKENS=512;
// English text runs near 0.3 tokens per character; a reply at one or more per visible character hid most of itself.
export const RAW_TOKENS_PER_VISIBLE_CHAR=1;
const RAW_DIR="model-stream";
// How long run end waits for a reply stream still being read: one that never ends must not hold the run open.
export const FLUSH_WAIT_MS=2000;
const ENCODER=new TextEncoder();
const UNKNOWN_CAP=32,TOOL_CAP=32,SAMPLE_CHARS=200;

const CHUNK_READ=new Set(["id","object","created","model","choices","usage","system_fingerprint"]);
const CHOICE_READ=new Set(["index","delta","finish_reason","usage"]);
// reasoning_details stays out: pi-ai keeps only encrypted details that match a tool call.
const DELTA_READ=new Set(["role","content","tool_calls"]);
const TOOL_READ=new Set(["index","id","type","function"]);
const FUNCTION_READ=new Set(["name","arguments"]);
// pi-ai takes the first non-empty one of these and drops the rest.
const REASONING_FIELDS=["reasoning_content","reasoning","reasoning_text"] as const;

type Dict=Readonly<Record<string,unknown>>;
const isDict=(value:unknown):value is Dict=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const nonBlank=(text:string):number=>text.replace(/\s/g,"").length;
const count=(value:unknown):number|null=>typeof value==="number"&&Number.isInteger(value)&&value>=0?value:null;
const present=(value:unknown):boolean=>value!==null&&value!==undefined&&value!==""&&!(Array.isArray(value)&&value.length===0);
const asText=(value:unknown):string=>typeof value==="string"?value:JSON.stringify(value);

function complete(args:string):boolean {
 if(!args.trimEnd().endsWith("}"))return false;
 try{JSON.parse(args);return true;}catch{return false;}
}

export class StreamAccount {
 private readonly decoder=new TextDecoder();
 private pending="";
 private dataLines:string[]=[];
 private raw:string[]=[];
 private rawBytes=0;
 private capped=false;
 private bytes=0;
 private frames=0;
 private unparsed=0;
 private comments=0;
 private done=false;
 private error:string|null=null;
 private contentChars=0;
 private readonly reasoning:Record<string,number>={};
 private reasoningDropped=0;
 private emptyDeltas=0;
 private extraChoices=0;
 private afterFinishChars=0;
 private finishReason:string|null=null;
 private usage:ModelStreamBody["usage"]=null;
 private readonly tools=new Map<number|null,ToolStream&{args:string;seen:Set<string>}>();
 private readonly unknown=new Map<string,UnknownField>();
 private unknownOverflow=0;
 private afterTool:{frames:number;content_chars:number;reasoning_chars:number;tool_args_chars:number}|null=null;
 private firstVisible:number|null=null;
 private lastVisible:number|null=null;
 private lastFrame:number|null=null;
 private gap=0;
 private gapAt:number|null=null;
 private endMs=0;
 private at=0;

 constructor(private readonly startedAt:number) {}

 bytesIn(chunk:Uint8Array,at:number):void {this.read(this.decoder.decode(chunk,{stream:true}),at,chunk.byteLength);}

 read(text:string,at:number,size=ENCODER.encode(text).byteLength):void {
  this.at=at-this.startedAt;
  this.bytes+=size;
  this.retain(text);
  this.pending+=text;
  const lines=this.pending.split("\n");
  this.pending=lines.pop()??"";
  for(const line of lines)this.line(line.endsWith("\r")?line.slice(0,-1):line);
 }

 close(at:number,error:string|null=null):void {
  this.at=at-this.startedAt;
  this.endMs=this.at;
  this.error=error;
  if(this.pending!==""){this.line(this.pending);this.pending="";}
  this.endFrame();
 }

 private retain(text:string):void {
  const line=`${JSON.stringify({ms:this.at,text})}\n`;
  const size=ENCODER.encode(line).byteLength;
  if(this.capped||this.rawBytes+size>RAW_CAP_BYTES){this.capped=true;return;}
  this.rawBytes+=size;
  this.raw.push(line);
 }

 private line(line:string):void {
  if(line===""){this.endFrame();return;}
  if(line.startsWith("data:")){this.dataLines.push(line.slice(line.startsWith("data: ")?6:5));return;}
  this.comments++;
 }

 private endFrame():void {
  if(this.dataLines.length===0)return;
  const data=this.dataLines.join("\n");
  this.dataLines=[];
  this.arrived();
  if(data==="[DONE]"){this.done=true;return;}
  let chunk:unknown;
  try{chunk=JSON.parse(data);}catch{this.unparsed++;return;}
  if(!isDict(chunk)){this.unparsed++;return;}
  this.frames++;
  this.chunk(chunk);
 }

 private arrived():void {
  if(this.lastFrame!==null&&this.at-this.lastFrame>this.gap){this.gap=this.at-this.lastFrame;this.gapAt=this.at;}
  this.lastFrame=this.at;
 }

 private note(scope:string,dict:Dict,read:ReadonlySet<string>):void {
  for(const [key,value] of Object.entries(dict)){
   if(read.has(key)||!present(value))continue;
   this.noteValue(`${scope}.${key}`,value);
  }
 }

 private noteValue(path:string,value:unknown):void {
  const text=asText(value);
  const known=this.unknown.get(path);
  if(known!==undefined){this.unknown.set(path,{...known,count:known.count+1,chars:known.chars+text.length});return;}
  if(this.unknown.size>=UNKNOWN_CAP){this.unknownOverflow++;return;}
  this.unknown.set(path,{path,count:1,chars:text.length,sample:text.slice(0,SAMPLE_CHARS)});
 }

 private chunk(chunk:Dict):void {
  this.note("chunk",chunk,CHUNK_READ);
  this.readUsage(chunk["usage"]);
  const choices=Array.isArray(chunk["choices"])?(chunk["choices"] as unknown[]):[];
  if(choices.length>1)this.extraChoices++;
  const choice=choices[0];
  if(!isDict(choice))return;
  this.note("choice",choice,CHOICE_READ);
  this.readUsage(choice["usage"]);
  const finished=this.finishReason!==null;
  if(typeof choice["finish_reason"]==="string")this.finishReason=choice["finish_reason"];
  if(isDict(choice["delta"]))this.delta(choice["delta"],finished);
 }

 private readUsage(value:unknown):void {
  if(!isDict(value))return;
  const prompt=count(value["prompt_tokens"]),completion=count(value["completion_tokens"]);
  if(prompt===null||completion===null)return;
  const details=value["completion_tokens_details"];
  const reasoning=isDict(details)?count(details["reasoning_tokens"]):null;
  this.usage={prompt_tokens:prompt,completion_tokens:completion,...(reasoning===null?{}:{reasoning_tokens:reasoning})};
 }

 private delta(delta:Dict,finished:boolean):void {
  this.note("delta",delta,new Set([...DELTA_READ,...REASONING_FIELDS]));
  const before=this.afterTool;
  let chars=0,visible=false,reasoningChars=0;
  const content=delta["content"];
  if(typeof content==="string"){this.contentChars+=content.length;chars+=content.length;visible=nonBlank(content)>0;}
  else if(present(content))this.noteValue("delta.content",content);
  let used=false;
  for(const field of REASONING_FIELDS){
   const value=delta[field];
   if(typeof value!=="string"){if(present(value))this.noteValue(`delta.${field}`,value);continue;}
   if(value==="")continue;
   this.reasoning[field]=(this.reasoning[field]??0)+value.length;
   if(used)this.reasoningDropped+=value.length;
   else{used=true;reasoningChars=value.length;chars+=value.length;visible=visible||nonBlank(value)>0;}
  }
  const toolChars=this.toolCalls(delta["tool_calls"]);
  chars+=toolChars.chars;
  visible=visible||toolChars.visible;
  if(finished)this.afterFinishChars+=chars;
  if(!Object.entries(delta).some(([key,value])=>key!=="role"&&present(value)))this.emptyDeltas++;
  if(visible){this.firstVisible??=this.at;this.lastVisible=this.at;}
  if(before!==null&&this.afterTool!==null)this.afterTool={frames:this.afterTool.frames+1,content_chars:this.afterTool.content_chars+(typeof content==="string"?content.length:0),reasoning_chars:this.afterTool.reasoning_chars+reasoningChars,tool_args_chars:this.afterTool.tool_args_chars+toolChars.chars};
 }

 private toolCalls(value:unknown):{chars:number;visible:boolean} {
  let chars=0,visible=false;
  if(!Array.isArray(value))return {chars,visible};
  for(const call of value as unknown[]){
   if(!isDict(call))continue;
   this.note("tool_call",call,TOOL_READ);
   const fn=isDict(call["function"])?call["function"]:{};
   this.note("tool_call.function",fn,FUNCTION_READ);
   const index=count(call["index"]);
   let tool=this.tools.get(index);
   if(tool===undefined){
    if(this.tools.size>=TOOL_CAP)continue;
    tool={index,ids:0,name:null,deltas:0,args_chars:0,args_blank_chars:0,args:"",seen:new Set()};
    this.tools.set(index,tool);
   }
   tool.deltas++;
   const id=call["id"],name=fn["name"],args=fn["arguments"];
   if(typeof id==="string"&&id!==""&&!tool.seen.has(id)){tool.seen.add(id);tool.ids++;}
   if(typeof name==="string"&&name!==""){tool.name??=name;visible=true;}
   if(typeof args==="string"&&args!==""){
    tool.args+=args;
    tool.args_chars+=args.length;
    const blank=args.length-nonBlank(args);
    tool.args_blank_chars+=blank;
    chars+=args.length;
    visible=visible||blank<args.length;
   }
   if(this.afterTool===null&&complete(tool.args))this.afterTool={frames:0,content_chars:0,reasoning_chars:0,tool_args_chars:0};
  }
  return {chars,visible};
 }

 summary():StreamFacts {
  return {
   ended:this.error!==null?"error":this.done?"done":"closed",
   ...(this.error===null?{}:{error:this.error}),
   bytes:this.bytes,frames:this.frames,unparsed_frames:this.unparsed,comment_lines:this.comments,
   content_chars:this.contentChars,reasoning:{...this.reasoning},reasoning_dropped_chars:this.reasoningDropped,
   tool_calls:[...this.tools.values()].map(({index,ids,name,deltas,args_chars,args_blank_chars})=>({index,ids,name,deltas,args_chars,args_blank_chars})),
   empty_deltas:this.emptyDeltas,extra_choice_frames:this.extraChoices,after_finish_chars:this.afterFinishChars,
   after_tool:this.afterTool,
   unknown_fields:[...this.unknown.values()],unknown_overflow:this.unknownOverflow,
   finish_reason:this.finishReason,usage:this.usage,
   timing:{first_visible_ms:this.firstVisible,last_visible_ms:this.lastVisible,last_frame_ms:this.lastFrame,end_ms:this.endMs,longest_gap_ms:this.gap,longest_gap_at_ms:this.gapAt},
  };
 }

 rawLines():string {return this.raw.join("");}
 sawDone():boolean {return this.done;}
 rawCapped():boolean {return this.capped;}
}

export interface ModelStreamPorts {
 readonly url:string;
 readonly now:()=>number;
 readonly turn:()=>number;
 readonly record:(turn:number,body:ModelStreamBody)=>void;
 /** Writes the raw lines under the run's model-stream folder; returns the bytes written. */
 readonly save:(name:string,raw:string)=>number;
 readonly sleep:(ms:number)=>Promise<void>;
}

export const chatCompletionsUrl=(baseUrl:string):string=>`${baseUrl.replace(/\/+$/,"")}/chat/completions`;

function requestOf(input:Parameters<typeof fetch>[0],init:Parameters<typeof fetch>[1]):{url:string;method:string} {
 if(input instanceof Request)return {url:input.url,method:init?.method??input.method};
 return {url:String(input),method:init?.method??"GET"};
}

function visibleOf(event:Extract<RunEvent,{type:"assistant"}>):Visible {
 return {thinking_chars:nonBlank(event.thinking),text_chars:nonBlank(event.text),tool_args_chars:event.tool_calls.reduce((sum,call)=>sum+nonBlank(JSON.stringify(call.args)),0),tool_calls:event.tool_calls.length};
}

interface Finished {readonly turn:number;readonly account:StreamAccount}
interface Reply {readonly turn:number;readonly visible:Visible;readonly output:number}

export class ModelStreamLog {
 private stream:Finished|null=null;
 private reply:Reply|null=null;
 private files=0;
 private readonly reading=new Set<Promise<void>>();
 constructor(private readonly ports:ModelStreamPorts) {}

 fetch(base:typeof fetch):typeof fetch {
  return async(input,init)=>{
   const {url,method}=requestOf(input,init);
   if(url!==this.ports.url||method!=="POST")return base(input,init);
   const turn=this.ports.turn(),startedAt=this.ports.now();
   const response=await base(input,init);
   if(response.ok&&response.body!==null){
    try{const reading=this.consume(turn,startedAt,response.clone());this.reading.add(reading);void reading.finally(()=>{this.reading.delete(reading);});}
    catch(error){console.warn(`model stream: turn ${String(turn)} not read: ${error instanceof Error?error.message:String(error)}`);}
   }
   return response;
  };
 }

 private async consume(turn:number,startedAt:number,copy:Response):Promise<void> {
  const account=new StreamAccount(startedAt);
  let failure:string|null=null;
  try{
   const reader=copy.body?.getReader();
   for(;;){
    const part=await reader?.read();
    if(part===undefined||part.done)break;
    account.bytesIn(part.value,this.ports.now());
    // The SDK stops reading at [DONE]; a server can hold the connection open after it.
    if(account.sawDone()){void reader?.cancel().catch(()=>undefined);break;}
   }
  }catch(error){failure=error instanceof Error?error.message:String(error);}
  account.close(this.ports.now(),failure);
  if(this.stream!==null)this.write(this.stream,null);
  this.stream={turn,account};
  this.join();
 }

 /** Recorder subscriber: the assistant event carries what pi delivered for the turn. */
 observe(event:RunEvent):void {
  if(event.type!=="assistant")return;
  this.reply={turn:event.turn,visible:visibleOf(event),output:event.usage.output};
  this.join();
 }

 private join():void {
  if(this.stream===null||this.reply===null||this.stream.turn!==this.reply.turn)return;
  const [stream,reply]=[this.stream,this.reply];
  this.stream=null;this.reply=null;
  this.write(stream,reply);
 }

 /** At run end: waits up to FLUSH_WAIT_MS for streams still being read, then records a stream whose reply never came. */
 async flush():Promise<void> {
  if(this.reading.size>0)await Promise.race([Promise.allSettled([...this.reading]),this.ports.sleep(FLUSH_WAIT_MS)]);
  if(this.stream!==null)this.write(this.stream,null);
  this.stream=null;this.reply=null;
 }

 private write(stream:Finished,reply:Reply|null):void {
  const facts=stream.account.summary();
  const output=facts.usage?.completion_tokens??reply?.output??0;
  const shown=reply===null?facts.content_chars+Object.values(facts.reasoning).reduce((a,b)=>a+b,0)+facts.tool_calls.reduce((sum,t)=>sum+t.args_chars-t.args_blank_chars,0):reply.visible.thinking_chars+reply.visible.text_chars+reply.visible.tool_args_chars;
  const raw=output>=RAW_MIN_OUTPUT_TOKENS&&output>=shown*RAW_TOKENS_PER_VISIBLE_CHAR?this.saveRaw(stream):null;
  try{this.ports.record(stream.turn,{...facts,visible:reply?.visible??null,output_tokens:output,raw});}
  catch(error){console.warn(`model stream: turn ${String(stream.turn)} not recorded: ${error instanceof Error?error.message:String(error)}`);}
 }

 private saveRaw(stream:Finished):ModelStreamBody["raw"] {
  if(this.files>=RAW_FILE_CAP)return {skipped:"run_cap"};
  this.files++;
  const name=`turn-${String(stream.turn).padStart(6,"0")}-${String(this.files)}.jsonl.gz`;
  try{return {file:`${RAW_DIR}/${name}`,bytes:this.ports.save(name,stream.account.rawLines()),capped:stream.account.rawCapped()};}
  catch{return {skipped:"write_failed"};}
 }
}
