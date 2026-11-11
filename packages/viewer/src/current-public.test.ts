import {parseWorkbench} from "./workbench-data.js";
import {expect,it} from "vitest";
import {currentFixture} from "../test-support/current.js";
import {Log,START,RUN,assistant,state} from "../test-support/events.js";
import {emptyCurrent,foldCurrent} from "./current-state.js";
import type {ProjectorAux} from "./current-service.js";
import {publishCurrent} from "./current-projection.js";
import {currentSplits,parseCurrentSnapshot,publicCurrentView,parseCurrentAnswer,parseCurrentQuery} from "./current-public.js";
const source={generation:"fixture-generation",identity:"1:2",offset:100,size:100,mtime:1,anchor:"a",evidence:""};
function fixture(complete=true){const log=new Log();log.add(0,{...START,system_prompt:"PRIVATE PROMPT"});log.add(1,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:200}});log.add(2,state());log.add(3,assistant());log.add(4,{type:"tool_call",turn:1,id:"PRIVATE TOOL ID",name:"observe",args:{secret:"PRIVATE ARG"}});const current=log.events.reduce((s,e)=>foldCurrent(s,e),emptyCurrent());if(current.start===null)throw new Error("missing header");current.start={...current.start,system_prompt:"PRIVATE PROMPT"};const aux:ProjectorAux={v:1,complete,reconstruct:true,updatedAt:2000,observedAt:2000,problem:null,headerEnd:1,namespace:1,health:{enabled:true,owner:true,ok:true,checkedAt:2000},regions:[{first:0,last:4}],prefix:null};return {current,aux};}
it("separates public display from resumable private state and preserves native display after JSON",()=>{const {current,aux}=fixture(),p=publishCurrent(current,source,7,aux);for(const secret of ["PRIVATE PROMPT","PRIVATE TOOL ID","PRIVATE ARG"])expect(p.detail).not.toContain(secret);const restored=parseCurrentSnapshot(JSON.parse(p.detail) as unknown);expect(restored.version).toBe(1);expect(restored.revision).toBe(7);expect(restored.totals?.input).toBe(500);expect(restored.phase).toMatchObject({kind:"tool",pending:1,tools:["observe"]});const text=JSON.stringify(restored);for(const privateText of ["PRIVATE PROMPT","PRIVATE TOOL ID","PRIVATE ARG",'"openTools"','"requestAt"','"nextSeq"'])expect(text).not.toContain(privateText);const display=publicCurrentView(restored);expect(display.partyMembers).toHaveLength(1);expect(display.partyState).toBe(display.state);expect(display.events).toEqual([]);expect(display.milestones).toEqual([]);expect(restored.run.splits).toEqual([]);expect(restored.run.measurement).toBeUndefined();});
it("uses null for provisional aggregate and clock fields while retaining source observations",()=>{const {current,aux}=fixture(false),p=publishCurrent(current,source,3,aux);expect(JSON.parse(p.detail) as unknown).toMatchObject({totals:null,control:null,run:{elapsedMs:null}});const v=parseCurrentSnapshot(JSON.parse(p.detail) as unknown);expect(v.totals).toBeNull();expect(v.control).toBeNull();expect(v.run.elapsedMs).toBeNull();expect(v.context.measured?.tokens).toBe(500);expect(v.run.turn).toBe(1);expect(v.progress.validation).toBe("unverified");expect(p.summary).not.toContain('"display"');});
it("refuses public data that invents complete counters or grading authority",()=>{const {current,aux}=fixture(false),v:unknown=JSON.parse(publishCurrent(current,source,1,aux).detail);if(typeof v!=="object"||v===null)throw new Error("fixture");expect(()=>parseCurrentSnapshot({...v,totals:current.totals})).toThrow();expect(()=>parseCurrentSnapshot({...v,measurement:{eligible:true}})).toThrow();expect(()=>parseCurrentSnapshot({...v,version:2})).toThrow();});

