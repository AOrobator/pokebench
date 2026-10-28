import {readFileSync} from "node:fs";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {dependencyProblems,featuresOf,featureInfo,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";

const ID="current-question-focus-v1";
const F=JSON.parse(readFileSync(new URL("../test-support/current-question-a702.json",import.meta.url),"utf8")) as {advance:unknown;ui:{phase:string;selected:string;ready:boolean;controls:string;diagnostic:null;value:null};map_id:[number,number];readout:string};
const advance=checkEvent(F.advance);
if(advance.type!=="dialogue_auto_advance")throw new Error("invalid fixture");
const QUESTION=advance.pages.at(-1)?.text;
if(QUESTION===undefined)throw new Error("missing last page");
const UI=`Interface: field_yes_no; input ready; selected YES; ${F.ui.controls}`;
const ANSWER="To answer NO, press DOWN, then A. Pressing A now answers YES. B also answers NO.";
const BLOCK=`CURRENT QUESTION\n${QUESTION}\n${UI}\n${ANSWER}`;
const flags=(on:boolean)=>({...featuresOf(["dialogue-auto-advance-v1"]),[ID]:on});
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:advance.run,seq:44776,turn:893,t:advance.t,...body});
const state=(overrides:Record<string,unknown>={})=>event({...IN_GAME,type:"state",map_id:F.map_id,active_ui:F.ui,...overrides});
const result=(id=advance.tool_call_id,text=F.readout,overrides:Record<string,unknown>={})=>event({type:"tool_result",seq:44777,id,name:"observe",state_seq:44776,text,is_error:false,duration_ms:1,frames:[],...overrides});
const history=(id=advance.tool_call_id,text=F.readout):AgentMessage[]=>[{role:"toolResult",toolCallId:id,toolName:"observe",content:[{type:"text",text}],isError:false,timestamp:0}];
function setup(on=true){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const wiring=contextTools(flags(on),{subscribe:f=>{listeners.push(f);},recordLedgerContext:n=>{notes.push(n);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
 const feed=(events:RunEvent[])=>{for(const e of events)for(const f of listeners)f(e);};
 return {wiring,notes,feed};
}
it("OFF preserves exact context identity and records nothing",async()=>{
 const s=setup(false);s.feed([advance,state(),result()]);const input=history();expect(await s.wiring.transformContext(input)).toBe(input);expect(s.notes).toEqual([]);
});
it("the factory repeats only the final whole delivered page and existing current controls",async()=>{
 const s=setup();s.feed([advance,state(),result()]);const input=history(),out=await s.wiring.transformContext(input);
 expect(out.slice(0,-1)).toEqual(input);expect(out.at(-1)).toMatchObject({role:"user",content:BLOCK});expect(s.wiring.tools).toEqual([]);
 expect(BLOCK).not.toContain("Have you delivered");expect(s.notes).toEqual([{text:BLOCK,evidence:[44775,44774,44777,44776]}]);
 await s.wiring.transformContext(input);expect(s.notes).toHaveLength(1);
});
it.each([
 ["not ready",{active_ui:{...F.ui,ready:false}}],
 ["unknown selection",{active_ui:{...F.ui,selected:null}}],
 ["diagnostic",{active_ui:{...F.ui,diagnostic:"unsupported"}}],
 ["another owner",{active_ui:{...F.ui,phase:"clock_confirmation"}}],
 ["battle",{in_battle:true}],
 ["other map",{map_id:[0,9]}],
 ["other run",{run:"different"}],
] as const)("does not focus an unsupported or mismatched state: %s",async(_label,overrides)=>{
 const s=setup();s.feed([advance,state(overrides),result()]);const input=history();expect(await s.wiring.transformContext(input)).toEqual(input);expect(s.notes).toEqual([]);
});
it.each([
 ["failed result",{is_error:true}],
 ["wrong state reference",{state_seq:99}],
 ["missing state reference",{state_seq:undefined}],
] as const)("requires a successful state-bound delivery: %s",async(_label,overrides)=>{
 const s=setup();s.feed([advance,state(),result(undefined,undefined,overrides)]);const input=history();expect(await s.wiring.transformContext(input)).toEqual(input);expect(s.notes).toEqual([]);
});
it("does not promote a page that was never delivered, a mismatched dialog, or an older result",async()=>{
 const s=setup();s.feed([advance,state()]);expect(await s.wiring.transformContext(history())).toEqual(history());
 s.feed([result(undefined,F.readout.replace("PETALBURG?","SLATEPORT?"))]);expect(await s.wiring.transformContext(history())).toEqual(history());
 const other=setup();other.feed([advance,state(),result()]);expect(await other.wiring.transformContext(history("older"))).toEqual(history("older"));
});
it("drops an old question on a new state and never carries it after a reply",async()=>{
 const s=setup();s.feed([advance,state(),result()]);await s.wiring.transformContext(history());s.feed([state({seq:44778,active_ui:null})]);expect(await s.wiring.transformContext(history())).toEqual(history());
 const other=setup();other.feed([advance,state(),result()]);const replied:AgentMessage[]=[...history(),{role:"user",content:"new decision",timestamp:0}];
 // The result must still be the latest message with game evidence; unrelated later input does not re-arm it.
 expect(await other.wiring.transformContext(replied)).toEqual(replied);
});
it("updates the selection while retaining only the same source-qualified question",async()=>{
 const s=setup();s.feed([advance,state(),result()]);await s.wiring.transformContext(history());
 const text=F.readout.replaceAll("selected YES","selected NO").replace(ANSWER,"To answer YES, press UP, then A. Pressing A now answers NO. B also answers NO.");
 s.feed([state({seq:44778,active_ui:{...F.ui,selected:"NO"}}),result("next",text,{seq:44779,state_seq:44778})]);
 const out=await s.wiring.transformContext(history("next",text));expect(out.at(-1)).toMatchObject({role:"user",content:BLOCK.replace("selected YES","selected NO").replace(ANSWER,"To answer YES, press UP, then A. Pressing A now answers NO. B also answers NO.")});
 expect(s.notes.at(-1)?.evidence).toEqual([44775,44774,44777,44779,44778]);
});
it("does not guess a new question without a matching delivered page",async()=>{
 const s=setup();s.feed([advance,state(),result()]);const text=F.readout.replace("PETALBURG?","SLATEPORT?");s.feed([state({seq:44778}),result("new",text,{seq:44779,state_seq:44778})]);expect(await s.wiring.transformContext(history("new",text))).toEqual(history("new",text));
});
it("does not re-record a delivered focus block restored from its ledger receipt",async()=>{
 const s=setup();s.feed([advance,state(),result(),event({type:"ledger_context",seq:44778,text:BLOCK,evidence:[44775,44774,44777,44776]})]);
 expect((await s.wiring.transformContext(history())).at(-1)).toMatchObject({content:BLOCK});expect(s.notes).toEqual([]);
});
it("registers exactly once with OFF defaults and the existing page owner dependency",()=>{
 expect(SWITCHABLE_FEATURES.filter(id=>id===ID as string)).toEqual([ID]);expect(featureInfo(ID as Parameters<typeof featureInfo>[0])).toMatchObject({needs:"dialogue-auto-advance-v1",switchable:true});
 const f=flags(true);expect(playHarnessFeatures(f,null).filter(id=>id===ID)).toEqual([ID]);expect(dependencyProblems(f)).toEqual([]);expect(SERVER_FEATURES).not.toContain(ID);
 expect(normalizeFeatures(featuresOf([]))).toHaveProperty(ID,false);expect(flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false})).toHaveProperty(ID,false);
 expect(readFileSync(new URL("../../viewer/src/next-run.ts",import.meta.url),"utf8")).toContain('"current-question-focus-v1":false');
});
