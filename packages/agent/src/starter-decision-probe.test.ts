import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {RUN_START_META} from "../test-support/events.js";
import {featuresOf,playHarnessFeatures} from "./features.js";
import {parseRun,decisionContext,type ProbePorts} from "./decision-probe.js";
import {STARTER_DECISION_PROMPT} from "./starter-decision.js";
const off=featuresOf([]),on={...off,"starter-decision-salience-v1":true};
const fixture=JSON.parse(readFileSync(new URL("./fixtures/starter-decision.json",import.meta.url),"utf8")) as Record<string,unknown>[];
const state=Object.fromEntries(Object.entries(fixture.find(e=>e["seq"]===2906)??{}).filter(([k])=>!["v","run","seq","t","type","turn"].includes(k)));
const text=String(fixture.find(e=>e["seq"]===2907)?.["text"]);
const ports:ProbePorts={thinkingSignature:"reasoning_content",frame:()=>"unused",rerender:()=>Promise.resolve([])};
const run=(treatment:boolean)=>{
 const bodies=[{type:"run_start",...RUN_START_META,harness_features:playHarnessFeatures(treatment?on:off,"STARTER_CHOSEN"),evaluation:{preset_id:"starter",target:"STARTER_CHOSEN",goal_target:null,failure_limit:3,flags:{loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false}}}, {type:"assistant",thinking:"Inspect.",text:"",tool_calls:[{id:"o",name:"observe",args:{}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},{type:"tool_call",name:"observe",id:"o",args:{}},{type:"state",...state},{type:"tool_result",name:"observe",id:"o",state_seq:3,frames:[],text:text+(treatment?"\n\n"+STARTER_DECISION_PROMPT:""),is_error:false,duration_ms:1},{type:"turn_start",context:{messages:2,images:0,est_tokens:10}}];
 return parseRun(bodies.map((e,seq)=>JSON.stringify({v:1,run:"probe",seq,turn:seq===5?2:1,t:"2026-10-19T12:00:00.000-04:00",...e})).join("\n"));
};
it("replays the actual starter result under both switch states without duplicating or retaining a disabled reminder",async()=>{
 for(const recordedOn of [false,true])for(const enabled of [false,true]){
  const context=await decisionContext(run(recordedOn),2,enabled?on:off,ports,"replayed");
  const result=context.messages.find(m=>m.role==="toolResult");
  expect(result?.role).toBe("toolResult");
  if(result?.role!=="toolResult")throw new Error("missing observation");
  expect(result.content.find(c=>c.type==="text")).toEqual({type:"text",text:text+(enabled?"\n\n"+STARTER_DECISION_PROMPT:"")});
  expect(context.systemPrompt).not.toContain("Your goal is: Reach the native game milestone STARTER CHOSEN");
 }
});
