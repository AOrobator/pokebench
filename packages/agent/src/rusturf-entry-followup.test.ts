import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {expect,it} from "vitest";
import {snapshot} from "../test-support/instruction-goals.js";
import {RUN_START_META,IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,type FeatureSet} from "./features.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {rusturfEntryFollowupContext} from "./rusturf-entry-followup.js";

const LOCK="Field controls: available (terrain and objects can still block a direction)";
const TEXT=`Screen: overworld\nDialog: none\nMenu: none open\nLocation: RUSTURF TUNNEL\nPosition: X=7, Y=12, facing right\n${LOCK}`;
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"run",seq:1,turn:1,t:"2026-10-30T00:00:00.000-04:00",...body});
const state=(extra:Record<string,unknown>={})=>event({...IN_GAME,type:"state",location:"RUSTURF TUNNEL",map_id:[24,4],position:{x:7,y:12},active_ui:null,field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null},story_progress:{flags:"00".repeat(300),rustboro_stage:0,devon_stage:0,letter:false},...extra});
const result=(extra:Record<string,unknown>={})=>event({type:"tool_result",seq:2,id:"observe-1",name:"observe",state_seq:1,text:TEXT,is_error:false,duration_ms:1,frames:[],...extra});
const messages=(text=TEXT,id="observe-1"):AgentMessage[]=>[{role:"toolResult",toolCallId:id,toolName:"observe",content:[{type:"text",text}],isError:false,timestamp:0}];
const assistant=(stop_reason="stop")=>event({type:"assistant",seq:3,text:"Continue",thinking:"",tool_calls:[],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason});
function setup(on=true,base=(m:AgentMessage[])=>Promise.resolve(m),extra:Partial<FeatureSet>={}){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const transform=rusturfEntryFollowupContext({...featuresOf([]),"rusturf-entry-followup-v1":on,...extra},{subscribe:f=>{listeners.push(f);},recordLedgerContext:n=>{notes.push(n);}},base);
 return {transform,notes,listeners,feed:(...events:RunEvent[])=>{for(const e of events)for(const f of listeners)f(e);}};
}
it("OFF returns the identical base without subscribing or changing bytes",async()=>{const base=(m:AgentMessage[])=>Promise.resolve(m),s=setup(false,base),m=messages();expect(s.transform).toBe(base);expect(s.listeners).toHaveLength(0);expect(await s.transform(m)).toBe(m);});
it("delivers an evidence-bound current position and generic inquiry, once per successful decision",async()=>{
 const s=setup();s.feed(state(),result());const input=messages(),out=await s.transform(input);expect(out.slice(0,-1)).toEqual(input);
 const cue=out.at(-1);expect(cue).toMatchObject({role:"user"});expect(cue?.content).toContain("RUSTURF TUNNEL");expect(cue?.content).toContain("X=7, Y=12");
 expect(cue?.content).toContain("local inquiry");expect(cue?.content).not.toMatch(/PEEKO|BRINEY|DEVON|local_id|4,10/i);expect(s.notes).toEqual([{text:cue?.content,evidence:[1,2]}]);
 expect((await s.transform(input)).at(-1)).toMatchObject({role:"user",content:cue?.content});expect(s.notes).toHaveLength(1);s.feed(assistant());expect(await s.transform(input)).toEqual(input);
});
it.each([
 ["unknown native progress",{story_progress:null}], ["missing native progress",{story_progress:undefined}], ["unknown field owner",{world_context:null}], ["missing UI owner",{active_ui:undefined}], ["battle",{in_battle:true}], ["wrong screen",{screen:"field_transition"}], ["locked",{field_controls_locked:true}], ["unknown readiness",{field_controls_locked:null}],
 ["menu",{active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A",diagnostic:null}}], ["dialogue",{world_context:{objects:[],triggers:[],dialogue:"Hello"}}],
 ["message",{world_context:{objects:[],triggers:[],dialogue:null,message:{phase:"printing",cursor:0,ready:false}}}],
 ["script",{world_context:{objects:[],triggers:[],dialogue:null,field_activity:{phase:"script_running",owner:1}}}],
 ["diagnostic",{world_context:{objects:[],triggers:[],dialogue:null,message_diagnostic:"unknown"}}], ["blackout",{blackout_active:true}],
 ["wrong map",{map_id:[24,5]}], ["name mismatch",{location:"OTHER CAVE"}], ["not started",{started:false}],
 ["unsettled",{settle:{frames:10,reason:"coherence_timeout"}}], ["missing position",{position:null}],
] as const)("does not cue unsupported current state: %s",async(_name,extra)=>{const s=setup();s.feed(state(extra),result());const m=messages();expect(await s.transform(m)).toEqual(m);expect(s.notes).toEqual([]);});
it.each([
 ["failed",{is_error:true}], ["missing reference",{state_seq:undefined}], ["stale reference",{state_seq:0}], ["wrong run",{run:"other"}],
 ["wrong location",{text:TEXT.replace("RUSTURF TUNNEL","OTHER CAVE")}], ["wrong position",{text:TEXT.replace("X=7","X=3")}],
 ["duplicate screen",{text:TEXT+"\nScreen: overworld"}], ["fabricated quote",{text:JSON.stringify(TEXT)}],
 ["unknown menu",{text:TEXT.replace("Menu: none open","Menu: unavailable (active owner not verified)")}], ["dialogue in readout",{text:TEXT.replace("Dialog: none",'Dialog: "Hello"')}], ["missing UI readout",{text:TEXT.replace("Menu: none open\n","")}], ["coverage failure",{text:TEXT+"\nSTATE COVERAGE ERROR: unknown"}], ["contradictory menu",{text:TEXT+"\nInterface: field_yes_no; input ready"}],
] as const)("requires coherent recorded readout: %s",async(_name,extra)=>{const s=setup();s.feed(state(),result(extra));const m=messages();expect(await s.transform(m)).toEqual(m);});
it("requires state, recorded result, exact actual result and untrimmed output",async()=>{
 const noState=setup();noState.feed(result());expect(await noState.transform(messages())).toEqual(messages());
 const noResult=setup();noResult.feed(state());expect(await noResult.transform(messages())).toEqual(messages());
 const s=setup();s.feed(state(),result());for(const m of [messages(TEXT,"older"),messages(TEXT+"\nextra"),messages("Quoted old result: "+TEXT),[{role:"user",content:TEXT,timestamp:0}] satisfies AgentMessage[]])expect(await s.transform(m)).toEqual(m);
 const trimmed=setup(true,()=>Promise.resolve([]));trimmed.feed(state(),result());expect(await trimmed.transform(messages())).toEqual([]);expect(trimmed.notes).toEqual([]);
});
it("does not reach through a newer assistant or tool result",async()=>{
 const s=setup();s.feed(state(),result());const reply:AgentMessage={role:"assistant",content:[],api:"openai-completions",provider:"test",model:"test",usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:0};
 for(const m of [[...messages(),reply],[...messages(),...messages("unrelated","new")]])expect(await s.transform(m)).toEqual(m);
});
it.each(["error","aborted"])("retains pending cue across %s retry and updates current facts",async reason=>{
 const s=setup();s.feed(state(),result());await s.transform(messages());s.feed(assistant(reason));expect((await s.transform(messages())).at(-1)?.content).toContain("local inquiry");
 const text=TEXT.replace("X=7","X=8");s.feed(state({seq:4,position:{x:8,y:12}}),result({seq:5,state_seq:4,id:"next",text}));expect((await s.transform(messages(text,"next"))).at(-1)?.content).toContain("X=8, Y=12");
});
it("assistant without cue exposure cannot consume it; leaving cancels pending; reentry is bounded",async()=>{
 const s=setup();s.feed(state(),result(),assistant());expect((await s.transform(messages())).at(-1)?.content).toContain("local inquiry");
 s.feed(state({seq:4,map_id:[0,31],location:"ROUTE 116"}));expect(await s.transform(messages())).toEqual(messages());
 s.feed(state({seq:5}),result({seq:6,state_seq:5}));await s.transform(messages());s.feed(assistant());
 s.feed(state({seq:8,map_id:[0,31]}),state({seq:9}),result({seq:10,state_seq:9}));expect(await s.transform(messages())).toEqual(messages());
});
it("defers an entry made in battle or menu until a coherent free field observation",async()=>{
 for(const extra of [{in_battle:true},{active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A",diagnostic:null}}]){const s=setup();s.feed(state(extra),result());expect(await s.transform(messages())).toEqual(messages());s.feed(state({seq:4}),result({seq:5,state_seq:4}));expect((await s.transform(messages())).at(-1)?.content).toContain("local inquiry");}
});
it.each(["RUSTURF_AQUA_GRUNT_DEFEATED","DEVON_GOODS_RECOVERED"])("suppresses authoritative completion: %s",async name=>{
 const s=setup();s.feed(event({type:"milestone",name,kind:"story",origin:"observed",server_timestamp:1,evidence:[0]}),state(),result());expect(await s.transform(messages())).toEqual(messages());
});
it("suppresses native recovered flag, but never accepts unqualified or other-run milestone claims",async()=>{
 const flags=new Uint8Array(300);flags[143>>3]=1<<(143&7);const s=setup();s.feed(state({story_progress:{flags:Buffer.from(flags).toString("hex"),rustboro_stage:4,devon_stage:0,letter:false}}),result());expect(await s.transform(messages())).toEqual(messages());
 for(const extra of [{},{kind:"legacy",origin:"observed"},{kind:"story",origin:"observed",run:"other"}]){const q=setup();q.feed(state(),event({type:"milestone",name:"DEVON_GOODS_RECOVERED",server_timestamp:1,...extra}),result());expect((await q.transform(messages())).at(-1)?.content).toContain("local inquiry");}
});

it("native battle victory suppresses postbattle scripting even before goods recovery",async()=>{
 const flags=new Uint8Array(300);flags[1296>>3]=1<<(1296&7);const s=setup();s.feed(state({story_progress:{flags:Buffer.from(flags).toString("hex"),rustboro_stage:3,devon_stage:0,letter:false}}),result());expect(await s.transform(messages())).toEqual(messages());
 s.feed(state({seq:4}),result({seq:5,state_seq:4}));expect(await s.transform(messages())).toEqual(messages());
});
it("a failed fresh state observation invalidates a previous eligible candidate",async()=>{
 const s=setup();s.feed(state(),result(),event({type:"telemetry_error",seq:3,source:"state",message:"state unavailable"}));expect(await s.transform(messages())).toEqual(messages());
});
it("matches production text-part joining, retains current supervisor context and avoids duplicate cues",async()=>{
 const s=setup();s.feed(state(),result());const m=messages();const tool=m[0];if(tool?.role!=="toolResult")throw new Error("fixture");
 const split:AgentMessage[]=[{...tool,content:TEXT.split("\n").map(text=>({type:"text"as const,text}))},{role:"user",content:"Current goal remains active.",timestamp:0}];
 const out=await s.transform(split);expect(out.slice(0,-1)).toEqual(split);expect(await s.transform(out)).toEqual(out);expect(s.notes).toHaveLength(1);
});

it("reentrant trimming cannot retain a stale injected note without its actual tool result",async()=>{
 const s=setup();s.feed(state(),result());const out=await s.transform(messages());const cue=out.at(-1);if(cue===undefined)throw new Error("fixture");expect(await s.transform([cue])).toEqual([]);
 const text=TEXT.replace("X=7","X=8");s.feed(state({seq:4,position:{x:8,y:12}}),result({seq:5,state_seq:4,id:"next",text}));const fresh=await s.transform([...messages(text,"next"),cue]);
 expect(fresh.filter(m=>m.role==="user")).toHaveLength(1);expect(fresh.at(-1)?.content).toContain("X=8, Y=12");expect(fresh.at(-1)?.content).not.toContain("X=7, Y=12");
});

it.each(["semantic-navigation-v1","semantic-navigation-v2"] as const)("mentions semantic tool only when available through %s",async id=>{
 const s=setup(true,undefined,{[id]:true});s.feed(state(),result());const text=(await s.transform(messages())).at(-1)?.content;
 expect(text).toContain("navigate_to_target with the current map_id and exact listed target");expect(text).toContain("occupied coordinates");expect(text).not.toContain("Use navigate_to only");
});
it("conditions coordinate navigation on its switch and preserves the inquiry/follow-through core",async()=>{
 for(const enabled of [false,true]){const s=setup(true,undefined,{"bounded-navigation-v1":enabled});s.feed(state(),result());const text=(await s.transform(messages())).at(-1)?.content;
 expect(text).not.toContain("navigate_to_target");if(typeof text!=="string")throw new Error("missing cue text");expect(text.includes("Use navigate_to only")).toBe(enabled);expect(text).toContain("already adjacent, facing that person and on the free field");expect(text).toContain("Limited visibility does not exhaust the leads");expect(text).toContain("keep it pending through wild battles, dialogue, menus and necessary healing/travel");expect(text).toContain("Arrival or a taunt is not completion");expect(text).toContain("older plans as proposals, not game facts");}
});
it("does not rotate run identity on a spoofed other-run state or result",async()=>{
 const s=setup();s.feed(state(),result());await s.transform(messages());s.feed(assistant());
 s.feed(state({run:"other",seq:4}),result({run:"other",seq:5,state_seq:4}));expect(await s.transform(messages())).toEqual(messages());
});

// Minimal replay of delivered fields at 82e1 state21792/result21793 (2026-10-29 09:20:09 -04).
// The owning exit-labels-v3 producer is map_sections.py:named and readout.py's Location line.
const HISTORICAL_SECTION="RUSTURF TUNNEL (map 24/4) — northwest terrain section [3,1]";
const sectionText=(current=HISTORICAL_SECTION)=>TEXT.replace("Location: RUSTURF TUNNEL",`Location: ${current}`);
const sectionState=(current=HISTORICAL_SECTION)=>({exit_sections:{current,warps:[],connections:[]}});
it("copies the exact historical current-section Location line without discarding its suffix",async()=>{
 const s=setup(),text=sectionText().replace("Position: X=7, Y=12, facing right","Position: X=4, Y=10, facing up, elevation 3");
 s.feed(state({...sectionState(),position:{x:4,y:10},facing:"up"}),result({text}));const out=await s.transform(messages(text));
 expect(out.at(-1)?.content).toContain(`Location: ${HISTORICAL_SECTION}\nPosition:`);expect(s.notes).toHaveLength(1);
});
it.each([
 ["forged suffix",`${HISTORICAL_SECTION} — fabricated exit`],
 ["foreign map",HISTORICAL_SECTION.replace("24/4","24/5")],
 ["foreign name",HISTORICAL_SECTION.replace("RUSTURF TUNNEL","OTHER CAVE")],
 ["arbitrary substring",`Previously visited ${HISTORICAL_SECTION}`],
 ["invalid section direction",HISTORICAL_SECTION.replace("northwest","upward")],
 ["negative section anchor",HISTORICAL_SECTION.replace("[3,1]","[-3,1]")],
] as const)("rejects a delivered and state-agreed unsupported section label: %s",async(_name,current)=>{
 const s=setup(),text=sectionText(current);s.feed(state(sectionState(current)),result({text}));expect(await s.transform(messages(text))).toEqual(messages(text));expect(s.notes).toEqual([]);
});
it("requires section text to equal the current observed field, not a remembered label",async()=>{
 const s=setup(),text=sectionText();s.feed(state(sectionState(HISTORICAL_SECTION.replace("[3,1]","[4,1]"))),result({text}));expect(await s.transform(messages(text))).toEqual(messages(text));
});
it("rejects duplicate Location owners and unknown historical native completion",async()=>{
 for(const [extra,text]of [[sectionState(),sectionText()+"\nLocation: RUSTURF TUNNEL"],[{...sectionState(),story_progress:undefined},sectionText()]]as const){const s=setup();s.feed(state(extra),result({text}));expect(await s.transform(messages(text))).toEqual(messages(text));}
});

it("isolates the native map-group guard with the same map number and coherent bare readout",async()=>{
 const s=setup();s.feed(state({map_id:[25,4]}),result());const input=messages();expect(await s.transform(input)).toEqual(input);expect(s.notes).toEqual([]);
});
it("isolates the native location-name guard with a coherently delivered foreign name",async()=>{
 const text=TEXT.replace("RUSTURF TUNNEL","OTHER CAVE"),s=setup();s.feed(state({location:"OTHER CAVE"}),result({text}));const input=messages(text);expect(await s.transform(input)).toEqual(input);expect(s.notes).toEqual([]);
});
it("isolates actual delivered toolName from the matching recorded call ID and text",async()=>{
 const s=setup();s.feed(state(),result());const input=messages().map(m=>m.role==="toolResult"?{...m,toolName:"press"}:m);expect(await s.transform(input)).toEqual(input);expect(s.notes).toEqual([]);
});
it("isolates the position X guard with identical wrong-X recorded and delivered text",async()=>{
 const text=TEXT.replace("X=7","X=3"),s=setup();s.feed(state(),result({text}));const input=messages(text);expect(await s.transform(input)).toEqual(input);expect(s.notes).toEqual([]);
});
it("isolates the position Y guard with identical wrong-Y recorded and delivered text",async()=>{
 const text=TEXT.replace("Y=12","Y=8"),s=setup();s.feed(state(),result({text}));const input=messages(text);expect(await s.transform(input)).toEqual(input);expect(s.notes).toEqual([]);
});
it("isolates a nonfield screen that native completion decoding still accepts",async()=>{
 const s=setup();s.feed(state({screen:"evolution"}),result());const input=messages();expect(await s.transform(input)).toEqual(input);expect(s.notes).toEqual([]);
});
