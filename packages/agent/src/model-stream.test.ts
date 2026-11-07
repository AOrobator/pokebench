import {describe,expect,it} from "vitest";
import {RAW_CAP_BYTES,RAW_FILE_CAP,RAW_MIN_OUTPUT_TOKENS,ModelStreamLog,StreamAccount,chatCompletionsUrl,type ModelStreamBody,type ModelStreamPorts} from "./model-stream.js";
import type {RunEvent} from "./events.js";

const URL_="http://127.0.0.1:18020/v1/chat/completions";
const frame=(chunk:unknown):string=>`data: ${JSON.stringify(chunk)}\n\n`;
const delta=(d:unknown,extra:Record<string,unknown>={}):string=>frame({id:"r",object:"chat.completion.chunk",created:1,model:"m",choices:[{index:0,delta:d,finish_reason:null,logprobs:null,...extra}]});
const finish=(reason:string):string=>frame({id:"r",choices:[{index:0,delta:{},finish_reason:reason}]});
const usage=(completion:number,prompt=100):string=>frame({id:"r",choices:[],usage:{prompt_tokens:prompt,completion_tokens:completion,total_tokens:prompt+completion}});
const DONE="data: [DONE]\n\n";

function account(parts:readonly (readonly [number,string])[],end=parts.at(-1)?.[0]??0):ReturnType<StreamAccount["summary"]> {
 const a=new StreamAccount(0);
 for(const [at,text] of parts)a.read(text,at);
 a.close(end);
 return a.summary();
}

function sseResponse(parts:readonly string[],init:ResponseInit={headers:{"content-type":"text/event-stream"}}):Response {
 const encoder=new TextEncoder();
 return new Response(new ReadableStream<Uint8Array>({start(c){for(const p of parts)c.enqueue(encoder.encode(p));c.close();}}),init);
}

