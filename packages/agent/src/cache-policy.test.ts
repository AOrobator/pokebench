import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {expect,it} from "vitest";
import type {Message} from "@mariozechner/pi-ai";
import {} from "./features.js";
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
  const images=shown.reduce((n,m)=>n+(m.role==="toolResult"?m.content.filter(p=>p.type==="image").length:0),0);
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
it("keeps hard limits with text-only turns, multi-tool batches and empty histories",()=>{
 const window=contextWindow({...base,"cache-aligned-window-v1":true});expect(slideWindow([],window)).toEqual([]);
 for(const perTurn of [0,1,3]){
  const history:Message[]=[task];
  for(let n=0;n<65;n++){
   const calls=Array.from({length:perTurn},(_,j)=>({type:"toolCall" as const,id:`${String(n)}-${String(j)}`,name:"observe",arguments:{}}));history.push(assistant({text:"decision",toolCalls:calls}),...calls.map(c=>result(c.id)));
   const shown=slideWindow(history,window);expect(shown[0]).toBe(task);expect(shown.filter(m=>m.role==="assistant").length).toBeLessThanOrEqual(20);expect(shown.reduce((n,m)=>n+(m.role==="toolResult"?m.content.filter(p=>p.type==="image").length:0),0)).toBeLessThanOrEqual(6);
   const ids=new Set(shown.flatMap(m=>m.role==="assistant"?m.content.filter(p=>p.type==="toolCall").map(p=>p.id):[]));for(const m of shown)if(m.role==="toolResult")expect(ids.has(m.toolCallId)).toBe(true);
  }
 }
});
it("records reuse truthfully and reinjects only after its anchor leaves",()=>{
 const jit=new StableJitContext({...base,"jit-guide-reuse-v1":true},null);const req=(messages:Message[])=>({systemPrompt:"full",messages,tools:[]});
 jit.observe({type:"state",seq:1,screen:"overworld",in_battle:false});jit.context(req([task,result("a")]));const original=jit.receipt()?.guidance;
 jit.observe({type:"state",seq:2,screen:"main_menu",in_battle:false});jit.context(req([task,result("a"),result("b")]));expect(jit.receipt()?.guidance).toBeUndefined();
 jit.observe({type:"state",seq:3,screen:"overworld",in_battle:false});jit.context(req([task,result("a"),result("b")]));expect(jit.receipt()?.guidance).toMatchObject({ordinal:original?.ordinal,source_state_seq:1,reason:"reused"});
 jit.context(req([task,result("c")]));expect(jit.receipt()?.guidance).toMatchObject({ordinal:2,source_state_seq:3,reason:"evicted",anchor:"tool:c"});
});
it("the production context factory carries the window switch and legacy presets omit both treatments",async()=>{
 const {contextTools}=await import("./play-wiring.js");const {normalizeFeatures,flagFeatures}=await import("./play-preset.js");
 const recorder={subscribe:()=>{},recordNavigationContext:()=>{},recordLedgerContext:()=>{},recordMilestoneHint:()=>{},recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>{}};
 for(const enabled of [false,true])expect(contextTools({...base,"cache-aligned-window-v1":enabled},recorder,m=>Promise.resolve(m)).window.alignCuts===true).toBe(enabled);
 const {"cache-aligned-window-v1":_a,"jit-guide-reuse-v1":_b,...legacy}=base;
 expect([_a,_b]).toEqual([false,false]);expect(normalizeFeatures(legacy)).toMatchObject({"cache-aligned-window-v1":false,"jit-guide-reuse-v1":false});expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})).toMatchObject({"cache-aligned-window-v1":false,"jit-guide-reuse-v1":false});
});
