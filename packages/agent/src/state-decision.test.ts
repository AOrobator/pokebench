import {createAssistantMessageEventStream, type AssistantMessage, type Context} from "@mariozechner/pi-ai";
import type {AgentEvent, StreamFn} from "@mariozechner/pi-agent-core";
import {expect, it, vi} from "vitest";
import {Value} from "typebox/value";
import {Governor} from "./harness.js";
import { controlledRun } from "./run-control.js";
import {gatewayLoopConfig} from "./provider.js";
import type {GatewayModel} from "./gateway.js";
import {StateActionSchema, stateDecisions, type DecisionSnapshot, type StateDecisionOptions} from "./state-decision.js";
import {IN_GAME} from "../test-support/events.js";

const model:GatewayModel={id:"fixture",name:"Fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://fixture/v1",reasoning:false,input:["text","image"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:4096};
const usage={input:10,output:5,cacheRead:0,cacheWrite:0,totalTokens:15,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
const snapshot=(n:number):DecisionSnapshot=>({state:{...IN_GAME,position:{x:n,y:2}},content:[{type:"image",data:`snapshot-${String(n)}`,mimeType:"image/png"},{type:"text",text:`Current snapshot ${String(n)}`} ]});
const answer=(args:unknown={kind:"press",buttons:["A"]},extra=false,stop:AssistantMessage["stopReason"]="toolUse"):AssistantMessage=>({role:"assistant",api:model.api,provider:model.provider,model:model.id,content:[{type:"toolCall",id:"act-one",name:"act",arguments:args as Record<string,unknown>},...(extra?[{type:"toolCall" as const,id:"act-two",name:"act",arguments:{kind:"press",buttons:["B"]}}]:[])],usage,stopReason:stop,timestamp:0});
function fixture(replies:AssistantMessage[]= [answer(),answer()]) {
 const controller=new AbortController();const contexts:Context[]=[];const events:AgentEvent[]=[];
 const governor=new Governor({limits:{maxTurns:replies.length,maxWallMs:10000,failureLimit:3},retry:vi.fn(),abort:()=>{controller.abort();},now:()=>0});
 const stream:StreamFn=(_model,context)=>{contexts.push({...context,messages:structuredClone(context.messages)});const message=replies[contexts.length-1];if(!message)throw Error("Unexpected extra model request");const s=createAssistantMessageEventStream();s.push({type:"done",reason:message.stopReason as "stop"|"length"|"toolUse",message});return s;};
 const execute=vi.fn(()=>Promise.resolve({content:[{type:"text" as const,text:"previous result MUST NOT persist"}],details:{}}));
 const read=vi.fn(()=>Promise.resolve(snapshot(contexts.length+1)));const record=vi.fn<(s:DecisionSnapshot)=>Promise<void>>(()=>Promise.resolve());
 const options:StateDecisionOptions={systemPrompt:"Act on current snapshot only",goal:"Reach native clock target",base:gatewayLoopConfig(model,"off"),governor,signal:controller.signal,readSnapshot:read,recordSnapshot:record,execute,transformContext:m=>Promise.resolve(m),emit:e=>{events.push(e);},streamFn:stream};
 return {options,contexts,events,execute,read,record,controller,governor};
}
it("uses a fresh one-message snapshot and one act tool at every pinned pi request",async()=>{
 const f=fixture();expect(await stateDecisions(f.options)).toBe("budget");
 expect(f.contexts).toHaveLength(2);
 for(let i=0;i<2;i++){
  const c=f.contexts[i];if(!c)throw Error("Missing captured request");expect(c.messages).toHaveLength(1);expect(c.messages[0]?.role).toBe("user");expect(c.messages[0]?.content).toEqual([{type:"text",text:"Reach native clock target"},...snapshot(i+1).content]);
  expect(c.tools?.map(t=>t.name)).toEqual(["act"]);expect(c.tools?.[0]?.parameters).toMatchObject({type:"object"});expect(JSON.stringify(c)).not.toContain("previous result MUST NOT persist");
 }
 expect(f.read).toHaveBeenCalledTimes(2);expect(f.record.mock.calls.map(c=>c[0])).toEqual([snapshot(1),snapshot(2)]);
 expect(f.execute).toHaveBeenCalledTimes(2);
 expect(f.events.filter(e=>e.type==="tool_execution_start")).toHaveLength(2);
});
it("rejects multiple action calls before executing either",async()=>{
 const f=fixture([answer({kind:"press",buttons:["A"]},true)]);
 expect(await stateDecisions(f.options)).toBe("budget");expect(f.execute).not.toHaveBeenCalled();
});
it.each([{kind:"press",buttons:[]},{kind:"press",buttons:["WAIT"]},{kind:"wait",duration_ms:0},{kind:"wait",duration_ms:2001},{kind:"wait",duration_ms:"60"},{kind:"press",buttons:["A"],extra:true}])("rejects illegal action %j",async args=>{
 expect(Value.Check(StateActionSchema,args)).toBe(false);const f=fixture([answer(args)]);await stateDecisions(f.options);expect(f.execute).not.toHaveBeenCalled();
});
it("accepts an explicit bounded host wait through the same recorded action owner",async()=>{
 const f=fixture([answer({kind:"wait",duration_ms:60})]);expect(await stateDecisions(f.options)).toBe("budget");expect(f.execute).toHaveBeenCalledWith("act-one",{kind:"wait",duration_ms:60},expect.any(AbortSignal));
});
it("does not read, call the model or execute once stopped",async()=>{
 const f=fixture();f.governor.stop("operator_stop");expect(await stateDecisions(f.options)).toBe("operator_stop");expect(f.read).not.toHaveBeenCalled();expect(f.contexts).toEqual([]);
});
it("rechecks stop after an awaited pause gate",async()=>{
 const f=fixture();f.options={...f.options,gate:()=>{f.governor.stop("operator_stop");return Promise.resolve();}};
 expect(await stateDecisions(f.options)).toBe("operator_stop");expect(f.read).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled();
});
it("does not send an observation whose recording already satisfied the native target",async()=>{
 const f=fixture();f.options={...f.options,recordSnapshot:()=>{f.governor.stop("milestone");return Promise.resolve();}};
 expect(await stateDecisions(f.options)).toBe("milestone");expect(f.contexts).toEqual([]);expect(f.execute).not.toHaveBeenCalled();
});
it("bounds malformed response retries without retaining the rejected conversation",async()=>{
 const f=fixture([answer({kind:"wait",duration_ms:"60"}),answer({kind:"wait",duration_ms:"60"}),answer({kind:"wait",duration_ms:"60"}),answer()]);
 expect(await stateDecisions(f.options)).toBe("model_error");expect(f.contexts).toHaveLength(3);expect(f.execute).not.toHaveBeenCalled();
 expect(f.contexts.map(c=>c.messages.length)).toEqual([1,1,1]);
});
it("withholds a truncated action response",async()=>{
 const f=fixture([answer({kind:"press",buttons:["A"]},false,"length")]);
 expect(await stateDecisions(f.options)).toBe("budget");expect(f.execute).not.toHaveBeenCalled();
});
it("rechecks stop after reading the coherent snapshot",async()=>{
 const f=fixture();f.options={...f.options,readSnapshot:()=>{f.governor.stop("operator_stop");return Promise.resolve(snapshot(1));}};
 expect(await stateDecisions(f.options)).toBe("operator_stop");expect(f.record).not.toHaveBeenCalled();expect(f.contexts).toHaveLength(0);
});
it("does not act when the run stops while the model replies",async()=>{
 const f=fixture([answer()]);const inner=f.options.streamFn;if(!inner)throw Error("Missing fixture transport");
 f.options={...f.options,streamFn:(m,c,o)=>{f.governor.stop("operator_stop");return inner(m,c,o);}};
 expect(await stateDecisions(f.options)).toBe("operator_stop");expect(f.execute).not.toHaveBeenCalled();
});
it("returns operator abort without reading when its signal was already aborted",async()=>{
 const f=fixture();f.controller.abort();expect(await stateDecisions(f.options)).toBe("operator_abort");expect(f.read).not.toHaveBeenCalled();
});
it("keeps current-turn recording ahead of the request and action",async()=>{
 const f=fixture([answer()]);const order:string[]=[];const inner=f.options.streamFn;if(!inner)throw Error("Missing fixture transport");
 f.options={...f.options,readSnapshot:()=>{order.push("read");return Promise.resolve(snapshot(1));},recordSnapshot:()=>{order.push("record");return Promise.resolve();},transformContext:m=>{order.push("turn");return Promise.resolve(m);},streamFn:(m,c,o)=>{order.push("request");return inner(m,c,o);},execute:()=>{order.push("action");return Promise.resolve({content:[{type:"text",text:"done"}],details:{}});}};
 expect(await stateDecisions(f.options)).toBe("budget");expect(order).toEqual(["read","record","turn","request","action"]);
});

it("blocks the network request if stopped at the final model gate",async()=>{
 const f=fixture();let gates=0;
 f.options={...f.options,gate:()=>{gates++;if(gates===2)f.governor.stop("operator_stop");return Promise.resolve();}};
 expect(await stateDecisions(f.options)).toBe("operator_stop");expect(f.contexts).toHaveLength(0);expect(f.execute).not.toHaveBeenCalled();
});
it("accounts for transport errors with bounded retries and fresh contexts",async()=>{
 const replies=[answer(),answer(),answer()];for(const m of replies){m.content=[];m.stopReason="error";m.errorMessage="fixture unavailable";}
 const f=fixture(replies);f.options={...f.options,streamFn:(_m,c)=>{f.contexts.push({...c,messages:structuredClone(c.messages)});const r=replies[f.contexts.length-1];if(!r)throw Error("Unexpected request");const s=createAssistantMessageEventStream();s.push({type:"error",reason:"error",error:r});return s;}};
 expect(await stateDecisions(f.options)).toBe("model_error");expect(f.contexts.map(c=>c.messages.length)).toEqual([1,1,1]);expect(f.execute).not.toHaveBeenCalled();
});
it("reads current state after the final pause gate rather than carrying pre-pause input",async()=>{
 const f=fixture([answer()]);let gates=0;let current=1;
 f.options={...f.options,gate:()=>{gates++;if(gates===2)current=99;return Promise.resolve();},readSnapshot:()=>Promise.resolve(snapshot(current))};
 expect(await stateDecisions(f.options)).toBe("budget");expect(f.contexts[0]?.messages[0]?.content).toEqual([{type:"text",text:"Reach native clock target"},...snapshot(99).content]);expect(f.record).toHaveBeenCalledWith(snapshot(99));
});
it("preserves the budget reason when snapshot I/O aborts during shutdown",async()=>{
 const f=fixture();f.options={...f.options,readSnapshot:()=>{f.governor.abort("budget");return Promise.reject(new Error("snapshot aborted"));}};
 expect(await stateDecisions(f.options)).toBe("budget");expect(f.contexts).toEqual([]);expect(f.execute).not.toHaveBeenCalled();
});
it("surfaces an actual snapshot failure instead of disguising it as a stop",async()=>{
 const f=fixture();f.options={...f.options,readSnapshot:()=>Promise.reject(new Error("invalid coherent observation"))};
 await expect(stateDecisions(f.options)).rejects.toThrow("invalid coherent observation");expect(f.contexts).toEqual([]);expect(f.execute).not.toHaveBeenCalled();
});

it("refreshes input when a pause/resume occurs during snapshot I/O",async()=>{
 const f=fixture([answer()]);let gates=0;let epoch=0;let current=1;
 f.options={...f.options,inputEpoch:()=>epoch,gate:()=>{gates++;if(gates===3){epoch++;current=99;}return Promise.resolve();},readSnapshot:()=>Promise.resolve(snapshot(current))};
 expect(await stateDecisions(f.options)).toBe("budget");expect(f.contexts[0]?.messages[0]?.content).toEqual([{type:"text",text:"Reach native clock target"},...snapshot(99).content]);expect(f.record).toHaveBeenCalledWith(snapshot(99));
});

it("holds a state-mode reply before act can execute", async () => {
  const f = fixture([answer()]);
  const replySeen = Promise.withResolvers<void>();
  const { control, governor, callControl } = controlledRun({
    limits: { maxTurns: 1, maxWallMs: 10_000, failureLimit: 3 },
    now: () => 0, retry: vi.fn(), abort: () => { f.controller.abort(); },
  }, {
    providerWaitPause: true, now: () => 0, freeze: () => Promise.resolve(), record: vi.fn(),
  }, () => 0);
  const at = "2026-11-07T12:00:00.000Z";
  const stream = f.options.streamFn;
  if (stream === undefined) throw Error("Missing fixture transport");
  const result = stateDecisions({
    ...f.options, governor, callControl,
    emit: event => {
      if (event.type === "message_end" && event.message.role === "assistant") replySeen.resolve();
    },
    streamFn: (...args) => {
      control.apply({ v: 1, seq: 1, at, action: "pause" });
      return stream(...args);
    },
  });
  await replySeen.promise;
  expect(control.state).toBe("paused");
  expect(f.execute).not.toHaveBeenCalled();
  control.apply({ v: 1, seq: 2, at, action: "resume" });
  expect(await result).toBe("budget");
  expect(f.execute).toHaveBeenCalledOnce();
});
