import {mkdtempSync,readFileSync} from "node:fs";
import {parseExperiment,experimentArms} from "./experiments.js";
import {describe,expect,it,vi} from "vitest";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {StreamFn} from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,type Model,type Message} from "@mariozechner/pi-ai";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {FrameStore} from "./frames.js";
import {Governor,piLoop,play} from "./harness.js";
import {StateMilestones} from "./milestones.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {parseEvent} from "./events.js";
import {playGameTools} from "./play-wiring.js";
import {IN_GAME,NAME_CONFIRMED,RUN_START_META} from "../test-support/events.js";
import {ALL_TOOL_SWITCHES,observeTool,pressTool} from "./game-tools.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {toolSwitches} from "./play-config.js";



import {ALL_ON as BEFORE_PENDING_ALL_ON,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,dependencyProblems} from "./features.js";
import type {Button} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";

const ALL_ON={...BEFORE_PENDING_ALL_ON,"menu-refusal-recovery-v1":false,"pending-field-dialogue-v1":false};
const field:GameStateSnapshot={...IN_GAME,story:NAME_CONFIRMED.story,started:true,screen:"overworld",map_id:[0,16],location:"ROUTE101",position:{x:10,y:7},in_battle:false,active_ui:null,field_controls_locked:false,world_context:null,running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:1,callback2:2,diagnostic:null,raw_hex:null}};
const text=(result:{content:readonly {type:string;text?:string}[]})=>result.content.flatMap(c=>c.type==="text"?[c.text??""]:[]).join("\n");
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAACYklEQVR4nO3OAQnAMAADsNqYjwm4f1U3USiMQAQk537wjMwHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFP07k6LPv/wpiQAAAABJRU5ErkJggg==","base64");
const urlOf=(input:Parameters<typeof fetch>[0])=>typeof input==="string"?input:input instanceof URL?input.href:input.url;
const clock={now:()=>0,sleep:()=>Promise.resolve()};
function server(state:GameStateSnapshot){
 parseGameState(state);
 const posts:string[]=[];
 const fetchFn=vi.fn<typeof fetch>((input,init)=>{
  const url=urlOf(input);if(init?.method==="POST")posts.push(url);
  const body=url.endsWith("/pokebench/state")?state:url.endsWith("/observation")?{state,state_text:"field",screenshot_base64:png.toString("base64")}:url.endsWith("/queue_status")?{queue_empty:true}:{status:"success"};
  return Promise.resolve(new Response(JSON.stringify(body)));
 });return {fetchFn,posts};
}
describe("navigation tool-use guard at the native input boundary",()=>{
 for(const direction of ["UP","DOWN","LEFT","RIGHT"] as const)it(`rejects ${direction} walking batches with zero input`,async()=>{
  const s=server(field),h=hooks();
  const result=await pressTool("http://game",h,s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true}).execute("model",{buttons:[direction,direction]});
  expect(s.posts).toEqual([]);expect(h.beforePress).not.toHaveBeenCalled();
  expect(text(result)).toContain('"submitted":[]');expect(text(result)).toContain(JSON.stringify({requested:[direction,direction],submitted:[],map_id:[0,16],position:{x:10,y:7}}));
 });
 it("rejects a model walking batch before native input, with state and requested/zero-submitted receipt",async()=>{
  const s=server(field),before=vi.fn();
  const tool=pressTool("http://game",{beforePress:before,afterPress:()=>Promise.resolve()},s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true});
  const result=await tool.execute("model",{buttons:["RIGHT","UP","UP"]});
  expect(s.posts).toEqual([]);expect(before).not.toHaveBeenCalled();
  expect(text(result)).toContain("Navigation tool-use guard");expect(text(result)).toContain('"submitted":[]');expect(text(result)).toContain('"requested":["RIGHT","UP","UP"]');
  expect((result.details as {state:GameStateSnapshot}).state).toMatchObject({map_id:[0,16],position:{x:10,y:7}});
 });
 it("wires the guard separately from the semantic feedback switch",()=>{
  const f=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(toolSwitches({...f,"navigation-tool-use-guard-v1":true})).toMatchObject({navigationToolUseGuard:true});
  expect(toolSwitches(f)).not.toHaveProperty("navigationToolUseGuard");
 });
 it("keeps internal checked navigation inputs available",async()=>{
  const s=server(field),tool=pressTool("http://game",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true});
  await tool.executeChecked("navigation",{buttons:["UP","UP"]},()=>undefined);
  expect(s.posts).toHaveLength(1);
 });
});

