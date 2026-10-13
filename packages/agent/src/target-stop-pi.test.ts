import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it} from "vitest";
import type {AgentTool,StreamFn} from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,type Message,type Model} from "@mariozechner/pi-ai";
import {Type} from "typebox";
import {NAME_CONFIRMED,RUN_START_META} from "../test-support/events.js";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {parseEvent} from "./events.js";
import {FrameStore} from "./frames.js";
import {Governor,piLoop,play} from "./harness.js";
import {StateMilestones} from "./milestones.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {NativeTargetStop} from "./target-stop.js";
const MODEL:Model<"openai-completions">={id:"fixture",name:"fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:1000,maxTokens:100};
it("native target finishes the current real pi tool/frame and blocks its trailing batch action without retries",async()=>{
 const root=mkdtempSync(join(tmpdir(),"native-target-"));try{
 const log=RunLog.create(root,"target-proof");const initial={...NAME_CONFIRMED,story:{...NAME_CONFIRMED.story,name_confirmed:false}};
 const state={read:()=>Promise.resolve(initial)};const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:new StateMilestones(state),gameState:state});await recorder.start(RUN_START_META);
 const retries:string[]=[];const controller=new AbortController();const governor=new Governor({limits:{maxTurns:10,maxWallMs:600000,failureLimit:3},retry:reason=>retries.push(reason),abort:()=>controller.abort(),now:()=>0});
 const target=new NativeTargetStop("target-proof","PLAYER_NAME_CONFIRMED",proof=>{recorder.setTargetProof(proof);governor.stop("milestone");});recorder.subscribe(event=>target.observe(event));
 const executed:string[]=[];const tools:AgentTool[]=["observe","press"].map(name=>({name,label:name,description:name,parameters:Type.Object({}),execute:()=>{executed.push(name);return Promise.resolve({content:[{type:"text" as const,text:"Accepted name from native state"},{type:"image" as const,data:Buffer.from("fixture-frame").toString("base64"),mimeType:"image/png" as const}],details:{state:NAME_CONFIRMED}});}}));
 const streamFn:StreamFn=()=>{const stream=createAssistantMessageEventStream();const message=assistant({toolCalls:[toolCall("accept","observe",{}),toolCall("must-not-press","press",{})],stopReason:"toolUse"});stream.push({type:"done",reason:"toolUse",message});return stream;};
 const loop=piLoop({systemPrompt:"play",tools,base:{model:MODEL,convertToLlm:messages=>messages as Message[]},governor,transformContext:recorder.transformContext,emit:recorder.emit,signal:controller.signal,streamFn});
 expect(await play(userText("play"),governor,loop)).toBe("milestone");recorder.end("milestone");expect(executed).toEqual(["observe"]);expect(retries).toEqual([]);expect(controller.signal.aborted).toBe(false);
 const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);const result=events.find(event=>event.type==="tool_result"&&event.id==="accept");expect(result).toMatchObject({is_error:false,frames:[{path:expect.any(String),sha1:expect.any(String)}]});expect(events.at(-1)).toMatchObject({type:"run_end",reason:"milestone",target_proof:{name:"PLAYER_NAME_CONFIRMED",milestone_seq:expect.any(Number),state_evidence:[expect.any(Number)]}});
 }finally{rmSync(root,{recursive:true,force:true});}
});
