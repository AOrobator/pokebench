import {expect,it} from "vitest";
import type {Context,Message} from "@mariozechner/pi-ai";
import {ALL_ON} from "./features.js";
import {StableJitContext} from "./jit-v2-context.js";

const features={...ALL_ON,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":true};
const task:Message={role:"user",content:"Play",timestamp:1};
const result=(id:string):Message=>({role:"toolResult",toolCallId:id,toolName:"observe",content:[{type:"text",text:"observation"}],isError:false,timestamp:2});
const request=(messages:Message[]=[task]):Context=>({systemPrompt:"standing",messages,tools:[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}},{name:"navigate_to",description:"walk",parameters:{type:"object",properties:{}}}]});
const scene=(jit:StableJitContext,screen:string,seq:number)=>jit.observe({type:"state",seq,screen,in_battle:screen==="battle"});
it("OFF preserves the identical request",()=>{
 const jit=new StableJitContext({...features,"just-in-time-prompt-v2":false},null),input=request();
 scene(jit,"clock",1);expect(jit.context(input)).toBe(input);expect(jit.receipt()).toBeNull();
});
it("keeps core and the full catalog stable across every scene",()=>{
 const jit=new StableJitContext(features,null);let core:string|undefined;let toolsHash:string|undefined;
 for(const [i,screen] of ["clock","naming","overworld","battle","bag_menu","unsupported"].entries()){
  scene(jit,screen,i+1);const input=request([task,result(String(i))]),out=jit.context(input);
  core??=out.systemPrompt;expect(out.systemPrompt).toBe(core);expect(out.tools).toBe(input.tools);
  toolsHash??=jit.receipt()?.tools_sha256;expect(jit.receipt()?.tools_sha256).toBe(toolsHash);
  expect(out.systemPrompt).toContain("Loop supervisor:");expect(out.systemPrompt).not.toContain("Clock interface:");
 }
});
it("preserves old guidance bytes and appends scoped episodes A B A without mutating history",()=>{
 const jit=new StableJitContext(features,null);scene(jit,"clock",4);
 const input=request();Object.freeze(input.messages);Object.freeze(task);
 const a=jit.context(input);expect(a.messages.at(-1)?.content).toContain("Clock interface:");
 const same=jit.context(input);expect(same).toEqual(a);expect(jit.receipt()?.guidance?.reason).toBe("none");
 scene(jit,"naming",8);const b=jit.context(request([task,result("b")]));
 expect(b.messages.slice(0,a.messages.length)).toEqual(a.messages);expect(b.messages.at(-1)?.content).toContain("Naming layout,");
 scene(jit,"clock",12);const again=jit.context(request([task,result("b"),result("c")]));
 expect(again.messages.slice(0,b.messages.length)).toEqual(b.messages);
 expect(jit.receipt()?.guidance).toMatchObject({reason:"scene_change",source_state_seq:12,ordinal:3});
 expect(input.messages).toEqual([task]);
});
it("anchors by tool call id through collapse, reinjects after active eviction, and ignores transient suffixes",()=>{
 const jit=new StableJitContext(features,null);scene(jit,"clock",1);jit.context(request());
 scene(jit,"naming",2);const b=jit.context(request([task,result("b")])),guide=b.messages.at(-1);
 const collapsed={...result("b"),content:[{type:"text" as const,text:"collapsed"}]};
 const suffix:Message={role:"user",content:"changing ledger",timestamp:999};
 const same=jit.context(request([task,collapsed,result("c"),suffix]));expect(same.messages[2]).toEqual(guide);
 expect(jit.receipt()?.guidance?.reason).toBe("none");
 const evicted=jit.context(request([task,result("c"),suffix]));expect(evicted.messages.at(-2)?.content).toContain("Naming layout,");
 expect(jit.receipt()?.guidance).toMatchObject({reason:"evicted",anchor:"tool:c",ordinal:3});
});
it("inserts after the entire result batch and records exact component characters and original source",()=>{
 const jit=new StableJitContext(features,null);scene(jit,"clock",10);
 const input=request([task,result("one"),result("two")]),out=jit.context(input),receipt=jit.receipt();
 expect(out.messages.slice(0,3)).toEqual(input.messages);expect(receipt?.guidance).toMatchObject({anchor:"tool:two",source_state_seq:10});
 expect(receipt?.guidance?.text).toBe(out.messages[3]?.content);
 expect(receipt?.component_chars).toMatchObject({core:out.systemPrompt?.length,history:JSON.stringify(input.messages).length,guidance:JSON.stringify([out.messages[3]]).length});
 scene(jit,"clock",11);jit.context(input);expect(jit.receipt()).toMatchObject({state_seq:11,guidance:{source_state_seq:10,reason:"none"}});
});
it("unknown keeps full fallback at the tail; transitions at the same anchor append rather than replace",()=>{
 const jit=new StableJitContext(features,null),input=request();const unknown=jit.context(input);
 expect(unknown.messages.at(-1)?.content).toContain("Clock interface:");expect(unknown.messages.at(-1)?.content).toContain("Naming layout,");
 scene(jit,"clock",1);const clock=jit.context(input);expect(clock.messages.slice(0,unknown.messages.length)).toEqual(unknown.messages);
 expect(clock.messages.at(-1)?.content).toContain("applies only");
});