const hooks=()=>({beforePress:vi.fn(),afterPress:()=>Promise.resolve()});
it("registers and records two independent optional default-OFF features",()=>{
 const ids=["navigation-tool-use-guard-v1","semantic-current-map-feedback-v1"] as const;
 expect(SWITCHABLE_FEATURES.slice(-17,-15)).toEqual(ids);
 expect(playHarnessFeatures(ALL_ON,null).slice(-15,-13)).toEqual(ids);
 const {"navigation-tool-use-guard-v1":guard,"semantic-current-map-feedback-v1":feedback,...old}=ALL_ON;
 expect([guard,feedback]).toEqual([true,true]);
 for(const id of ids){expect(normalizeFeatures(old)[id]).toBe(false);expect(featureInfo(id).description).toContain(" Off: ");}
 expect(dependencyProblems({...ALL_ON,"bounded-navigation-v1":false})).toContain("navigation-tool-use-guard-v1 needs bounded-navigation-v1");
});
for(const [name,change] of [
 ["not started",{started:false}], ["menu",{screen:"menu"}], ["battle",{in_battle:true}],
 ["unknown UI",{active_ui:undefined}], ["locked field",{field_controls_locked:true}],
 ["unknown lock",{field_controls_locked:null}], ["moving avatar",{running:{...field.running,controllable:false}}],
 ["unknown motion",{running:null}], ["missing map",{map_id:null}], ["missing position",{position:null}],
 ["dialogue",{world_context:{objects:[],triggers:[],dialogue:"Wait!",message:null}}], ["script activity",{world_context:{objects:[],triggers:[],dialogue:null,field_activity:{phase:"script_running",owner:1}}}],
 ["message",{world_context:{objects:[],triggers:[],dialogue:null,message:{phase:"button_wait",cursor:0,ready:true}}}],
] as const)it(`allows existing inputs with ${name}`,async()=>{
 const s=server({...field,...change} as GameStateSnapshot),h=hooks();
 await pressTool("http://game",h,s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true}).execute("model",{buttons:["UP","UP"]});
 expect(s.posts).toHaveLength(1);expect(h.beforePress).toHaveBeenCalledOnce();
});
for(const buttons of [["UP"],["RIGHT"],["UP","A"],["B","UP"],["A","A"]] satisfies Button[][])it(`preserves ${buttons.join(",")} inputs`,async()=>{
 const s=server(field);
 const result=await pressTool("http://game",hooks(),s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true}).execute("model",{buttons});
 expect(s.posts).toHaveLength(1);expect(text(result)).not.toContain("Navigation tool-use guard");
});
it("OFF is byte-identical to the previous default for walking batches",async()=>{
 const run=async(switches:typeof ALL_TOOL_SWITCHES)=>{
  const s=server(field),h=hooks(),tool=pressTool("http://game",h,s.fetchFn,clock,switches);
  const result=await tool.execute("model",{buttons:["UP","UP"]});
  expect(s.posts).toEqual(["http://game/action"]);
  const posts=s.fetchFn.mock.calls.filter(([,init])=>init?.method==="POST");
  expect(posts.map(([url,init])=>[urlOf(url),init?.body])).toEqual([["http://game/action",JSON.stringify({buttons:["UP","UP"],hold_frames:10,release_frames:8})]]);
  expect(h.beforePress).toHaveBeenCalledOnce();expect(h.beforePress).toHaveBeenCalledWith("model",["UP","UP"],{hold_frames:10,release_frames:8},field);
  expect(text(result)).not.toContain("Navigation tool-use guard");
  return {result,description:tool.description,calls:s.fetchFn.mock.calls.map(([url,init])=>[urlOf(url),init?.method,init?.body]),hooks:h.beforePress.mock.calls};
 };
 expect(await run({...ALL_TOOL_SWITCHES,navigationToolUseGuard:false})).toEqual(await run(ALL_TOOL_SWITCHES));
});
it("preserves old operation when the state server is unavailable",async()=>{
 const s=server(field),base=s.fetchFn;
 const fetchFn:typeof fetch=(input,init)=>urlOf(input).endsWith("/pokebench/state")?Promise.reject(new Error("offline")):base(input,init);
 await pressTool("http://game",hooks(),fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true}).execute("model",{buttons:["UP","UP"]});
 expect(s.posts).toHaveLength(1);
});
it("a stopped request makes no request or native input",async()=>{
 const s=server(field),stop=new AbortController();stop.abort();
 await expect(pressTool("http://game",hooks(),s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true}).execute("model",{buttons:["UP","UP"]},stop.signal)).rejects.toThrow();
 expect(s.fetchFn).not.toHaveBeenCalled();
});

