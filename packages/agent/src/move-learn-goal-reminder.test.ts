import {describe,it,expect} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {flagFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {readFileSync} from "node:fs";

const ID="move-learn-goal-reminder-v1";
const REMINDER="Task reminder: your instruction is to play the game and make as much story progress as you can. There is no instruction to skip learning new moves or to keep the current moveset. Your earlier reasoning about skipping new moves was your own plan, not a rule. Evaluate this offered move using the displayed comparison and the current party, then choose whether to learn it or decline it. The choice is yours.";
const GENERAL=REMINDER.replace("Your earlier reasoning about skipping new moves was your own plan, not a rule. ", "");
const off=()=>flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false});
const messages:AgentMessage[]=[{role:"user",content:"Play the game and make as much story progress as you can.",timestamp:0}];
const envelope={v:1 as const,run:"goal",seq:1,turn:1,t:"2026-10-22T19:00:00.000-04:00"};
function setup(on:boolean){
 const listeners:((e:RunEvent)=>void)[]=[],notes:unknown[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{listeners.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:(n:unknown)=>{notes.push(n);},recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>undefined};
 const wired=contextTools({...off(),[ID]:on},recorder,m=>Promise.resolve(m));
 const emit=(e:RunEvent)=>{for(const f of listeners)f(checkEvent(e));};
 const state=JSON.parse(readFileSync(new URL("../test-support/move-goal-state.json",import.meta.url),"utf8")) as Extract<RunEvent,{type:"state";started:boolean}>;
 const claim={...envelope,type:"assistant" as const,thinking:"I am being asked if I want to delete a move to learn PECK. Since I am speedrunning, I don't need new moves, so I will answer NO.",text:"",tool_calls:[],usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null,stop_reason:"toolUse" as const};
 const result={...envelope,seq:3,type:"tool_result" as const,id:"obs",name:"observe",text:"Interface: evolution_move_learning; input ready\nMoves (the game's move data and the summary screen's descriptions):\n  New move: DOUBLE KICK",is_error:false,state_seq:2,duration_ms:0,frames:[]};
 const ui=state.active_ui,moves=state.party[0]?.moves;if(ui==null||moves==null)throw Error("Native fixture missing UI or moves");
 return {wired,notes,listeners,emit,state,ui,moves,claim,result};
}
describe(ID,()=>{
 it("OFF leaves the production context and subscriptions unchanged",async()=>{const s=setup(false);expect(await s.wired.transformContext(messages)).toBe(messages);expect(s.listeners).toHaveLength(0);});
 it("production factory appends the exact tested user reminder after a delivered learning choice and prior skip claim",async()=>{const s=setup(true);s.emit(s.claim);s.emit(s.state);s.emit(s.result);const out=await s.wired.transformContext(messages);expect(out.slice(0,-1)).toEqual(messages);expect(out.at(-1)).toMatchObject({role:"user",content:REMINDER});expect(messages).toHaveLength(1);expect(s.notes).toEqual([{text:REMINDER,evidence:[1,2,3]}]);expect(await s.wired.transformContext(out)).toEqual(out);});
 it("reminds at the first choice without inventing prior reasoning",async()=>{const s=setup(true);s.emit(s.state);s.emit(s.result);const out=await s.wired.transformContext(messages);expect(out.slice(0,-1)).toEqual(messages);expect(out.at(-1)).toMatchObject({content:GENERAL});expect(s.notes).toEqual([{text:GENERAL,evidence:[2,3]}]);expect(await s.wired.transformContext(out)).toEqual(out);});
 it.each(["not_ready","diagnostic","other_ui","result_page","error","stale"])("does not remind for %s",async kind=>{const s=setup(true);s.emit(s.claim);if(kind==="not_ready")s.ui.ready=false;if(kind==="diagnostic")s.ui.diagnostic="unknown";if(kind==="other_ui")s.ui.phase="evolution_result";if(kind==="result_page")s.moves[1]={move_id:24,pp:30,pp_bonus:0,name:"DOUBLE KICK"};s.emit(s.state);s.emit({...s.result,is_error:kind==="error",state_seq:kind==="stale"?99:2});expect(await s.wired.transformContext(messages)).toBe(messages);});
 it("stops at the next delivered nonlearning observation",async()=>{const s=setup(true);s.emit(s.claim);s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:REMINDER});s.emit({...s.state,seq:4,screen:"overworld",active_ui:null});s.emit({...s.result,seq:5,state_seq:4,text:"Screen: overworld"});expect(await s.wired.transformContext(messages)).toBe(messages);});
 it.each(["evolution_move_confirmation","summary_move_forget"])("also recognizes a ready %s choice",async phase=>{const s=setup(true);s.ui.phase=phase;s.ui.details={...s.ui.details,yes_next_state:5,no_next_state:10,selected_index:0,move_names:["SCRATCH","GROWL","FOCUS ENERGY","EMBER"]};s.emit(s.claim);s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:REMINDER});});
 it("does not carry the reminder onto the final decline page",async()=>{const s=setup(true);s.ui.details={...s.ui.details,move_learning_state:9};s.emit(s.claim);s.emit(s.state);s.emit(s.result);expect(await s.wired.transformContext(messages)).toBe(messages);});

 it("delivers in control without requiring the five bundle-only readouts or tools",async()=>{const s=setup(true);s.emit(s.claim);s.emit(s.state);s.emit({...s.result,text:"Interface: evolution_move_learning; input ready"});expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:REMINDER});});

 it.each([1,2])("recognizes initial native move-learning page %i",async move_learning_state=>{const s=setup(true);s.ui.details={...s.ui.details,move_learning_state};s.emit(s.claim);s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:REMINDER});});
 it.each(["I will skip learning new moves","I will keep the current moveset"])("records an explicit earlier plan: %s",async thinking=>{const s=setup(true);s.emit({...s.claim,thinking});s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:REMINDER});});
 it("does not treat a rejected skip plan as a prior instruction",async()=>{const s=setup(true);s.emit({...s.claim,thinking:"I will not skip learning new moves."});s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:GENERAL});});

 it("reminds for the historical keep-current-moves wording without requiring a phrase match",async()=>{const s=setup(true);s.emit({...s.claim,thinking:"The game is asking if Combusken should learn DOUBLE KICK. I will answer NO to keep its current moves."});s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:GENERAL});});
 it("reminds at later choices too, without requiring a skip plan",async()=>{const s=setup(true);s.emit(s.state);s.emit(s.result);expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:GENERAL});s.emit({...s.state,seq:4});s.emit({...s.result,seq:5,state_seq:4});expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:GENERAL});expect(s.notes).toEqual([{text:GENERAL,evidence:[2,3]},{text:GENERAL,evidence:[4,5]}]);});
 it("accepts the current battle-readiness delivery after its fresh state",async()=>{const s=setup(true);s.emit(s.state);s.emit({...envelope,seq:3,type:"decision_input",decision_turn:2,state_seq:2,text:"Current move-learning choice",frames:[{path:"frames/ready.png",sha1:"0".repeat(40)}]});expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:GENERAL});expect(s.notes).toEqual([{text:GENERAL,evidence:[2,3]}]);});
 it("rejects a stale battle-readiness delivery",async()=>{const s=setup(true);s.emit(s.state);s.emit({...envelope,seq:3,type:"decision_input",decision_turn:2,state_seq:99,text:"Stale move choice",frames:[{path:"frames/ready.png",sha1:"0".repeat(40)}]});expect(await s.wired.transformContext(messages)).toBe(messages);});
});
