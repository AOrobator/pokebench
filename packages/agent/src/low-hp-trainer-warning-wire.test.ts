// low-hp-trainer-warning-v1 through the pinned pi loop: the production playGameTools, a real RunRecorder and an
// OpenAI-compatible gateway fixture. The first model reply calls observe on run 54a7's T363 state; the second
// request must carry the warning in that tool result, and the run log must hold the event and the augmented result.
// One real-adapter run (ON); OFF and the trigger matrix are proven in memory in low-hp-trainer-warning.test.ts.
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {featuresOf,type FeatureSet} from "./features.js";
import {Governor,piLoop,play} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState} from "./game-state.js";
import {playGameTools} from "./play-wiring.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";

const ID="low-hp-trainer-warning-v1";
const RUN54A7=JSON.parse(readFileSync(new URL("../test-support/trainer-heal-54a7.json",import.meta.url),"utf8")) as {harness_features:string[];states:{turn:number;state:unknown}[]};
const T363=parseGameState(RUN54A7.states.find(s=>s.turn===363)?.state);
const WARNING="SUPERVISOR: Your TORCHIC has 3/21 HP (below half), and your rival MAY is on this map at (10,3).";
// The bundle's switches, minus the ones whose tool wrappers need the real game server (navigation, auto-advance).
const BASE:FeatureSet={...featuresOf(RUN54A7.harness_features),"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false};

it("delivers the warning to the next model request through pi and records the event before the augmented tool result (OFF is proven in memory in low-hp-trainer-warning.test.ts)",async()=>{
 const requests:string[]=[];
 const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"warning-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(part:string)=>{body+=part;});req.on("end",()=>{
   requests.push(body);res.writeHead(200,{"content-type":"text/event-stream"});
   for(const [delta,finish] of [[{role:"assistant",tool_calls:[{index:0,id:`observe-${String(requests.length)}`,type:"function",function:{name:"observe",arguments:"{}"}}]},null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"warning-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 const root=mkdtempSync(join(tmpdir(),"pokebench-low-hp-wire-"));
 try{
  const {port}=server.address() as AddressInfo;
  const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["warning-fixture"]}),"warning-fixture");
  {
   const log=RunLog.create(root,"on");
   const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(T363)}});
   await recorder.start(RUN_START_META);
   const game=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:`${name}: ROUTE103 readout`}],details:{state:T363}})});
   const tools=playGameTools([game("observe"),game("press")],{...BASE,[ID]:true},{read:()=>Promise.resolve(T363)},recorder);
   const abort=new AbortController();
   const governor=new Governor({limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{abort.abort();},now:()=>0});
   const loop=piLoop({systemPrompt:"Play",tools,base:gatewayLoopConfig(model,"off"),governor,signal:abort.signal,transformContext:m=>Promise.resolve(m),emit:event=>recorder.emit(event)});
   expect(await play({role:"user",content:"Play",timestamp:0},governor,loop)).toBe("budget");
   recorder.end("budget");
   expect(requests).toHaveLength(2);
   const events:RunEvent[]=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
   const warnings=events.filter(e=>e.type==="low_hp_trainer_warning");
   const results=events.filter((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result");
   {
    // The first tool result reached the second request with the paragraph after the readout.
    expect(requests[0]).not.toContain(WARNING);
    expect(requests[1]).toContain(WARNING);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({tool:"observe",species:"TORCHIC",hp:3,max_hp:21,rival:"MAY",x:10,y:3});
    expect(results[0]?.text).toContain(`observe: ROUTE103 readout\n${WARNING}`);
    expect(must(warnings[0]).seq).toBeLessThan(must(results[0]).seq);
    // Once only: the second observe on the same state adds nothing.
    expect(results[1]?.text).toBe("observe: ROUTE103 readout");
   }
  }
 }finally{
  rmSync(root,{recursive:true,force:true});
  await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});
 }
});

function must<T>(value:T|undefined):T {if(value===undefined)throw new Error("missing");return value;}