it("registers independent unqueued experiments with one switch difference and explicit incumbent flags",()=>{
 for(const id of ["navigation-tool-use-guard-v1","semantic-current-map-feedback-v1","rejected-movement-step-v1","observed-field-dialogue-v1"] as const){
  const entry=parseExperiment(JSON.parse(readFileSync(new URL(`../../../experiments/${id}.json`,import.meta.url),"utf8")) as unknown);
  expect(entry.queuePosition).toBeUndefined();expect(entry.changedFeature).toBe(id);
  if(id==="rejected-movement-step-v1"||id==="observed-field-dialogue-v1")expect(entry.blocked).toContain("Pending correctness candidate");
  expect(Object.keys(entry.incumbent.features)).toEqual([...SWITCHABLE_FEATURES]);
  const {incumbent,candidate}=experimentArms(entry);
  expect(SWITCHABLE_FEATURES.filter(key=>incumbent.features[key]!==candidate.features[key])).toEqual([id]);
  expect(incumbent.features[id]).toBe(false);expect(candidate.features[id]).toBe(true);
  expect(incumbent.features["semantic-navigation-v2"]).toBe(true);
 }
});

it("delivers both refusals through pinned pi to the next decision and records them with zero native actions",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-navigation-delivery-")),log=RunLog.create(root,"navigation-delivery-proof");
 const stateSource={read:()=>Promise.resolve(field)},recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:new StateMilestones(stateSource),gameState:stateSource});
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"semantic-navigation-v2":true,"navigation-tool-use-guard-v1":true,"semantic-current-map-feedback-v1":true};
 const s=server(field),press=pressTool("http://game",{beforePress:(id,buttons,timing,before)=>{recorder.buttonPress(id,buttons,timing,before);},afterPress:()=>recorder.afterPress()},s.fetchFn,clock,toolSwitches(features));
 const tools=playGameTools([observeTool("http://game",s.fetchFn),press],features,stateSource,recorder);
 await recorder.start({...RUN_START_META,model:{...RUN_START_META.model,id:"fixture-navigation-delivery"},harness_features:playHarnessFeatures(features,null).filter(id=>SWITCHABLE_FEATURES.some(s=>s===id)),tools:tools.map(t=>t.name)});
 const governor=new Governor({limits:{maxTurns:3,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const model:Model<"openai-completions">={id:"fixture",name:"fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text","image"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:10000,maxTokens:100};
 let decisions=0;
 const streamFn:StreamFn=(_model,context)=>{
  decisions++;
  const messages=context.messages.filter(m=>m.role==="toolResult");
  if(decisions===2)expect(messages.flatMap(m=>m.content.filter(c=>c.type==="text").map(c=>c.text)).join("\n")).toContain('"submitted":[]');
  if(decisions===3)expect(messages.flatMap(m=>m.content.filter(c=>c.type==="text").map(c=>c.text)).join("\n")).toContain("Current map: ROUTE101 (map 0/16). Position: (10,7). No input was sent.");
  const message=decisions===1?assistant({toolCalls:[toolCall("guard","press",{buttons:["UP","UP"]})],stopReason:"toolUse"}):decisions===2?assistant({toolCalls:[toolCall("stale","navigate_to_target",{map_id:[0,9],target:{kind:"connection",direction:"NORTH"}})],stopReason:"toolUse"}):assistant({text:"fixture complete"});
  const stream=createAssistantMessageEventStream();stream.push({type:"done",reason:message.stopReason==="toolUse"?"toolUse":"stop",message});return stream;
 };
 const loop=piLoop({systemPrompt:"Synthetic delivery proof; no real model or emulator",tools,base:{model,convertToLlm:m=>m as Message[]},governor,transformContext:recorder.transformContext,emit:recorder.emit,streamFn,signal:new AbortController().signal});
 expect(await play(userText("Fixture"),governor,loop)).toBe("budget");recorder.end("budget");
 const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
 expect(decisions).toBe(3);expect(s.posts).toEqual([]);expect(events.filter(e=>e.type==="button_press"||e.type==="native_action")).toEqual([]);
 expect(events.filter(e=>e.type==="tool_result")).toHaveLength(2);
 expect(readFileSync(log.eventsPath,"utf8")).toContain('Navigation tool-use guard');
 expect(readFileSync(log.eventsPath,"utf8")).toContain('Current map: ROUTE101');
 console.log(`Synthetic delivery receipt: ${log.eventsPath}`);
});


describe("rejected-movement-step-v1 production input boundary",()=>{
 const features=()=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"navigation-tool-use-guard-v1":true,"rejected-movement-step-v1":true});
 it.each(["UP","DOWN","LEFT","RIGHT"] as const)("submits only the first %s from a rejected walking batch",async direction=>{
  const s=server(field),h=hooks();
  const result=await pressTool("http://game",h,s.fetchFn,clock,toolSwitches(features())).execute("model",{buttons:[direction,direction,"LEFT"]});
  const bodies=s.fetchFn.mock.calls.filter(([,init])=>init?.method==="POST").map(([,init])=>JSON.parse(typeof init?.body==="string"?init.body:"null") as unknown);
  expect(bodies).toEqual([{buttons:[direction],hold_frames:10,release_frames:8}]);
  expect(h.beforePress).toHaveBeenCalledWith("model",[direction],{hold_frames:10,release_frames:8},field);
  expect(text(result)).toContain("Movement batch limited to one direction press");
  expect(text(result)).toContain(JSON.stringify({requested:[direction,direction,"LEFT"],submitted:[direction],dropped:[direction,"LEFT"]}));
  expect(text(result)).not.toContain("no input was sent");
 });
 it("OFF is identical to the original rejection, and does not change checked navigation",async()=>{
  const run=async(enabled:boolean|undefined)=>{
   const s=server(field),h=hooks();const f={...features(),"rejected-movement-step-v1":enabled??false};
   const result=await pressTool("http://game",h,s.fetchFn,clock,toolSwitches(f)).execute("model",{buttons:["UP","UP"]});
   return {result,posts:s.posts,hooks:h.beforePress.mock.calls};
  };
  expect(await run(false)).toEqual(await run(undefined));
  const s=server(field),h=hooks();await pressTool("http://game",h,s.fetchFn,clock,toolSwitches(features())).executeChecked("internal",{buttons:["UP","UP"]},()=>undefined);
  expect(h.beforePress.mock.calls[0]?.[1]).toEqual(["UP","UP"]);
 });
 it("leaves mixed interaction batches and a disabled guard unchanged",async()=>{
  for(const guard of [true,false]){
   const s=server(field),h=hooks();
   await pressTool("http://game",h,s.fetchFn,clock,toolSwitches({...features(),"navigation-tool-use-guard-v1":guard})).execute("model",{buttons:["UP","A"]});
   expect(h.beforePress.mock.calls[0]?.[1]).toEqual(["UP","A"]);
  }
 });
});

