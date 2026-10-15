import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it} from "vitest";
import {Type} from "typebox";
import {Value} from "typebox/value";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {ALL_ON} from "./features.js";
import {Governor} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {StateWatcher} from "./game-state.js";
import {FrameStore} from "./frames.js";
import {RunLog} from "./run-log.js";
import {RunRecorder} from "./recorder.js";
import {parseEvent} from "./events.js";
import {runStateMode} from "./state-runtime.js";
const Action=Type.Object({buttons:Type.Array(Type.String()),hold_frames:Type.Integer(),release_frames:Type.Integer()});
it.each([false,true])("runs production state-mode seams (malformed arguments=%s)",async malformed=>{
 const dir=mkdtempSync(join(tmpdir(),"state-runtime-fixture-"));const requests:unknown[]=[];const calls:string[]=[];let y=8;
 const image=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(image);image.write("IHDR",12,"ascii");image.writeUInt32BE(240,16);image.writeUInt32BE(160,20);
 const state=()=>({...IN_GAME,position:{x:5,y}});
 const server=createServer((req,res)=>{
  calls.push(`${req.method??""} ${req.url??""}`);res.setHeader("content-type","application/json");
  if(req.url==="/v1/models"){res.end(JSON.stringify({data:[{id:"runtime-fixture",context_window:65536,max_tokens:4096}]}));return;}
  if(req.url==="/pokebench/state"){res.end(JSON.stringify(state()));return;}
  if(req.url==="/pokebench/observation"){res.end(JSON.stringify({state:state(),state_text:`Player at (5,${String(y)})`,screenshot_base64:image.toString("base64")}));return;}
  if(req.url==="/queue_status"){res.end(JSON.stringify({queue_empty:true}));return;}
  let raw="";req.setEncoding("utf8");req.on("data",(part:string)=>{raw+=part;});req.on("end",()=>{
   const body:unknown=JSON.parse(raw);
   if(req.url==="/action"){
    if(!Value.Check(Action,body)){res.statusCode=400;res.end(JSON.stringify({status:"error"}));return;}
    if(body.buttons[0]==="UP")y--;res.end(JSON.stringify({status:"success"}));return;
   }
   requests.push(body);res.setHeader("content-type","text/event-stream");
   const args=malformed?null:requests.length===1?{kind:"press",buttons:["UP"]}:{kind:"wait",duration_ms:1};
   const delta={tool_calls:[{index:0,id:`action-${String(requests.length)}`,type:"function",function:{name:"act",arguments:JSON.stringify(args)}}]};
   for(const [d,finish] of [[delta,null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"runtime-fixture",choices:[{index:0,delta:d,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const {port}=server.address() as AddressInfo;const url=`http://127.0.0.1:${String(port)}`;
  const model=selectModel(await discoverModels({gatewayUrl:`${url}/v1`,visionModels:["runtime-fixture"]}),"runtime-fixture");
  const log=RunLog.create(dir,"state-runtime-fixture");const recorder=new RunRecorder({log,frames:new FrameStore(dir,10000,()=>{}),gameState:new StateWatcher(url),milestones:{poll:()=>Promise.resolve([])}});
  await recorder.start({...RUN_START_META,harness_features:["ram-state-v1","state-only-decisions-v1"],tools:["act"]});
  const signal=new AbortController();const governor=new Governor({limits:{maxTurns:malformed?5:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{signal.abort();},now:()=>0});
  const features={...ALL_ON,"navigation-evidence-memory-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"state-only-decisions-v1":true,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false,"deterministic-loop-guard-v1":false,"bounded-navigation-v1":false,"press-result-v1":false};
  expect(await runStateMode({features,target:null,serverUrl:url,recorder,governor,base:gatewayLoopConfig(model,"off"),signal:signal.signal,gate:()=>Promise.resolve()})).toBe(malformed?"model_error":"budget");
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
  expect(events.filter(e=>e.type==="decision_input").map(e=>e.decision_turn)).toEqual(malformed?[1,2,3]:[1,2]);
  expect(events.filter(e=>e.type==="decision_input").map(e=>e.text)).toEqual(malformed?["Player at (5,8)","Player at (5,8)","Player at (5,8)"]:["Player at (5,8)","Player at (5,7)"]);
  expect(events.filter(e=>e.type==="wait_input").map(e=>e.duration_ms)).toEqual(malformed?[]:[1]);expect(events.filter(e=>e.type==="button_press").map(e=>e.buttons)).toEqual(malformed?[]:[["UP"]]);
  expect(events.filter(e=>e.type==="tool_call").map(e=>e.name)).toEqual(malformed?["act","act","act"]:["act","act"]);
  const turns=events.filter(e=>e.type==="turn_start");expect(turns.map(e=>[e.context.messages,e.context.images])).toEqual(malformed?[[1,1],[1,1],[1,1]]:[[1,1],[1,1]]);for(const e of turns)expect(e.context.est_tokens).toBeGreaterThan(0);
  if(malformed)expect(events.filter(e=>e.type==="tool_call").map(e=>e.args)).toEqual([null,null,null]);
  expect(requests).toHaveLength(malformed?3:2);expect(calls.filter(x=>x==="GET /pokebench/observation")).toHaveLength(malformed?3:4);expect(calls.filter(x=>x==="POST /action")).toHaveLength(malformed?0:1);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});rmSync(dir,{recursive:true});}
});
