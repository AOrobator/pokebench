import {describe,it,expect} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {flagFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import type {RunEvent} from "./events.js";
import {readFileSync} from "node:fs";

const ID="move-learn-goal-reminder-v1";
const REMINDER="Task reminder: your instruction is to play the game and make as much story progress as you can. There is no instruction to skip learning new moves or to keep the current moveset. Your earlier reasoning about skipping new moves was your own plan, not a rule. Evaluate this offered move using the displayed comparison and the current party, then choose whether to learn it or decline it. The choice is yours.";
const off=()=>flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false});
const messages:AgentMessage[]=[{role:"user",content:"Play the game and make as much story progress as you can.",timestamp:0}];
const envelope={v:1 as const,run:"goal",seq:1,turn:1,t:"2026-10-22T19:00:00.000-04:00"};
function setup(on:boolean){
 const listeners:((e:RunEvent)=>void)[]=[],notes:unknown[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{listeners.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:(n:unknown)=>{notes.push(n);},recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>undefined};
 const wired=contextTools({...off(),[ID]:on},recorder,async m=>m);
 const emit=(e:RunEvent)=>{for(const f of listeners)f(e);};
 const state=JSON.parse(readFileSync(new URL("../test-support/move-goal-state.json",import.meta.url),"utf8")) as Extract<RunEvent,{type:"state";started:boolean}>;
 const claim={...envelope,type:"assistant" as const,thinking:"I am being asked if I want to delete a move to learn PECK. Since I am speedrunning, I don't need new moves, so I will answer NO.",text:"",tool_calls:[],usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null,stop_reason:"toolUse" as const};
 const result={...envelope,seq:3,type:"tool_result" as const,id:"obs",name:"observe",text:"Interface: evolution_move_learning; input ready\nMoves (the game's move data and the summary screen's descriptions):\n  New move: DOUBLE KICK",is_error:false,state_seq:2};
 return {wired,notes,listeners,emit,state,claim,result};
}
describe(ID,()=>{
 it("OFF leaves the production context and subscriptions unchanged",async()=>{const s=setup(false);expect(await s.wired.transformContext(messages)).toBe(messages);expect(s.listeners).toHaveLength(0);});
 it("production factory appends the exact tested user reminder after a delivered learning choice and prior skip claim",async()=>{const s=setup(true);s.emit(s.claim);s.emit(s.state);s.emit(s.result);const out=await s.wired.transformContext(messages);expect(out.slice(0,-1)).toEqual(messages);expect(out.at(-1)).toMatchObject({role:"user",content:REMINDER});expect(messages).toHaveLength(1);expect(s.notes).toEqual([{text:REMINDER,evidence:[1,2,3]}]);expect(await s.wired.transformContext(out)).toEqual(out);});
 it("does not invent a prior skip plan for neutral histories",async()=>{const s=setup(true);s.emit(s.state);s.emit(s.result);expect(await s.wired.transformContext(messages)).toBe(messages);});
 it.each(["not_ready","diagnostic","other_ui","result_page","missing_comparison","error","stale"])("does not remind for %s",async kind=>{const s=setup(true);s.emit(s.claim);if(kind==="not_ready")s.state.active_ui!.ready=false;if(kind==="diagnostic")s.state.active_ui!.diagnostic="unknown";if(kind==="other_ui")s.state.active_ui!.phase="evolution_result";if(kind==="result_page")s.state.party[0]!.moves!.push({move_id:24,pp:30,name:"DOUBLE KICK"});s.emit(s.state);s.emit({...s.result,text:kind==="missing_comparison"?"No comparison":s.result.text,is_error:kind==="error",state_seq:kind==="stale"?99:2});expect(await s.wired.transformContext(messages)).toBe(messages);});
 it("stops at the next delivered nonlearning observation",async()=>{const s=setup(true);s.emit(s.claim);s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:REMINDER});s.emit({...s.result,seq:4,text:"Screen: overworld"});expect(await s.wired.transformContext(messages)).toBe(messages);});
});
