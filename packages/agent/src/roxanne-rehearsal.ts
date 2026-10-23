import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,type AssistantMessage,type Message,type Model} from "@mariozechner/pi-ai";
import {Governor,piLoop,playFromHistory} from "./harness.js";
import {flagFeatures} from "./play-preset.js";
import {CampaignController,digest,type CampaignJob} from "./roxanne-campaign.js";
import {runAutonomousCampaign,type AutonomousHost,type AutonomousInputs,type AutonomousResult} from "./roxanne-autonomous.js";
import {prepareContinuation} from "./roxanne-continuation.js";
import {buildRestoreBundle} from "./roxanne-restore.js";
import {scoreRecovery,scoreReadiness,type RecoveryFrame} from "./roxanne-score.js";
import {episodeTraceHash,gradeDigest,type BlindJudgment,type EpisodeOutcome} from "./roxanne-campaign-runner.js";

class VirtualClock{
 now=0;
 private waits:{at:number;resolve:()=>void}[]=[];
 private timers:{at:number;abort:()=>void;active:boolean}[]=[];
 private queued=false;
 deadline(at:number,abort:()=>void):()=>void{const timer={at,abort,active:true};this.timers.push(timer);return ()=>{timer.active=false;};}
 wait(at:number):Promise<void>{return new Promise(resolve=>{this.waits.push({at,resolve});if(!this.queued){this.queued=true;queueMicrotask(()=>{this.pulse();});}});}
 private pulse():void{
  this.queued=false;if(this.waits.length===0)return;
  const at=Math.min(...this.waits.map(w=>w.at));this.now=at;
  for(const timer of this.timers)if(timer.active&&timer.at<=at){timer.active=false;timer.abort();}
  const ready=this.waits.filter(w=>w.at===at);this.waits=this.waits.filter(w=>w.at!==at);for(const w of ready)w.resolve();
  if(this.waits.length>0){this.queued=true;queueMicrotask(()=>{this.pulse();});}
 }
}
const FIXTURE_MODEL:Model<"openai-completions">={id:"offline-rehearsal-fixture",name:"offline fixture",api:"openai-completions",provider:"offline",baseUrl:"http://never-contact.invalid",reasoning:false,input:["text"],contextWindow:65536,maxTokens:1000,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
const mon={identity:"fixture-mon",species:280,level:15,moves:[10,45,116,52]};
function frame(seq:number,extra:Partial<RecoveryFrame>={}):RecoveryFrame{return {seq,turn:seq,elapsedMs:seq*100,map:[11,3],party:[mon],roxanneBattle:false,victory:false,coherent:true,...extra};}
const history:Message[]=[{role:"user",content:"REHEARSAL ONLY: the recorded full-health team lost. Continue playing.",timestamp:0}];
const bytes=Buffer.from("REHEARSAL ONLY; NOT A NATIVE SAVE");
const fixtureBundle=buildRestoreBundle({sourceRun:"rehearsal-source",sourceCommit:"0".repeat(40),turn:1,stateSeq:1,stateBytes:bytes,nativeReceipt:{passed:true,frame:1,ewram:"0".repeat(64),iwram:"0".repeat(64),registers:true,restored:true,inputReady:true,insideGym:true},history,eventsPrefix:"REHEARSAL PREFIX",systemPrompt:"Offline fixture.",toolsHash:digest([]),rtcUnixMs:1792600000000});
export interface RehearsalReceipt{readonly mode:"fake-clock-scripted-model";readonly gpuCalls:0;readonly finishEarlyMs:number;readonly modelResponses:number;readonly episodes:number;readonly spentMs:number;readonly wallMs:number;readonly leasesReleased:boolean;readonly result:AutonomousResult}
/** Runs the production agent loop, controller and scorer; only model responses/game actions/clock are fixtures. */
export async function rehearseCampaign(controller:CampaignController,write:(id:string,value:unknown)=>void,scenario:"revision_wins"|"no_nominee"="revision_wins",finishEarlyMs=0):Promise<RehearsalReceipt>{
 if(!Number.isSafeInteger(finishEarlyMs)||finishEarlyMs<0||finishEarlyMs>=600_000)throw new Error("invalid fixture completion timing");
 const clock=new VirtualClock(),held=new Set<string>();let responses=0,episodes=0;
 const prefixes=new Map<string,EpisodeOutcome>();const prompts=new Map<string,string>();
 const inputs:AutonomousInputs={development:[{id:"development-one",family:"dev-one",restoreHash:"1".repeat(64),qualified:true},{id:"development-two",family:"dev-two",restoreHash:"2".repeat(64),qualified:true}],readiness:[{id:"ready-one",family:"ready-one",restoreHash:"3".repeat(64),qualified:true},{id:"ready-two",family:"ready-two",restoreHash:"4".repeat(64),qualified:true}],endpoints:["fixture-gpu0","fixture-gpu1"],seed:20261023};

 const host:AutonomousHost={
  mode:"offline-fixture",
  now:()=>clock.now,
  acquire:endpoint=>{if(held.has(endpoint))throw new Error("overlapping fake lease");held.add(endpoint);return Promise.resolve(()=>{held.delete(endpoint);return Promise.resolve();});},
  deadline:(at,abort)=>clock.deadline(at,abort),
  episode:async(job:CampaignJob,_signal,deadline)=>{
   episodes++;
   const success=scenario!=="no_nominee"&&job.arm!=="baseline"&&(job.arm.endsWith("-r1")||job.arm==="a"&&job.family==="dev-one");
   const ready=job.id.startsWith("control-");
   const text=job.arm==="baseline"?"":prompts.get(job.promptHash);if(text===undefined||digest(text)!==job.promptHash)throw new Error("episode reminder differs from frozen prompt");
   const prepared=prepareContinuation({...flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false}),"roxanne-campaign-reminder-v1":job.arm!=="baseline"},fixtureBundle,bytes,history,"REHEARSAL PREFIX",text);
   const messages:Message[]=[...prepared.messages];const frames=[frame(0)];let step=0;
   const signal=new AbortController();const governor=new Governor({retry:()=>undefined,limits:{maxTurns:5,maxWallMs:30_000,failureLimit:1},abort:()=>{signal.abort();},now:()=>0});
   const tools:AgentTool[]=[{name:"fixture_step",label:"scripted game step",description:"Offline rehearsal game response",parameters:Type.Object({}),execute:()=>{step++;frames.push(ready?frame(step,{roxanneBattle:true}):success?step===1?frame(step,{map:[0,3]}):step===2?frame(step,{map:[0,31],party:[{...mon,level:16}]}):frame(step,{party:[{...mon,level:16}],roxanneBattle:true,victory:step>=4}):frame(step,{roxanneBattle:step>=2}));return Promise.resolve({content:[{type:"text",text:`REHEARSAL observation ${String(step)}`}],details:{}});}}];
   const loop=piLoop({systemPrompt:"REHEARSAL ONLY",tools,base:{model:FIXTURE_MODEL,convertToLlm:rows=>rows as Message[]},governor,transformContext:m=>Promise.resolve(m),emit:event=>{if(event.type==="message_end"&&"role"in event.message)messages.push(event.message as Message);},signal:signal.signal,
    streamFn:()=>{responses++;const stream=createAssistantMessageEventStream();const response:AssistantMessage={role:"assistant",content:[{type:"toolCall",id:`fixture-${String(responses)}`,name:"fixture_step",arguments:{}}],api:"openai-completions",provider:"offline",model:FIXTURE_MODEL.id,usage:{input:10,output:5,cacheRead:0,cacheWrite:0,totalTokens:15,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"toolUse",timestamp:0};stream.push({type:"done",reason:"toolUse",message:response});return stream;}});
   await playFromHistory(prepared.messages,governor,loop);
   await clock.wait(deadline-finishEarlyMs);
   const outcome={reason:"budget",messages,reminder:prepared.receipt,trace:{kind:"fixture" as const,frames},nativeScore:scoreRecovery(frames),...(ready?{readinessPassed:scoreReadiness(frames)}:{})};return {...outcome,traceHash:episodeTraceHash(outcome)};
  },
  record:(id,outcome)=>{prefixes.set(id,outcome);write(id,{mode:"fixture",...outcome});return Promise.resolve();},
  grade:rows=>{const judgments:BlindJudgment[]=rows.map(row=>({id:row.id,diagnosis:row.nativeScore.strictRecovery?"none":"invalid_action",factualError:false,verified:row.nativeScore.verified,tokens:75,evidence:[`${row.id}:native-sequence`]}));write(`grades-${String(controller.state.batches.length)}`,{mode:"fixture",rows,judgments});return Promise.resolve({hash:gradeDigest(rows.map(r=>r.id),judgments),ids:rows.map(r=>r.id),judgments});},
  freezeCandidate:c=>{prompts.set(c.hash,c.text);write(`candidate-${c.hash}`,c);return Promise.resolve();},
  freezeFinalist:f=>{write("frozen-finalist",f);return Promise.resolve();},
  qualifyHeldout:()=>{const validated:[{id:string;family:string;restoreHash:string;qualified:true},{id:string;family:string;restoreHash:string;qualified:true}]=[{id:"heldout-one",family:"heldout-one",restoreHash:"5".repeat(64),qualified:true},{id:"heldout-two",family:"heldout-two",restoreHash:"6".repeat(64),qualified:true}];return Promise.resolve([validated[0],validated[1]]);},
  report:r=>{write("report",r);return Promise.resolve();},
 };
 const result=await runAutonomousCampaign(controller,inputs,host);
 const receipt:RehearsalReceipt={mode:"fake-clock-scripted-model",gpuCalls:0,finishEarlyMs,modelResponses:responses,episodes,spentMs:controller.state.spentMs,wallMs:clock.now,leasesReleased:held.size===0,result};write("rehearsal-receipt",receipt);return receipt;
}