interface Harness {readonly log:ModelStreamLog;readonly recorded:{turn:number;body:ModelStreamBody}[];readonly saved:{name:string;raw:string}[];turn:number;clock:number;}
function harness(over:Partial<ModelStreamPorts>={}):Harness {
 const h:Harness={log:null as never,recorded:[],saved:[],turn:1,clock:0};
 return Object.assign(h,{log:new ModelStreamLog({url:URL_,now:()=>h.clock,turn:()=>h.turn,record:(turn,body)=>{h.recorded.push({turn,body});},save:(name,raw)=>{h.saved.push({name,raw});return raw.length;},...over})});
}
const assistant=(turn:number,over:{thinking?:string;text?:string;args?:Record<string,unknown>;output?:number}={}):RunEvent=>({v:1,run:"r",seq:1,t:"2026-11-07T00:00:00.000-05:00",type:"assistant",turn,thinking:over.thinking??"",text:over.text??"",tool_calls:over.args===undefined?[]:[{id:"c",name:"observe",args:over.args}],usage:{input:1,output:over.output??10,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"});
const drain=async(response:Response):Promise<string>=>response.text();
const settled=async():Promise<void>=>{for(let i=0;i<20;i++)await new Promise<void>(resolve=>{queueMicrotask(resolve);});await new Promise<void>(resolve=>{setImmediate(resolve);});};

describe("StreamAccount reads the raw stream",()=>{
 it("counts what pi turns into text, thinking and tool calls",()=>{
  const s=account([[10,delta({role:"assistant",reasoning:"plan"})],[20,delta({content:"hi there"})],[30,delta({tool_calls:[{index:0,id:"c1",type:"function",function:{name:"press",arguments:"{\"a\":"}}]})],[40,delta({tool_calls:[{index:0,function:{arguments:"1}"}}]})],[50,finish("tool_calls")],[51,usage(12)],[52,DONE]]);
  expect(s.ended).toBe("done");
  expect(s.frames).toBe(6);
  expect(s.content_chars).toBe(8);
  expect(s.reasoning).toEqual({reasoning:4});
  expect(s.tool_calls).toEqual([{index:0,ids:1,name:"press",deltas:2,args_chars:7,args_blank_chars:0}]);
  expect(s.finish_reason).toBe("tool_calls");
  expect(s.usage).toEqual({prompt_tokens:100,completion_tokens:12});
  expect(s.timing).toEqual({first_visible_ms:10,last_visible_ms:40,last_frame_ms:52,end_ms:52,longest_gap_ms:10,longest_gap_at_ms:20});
  expect(s.unknown_fields).toEqual([]);
 });

 it("shows the silent tail after a zero-argument call",()=>{
  const s=account([[1000,delta({tool_calls:[{index:0,id:"c1",function:{name:"observe",arguments:"{}"}}]})],[31000,finish("length")],[31001,usage(8192)],[31002,DONE]]);
  expect(s.timing.last_visible_ms).toBe(1000);
  expect(s.timing.longest_gap_ms).toBe(30000);
  expect(s.timing.longest_gap_at_ms).toBe(31000);
  expect(s.finish_reason).toBe("length");
 });

 it("does not call blank arguments visible, and counts them",()=>{
  const blanks=Array.from({length:50},(_,i)=>[1000+i*10,delta({tool_calls:[{index:0,function:{arguments:"\n\n  "}}]})] as const);
  const s=account([[1000,delta({tool_calls:[{index:0,id:"c1",function:{name:"observe",arguments:"{"}}]})],...blanks,[2000,delta({tool_calls:[{index:0,function:{arguments:"}"}}]})],[2001,DONE]]);
  expect(s.tool_calls[0]).toMatchObject({args_chars:202,args_blank_chars:200,deltas:52});
  expect(s.timing.last_visible_ms).toBe(2000);
 });

 it("counts content after a tool call is complete",()=>{
  const s=account([[1,delta({tool_calls:[{index:0,id:"c",function:{name:"observe",arguments:"{}"}}]})],[2,delta({content:"more words"})],[3,delta({reasoning:"still"})],[4,delta({tool_calls:[{index:0,function:{arguments:"   "}}]})],[5,DONE]]);
  expect(s.after_tool).toEqual({frames:3,content_chars:10,reasoning_chars:5,tool_args_chars:3});
 });

 it("reports fields pi never reads, with a sample and no nulls",()=>{
  const s=account([[1,delta({content:"a",hidden_field:"secret words",refusal:null},{stop_reason:"x",token_ids:[1,2,3]})],[2,frame({id:"r",nvext:{a:1},choices:[{index:0,delta:{tool_calls:[{index:0,id:"c",extra:"e",function:{name:"n",arguments:"{}",strict:true}}]}}]})]]);
  expect(s.unknown_fields).toEqual([
   {path:"choice.stop_reason",count:1,chars:1,sample:"x"},
   {path:"choice.token_ids",count:1,chars:7,sample:"[1,2,3]"},
   {path:"delta.hidden_field",count:1,chars:12,sample:"secret words"},
   {path:"chunk.nvext",count:1,chars:7,sample:"{\"a\":1}"},
   {path:"tool_call.extra",count:1,chars:1,sample:"e"},
   {path:"tool_call.function.strict",count:1,chars:4,sample:"true"},
  ]);
 });

 it("keeps the unknown list and its samples bounded",()=>{
  const wide=Object.fromEntries(Array.from({length:40},(_,i)=>[`f${String(i)}`,"x".repeat(500)]));
  const s=account([[1,delta(wide)],[2,delta(wide)]]);
  expect(s.unknown_fields).toHaveLength(32);
  expect(s.unknown_fields[0]).toMatchObject({count:2,chars:1000});
  expect(s.unknown_fields[0]?.sample).toHaveLength(200);
  expect(s.unknown_overflow).toBe(16);
 });

 it("sees a second reasoning field pi drops, extra choices and empty deltas",()=>{
  const s=account([[1,delta({reasoning_content:"kept",reasoning:"dropped text"})],[2,delta({})],[3,delta({content:""})],[4,frame({id:"r",choices:[{index:0,delta:{}},{index:1,delta:{content:"other"}}]})]]);
  expect(s.reasoning).toEqual({reasoning_content:4,reasoning:12});
  expect(s.reasoning_dropped_chars).toBe(12);
  expect(s.empty_deltas).toBe(3);
  expect(s.extra_choice_frames).toBe(1);
 });

 it("counts deltas after the finish reason",()=>{
  const s=account([[1,finish("stop")],[2,delta({content:"late"})],[3,usage(1)],[4,DONE]]);
  expect(s.after_finish_chars).toBe(4);
 });

 it("sees merged tool calls: two ids on one index",()=>{
  const s=account([[1,delta({tool_calls:[{index:0,id:"a",function:{name:"x",arguments:"{}"}},{index:0,id:"b",function:{name:"y",arguments:"{}"}}]})]]);
  expect(s.tool_calls).toEqual([{index:0,ids:2,name:"x",deltas:2,args_chars:4,args_blank_chars:0}]);
 });

 it("reassembles frames split across reads, CRLF, comments and multi-line data",()=>{
  const whole=delta({content:"split"});
  const s=account([[1,whole.slice(0,17)],[2,whole.slice(17)],[3,": ping\n\n"],[4,"event: x\ndata: {\"id\":\"r\",\r\ndata: \"choices\":[{\"index\":0,\"delta\":{\"content\":\"ab\"}}]}\r\n\r\n"]]);
  expect(s.content_chars).toBe(7);
  expect(s.comment_lines).toBe(2);
  expect(s.frames).toBe(2);
  expect(s.unparsed_frames).toBe(0);
 });

 it("reads a last frame with no blank line after it",()=>{
  expect(account([[1,"data: {\"id\":\"r\",\"choices\":[{\"delta\":{\"content\":\"end\"}}]}"]]).content_chars).toBe(3);
 });

 it("counts frames it cannot parse and never throws on odd shapes",()=>{
  const s=account([[1,"data: {nope\n\n"],[2,"data: 7\n\n"],[3,"data: {\"choices\":\"x\",\"usage\":{\"prompt_tokens\":\"a\"}}\n\n"],[4,"data: {\"choices\":[7,{\"delta\":3}]}\n\n"],[5,"data: {\"choices\":[{\"delta\":{\"content\":5,\"tool_calls\":[7,{\"function\":3}]}}]}\n\n"]]);
  expect(s.unparsed_frames).toBe(2);
  expect(s.frames).toBe(3);
  expect(s.usage).toBeNull();
  expect(s.unknown_fields.map(f=>f.path)).toContain("delta.content");
 });

 it("reads usage carried on the choice and reasoning tokens",()=>{
  const s=account([[1,frame({choices:[{index:0,delta:{},usage:{prompt_tokens:3,completion_tokens:4,completion_tokens_details:{reasoning_tokens:2}}}]})]]);
  expect(s.usage).toEqual({prompt_tokens:3,completion_tokens:4,reasoning_tokens:2});
 });

 it("ends as closed without [DONE] and as error on a failed read",()=>{
  expect(account([[1,delta({content:"x"})]]).ended).toBe("closed");
  const a=new StreamAccount(0);a.read(delta({content:"x"}),1);a.close(9,"reader lost");
  expect(a.summary()).toMatchObject({ended:"error",error:"reader lost"});
 });

 it("retains the raw reads with their times, up to the cap",()=>{
  const a=new StreamAccount(0);a.read("abc",5);a.read("x".repeat(RAW_CAP_BYTES),6);a.read("z",7);a.close(8);
  expect(a.rawLines()).toBe("{\"ms\":5,\"text\":\"abc\"}\n");
  expect(a.rawCapped()).toBe(true);
  expect(a.summary().bytes).toBe(RAW_CAP_BYTES+4);
 });
});

describe("ModelStreamLog taps the model's stream",()=>{
 it("passes the request through untouched and returns the original response",async()=>{
  const h=harness();const original=sseResponse([delta({content:"hello"}),DONE]);
  const init={method:"POST",body:"{\"exact\":\"bytes\"}"};let seen:unknown[]=[];
  const tapped=h.log.fetch((...args)=>{seen=args;return Promise.resolve(original);});
  const response=await tapped(URL_,init);
  expect(seen).toEqual([URL_,init]);
  expect(seen[1]).toBe(init);
  expect(response).toBe(original);
  expect(await drain(response)).toContain("hello");
 });

 it("leaves every other request alone",async()=>{
  const h=harness();const passed:Response[]=[];
  const tapped=h.log.fetch(()=>{const r=sseResponse([delta({content:"x"}),DONE]);passed.push(r);return Promise.resolve(r);});
  await tapped("http://127.0.0.1:8000/state",{method:"GET"});
  await tapped(URL_,{method:"GET"});
  await tapped(new URL("http://127.0.0.1:8000/x"));
  await settled();h.log.flush();
  expect(h.recorded).toEqual([]);
 });

 it("reads a Request or URL object for the model too",async()=>{
  const h=harness();
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([DONE])));
  await tapped(new Request(URL_,{method:"POST",body:"x"}));
  await tapped(new URL(URL_),{method:"POST"});
  await settled();h.log.flush();
  expect(h.recorded).toHaveLength(1);
 });

 it("ignores an error response, which has no stream",async()=>{
  const h=harness();
  const tapped=h.log.fetch(()=>Promise.resolve(new Response("{\"error\":\"x\"}",{status:500,headers:{"content-type":"application/json"}})));
  await tapped(URL_,{method:"POST"});
  await settled();h.log.flush();
  expect(h.recorded).toEqual([]);
 });

 it("joins the stream with the assistant event, whichever comes first",async()=>{
  for(const assistantFirst of [true,false]){
   const h=harness();h.clock=100;
   const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([delta({content:"hello"}),usage(5),DONE])));
   if(assistantFirst)h.log.observe(assistant(1,{text:"hello",args:{},thinking:"  a b "}));
   await tapped(URL_,{method:"POST"});
   await settled();
   if(!assistantFirst)h.log.observe(assistant(1,{text:"hello",args:{},thinking:"  a b "}));
   if(assistantFirst){expect(h.recorded).toHaveLength(0);h.log.observe(assistant(2));h.log.flush();}
   const record=h.recorded[0];
   if(assistantFirst)continue;
   expect(record?.turn).toBe(1);
   expect(record?.body.visible).toEqual({thinking_chars:2,text_chars:5,tool_args_chars:2,tool_calls:1});
   expect(record?.body.output_tokens).toBe(5);
   expect(record?.body.raw).toBeNull();
  }
 });

 it("writes the raw stream when the tokens far outrun what was visible",async()=>{
  const h=harness();h.turn=47;
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([delta({tool_calls:[{index:0,id:"c",function:{name:"observe",arguments:"{}"}}]}),usage(8192),DONE])));
  await tapped(URL_,{method:"POST"});await settled();
  h.log.observe(assistant(47,{args:{},thinking:"x".repeat(2900),output:8192}));
  expect(h.saved).toHaveLength(1);
  expect(h.saved[0]?.name).toBe("turn-000047-1.jsonl.gz");
  expect(h.saved[0]?.raw).toContain("observe");
  expect(h.recorded[0]?.body.raw).toMatchObject({file:"model-stream/turn-000047-1.jsonl.gz",capped:false});
 });

 it("leaves a normal long reply's raw stream out",async()=>{
  const h=harness();
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([usage(RAW_MIN_OUTPUT_TOKENS),DONE])));
  await tapped(URL_,{method:"POST"});await settled();
  h.log.observe(assistant(1,{thinking:"x".repeat(RAW_MIN_OUTPUT_TOKENS*3),output:RAW_MIN_OUTPUT_TOKENS}));
  expect(h.saved).toEqual([]);
 });

 it("leaves a short reply's raw stream out whatever the ratio",async()=>{
  const h=harness();
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([usage(RAW_MIN_OUTPUT_TOKENS-1),DONE])));
  await tapped(URL_,{method:"POST"});await settled();
  h.log.observe(assistant(1,{output:RAW_MIN_OUTPUT_TOKENS-1}));
  expect(h.saved).toEqual([]);
 });

 it("uses the assistant's token count when the stream carried no usage",async()=>{
  const h=harness();
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([DONE])));
  await tapped(URL_,{method:"POST"});await settled();
  h.log.observe(assistant(1,{output:1000}));
  expect(h.recorded[0]?.body.output_tokens).toBe(1000);
  expect(h.saved).toHaveLength(1);
 });

 it("stops writing raw files at the run's cap and says so",async()=>{
  const h=harness();
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([usage(8192),DONE])));
  for(let turn=1;turn<=RAW_FILE_CAP+1;turn++){h.turn=turn;await tapped(URL_,{method:"POST"});await settled();h.log.observe(assistant(turn,{output:8192}));}
  expect(h.saved).toHaveLength(RAW_FILE_CAP);
  expect(h.recorded.at(-1)?.body.raw).toEqual({skipped:"run_cap"});
 });

 it("survives a save or record that throws",async()=>{
  const h=harness({save:()=>{throw new Error("disk");}});
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([usage(8192),DONE])));
  await tapped(URL_,{method:"POST"});await settled();
  h.log.observe(assistant(1,{output:8192}));
  expect(h.recorded[0]?.body.raw).toEqual({skipped:"write_failed"});
  const broken=harness({record:()=>{throw new Error("log closed");}});
  const again=broken.log.fetch(()=>Promise.resolve(sseResponse([DONE])));
  await again(URL_,{method:"POST"});await settled();
  expect(()=>{broken.log.observe(assistant(1));}).not.toThrow();
 });

 it("records a stream whose reply never came, at flush or at the next stream",async()=>{
  const h=harness();
  const tapped=h.log.fetch(()=>Promise.resolve(sseResponse([delta({content:"x"}),DONE])));
  await tapped(URL_,{method:"POST"});await settled();
  h.turn=2;await tapped(URL_,{method:"POST"});await settled();
  expect(h.recorded.map(r=>r.turn)).toEqual([1]);
  expect(h.recorded[0]?.body.visible).toBeNull();
  h.log.flush();
  expect(h.recorded.map(r=>r.turn)).toEqual([1,2]);
 });

 it("records a read that fails partway and still hands pi its response",async()=>{
  const h=harness();const encoder=new TextEncoder();let pulls=0;
  const failing=new Response(new ReadableStream<Uint8Array>({pull(c){pulls++;if(pulls===1)c.enqueue(encoder.encode(delta({content:"x"})));else c.error(new Error("connection lost"));}}),{headers:{"content-type":"text/event-stream"}});
  const response=await h.log.fetch(()=>Promise.resolve(failing))(URL_,{method:"POST"});
  await expect(response.text()).rejects.toThrow();
  await settled();h.log.flush();
  expect(h.recorded[0]?.body).toMatchObject({ended:"error",error:"connection lost",content_chars:1});
 });

 it("drops an assistant event with no stream of its own",()=>{
  const h=harness();h.log.observe(assistant(1));h.log.observe(assistant(2));h.log.flush();
  expect(h.recorded).toEqual([]);
 });

 it("builds the chat URL from the model's base URL",()=>{
  expect(chatCompletionsUrl("http://x/v1")).toBe("http://x/v1/chat/completions");
  expect(chatCompletionsUrl("http://x/v1/")).toBe("http://x/v1/chat/completions");
 });
});
