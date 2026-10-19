import {expect,it} from "vitest";
import type {Message} from "@mariozechner/pi-ai";
import {ALL_ON} from "./features.js";
import {contextWindow,slideWindow,WINDOW} from "./harness.js";
import {StableJitContext} from "./jit-v2-context.js";
import {assistant} from "../test-support/pi.js";
const base={...ALL_ON,"cache-aligned-window-v1":false,"jit-guide-reuse-v1":false,"double-context-window-v1":false};
const task:Message={role:"user",content:"Play",timestamp:1};
const result=(id:string):Message=>({role:"toolResult",toolCallId:id,toolName:"observe",isError:false,timestamp:2,content:[{type:"text",text:"Screen: overworld"},{type:"image",data:"AAAA",mimeType:"image/png"}]});
it("aligns an imminent history trim with result collapse without raising budgets",()=>{
 const window=contextWindow({...base,"cache-aligned-window-v1":true});const messages:Message[]=[task];let priorFrom="";let priorCollapsed=0;let cuts=0;
 for(let n=1;n<=80;n++){
  messages.push(assistant({toolCalls:[{type:"toolCall",id:String(n),name:"observe",arguments:{}}]}),result(String(n)));
  const shown=slideWindow(messages,window);const from=shown.find(m=>m.role==="assistant");const id=from?.role==="assistant"?JSON.stringify(from.content):"";
  const images=shown.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==="image").length;
  const totalResults=messages.filter(m=>m.role==="toolResult").length;const full=slideWindow(messages,{...WINDOW,turns:{max:1000,chunk:10}}).filter(m=>m.role==="toolResult"&&m.content.some(p=>p.type==="image")).length;const collapsed=totalResults-full;
  expect(shown.filter(m=>m.role==="assistant").length).toBeLessThanOrEqual(20);expect(images).toBeLessThanOrEqual(6);
  if(priorFrom!==""&&id!==priorFrom){cuts++;expect(collapsed).toBeGreaterThan(priorCollapsed);}
  priorFrom=id;priorCollapsed=collapsed;
 }
 expect(cuts).toBeGreaterThan(5);
});
it("OFF preserves the legacy window exactly",()=>{
 expect(contextWindow(base)).toEqual({...WINDOW,keepDialogue:true});
});
it("reuses identical retained guides without rewriting earlier messages, OFF still appends",()=>{
 for(const reuse of [false,true]){
  const jit=new StableJitContext({...base,"jit-guide-reuse-v1":reuse},null);const tools=[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}}];
  const request=(messages:Message[])=>({systemPrompt:"full",messages,tools});jit.observe({type:"state",seq:1,screen:"overworld",in_battle:false});const first=jit.context(request([task,result("one")]));const receipt=jit.receipt();
  jit.observe({type:"state",seq:2,screen:"clock",in_battle:false});const second=jit.context(request([task,result("one"),result("two")]));
  jit.observe({type:"state",seq:3,screen:"overworld",in_battle:false});const third=jit.context(request([task,result("one"),result("two"),result("three")]));
  expect(third.messages.slice(0,second.messages.length)).toEqual(second.messages);expect(jit.receipt()?.projected_guidance).toHaveLength(reuse?2:3);
  if(reuse){expect(jit.receipt()?.guidance?.anchor).toBe(receipt?.guidance?.anchor);expect(third.messages[2]).toBe(first.messages[2]);}
 }
});
