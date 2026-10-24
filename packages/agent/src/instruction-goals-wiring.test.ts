import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {contextTools,playGameTools} from "./play-wiring.js";
import {featuresOf,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt,playTools,jitTools} from "./play-config.js";
import {checkEvent,type BodyOf,type RunEvent} from "./events.js";
import {withInstructionGoalReview} from "./instruction-goal-tools.js";
import {parseGameState} from "./game-state.js";
const data=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz",import.meta.url))).toString()) as {events:unknown[]};
const events=data.events.map(checkEvent),source=events.find(e=>e.seq===39512)!;
const {v:_v,run:_r,t:_t,turn:_tu,type:_ty,seq:_s,...body}=source;
const state=parseGameState(body);
const features=(goal:boolean,menu=false):FeatureSet=>({...featuresOf([]),"ram-state-v1":true,"instruction-goal-ledger-v1":goal,"menu-option-tool-v1":menu});
const review={reviewed:[{episode:39430,interpretation:"Scientist asks for Match Call"},{episode:39462,interpretation:"Select POKéNAV"}],updates:[{id:"select",title:"Select POKéNAV",sources:[{episode:39462,page:0}],parent:null,status:"active",reason:"Scientist asks",completion:"POKéNAV opens"}]};
function setup(on=true){
 const subscribers:((e:RunEvent)=>void)[]=[],records:Omit<BodyOf<"ledger_context">,"type"|"turn">[]=[];
 const record={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLedgerContext:(b:Omit<BodyOf<"ledger_context">,"type"|"turn">)=>{records.push(b);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined};
 const f=features(on),context=contextTools(f,record,m=>Promise.resolve(m));
 const send=(es:readonly RunEvent[])=>{for(const e of es)for(const fn of subscribers)fn(e);};send(events.filter(e=>e.seq<=39462));
 return {context,records,send,record,f};
}
it("factory pins recorded request after compaction; action accepts inline review and does not choose the goal",async()=>{
 const s=setup();let presses=0;let received:unknown;
 const press:AgentTool={name:"press",label:"Press",description:"Press",parameters:Type.Object({buttons:Type.Array(Type.String())},{additionalProperties:false}),execute:async(_id,args)=>{presses++;received=args;return {content:[{type:"text",text:'Story goal: historical Norman line'}],details:{state}};}};
 const tools=withInstructionGoalReview([press,...s.context.tools],s.context.instructionGoals??null),action=tools.find(t=>t.name==="press")!;
 expect(JSON.stringify(await action.execute("blocked",{buttons:["B"]}))).toContain("No game input sent");expect(presses).toBe(0);
 const result=await action.execute("chosen",{buttons:["DOWN"],goal_review:review});expect(presses).toBe(1);expect(received).toEqual({buttons:["DOWN"]});expect(JSON.stringify(result)).toContain("not your active goal");
 const before=await s.context.transformContext([]);expect(JSON.stringify(before)).toContain("Select POKéNAV");
 const restored=setup();const transaction=s.records.find(b=>b.instruction_goals!==undefined)!;
 restored.send([checkEvent({v:1,run:source.run,seq:80000,t:source.t,turn:1031,type:"ledger_context",...transaction})]);
 expect(restored.context.instructionGoals?.ledger.pending()).toEqual([]);expect(restored.context.instructionGoals?.ledger.text()).toBe(s.context.instructionGoals?.ledger.text());
});
it("OFF has no bookkeeping or new prompt/tool/schema fields",async()=>{
 const s=setup(false),input:AgentMessage[]=[{role:"user",content:"old",timestamp:0}];expect(await s.context.transformContext(input)).toEqual(input);expect(s.context.tools).toEqual([]);expect(s.records).toEqual([]);
 expect(playSystemPrompt(s.f,null)).not.toContain("review_goals");expect(playTools(s.f)).not.toContain("select_menu_option");
 const old:AgentTool={name:"press",label:"Press",description:"old",parameters:Type.Object({}),execute:async()=>({content:[],details:undefined})};expect(withInstructionGoalReview([old],null)[0]).toBe(old);
 for(const id of ["instruction-goal-ledger-v1","menu-option-tool-v1"] as const){expect(normalizeFeatures(featuresOf([]))[id]).toBe(false);expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[id]).toBe(false);}
});
it("two switches independently change the documented tool set in every scene",()=>{
 for(const scene of ["overworld","battle","menu","clock","naming","unknown"] as const){
  for(const [goal,menu] of [[false,false],[true,false],[false,true],[true,true]] as const){const f=features(goal,menu),names=jitTools(playTools(f).map(name=>({name})),scene).map(t=>t.name),prompt=playSystemPrompt({...f,"just-in-time-prompt-v1":true},null,scene);
   expect(names.includes("review_goals")).toBe(goal);expect(names.includes("select_menu_option")).toBe(menu);expect(prompt.includes("- review_goals:")).toBe(goal);expect(prompt.includes("- select_menu_option:")).toBe(menu);
  }
 }
});
it("production game-tool factory offers menu selection only under its own switch",()=>{
 const s=setup(false);const dummy:AgentTool={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:async()=>({content:[],details:{state}})};
 const press={...dummy,name:"press",executeChecked:async()=>({content:[],details:{state}})};
 const record={...s.record,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:2,turn:1}),lowHpTrainerWarning:()=>{},peopleIdCard:()=>{},storyGoalAway:()=>{},destinationCitation:()=>{},unfinishedActivity:()=>{},healFirstFacts:()=>{}};
 // The feature-off factory needs no game server; all ordinary execution is injected.
 expect(playGameTools([dummy,press],features(false),{read:async()=>state},record).map(t=>t.name)).not.toContain("select_menu_option");
 expect(playGameTools([dummy,press],features(false,true),{read:async()=>state},record).map(t=>t.name)).toContain("select_menu_option");
});
it("rejects bad inline review before execution, permits observation, and standalone tools retrieve exact quotes",async()=>{
 const s=setup();let count=0;const action:AgentTool={name:"press",label:"Press",description:"Press",parameters:Type.Object({}),execute:async()=>{count++;return {content:[],details:undefined};}};
 const tools=withInstructionGoalReview([action,...s.context.tools],s.context.instructionGoals??null),press=tools.find(t=>t.name==="press")!;
 expect(JSON.stringify(await press.execute("bad",{goal_review:{}}))).toContain("Goal review rejected");expect(count).toBe(0);
 const archive=tools.find(t=>t.name==="get_instruction_goals")!,reviewTool=tools.find(t=>t.name==="review_goals")!;
 expect(JSON.stringify(await archive.execute("read",{episode:39462}))).toContain("Please select the POKéNAV.");
 await reviewTool.execute("standalone",review);await press.execute("go",{});expect(count).toBe(1);
 await expect(press.execute("invalid",null)).rejects.toThrow("Invalid action");
 const scalar={...action,parameters:Type.String()};expect(()=>withInstructionGoalReview([scalar],s.context.instructionGoals??null)).toThrow("object parameters");
});
