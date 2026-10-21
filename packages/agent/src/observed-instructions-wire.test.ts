import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {Type} from "typebox";
import {Governor,piLoop,play} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {contextTools} from "./play-wiring.js";
import {SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";

it.each([false,true])("sends exact recorded memory through pinned pi HTTP on every turn, compact=%s, with no added tools",async trim=>{
 const requests:unknown[]=[];
 const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"instruction-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(chunk:string)=>{body+=chunk;});req.on("end",()=>{
   requests.push(JSON.parse(body) as unknown);res.writeHead(200,{"content-type":"text/event-stream"});
   for(const [delta,finish] of [[{role:"assistant",tool_calls:[{index:0,id:`observe-${String(requests.length)}`,type:"function",function:{name:"observe",arguments:"{}"}}]},null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"instruction-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const {port}=server.address() as AddressInfo;
  const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["instruction-fixture"]}),"instruction-fixture");
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/observed-instructions-norman.json",import.meta.url),"utf8")) as {events:unknown[]};
  for(const enabled of [false,true]){
   requests.length=0;const subscribers:((event:RunEvent)=>void)[]=[],records:{text:string;evidence:number[]}[]=[];
   const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":enabled,"milestone-instruction-memory-v1":enabled&&trim} as FeatureSet;
   const wiring=contextTools(features,{subscribe:fn=>{subscribers.push(fn);},recordLedgerContext:body=>{records.push(body);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>{}},messages=>Promise.resolve(messages));
   for(const e of fixture.events.map(checkEvent))for(const fn of subscribers)fn(e);
   const abort=new AbortController();const governor=new Governor({limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{abort.abort();},now:()=>0});
   const observe={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"ordinary observation"}],details:undefined})};
   const loop=piLoop({systemPrompt:"Play",tools:[observe,...wiring.tools],base:gatewayLoopConfig(model,"off"),governor,signal:abort.signal,transformContext:wiring.transformContext,emit:()=>{}});
   expect(await play({role:"user",content:"Play",timestamp:0},governor,loop)).toBe("budget");
   expect(requests).toHaveLength(2);expect(wiring.tools).toEqual([]);
   if(enabled){
    expect(records).toHaveLength(2);
    for(const [i,record] of records.entries()){
     expect(JSON.stringify(requests[i])).toContain(JSON.stringify(record.text).slice(1,-1));
     expect(record.text).toContain("ROXANNE");if(trim)expect(record.text).toContain('"columns":');expect(record.evidence).toContain(2882);
    }
   }else{expect(records).toEqual([]);expect(JSON.stringify(requests)).not.toContain("OBSERVED INSTRUCTION MEMORY");}
  }
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});}
});