it("delivers the limited movement receipt to the next pinned-pi decision and records only the submitted button",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-movement-step-delivery-")),log=RunLog.create(root,"movement-step-delivery-proof");
 const stateSource={read:()=>Promise.resolve(field)},recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:new StateMilestones(stateSource),gameState:stateSource});
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"navigation-tool-use-guard-v1":true,"rejected-movement-step-v1":true};
 const s=server(field),press=pressTool("http://game",{beforePress:(id,buttons,timing,before)=>{recorder.buttonPress(id,buttons,timing,before);},afterPress:()=>recorder.afterPress()},s.fetchFn,clock,toolSwitches(features));
 await recorder.start({...RUN_START_META,harness_features:playHarnessFeatures(features,null).filter(id=>SWITCHABLE_FEATURES.some(key=>key===id)),tools:["press"]});
 const governor=new Governor({limits:{maxTurns:2,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const model:Model<"openai-completions">={id:"fixture",name:"fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text","image"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:10000,maxTokens:100};
 let decisions=0;
 const streamFn:StreamFn=(_model,context)=>{
  decisions++;
  if(decisions===2){const delivered=context.messages.filter(m=>m.role==="toolResult").flatMap(m=>m.content.filter(c=>c.type==="text").map(c=>c.text)).join("\n");expect(delivered).toContain('"submitted":["UP"]');expect(delivered).toContain('"dropped":["UP","UP"]');expect(delivered).not.toContain("no input was sent");}
  const message=decisions===1?assistant({toolCalls:[toolCall("step","press",{buttons:["UP","UP","UP"]})],stopReason:"toolUse"}):assistant({text:"fixture complete"});
  const stream=createAssistantMessageEventStream();stream.push({type:"done",reason:message.stopReason==="toolUse"?"toolUse":"stop",message});return stream;
 };
 const loop=piLoop({systemPrompt:"Synthetic input and delivery proof",tools:[press],base:{model,convertToLlm:m=>m as Message[]},governor,transformContext:recorder.transformContext,emit:recorder.emit,streamFn,signal:new AbortController().signal});
 expect(await play(userText("Fixture"),governor,loop)).toBe("budget");recorder.end("budget");
 const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
 expect(decisions).toBe(2);expect(s.posts).toEqual(["http://game/action"]);
 const presses=events.filter(e=>e.type==="button_press");expect(presses).toHaveLength(1);expect(presses[0]?.buttons).toEqual(["UP"]);
 expect(events.find(e=>e.type==="run_start")?.harness_features).toContain("rejected-movement-step-v1");
});

it("limited movement does not use automatic running and is inactive without the original guard",async()=>{
 const base={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"automatic-running-v1":true,"navigation-tool-use-guard-v1":true,"rejected-movement-step-v1":true};
 const s=server(field),h=hooks();await pressTool("http://game",h,s.fetchFn,clock,toolSwitches(base)).execute("step",{buttons:["UP","UP"],walking:true});
 expect(s.posts).toEqual(["http://game/action"]);expect(h.beforePress.mock.calls[0]?.[1]).toEqual(["UP"]);expect(h.beforePress.mock.calls[0]?.[4]).toEqual({automatic_running:false});
 const t=server(field),j=hooks();await pressTool("http://game",j,t.fetchFn,clock,toolSwitches({...base,"automatic-running-v1":false,"navigation-tool-use-guard-v1":false})).execute("ordinary",{buttons:["UP","UP"]});
 expect(j.beforePress.mock.calls[0]?.[1]).toEqual(["UP","UP"]);
});
