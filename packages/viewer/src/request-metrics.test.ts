import {expect,it} from "vitest";
import {Log,START,state} from "../test-support/events.js";
import {requestMetrics} from "./request-metrics.js";

it("keeps input/cache/output separate and leaves unsupported judgments unknown",()=>{
 const log=new Log();log.add(0,{...START,type:"run_start"});
 log.add(0,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:200}});
 log.add(0,{type:"assistant",turn:1,thinking:"x",text:"",tool_calls:[{id:"x",name:"observe",args:{}}],usage:{input:20,output:7,cache_read:30,cache_write:5},ttft_ms:100,latency_ms:400,stop_reason:"toolUse"});
 log.add(0,{type:"tool_result",turn:1,id:"x",name:"observe",is_error:true,duration_ms:5,text:"failed",frames:[]});
 const view=requestMetrics(log.events);
 expect(view.requests).toHaveLength(1);
 expect(view.requests[0]).toMatchObject({input:20,cacheRead:30,cacheWrite:5,logicalInput:55,output:7,ttftMs:100,inferenceMs:400,failedToolResults:1,reasoningTokens:null,prefillTokens:null,correctAction:null});
 expect(view.pendingTurn).toBeNull();
});
it("does not invent zero tokens or latency for an unfinished request",()=>{
 const log=new Log();log.add(0,{...START,type:"run_start"});log.add(0,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:200}});
 expect(requestMetrics(log.events)).toMatchObject({requests:[],pendingTurn:1});
});
it("retains failed and cancelled inference and rejects mixed run identities",()=>{
 const log=new Log();log.add(0,{...START,type:"run_start"});log.add(0,{type:"assistant",turn:1,thinking:"",text:"",tool_calls:[],usage:{input:0,output:0,cache_read:0},ttft_ms:null,latency_ms:20,stop_reason:"aborted"});
 const view=requestMetrics(log.events);expect(view.requests[0]).toMatchObject({stopReason:"aborted",ttftMs:null});
 expect(()=>requestMetrics([...log.events,{...log.events[0],run:"other"} as typeof log.events[number]])).toThrow(/run/);
});

it("links request screens to source evidence and rejects replay duplicates",()=>{
 const log=new Log();log.add(0,{...START,type:"run_start"});
 const source=log.add(10,state({screen:"clock"}));
 log.add(20,{type:"turn_start",turn:1,context:{messages:1,images:1,est_tokens:200}});
 log.add(30,{type:"assistant",turn:1,thinking:"",text:"",tool_calls:[],usage:{input:3,output:4,cache_read:5},ttft_ms:null,latency_ms:10,stop_reason:"stop"});
 expect(requestMetrics(log.events).requests[0]).toMatchObject({screen:"clock",stateSeq:source.seq,cacheWrite:null,logicalInput:null,recordedPromptTokens:8});
 expect(()=>requestMetrics([...log.events,log.events[0] as typeof log.events[number]])).toThrow(/sequence/);
 expect(requestMetrics([])).toEqual({run:null,requests:[],pendingTurn:null,incompleteRequest:null,lastEventAt:null});
});

it.each(["crash","budget","operator_stop"] as const)("retains an unanswered request as terminal and incomplete after %s",reason=>{
 const log=new Log();log.add(0,START);
 log.add(10,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:200}});
 expect(requestMetrics(log.events)).toMatchObject({requests:[],pendingTurn:1});
 const end=log.add(20,{type:"run_end",turn:1,reason,furthest_milestone:null,turns:1,wall_ms:20,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
 expect(requestMetrics(log.events)).toMatchObject({requests:[],pendingTurn:null,incompleteRequest:{turn:1,reason,seq:end.seq,at:end.t}});
 expect(requestMetrics(log.events)).toEqual(requestMetrics(log.events));
});

it("does not label a completed response incomplete when the run ends",()=>{
 const log=new Log();log.add(0,START);
 log.add(10,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:200}});
 log.add(15,{type:"assistant",turn:1,thinking:"",text:"",tool_calls:[],usage:{input:3,output:0,cache_read:0},ttft_ms:null,latency_ms:5,stop_reason:"aborted"});
 log.add(20,{type:"run_end",turn:1,reason:"budget",furthest_milestone:null,turns:1,wall_ms:20,tokens:{input:3,output:0},frames:{saved:0,bytes:0}});
 const view=requestMetrics(log.events);
 expect(view).toMatchObject({pendingTurn:null,incompleteRequest:null});
 expect(view.requests).toHaveLength(1);
 expect(view.requests[0]).toMatchObject({stopReason:"aborted",input:3,ttftMs:null});
});
