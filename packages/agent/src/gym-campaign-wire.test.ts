import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {Governor,piLoop,play} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {contextTools} from "./play-wiring.js";
import {featuresOf} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";

it("delivers the persistent checklist through real pi HTTP after older history is pruned",async()=>{
 const requests:unknown[]=[];
 const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(chunk:string)=>{body+=chunk;});req.on("end",()=>{
   requests.push(JSON.parse(body) as unknown);res.writeHead(200,{"content-type":"text/event-stream"});
   for(const [delta,finish] of [[{role:"assistant",tool_calls:[{index:0,id:`o${String(requests.length)}`,type:"function",function:{name:"observe",arguments:"{}"}}]},null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const {port}=server.address() as AddressInfo;
  const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["fixture"]}),"fixture");
  const rows=(JSON.parse(gunzipSync(readFileSync(new URL("../test-support/gym-campaign-6bbd.json.gz",import.meta.url))).toString()) as unknown[]).map(checkEvent);
  for(const enabled of [false,true]){
   requests.length=0;const listeners:((e:RunEvent)=>void)[]=[],notes:string[]=[];
   const wiring=contextTools({...featuresOf([]),"discovered-gym-checklist-v1":enabled},{subscribe:f=>{listeners.push(f);},recordLedgerContext:n=>{notes.push(n.text);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>{}},messages=>Promise.resolve(messages));
   for(const e of rows.slice(0,2))for(const f of listeners)f(e);
   const abort=new AbortController(),governor=new Governor({limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{abort.abort();},now:()=>0});
   const observe={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:(id:string)=>{
    const state=rows[4],result=rows[5];if(state?.type!=="state"||result?.type!=="tool_result")throw Error("fixture");
    for(const e of [state,{...result,id,name:"observe" as const}])for(const f of listeners)f(e);
    return Promise.resolve({content:[{type:"text" as const,text:result.text}],details:undefined});
   }};
   const prune=(messages:AgentMessage[])=>{const last=messages.findLast(m=>m.role==="toolResult");return wiring.transformContext(last===undefined?messages:[last]);};
   const loop=piLoop({systemPrompt:"Play",tools:[observe],base:gatewayLoopConfig(model,"off"),governor,signal:abort.signal,transformContext:prune,emit:()=>{}});
   expect(await play({role:"user",content:"Play",timestamp:0},governor,loop)).toBe("budget");
   expect(requests).toHaveLength(2);expect(wiring.tools).toEqual([]);
   expect(JSON.stringify(requests[1]).includes("DEWFORD TOWN GYM — unfinished; discovered at result 66304")).toBe(enabled);
   expect(notes.length).toBe(enabled?2:0);
  }
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});}
});
