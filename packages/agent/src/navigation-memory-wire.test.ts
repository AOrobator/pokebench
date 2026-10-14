import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {expect,it} from "vitest";
import {Type} from "typebox";
import {navigationMemory} from "./navigation-memory.js";
import {ALL_ON} from "./features.js";
import {Governor,piLoop,play} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {checkEvent,type BodyOf, type RunEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";
it("delivers exact recorded ledger through pinned pi HTTP context only when ON and exposes optional tool",async()=>{
 const requests:unknown[]=[];const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"memory-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(part:string)=>{body+=part;});req.on("end",()=>{
   requests.push(JSON.parse(body) as unknown);res.writeHead(200,{"content-type":"text/event-stream"});
   for(const [delta,finish] of [[{role:"assistant",tool_calls:[{index:0,id:`observe-${String(requests.length)}`,type:"function",function:{name:"observe",arguments:"{}"}}]},null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"memory-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const {port}=server.address() as AddressInfo;const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["memory-fixture"]}),"memory-fixture");
  for(const enabled of [false,true]){
   requests.length=0;const bodies:Omit<BodyOf<"navigation_context">,"type"|"turn">[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
   const features={...ALL_ON,"navigation-evidence-memory-v1":enabled};
   const memory=navigationMemory(features,{subscribe:cb=>{subscribers.push(cb);},recordNavigationContext:b=>{bodies.push(b);}},messages=>Promise.resolve(messages));
   const fact=checkEvent({v:1,run:"wire-proof",seq:1,t:"2026-10-14T12:00:00.000-04:00",turn:0,type:"state",...IN_GAME,started:true,screen:"overworld",location:"Actual Room",world_context:{objects:[],triggers:[],dialogue:"Observed instruction from native text"}});
   for(const cb of subscribers)cb(fact);
   const abort=new AbortController();const governor=new Governor({limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{abort.abort();},now:()=>0});
   const observe={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"ordinary current observation"}],details:undefined})};
   const loop=piLoop({systemPrompt:"Play",tools:[observe,...(memory===null?[]:[memory.tool])],base:gatewayLoopConfig(model,"off"),governor,signal:abort.signal,transformContext:memory?.transformContext??(m=>Promise.resolve(m)),emit:()=>{}});
   expect(await play({role:"user",content:"Play",timestamp:0},governor,loop)).toBe("budget");
   expect(requests).toHaveLength(2);const delivered=JSON.stringify(requests);
   if(enabled){expect(bodies).toHaveLength(2);for(const b of bodies){expect(delivered).toContain(JSON.stringify(b.text).slice(1,-1));expect(b.evidence).toEqual([1]);}expect(delivered).toContain("remember_destination");}
   else{expect(bodies).toHaveLength(0);expect(delivered).not.toContain("NAVIGATION EVIDENCE MEMORY");expect(delivered).not.toContain("remember_destination");}
  }
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});}
});
