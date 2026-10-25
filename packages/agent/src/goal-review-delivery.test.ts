import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,StreamFn} from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,type Message,type Model} from "@mariozechner/pi-ai";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {RUN_START_META} from "../test-support/events.js";
import {must,snapshot} from "../test-support/instruction-goals.js";
import {FrameStore} from "./frames.js";
import {Governor,piLoop,play} from "./harness.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {checkEvent,parseEvent} from "./events.js";
import {featuresOf,SWITCHABLE_FEATURES} from "./features.js";
import {contextTools,playGameTools} from "./play-wiring.js";
import {playSystemPrompt} from "./play-config.js";
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz",import.meta.url))).toString()) as {events:unknown[]};
const history=fixture.events.map(checkEvent).filter(e=>e.seq<=39462),state=snapshot(must(history.find(e=>e.type==="state")));
const model:Model<"openai-completions">={id:"offline-goal-review-fixture",name:"offline-goal-review-fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:100};
it.each([
 {advisory:false,malformed:false,invalidAction:false},
 {advisory:true,malformed:false,invalidAction:false},
 {advisory:true,malformed:true,invalidAction:false},
 {advisory:true,malformed:false,invalidAction:true},
])("pinned pi delivery and validation: %j",async({advisory,malformed,invalidAction})=>{
 const root=mkdtempSync(join(tmpdir(),"goal-review-delivery-"));
 try{
  const log=RunLog.create(root,"offline-goal-review",()=>new Date("2026-10-25T18:00:00Z"),80000);
  const recorder=new RunRecorder({log,frames:new FrameStore(log.runDir),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)},history,restoreRunIdentity:true});
  const f={...featuresOf([]),"instruction-goal-ledger-v1":true,"instruction-goal-advisory-v1":advisory,"goal-review-repair-feedback-v1":true};
  const wiring=contextTools(f,recorder,recorder.transformContext);let actions=0;
  const action:AgentTool={name:"press",label:"Press",description:"Press",parameters:Type.Object({buttons:Type.Array(Type.Enum(["A","B"]))}),execute:()=>{actions++;return Promise.resolve({content:[{type:"text",text:"ordinary validated action result"}],details:{state}});}};
  const tools=playGameTools([action,...wiring.tools],f,{read:()=>Promise.resolve(state)},recorder,undefined,[],undefined,wiring.instructionGoals);
  const prompt=playSystemPrompt(f,null);
  await recorder.start({...RUN_START_META,harness_features:SWITCHABLE_FEATURES.filter(id=>f[id]),tools:tools.map(t=>t.name),system_prompt:prompt});
  await recorder.restoreHistory(()=>Promise.resolve());
  const before=must(wiring.instructionGoals).ledger.pending();
  const governor=new Governor({limits:{maxTurns:2,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  let decisions=0,delivered="";
  const feedback=invalidAction?'Validation failed for tool "press"':malformed?"Invalid goal review at /:":"reviewed[0].episode 123 was not delivered; recent delivered episode IDs: [39430,39462]";
  const streamFn:StreamFn=(_model,context)=>{
   decisions++;
   if(decisions===2){delivered=context.messages.filter(m=>m.role==="toolResult").flatMap(m=>m.content.filter(c=>c.type==="text").map(c=>c.text)).join("\n");expect(delivered).toContain(feedback);expect(delivered.includes("ordinary validated action result")).toBe(advisory&&!invalidAction);}
   const message=decisions===1?assistant({toolCalls:[toolCall("invalid-review","press",{buttons:[invalidAction?"NOT_A_BUTTON":"B"],goal_review:malformed?{}:{reviewed:[{episode:123,interpretation:"unknown"}],updates:[]}})],stopReason:"toolUse"}):assistant({text:"offline proof complete"});
   const stream=createAssistantMessageEventStream();stream.push({type:"done",reason:message.stopReason==="toolUse"?"toolUse":"stop",message});return stream;
  };
  const loop=piLoop({systemPrompt:prompt,tools,base:{model,convertToLlm:messages=>messages as Message[]},governor,transformContext:wiring.transformContext,emit:recorder.emit,streamFn,signal:new AbortController().signal});
  expect(await play(userText("Offline delivery proof"),governor,loop)).toBe("budget");recorder.end("budget");
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
  const result=must(events.find(e=>e.type==="tool_result"&&e.id==="invalid-review"));
  expect(result).toMatchObject({type:"tool_result",text:delivered,is_error:invalidAction});expect(delivered).toContain(feedback);expect(decisions).toBe(2);expect(actions).toBe(advisory&&!invalidAction?1:0);expect(wiring.instructionGoals?.ledger.pending()).toEqual(before);
  expect(events.filter(e=>e.type==="ledger_context"&&e.instruction_goals!==undefined)).toEqual([]);
  const output=process.env.POKEBENCH_GOAL_REVIEW_TEST_EXPORT;if(advisory&&!malformed&&!invalidAction&&output!==undefined)writeFileSync(output,readFileSync(log.eventsPath));
 }finally{rmSync(root,{recursive:true,force:true});}
});
