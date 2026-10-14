import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {expect,it} from "vitest";
import {Type} from "typebox";
import {Value} from "typebox/value";
import {IN_GAME} from "../test-support/events.js";
import {Governor} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {stateDecisions} from "./state-decision.js";

const RequestSchema=Type.Object({model:Type.String(),messages:Type.Array(Type.Object({role:Type.String(),content:Type.Unknown()})),tools:Type.Array(Type.Object({type:Type.String(),function:Type.Object({name:Type.String(),parameters:Type.Object({type:Type.String()})})}))});
const frame="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
it("sends only system and current snapshot through real pinned pi HTTP conversion",async()=>{
 const requests:unknown[]=[];
 const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"state-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let raw="";req.setEncoding("utf8");req.on("data",(part:string)=>{raw+=part;});req.on("end",()=>{
   requests.push(JSON.parse(raw) as unknown);res.writeHead(200,{"content-type":"text/event-stream"});
   const deltas=[{role:"assistant",reasoning_content:"PREVIOUS REASONING MUST NOT PERSIST"},{tool_calls:[{index:0,id:`act-${String(requests.length)}`,type:"function",function:{name:"act",arguments:JSON.stringify({kind:"press",buttons:["A"]})}}]}];
   for(const delta of deltas)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"state-fixture",choices:[{index:0,delta,finish_reason:null}]})}\n\n`);
   res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"state-fixture",choices:[{index:0,delta:{},finish_reason:"tool_calls"}]})}\n\n`);res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const {port}=server.address() as AddressInfo;const gatewayUrl=`http://127.0.0.1:${String(port)}/v1`;
  const model=selectModel(await discoverModels({gatewayUrl,visionModels:["state-fixture"]}),"state-fixture");
  const signal=new AbortController();const governor=new Governor({limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{signal.abort();},now:()=>0});
  const result=await stateDecisions({systemPrompt:"Act on the current snapshot",goal:"Make story progress",base:gatewayLoopConfig(model,"medium"),governor,signal:signal.signal,readSnapshot:()=>Promise.resolve({state:IN_GAME,content:[{type:"image",data:frame,mimeType:"image/png"},{type:"text",text:`CURRENT SNAPSHOT ${String(requests.length+1)}`}]}),recordSnapshot:()=>Promise.resolve(),execute:()=>Promise.resolve({content:[{type:"text",text:"OLD RESULT MUST NOT PERSIST"}],details:{}}),transformContext:m=>Promise.resolve(m),emit:()=>{}});
  expect(result).toBe("budget");expect(requests).toHaveLength(2);
  for(let i=0;i<requests.length;i++){
   const request=requests[i];if(!Value.Check(RequestSchema,request))throw Error(`Invalid HTTP request ${JSON.stringify(request)}`);
   expect(request.messages.map(m=>m.role)).toEqual(["system","user"]);
   expect(request.tools.map(t=>[t.function.name,t.function.parameters.type])).toEqual([["act","object"]]);
   expect(JSON.stringify(request)).toContain(`CURRENT SNAPSHOT ${String(i+1)}`);
   expect(JSON.stringify(request)).toContain(frame);expect(JSON.stringify(request)).not.toContain("MUST NOT PERSIST");
   if(i===1)expect(JSON.stringify(request)).not.toContain("CURRENT SNAPSHOT 1");
  }
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});}
});
