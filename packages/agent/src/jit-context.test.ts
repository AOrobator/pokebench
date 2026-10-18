import {expect,it} from "vitest";
import {ALL_ON} from "./features.js";
import {playSystemPrompt,promptScene} from "./play-config.js";
import {JitContext} from "./jit-context.js";
import type {Context} from "@mariozechner/pi-ai";

const features={...ALL_ON,"state-only-decisions-v1":false,"just-in-time-prompt-v1":true};
const request:Context={systemPrompt:"standing prompt",messages:[],tools:[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}},{name:"navigate_to",description:"walk",parameters:{type:"object",properties:{}}},{name:"battle_action",description:"fight",parameters:{type:"object",properties:{}}}]};
it("falls back to full context for missing, unknown and conflicting screens",()=>{
 expect(promptScene({screen:"unrecognized",in_battle:false})).toBe("unknown");
 expect(promptScene({screen:"overworld",in_battle:false,active_ui:{phase:"unknown"}})).toBe("unknown");
 const jit=new JitContext(features,null);
 expect(jit.context(request).systemPrompt).toBe(playSystemPrompt(features,null));
 expect(jit.context(request).tools).toEqual(request.tools);
});
it("uses the newest state at every request, retaining naming during a battle",()=>{
 const jit=new JitContext(features,null);
 jit.observe({type:"state",seq:4,screen:"clock",in_battle:false});
 const clock=jit.context(request);
 expect(clock.systemPrompt).toContain("Clock interface:");
 expect(clock.systemPrompt).not.toContain("Naming layout,");
 expect(clock.tools?.map(t=>t.name)).toEqual(["observe"]);
 expect(jit.allowed("navigate_to")).toBe(false);
 jit.observe({type:"state",seq:8,screen:"naming",in_battle:true});
 expect(jit.context(request).systemPrompt).toContain("Naming layout,");
 jit.observe({type:"state",seq:12,screen:"overworld",in_battle:false});
 expect(jit.context(request).tools?.map(t=>t.name)).toEqual(["observe","navigate_to"]);
 jit.observe({type:"state",seq:16,screen:"battle",in_battle:true});
 expect(jit.context(request).tools?.map(t=>t.name)).toEqual(["observe","battle_action"]);
 expect(jit.allowed("navigate_to")).toBe(false);
 expect(jit.allowed("battle_action")).toBe(true);
});
it("OFF returns the identical context and permits the original execution path",()=>{
 const jit=new JitContext({...features,"just-in-time-prompt-v1":false},null);
 jit.observe({type:"state",seq:1,screen:"clock",in_battle:false});
 expect(jit.context(request)).toBe(request);
 expect(jit.allowed("navigate_to")).toBe(true);
});
it("binds request receipts to exact prompt and tools without modifying history",()=>{
 const jit=new JitContext(features,null);
 jit.observe({type:"state",seq:10,screen:"clock",in_battle:false});
 const next=jit.context(request), receipt=jit.receipt();
 expect(next.messages).toBe(request.messages);
 expect(receipt).toMatchObject({scene:"clock",state_seq:10,system_prompt:next.systemPrompt,tools:["observe"]});
 expect(receipt?.prompt_sha256).toMatch(/^[a-f0-9]{64}$/);
 expect(receipt?.tools_sha256).toMatch(/^[a-f0-9]{64}$/);
 expect(request.systemPrompt).toBe("standing prompt");
});
