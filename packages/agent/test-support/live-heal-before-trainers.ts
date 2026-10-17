// Live proof helper (not a test): records a scratch run with heal-before-trainers-v1 ON through the production
// playGameTools, a real RunRecorder and the pinned pi loop (a gateway fixture whose model calls observe each turn), over
// run e046's recorded tool-result states 6851-16828, then serves it on an isolated built viewer for a browser check.
// Usage: npx tsx test-support/live-heal-before-trainers.ts <scratch-runs-root> <port>
// The scratch root must not be ~/dev/pokebench/runs; it holds no experiments/ approvals or ledgers.
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {SWITCHABLE_FEATURES,featuresOf,type FeatureSet} from "../src/features.js";
import {Governor,piLoop,play} from "../src/harness.js";
import {discoverModels,selectModel} from "../src/gateway.js";
import {gatewayLoopConfig} from "../src/provider.js";
import {parseGameState} from "../src/game-state.js";
import {playGameTools} from "../src/play-wiring.js";
import {RunRecorder} from "../src/recorder.js";
import {RunLog} from "../src/run-log.js";
import {FrameStore} from "../src/frames.js";
import {RUN_START_META} from "./events.js";

const [root,portText]=process.argv.slice(2);
if(root===undefined||portText===undefined||root.includes("/dev/pokebench/runs"))throw new Error("usage: <scratch-runs-root> <port>");
const E046=JSON.parse(readFileSync(new URL("./heal-before-trainers-e046.json",import.meta.url),"utf8")) as {harness_features:string[];states:{seq:number;state:unknown}[]};
const PLACES:unknown=JSON.parse(readFileSync(new URL("./story-destinations-places.json",import.meta.url),"utf8"));
const states=E046.states.map(s=>parseGameState(s.state));
const features:FeatureSet={...featuresOf(E046.harness_features),"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false,"low-hp-trainer-warning-v1":true,"heal-before-trainers-v1":true};

const server=createServer((req,res)=>{
 if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"proof-fixture",context_window:65536,max_tokens:4096}]}));return;}
 req.resume();req.on("end",()=>{
  res.writeHead(200,{"content-type":"text/event-stream"});
  for(const [delta,finish] of [[{role:"assistant",tool_calls:[{index:0,id:`observe-${String(Date.now())}`,type:"function",function:{name:"observe",arguments:"{}"}}]},null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"proof-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
  res.end("data: [DONE]\n\n");
 });
});
await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
const {port}=server.address() as AddressInfo;
const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["proof-fixture"]}),"proof-fixture");
const runId=`2026-10-17T16-00-00_proof_hbt1`;
const log=RunLog.create(root,runId);
let i=0;
const current=()=>states[Math.min(i,states.length-1)]??states[0];
const recorder=new RunRecorder({log,frames:new FrameStore(log.runDir),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(current() as ReturnType<typeof parseGameState>)}});
// The switches only: measurement features would need the game server's journals.
await recorder.start({...RUN_START_META,harness_features:SWITCHABLE_FEATURES.filter(id=>features[id])});
const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>{const state=current();i++;return Promise.resolve({content:[{type:"text" as const,text:`observe: ${state?.location??"?"} readout`}],details:{state}});}};
const tools=playGameTools([observe],features,{read:()=>Promise.resolve(current() as ReturnType<typeof parseGameState>),places:()=>Promise.resolve(PLACES)},recorder);
const abort=new AbortController();
const governor=new Governor({limits:{maxTurns:states.length,maxWallMs:60000,failureLimit:3},retry:()=>{},abort:()=>{abort.abort();},now:()=>0});
const loop=piLoop({systemPrompt:"Play",tools,base:gatewayLoopConfig(model,"off"),governor,signal:abort.signal,transformContext:m=>Promise.resolve(m),emit:event=>recorder.emit(event)});
await play({role:"user",content:"Play",timestamp:0},governor,loop);
recorder.end("budget");
server.close();
const viewerDist=fileURLToPath(new URL("../../viewer/dist/",import.meta.url));
const {startViewer}=await import(`${viewerDist}server.js`) as {startViewer:(o:{runsRoot:string;staticDir:string;appDir:string;port:number})=>Promise<{port:number}>};
const viewer=await startViewer({runsRoot:root,staticDir:fileURLToPath(new URL("../../viewer/static/",import.meta.url)),appDir:viewerDist,port:Number(portText)});
console.log(`run ${log.runDir}\nviewer http://127.0.0.1:${String(viewer.port)}/`);