it("validates every public envelope while rejecting missing detail, private extras and foreign replacements",()=>{const {current,aux}=fixture(),s=parseCurrentSnapshot(JSON.parse(publishCurrent(current,source,7,aux).detail) as unknown);const summary:unknown=JSON.parse(publishCurrent(current,source,7,aux).summary);const answers:unknown[]=[{kind:"list",version:1,epoch:"e",cursor:"c",runs:[summary],next:null,indexing:false,problems:[]},{kind:"current",version:1,epoch:"e",cursor:"c",snapshot:s},{kind:"updates",version:1,epoch:"e",cursor:"c",reset:false,more:false,changes:[{id:RUN,removed:false,summary,snapshot:s},{id:"gone",removed:true}]},{kind:"history",version:1,epoch:"e",generation:"g",state:"ready",events:[current.start],before:null},{kind:"unavailable",version:1,problem:"fixture"}];for(const answer of answers)expect(parseCurrentAnswer(answer)).toEqual(answer);
 for(const value of [{...s,end:undefined},{...s,display:{}},{...s,phase:{...s.phase,requestAt:9}},{...s,health:{...s.health,port:8000}},{...s,header:{...s.header,system_prompt:"private"}}])expect(()=>parseCurrentSnapshot(value)).toThrow();
 expect(()=>parseCurrentAnswer({...answers[2] as object,changes:[{id:"other",removed:false,summary}]})).toThrow();expect(()=>parseCurrentAnswer({...answers[2] as object,reset:true})).toThrow();expect(()=>parseCurrentAnswer({...answers[3] as object,state:"reset"})).toThrow();expect(()=>parseCurrentAnswer({kind:"list",version:99})).toThrow();
 for(const q of [{kind:"list",now:1},{kind:"current",now:1,run:"name.with.dots"},{kind:"updates",now:1,after:null},{kind:"history",now:1,run:RUN,before:null}])expect(parseCurrentQuery(q)).toEqual(q);
 for(const q of [{kind:"list",now:-1},{kind:"current",now:1,run:"../escape"},{kind:"updates",now:1,after:"x".repeat(513)},{kind:"history",now:1,run:RUN,before:null,private:true}])expect(()=>parseCurrentQuery(q)).toThrow();
});

it("rejects otherwise valid nested grading splits, measurement and operator exclusion independently",()=>{const {current,aux}=fixture(),base=parseCurrentSnapshot(JSON.parse(publishCurrent(current,source,7,aux).detail) as unknown);const runs=[{...base.run,splits:[{name:"first_battle_win",elapsedMs:10,segmentMs:10,seq:2,turn:1,inputTokens:500,outputTokens:100}]},{...base.run,measurement:{controller:"agent",features:[],logSha256:"0".repeat(64),logBytes:1,pausedMs:0,rawSplits:[]}},{...base.run,excluded:"operator fixture"}];for(const run of runs){expect(()=>parseWorkbench({version:1,at:0,milestones:[],runs:[run],problems:[]})).not.toThrow();expect(()=>parseCurrentSnapshot({...base,run})).toThrow("Invalid current display response");}});

