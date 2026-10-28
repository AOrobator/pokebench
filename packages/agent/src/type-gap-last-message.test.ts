import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {dependencyProblems,featureInfo,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {newestTypeGapBlock,typeGapBlockIn,typeGapLastMessage} from "./type-gap-last-message.js";
import {TYPE_GAP_HEADER} from "./type-gap-team.js";

const ID="type-gap-team-last-message-v1";
// Recorded results (run f60d, the only bundle run with type-gap-team-v1 on so far: every result whose state the shipped
// TypeGapTeam renders a block for, with that block), the probe study's rendered blocks with their control readouts, and
// text recorded after other appended blocks. Built read-only from runs/ (see "source").
type Replayed={recorded:{run:string;seq:number;text:string;block:string}[];rendered:{case:string;readout:string;block:string}[];followers:string[]};
const CASES=JSON.parse(readFileSync(new URL("../test-support/type-gap-replay-cases.json",import.meta.url),"utf8")) as Replayed;
const CURRENT=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {switches:string[];onInBoth:string[];offInBoth:string[];features:Record<string,boolean>};
// The shipped block d41e turn 335 carried in the probes (runs/probes/type-gap-team-20261027, contexts.json "block").
const BLOCK=[TYPE_GAP_HEADER,
 "- RUSTBORO CITY GYM (leader not defeated): ROCK, from the gym guide on RUSTBORO CITY GYM: \"ROXANNE is a user of ROCK-type POKéMON.\"",
 "  Super effective against it (game type chart): WATER ×2, GRASS ×2, FIGHTING ×2, GROUND ×2, STEEL ×2",
 "  No party POKéMON type or damaging move: WATER, GRASS, FIGHTING, GROUND, STEEL",
 "- Party: TORCHIC FIRE (SCRATCH NORMAL, EMBER FIRE)",
 "- Balls in BAG: POKé BALL ×5"].join("\n");
const base=flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false});
const call=(id:string):AgentMessage=>({role:"assistant",content:[{type:"toolCall",id,name:"press",arguments:{}}],api:"openai-completions",provider:"p",model:"m",usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"toolUse",timestamp:0});
const result=(id:string,extra:string[]=[]):AgentMessage=>({role:"toolResult",toolCallId:id,toolName:"press",content:[{type:"text",text:"Readout: overworld, RUSTBORO CITY"},...extra.map(text=>({type:"text" as const,text}))],isError:false,timestamp:0});
const history=(extra:string[]=[]):AgentMessage[]=>[{role:"user",content:"Play the game.",timestamp:0},call("c1"),result("c1",extra)];

function setup(features:FeatureSet){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{listeners.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:(n:{text:string;evidence:number[]})=>{notes.push(n);},recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>undefined};
 const wired=contextTools(features,recorder,m=>Promise.resolve(m));
 const emit=(id:string,seq:number)=>{for(const f of listeners)f(checkEvent({v:1,run:"r",seq,turn:1,t:"2026-10-27T23:00:00.000-04:00",type:"tool_result",id,name:"press",text:"result",is_error:false,duration_ms:0,frames:[]}));};
 const replayLedger=(text:string,evidence:number[],seq:number)=>{for(const f of listeners)f(checkEvent({v:1,run:"r",seq,turn:2,t:"2026-10-27T23:00:00.000-04:00",type:"ledger_context",text,evidence}));};
 return {wired,notes,emit,replayLedger};
}
// The probes' production_and_last variant (sample.mjs): appendToResult(block) then asLastUser(block).
const probeBothPlaces=(messages:AgentMessage[],block:string):AgentMessage[]=>[...messages.map((m,i)=>i===messages.length-1&&m.role==="toolResult"?{...m,content:[...m.content,{type:"text" as const,text:block}]}:m),{role:"user",content:block,timestamp:0}];
const stamp=(messages:AgentMessage[])=>messages.map(m=>({...m,timestamp:0}));

