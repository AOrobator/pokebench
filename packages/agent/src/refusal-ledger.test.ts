import {readFileSync} from "node:fs";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {checkEvent,type BodyOf,type RunEvent} from "./events.js";
import {featuresOf,featureInfo,dependencyProblems,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {playSystemPrompt} from "./play-config.js";
import {contextTools} from "./play-wiring.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";

const ID="refusal-ledger-v1";
const ON={...featuresOf([]),"story-state-v1":true,"disproved-beliefs-v1":true,[ID]:true};
const OFF={...ON,[ID]:false};
type Body=Omit<BodyOf<"belief_ledger">,"type"|"turn">;
interface Fixture {source:string;events:RunEvent[]}
const fixtures=JSON.parse(readFileSync(new URL("../test-support/refusals-frontier.json",import.meta.url),"utf8")) as Fixture[];
const fixture=(suffix:string):RunEvent[]=>fixtures.find(f=>f.source.includes(`_${suffix}/`))?.events.map(checkEvent)??[];
function setup(features:FeatureSet=ON){
 const subscribers:((e:RunEvent)=>void)[]=[],bodies:Body[]=[];
 const context=contextTools(features,{subscribe:fn=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:body=>{bodies.push(body);}},m=>Promise.resolve(m));
 const send=(events:readonly RunEvent[])=>{for(const event of events)for(const subscriber of subscribers)subscriber(event);};
 const input:AgentMessage[]=[{role:"user",content:"Current observation wins.",timestamp:0}];
 return {context,bodies,send,input,decide:()=>context.transformContext(input)};
}
const stateOf=(events:RunEvent[])=>events.find(e=>e.type==="state"&&"started"in e);
const rewrite=(event:RunEvent,extra:Record<string,unknown>)=>checkEvent({...event,...extra});

describe("refusal ledger production context",()=>{
 it("defaults OFF and requires the existing belief ledger",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"disproved-beliefs-v1"});
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(normalizeFeatures(featuresOf([]))[ID]).toBe(false);
  const omitted=Object.fromEntries(Object.entries(ON).filter(([id])=>id!==ID));
  expect(normalizeFeatures(omitted as FeatureSet)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(playHarnessFeatures(ON,null)).toContain(ID);
  expect(dependencyProblems({...ON,"disproved-beliefs-v1":false})).toContain(`${ID} needs disproved-beliefs-v1`);
 });
 it.each(["2aca","a866"])("delivers exact recorded %s reason, two attempts, source references and current-observation precedence",async suffix=>{
  const events=fixture(suffix),s=setup();s.send(events);const out=await s.decide();
  const results=events.filter(e=>e.type==="tool_result");
  const latest=results.at(-1);if(latest?.type!=="tool_result")throw new Error("missing result");
  expect(s.bodies).toHaveLength(1);
  const body=s.bodies[0];
  expect(body?.entries).toBe(1);
  expect(body?.text).toContain("2 times");
  expect(body?.text).toContain(latest.text);
  expect(body?.text).toContain("Current observations take precedence");
  expect(body?.evidence).toEqual([...new Set(events.map(e=>e.seq))].sort((a,b)=>a-b));
  expect(out[0]).toEqual(s.input[0]);
  expect(out.at(-1)).toMatchObject({role:"user",content:body?.text});
  expect(()=>checkEvent({v:1,run:"fixture",seq:99999,t:latest.t,type:"belief_ledger",turn:latest.turn+1,...body})).not.toThrow();
 });
 it("OFF produces exactly the previous context and no extra events",async()=>{
  const s=setup(OFF);s.send(fixture("2aca"));expect(await s.decide()).toEqual(s.input);expect(s.bodies).toEqual([]);
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt(OFF,null));
  expect(setup(ON).context.tools).toEqual(setup(OFF).context.tools);
 });
 it("uses semantic refusal history, never the guard's advice, and excludes successful walks and B-loop presses",async()=>{
  const s=setup();s.send(fixture("ee12").filter(e=>e.turn<=320));await s.decide();
  expect(s.bodies.at(-1)?.text).toContain("NORTH");
  expect(s.bodies.at(-1)?.text).toContain("2 times");
  const ignored=setup();ignored.send(fixture("ee12").filter(e=>e.turn===400));ignored.send(fixture("da1c"));
  expect(await ignored.decide()).toEqual(ignored.input);expect(ignored.bodies).toEqual([]);
 });
 it.each(["map","story","reached"])("expires history as soon as a native %s observation arrives",async kind=>{
  const events=fixture("2aca"),s=setup();s.send(events);
  await s.decide();expect(s.bodies).toHaveLength(1);s.bodies.length=0;
  const state=stateOf(events);if(state===undefined||!("started"in state))throw new Error("state missing");
  s.send([rewrite(state,{seq:90000,...(kind==="map"?{map_id:[0,9]}:kind==="reached"?{position:{x:14,y:5}}:{story:{...state.story,stone_badge:true}})})]);
  expect(await s.decide()).toEqual(s.input);expect(s.bodies).toEqual([]);
 });
 it("replaces a changed reason, preserving its whole line and restarting the count",async()=>{
  const events=fixture("2aca"),s=setup();s.send(events);
  const call=events.findLast(e=>e.type==="tool_call"),result=events.findLast(e=>e.type==="tool_result");
  if(call===undefined||result===undefined)throw new Error("missing call/result");
  s.send([rewrite(call,{seq:90001,id:"changed"}),rewrite(result,{seq:90002,id:"changed",text:"Navigation: no supported path on the current map; 0 bounded movement actions."})]);
  await s.decide();expect(s.bodies[0]?.text).toContain("1 time");expect(s.bodies[0]?.text).not.toContain("26,23");
 });
 it("does not replay old supervisor text after a new current map, even if a guard notice arrives later",async()=>{
  const events=fixture("a866"),s=setup();s.send(events);
  await s.decide();expect(s.bodies).toHaveLength(1);s.bodies.length=0;
  const state=stateOf(events);if(state===undefined)throw new Error("missing state");
  s.send([rewrite(state,{seq:90000,map_id:[1,3]})]);
  s.send([checkEvent({v:1,run:state.run,t:state.t,seq:90001,type:"loop_guard",turn:200,kind:"same_target_no_progress",message:"STALE SUPERVISOR: go north",calls:8,evidence:[4879],mode:"enforced",phase:"supervisor"})]);
  expect(await s.decide()).toEqual(s.input);
 });
 it.each(["error","no-state","wrong-map","stale-result","battle","locked","arrival","activation","no-receipt","wrong-name"])("does not invent refusal evidence from %s",async kind=>{
  const events=fixture("2aca"),s=setup();
  const call=events.findLast(e=>e.type==="tool_call"),result=events.findLast(e=>e.type==="tool_result"),state=events.findLast(e=>e.type==="state");
  if(call===undefined||result===undefined||state===undefined)throw new Error("fixture incomplete");
  const before=rewrite(state,{seq:90000});
  const after=rewrite(state,{seq:90002,...(kind==="battle"?{in_battle:true}:kind==="locked"?{field_controls_locked:true}:{})});
  const alteredCall=rewrite(call,{seq:90001,...(kind==="wrong-map"?{args:{x:14,y:5,map_id:[0,9]}}:kind==="no-receipt"?{name:"navigate_to_target",args:{map_id:[24,11],target:{kind:"object",local_id:4}}}:{})});
  const alteredResult:Record<string,unknown>={...result,seq:90003,state_seq:90002,...(kind==="error"?{is_error:true}:kind==="no-state"?{state_seq:undefined}:kind==="arrival"?{text:"Navigation: arrived at requested coordinate; 2 bounded movement actions."}:kind==="activation"?{semantic_navigation:{target:{kind:"warp",x:14,y:5},activation_attempted:true}}:kind==="no-receipt"?{name:"navigate_to_target"}:kind==="wrong-name"?{name:"observe"}:{})};
  if(kind==="no-state")delete alteredResult.state_seq;
  s.send([before,alteredCall,after,...(kind==="stale-result"?[rewrite(state,{seq:90004})]:[]),checkEvent(alteredResult)]);
  expect(await s.decide()).toEqual(s.input);expect(s.bodies).toEqual([]);
 });
 it("retires an old refusal when a later valid result no longer refuses it",async()=>{
  const events=fixture("2aca"),s=setup();s.send(events);await s.decide();expect(s.bodies).toHaveLength(1);s.bodies.length=0;
  const call=events.findLast(e=>e.type==="tool_call"),result=events.findLast(e=>e.type==="tool_result");if(call===undefined||result===undefined)throw new Error("fixture incomplete");
  s.send([rewrite(call,{seq:90001,id:"retry"}),rewrite(result,{seq:90002,id:"retry",text:"Navigation: action bound reached; inspect new state; 8 bounded movement actions."})]);
  expect(await s.decide()).toEqual(s.input);expect(s.bodies).toEqual([]);
 });

});