it("retains approximate display elapsed after backwards recorded time without granting grading authority",()=>{
 const {current,aux}=fixture();current.warning="Recorded time moved backwards; current display is not timing validation";
 const projected=parseCurrentSnapshot(JSON.parse(publishCurrent(current,source,8,aux).detail) as unknown);
 const exact=parseCurrentSnapshot(JSON.parse(publishCurrent({...current,warning:null},source,8,aux).detail) as unknown);
 expect(exact.run.elapsedMs).not.toBeNull();expect(projected.run.elapsedMs).toBe(exact.run.elapsedMs);
 expect(projected.warning).toBe(current.warning);expect(projected.run.clockWarning).toBe(current.warning);
 expect(projected.run.splits).toEqual([]);expect(projected.run.measurement).toBeUndefined();
 const incomplete=parseCurrentSnapshot(JSON.parse(publishCurrent(current,source,8,{...aux,complete:false}).detail) as unknown);
 expect(incomplete.run.elapsedMs).toBeNull();expect(incomplete.control).toBeNull();
});
it("reads a snapshot saved before thinking was published",()=>{const f=currentFixture(),old:Record<string,unknown>=JSON.parse(JSON.stringify(f.snapshot)) as Record<string,unknown>,display=old["display"] as Record<string,unknown>;delete display["thought"];delete display["streaming"];delete display["thinkingSince"];expect(publicCurrentView(parseCurrentSnapshot(old)).lastThought).toBeNull();});
it("sends a shared state once and restores it on read",()=>{const detail=currentFixture().snapshot;expect(detail.display.state?.seq).toBeDefined();expect(detail.display.partyState).toBeNull();expect(detail.display.partyIsState).toBe(true);const view=publicCurrentView(parseCurrentSnapshot(JSON.parse(JSON.stringify(detail))));expect(view.partyState).toBe(view.state);});
it("still sends a separate party state when it comes from an earlier event",()=>{const f=currentFixture({extra:[state({party:[],in_battle:true})]});expect(f.snapshot.display.partyIsState).toBeUndefined();expect(f.snapshot.display.partyState?.seq).not.toBe(f.snapshot.display.state?.seq);});
it("refuses a shared-state marker that contradicts the snapshot",()=>{const f=currentFixture(),base=f.snapshot;for(const display of [{...base.display,partyIsState:false},{...base.display,partyState:base.display.state}])expect(()=>parseCurrentSnapshot(JSON.parse(JSON.stringify({...base,display})))).toThrow("Invalid current display response");});
it("gives cards the snapshot's recorded progress before the full recording is read",()=>{const f=currentFixture({extra:[{type:"milestone",turn:1,name:"LITTLEROOT_TOWN",origin:"observed",server_timestamp:1,evidence:[1]}]}),summary=f.summary,splits=currentSplits(summary);expect(splits.map(split=>split.name)).toEqual(["LITTLEROOT_TOWN"]);const row=summary.progress.recorded[0];expect(splits[0]).toMatchObject({seq:row?.seq,turn:row?.turn,elapsedMs:(row?.at??0)-Date.parse(summary.header.t)});});
it("never gives a split a negative time",()=>{const f=currentFixture({extra:[{type:"milestone",turn:1,name:"LITTLEROOT_TOWN",origin:"observed",server_timestamp:1,evidence:[1]}]}),summary={...f.summary,header:{...f.summary.header,t:"2100-01-01T00:00:00.000Z"}};expect(currentSplits(summary)[0]?.elapsedMs).toBe(0);});
it("keeps milestones that were already true at a checkpoint out of the provisional story",()=>{const f=currentFixture({extra:[{type:"milestone",turn:1,name:"OLD_BADGE",origin:"present_at_start",server_timestamp:1},{type:"milestone",turn:1,name:"UNPROVEN",origin:"observed",server_timestamp:1},{type:"milestone",turn:1,name:"NEW_TOWN",origin:"observed",server_timestamp:1,evidence:[1]}]});expect(currentSplits(f.summary).map(split=>split.name)).toEqual(["NEW_TOWN"]);});
it("trusts older rows without provenance only on a boot start",()=>{const f=currentFixture({extra:[{type:"milestone",turn:1,name:"A",origin:"observed",server_timestamp:1,evidence:[1]}]}),old={...f.summary,progress:{...f.summary.progress,recorded:f.summary.progress.recorded.map(row=>({name:row.name,seq:row.seq,turn:row.turn,at:row.at}))}};expect(currentSplits(old).map(split=>split.name)).toEqual(["A"]);const saved={...old,header:{...old.header,start_state:{...old.header.start_state,kind:"save_state" as const}}};expect(currentSplits(saved as typeof old)).toEqual([]);});
it("never dates a split after the run's own clock",()=>{const f=currentFixture({extra:[{type:"milestone",turn:1,name:"A",origin:"observed",server_timestamp:1,evidence:[1]}]}),summary={...f.summary,run:{...f.summary.run,elapsedMs:1}};expect(currentSplits(summary)[0]?.elapsedMs).toBe(1);});
it("gives a probe run no provisional story",()=>{const f=currentFixture({start:{harness_features:["probe"]},extra:[{type:"milestone",turn:1,name:"A",origin:"observed",server_timestamp:1,evidence:[1]}]});expect(currentSplits(f.summary)).toEqual([]);});

it("publishes the quota reason through the browser display protocol",()=>{
 const {current,aux}=fixture();
 current.control={...current.control,state:"paused",pauseAt:1,pauseReason:"claude_quota"};
 const snapshot=parseCurrentSnapshot(JSON.parse(publishCurrent(current,source,2,aux).detail) as unknown);
 expect(publicCurrentView(snapshot).control.pauseReason).toBe("claude_quota");
 expect(snapshot.phase.kind).toBe("paused");
});

it("publishes a verified control clock before lifetime totals have rebuilt",()=>{
 const {current,aux}=fixture(false);
 aux.clock=JSON.stringify(current);aux.clockReady=true;
 const snapshot=parseCurrentSnapshot(JSON.parse(publishCurrent(current,source,1,aux).detail) as unknown);
 expect(snapshot.complete).toBe(false);
 expect(snapshot.totals).toBeNull();
 expect(snapshot.control).not.toBeNull();
 expect(snapshot.run.elapsedMs).not.toBeNull();
 expect(publicCurrentView(snapshot).control.state).toBe("running");
});

it("keeps later cards but withholds complete totals after omitted records",()=>{
 const {current,aux}=fixture();
 current.partial=true;current.warning="Display skipped future event";
 aux.clock=JSON.stringify({...current,partial:undefined,warning:null});aux.clockReady=true;
 const snapshot=parseCurrentSnapshot(JSON.parse(publishCurrent(current,source,1,aux).detail) as unknown);
 expect(snapshot.complete).toBe(false);expect(snapshot.totals).toBeNull();
 expect(snapshot.run.card).not.toBeNull();expect(snapshot.control).not.toBeNull();
});