describe(ID,()=>{
 it("is a default-off bundle observation switch registered after the gateway switches, needing type-gap-team-v1, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(288);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"type-gap-team-v1",switchable:true,title:"GYM TYPE GAP LAST MESSAGE"});
  expect(featureInfo(ID).description).toContain("Bundle arm only, default off");
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(playHarnessFeatures({...LEGACY_ALL_ON,[ID]:true},null).at(-1)).toBe(ID);
  expect(playHarnessFeatures({...LEGACY_ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(LEGACY_ALL_ON[ID]).toBe(false);
  expect(base[ID]).toBe(false);
  const {[ID]:omitted,...rest}=base;
  expect(omitted).toBe(false);
  expect(normalizeFeatures(rest)[ID]).toBe(false);
 });

 it("fails validation when on without type-gap-team-v1",()=>{
  expect(dependencyProblems({...base,"type-gap-team-v1":false,[ID]:true})).toContain(`${ID} needs type-gap-team-v1`);
  expect(dependencyProblems({...base,"type-gap-team-v1":true,[ID]:true})).not.toContain(`${ID} needs type-gap-team-v1`);
 });

 it("is a bundle-only switch in current.json, base off",()=>{
  expect(CURRENT.switches).toContain(ID);
  expect(CURRENT.features[ID]).toBe(false);
  expect(CURRENT.onInBoth).not.toContain(ID);
  expect(CURRENT.offInBoth).not.toContain(ID);
 });

 it("ON: the block on the newest result is repeated, byte for byte, as the last message, matching the probes' both-places request",async()=>{
  const {wired,notes,emit}=setup({...base,"type-gap-team-v1":true,[ID]:true});
  emit("c1",41);
  const sent=await wired.transformContext(history([BLOCK]));
  expect(stamp(sent)).toEqual(probeBothPlaces(history(),BLOCK));
  expect(sent.at(-1)).toMatchObject({role:"user",content:BLOCK});
  expect(notes).toEqual([{text:BLOCK,evidence:[41]}]);
  await wired.transformContext(history([BLOCK]));
  expect(notes).toHaveLength(1);
 });

 it("ON: after a continuation restore replays the recorded copy, the copy is delivered again but not recorded again",async()=>{
  const {wired,notes,emit,replayLedger}=setup({...base,"type-gap-team-v1":true,[ID]:true});
  emit("c1",41);
  replayLedger(BLOCK,[41],42);
  replayLedger("Instruction ledger: unrelated",[41],43);
  const sent=await wired.transformContext(history([BLOCK]));
  expect(sent.at(-1)).toMatchObject({role:"user",content:BLOCK});
  expect(notes).toEqual([]);
  emit("c2",50);
  await wired.transformContext([...history([BLOCK]),call("c2"),result("c2",[BLOCK])]);
  expect(notes).toEqual([{text:BLOCK,evidence:[50]}]);
 });

 it("ON: nothing is added when the newest result has no block, or the block is on a result an assistant reply already followed",async()=>{
  const {wired,notes}=setup({...base,"type-gap-team-v1":true,[ID]:true});
  expect(await wired.transformContext(history())).toEqual(history());
  const answered=[...history([BLOCK]),call("c2"),result("c2")];
  expect(await wired.transformContext(answered)).toEqual(answered);
  expect(notes).toEqual([]);
 });

 it("ON: a block on a result with no recorded event is still repeated, with no evidence",async()=>{
  const {wired,notes}=setup({...base,"type-gap-team-v1":true,[ID]:true});
  expect((await wired.transformContext(history([BLOCK]))).at(-1)).toMatchObject({role:"user",content:BLOCK});
  expect(notes).toEqual([{text:BLOCK,evidence:[]}]);
 });

 it("no copy when type-gap-team-v1 is off, even with this switch on",async()=>{
  const recorder={subscribe:()=>undefined,recordLedgerContext:()=>undefined};
  const identity=(m:AgentMessage[])=>Promise.resolve(m);
  expect(typeGapLastMessage({...base,"type-gap-team-v1":false,[ID]:true},recorder,identity)).toBe(identity);
  const {wired}=setup({...base,"type-gap-team-v1":false,[ID]:true});
  expect(await wired.transformContext(history([BLOCK]))).toEqual(history([BLOCK]));
 });

 it("OFF is byte-identical: the request, tools and recorded notes match the run without the switch",async()=>{
  const off=setup({...base,"type-gap-team-v1":true,[ID]:false});
  const identity=(m:AgentMessage[])=>Promise.resolve(m);
  expect(typeGapLastMessage({...base,"type-gap-team-v1":true,[ID]:false},{subscribe:()=>undefined,recordLedgerContext:()=>undefined},identity)).toBe(identity);
  off.emit("c1",41);
  const input=history([BLOCK]);
  expect(JSON.stringify(await off.wired.transformContext(input))).toBe(JSON.stringify(input));
  expect(off.notes).toEqual([]);
  const on=setup({...base,"type-gap-team-v1":true,[ID]:true});
  expect(on.wired.tools.map(t=>t.name)).toEqual(off.wired.tools.map(t=>t.name));
 });

 it("replayed results: the block cut from the recorder's joined text is byte-identical to the live block part",()=>{
  expect(CASES.recorded).toHaveLength(12);
  for(const r of CASES.recorded){
   const at=r.text.indexOf(r.block);
   expect(at,`seq ${String(r.seq)}`).toBeGreaterThan(0);
   expect(typeGapBlockIn(r.text),`seq ${String(r.seq)}`).toBe(r.block);
   const parts=[r.text.slice(0,at-1),r.block,...(at+r.block.length<r.text.length?[r.text.slice(at+r.block.length+1)]:[])];
   expect(parts.join("\n")).toBe(r.text);
   const live=newestTypeGapBlock([call("c"),{...result("c"),content:parts.map(text=>({type:"text" as const,text}))}]);
   const replayed=newestTypeGapBlock([call("c"),{...result("c"),content:[{type:"text",text:r.text}]}]);
   expect(replayed).toEqual(live);
   expect(live?.text).toBe(r.block);
  }
  expect(CASES.recorded.filter(r=>!r.text.endsWith(r.block)).length).toBeGreaterThan(0);
 });

 it("rendered blocks: the cut stops where the next appended block starts, for every follower recorded after one",()=>{
  expect(CASES.rendered.map(r=>r.case)).toContain("t335");
  expect(CASES.followers.length).toBeGreaterThanOrEqual(6);
  for(const r of CASES.rendered)for(const follower of [null,...CASES.followers]){
   const parts=[r.readout,r.block,...(follower===null?[]:[follower])];
   const label=`${r.case} + ${follower?.slice(0,30)??"nothing"}`;
   expect(typeGapBlockIn(parts.join("\n")),label).toBe(r.block);
   expect(newestTypeGapBlock([call("c"),{...result("c"),content:parts.map(text=>({type:"text" as const,text}))}])?.text,label).toBe(r.block);
  }
 });

 it("a decision probe's rebuilt result (one joined text part after its frames) gets the copy and the result's seq",async()=>{
  const {wired,notes,emit}=setup({...base,"type-gap-team-v1":true,[ID]:true});
  const r=CASES.recorded.find(x=>!x.text.endsWith(x.block)) as Replayed["recorded"][number];
  emit("c1",r.seq);
  const rebuilt:AgentMessage={role:"toolResult",toolCallId:"c1",toolName:"press",content:[{type:"image",data:"",mimeType:"image/png"},{type:"text",text:r.text}],isError:false,timestamp:0};
  const input=[{role:"user" as const,content:"Play the game.",timestamp:0},call("c1"),rebuilt];
  const sent=await wired.transformContext(input);
  expect(stamp(sent)).toEqual([...input,{role:"user",content:r.block,timestamp:0}]);
  expect(notes).toEqual([{text:r.block,evidence:[r.seq]}]);
 });

 it("finds the newest block among parallel results and ignores text that only mentions the header",()=>{
  expect(newestTypeGapBlock([call("a"),result("a",[BLOCK]),result("b")])).toEqual({id:"a",text:BLOCK});
  expect(newestTypeGapBlock([call("a"),result("a",[`Readout ${TYPE_GAP_HEADER}`])])).toBeNull();
  expect(typeGapBlockIn(`Readout\n${TYPE_GAP_HEADER}`)).toBe(TYPE_GAP_HEADER);
  expect(newestTypeGapBlock([{role:"user",content:"hi",timestamp:0}])).toBeNull();
 });
});
