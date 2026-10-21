// ping-pong-fixed-point-v1 (the operator 2026-10-21 00:08 UTC: "lets do those fixes and put them in the bundle"). Run
// 2026-10-20T19-58-04_qwen36-gpu0_ef9f called press RIGHT,A every turn from turn 131 while the clock bounced between
// its confirmation (NO highlighted) and its adjustment, and duplicate-turn-collapse-v1 never acted.
// ping-pong-ef9f.jsonl.gz is that run's run_start plus every turn_start, assistant, tool_call, button_press, state,
// tool_result, milestone and dialogue_auto_advance event of turns 125-140, made by the test author; tool results drop
// `frames`, states drop `raw_ram` and `resources.berry_trees`; other event types are dropped.
import {readFileSync} from "node:fs";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {recorded} from "../test-support/battle-facts.js";
import {IN_GAME} from "../test-support/events.js";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {decisionContext} from "./decision-probe.js";
import {checkEvent,type EventBody,type RunEvent} from "./events.js";
import {parseExperiment,experimentArms} from "./experiments.js";
import {ALL_ON,FEATURES,SWITCHABLE_FEATURES,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {BREAKER_NOTE,FixedPointBreaker,fixedPointNote,pingPongNote,pingPongState} from "./fixed-point-breaker.js";
import type {GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";

const ID="ping-pong-fixed-point-v1";
const NONE=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const COLLAPSE:FeatureSet={...NONE,"duplicate-turn-collapse-v1":true,[ID]:true};
const BREAKER:FeatureSet={...NONE,"fixed-point-breaker-v1":true,[ID]:true};
type Breaker=Extract<RunEvent,{type:"loop_breaker"}>;
type Body=Omit<Breaker,"v"|"run"|"seq"|"t"|"turn"|"type">;

// The two clock interfaces of ef9f, as the readout reports them on the clock screen.
const ui=(phase:string,selected:string|null,value:string)=>({phase,selected,ready:true,controls:"",diagnostic:null,value});
const CLOCK={...IN_GAME,screen:"clock",map_id:[1,1],position:{x:5,y:2},facing:"up"} satisfies GameStateSnapshot;
const ADJUST=(value="10:58 AM"):GameStateSnapshot=>({...CLOCK,active_ui:ui("clock_adjustment",null,value)});
const CONFIRM=(value="10:58 AM"):GameStateSnapshot=>({...CLOCK,active_ui:ui("clock_confirmation","NO",value)});
const RIGHT_A={buttons:["RIGHT","A"]};

function rig(features:FeatureSet){
 const subscribers:((e:RunEvent)=>void)[]=[];const recorded:Body[]=[];
 let seq=0;
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:(b:Body)=>{recorded.push(b);}};
 const wiring=contextTools(features,recorder,m=>Promise.resolve(m));
 const emit=(body:EventBody):RunEvent=>{const e=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T20:06:00.000-04:00",...body});for(const s of subscribers)s(e);return e;};
 const messages:AgentMessage[]=[userText("Play.")];
 let n=0;
 // One completed press turn whose result left `state`; every turn's thinking differs, as ef9f's did.
 const turn=(args:Record<string,unknown>,state:GameStateSnapshot,thinking=`Turn ${String(n+1)}: press RIGHT then A.`):void=>{
  const id=`c${String(++n)}`;
  emit({type:"assistant",turn:n,thinking,text:"",tool_calls:[{id,name:"press",args}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"});
  emit({type:"tool_call",turn:n,id,name:"press",args});
  const s=emit({type:"state",turn:n,...state});
  emit({type:"tool_result",turn:n,id,name:"press",is_error:false,duration_ms:1,text:`pressed. turn ${String(n)}`,frames:[],state_seq:s.seq});
  messages.push({...assistant({thinking,toolCalls:[toolCall(id,"press",args)]}),timestamp:n});
  messages.push({role:"toolResult",toolCallId:id,toolName:"press",content:[{type:"text",text:`pressed. turn ${String(n)}`}],isError:false,timestamp:n});
 };
 return {turn,messages,recorded,wiring,send:()=>wiring.transformContext([...messages])};
}
const texts=(out:readonly AgentMessage[]):string[]=>out.flatMap(m=>m.role==="user"?[typeof m.content==="string"?m.content:"(parts)"]:m.role==="toolResult"?[m.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("")]:[`assistant ${String(m.timestamp)}`]);
const bounce=(r:ReturnType<typeof rig>,count:number,first=CONFIRM,second=ADJUST):void=>{for(let i=0;i<count;i++)r.turn(RIGHT_A,i%2===0?first():second());};

describe("the ping-pong state fingerprint",()=>{
 const state=(s:GameStateSnapshot)=>checkEvent({v:1,run:"r",seq:1,t:"2026-10-20T20:06:00.000-04:00",type:"state",turn:1,...s}) as Extract<RunEvent,{type:"state";started:boolean}>;
 it("qualifies a ready interface on any screen and leaves out the interface's value",()=>{
  expect(pingPongState(state(ADJUST("10:58 AM")))).toBe(pingPongState(state(ADJUST("11:00 AM"))));
  expect(pingPongState(state(ADJUST()))).not.toBeNull();
  expect(pingPongState(state(ADJUST()))).not.toBe(pingPongState(state(CONFIRM())));
 });
 it("is null where the readout cannot qualify the state, and keeps the field and battle fields",()=>{
  expect(pingPongState(state({...ADJUST(),active_ui:{...ui("clock_adjustment",null,"x"),ready:false}}))).toBeNull();
  expect(pingPongState(state({...ADJUST(),active_ui:{...ui("clock_adjustment",null,"x"),diagnostic:"unknown task"}}))).toBeNull();
  expect(pingPongState(state({...CLOCK,active_ui:null}))).toBeNull();
  expect(pingPongState(state({...CLOCK,started:false}))).toBeNull();
  expect(pingPongState(state({...IN_GAME,position:null}))).toBeNull();
  expect(pingPongState(state(IN_GAME))).not.toBe(pingPongState(state({...IN_GAME,position:{x:8,y:9}})));
  expect(pingPongState(state({...IN_GAME,in_battle:true}))).toBeNull();
  const battle={...IN_GAME,in_battle:true,screen:"battle",active_ui:ui("battle_action","FIGHT","")};
  expect(pingPongState(state(battle))).not.toBeNull();
  expect(pingPongState(state(battle))).not.toBe(pingPongState(state({...battle,party:[{species:"TORCHIC",level:5,hp:9,max_hp:20}]})));
 });
});

describe("stage 1 with the switch on: a two-state ping-pong collapses like a fixed point",()=>{
 it("keeps only the newest of 3 same-call turns whose results alternate between two states, whatever the thinking",async()=>{
  const r=rig(COLLAPSE);
  r.turn({buttons:["DOWN","A"]},ADJUST());
  bounce(r,3);
  const out=await r.send();
  expect(texts(out)).toEqual(["Play.","assistant 1","pressed. turn 1","assistant 4","pressed. turn 4"]);
  expect(out[3]).toBe(r.messages[7]);
  expect(r.recorded).toEqual([{stage:1,trigger:"ping_pong",repeats:3,collapsed:2,text:null}]);
 });
 it("counts the whole alternating run, and records again only when new turns join it",async()=>{
  const r=rig(COLLAPSE);
  bounce(r,3);await r.send();await r.send();
  bounce(r,2,ADJUST,CONFIRM);
  const out=await r.send();
  expect(texts(out)).toEqual(["Play.","assistant 5","pressed. turn 5"]);
  expect(r.recorded).toEqual([{stage:1,trigger:"ping_pong",repeats:3,collapsed:2,text:null},{stage:1,trigger:"ping_pong",repeats:5,collapsed:4,text:null}]);
 });
 it("does not fire on two alternating turns",async()=>{
  const r=rig(COLLAPSE);bounce(r,2);
  expect(await r.send()).toEqual(r.messages);
  expect(r.recorded).toEqual([]);
 });
 it("does not fire on three distinct states",async()=>{
  const r=rig(COLLAPSE);
  r.turn(RIGHT_A,CONFIRM());r.turn(RIGHT_A,ADJUST());r.turn(RIGHT_A,{...CLOCK,active_ui:ui("clock_confirmation","YES","10:58 AM")});
  expect(await r.send()).toEqual(r.messages);
  expect(r.recorded).toEqual([]);
 });
 it("is broken by a real state change, a different call or a state the readout cannot qualify",async()=>{
  const moved=rig(COLLAPSE);
  moved.turn(RIGHT_A,CONFIRM());moved.turn(RIGHT_A,ADJUST());moved.turn(RIGHT_A,{...CONFIRM(),position:{x:5,y:3}});moved.turn(RIGHT_A,{...ADJUST(),position:{x:5,y:3}});
  expect(await moved.send()).toEqual(moved.messages);
  const story=rig(COLLAPSE);
  story.turn(RIGHT_A,CONFIRM());story.turn(RIGHT_A,ADJUST());story.turn(RIGHT_A,{...CONFIRM(),party:[]});
  expect(await story.send()).toEqual(story.messages);
  const call=rig(COLLAPSE);
  call.turn(RIGHT_A,CONFIRM());call.turn({buttons:["DOWN","A"]},ADJUST());call.turn(RIGHT_A,CONFIRM());
  expect(await call.send()).toEqual(call.messages);
  const unready=rig(COLLAPSE);
  unready.turn(RIGHT_A,CONFIRM());unready.turn(RIGHT_A,{...ADJUST(),active_ui:{...ui("clock_adjustment",null,"10:58 AM"),ready:false}});unready.turn(RIGHT_A,CONFIRM());
  expect(await unready.send()).toEqual(unready.messages);
  expect([...moved.recorded,...story.recorded,...call.recorded,...unready.recorded]).toEqual([]);
 });
 it("ignores the interface's value, as the clock's two minutes a cycle in ef9f",async()=>{
  const r=rig(COLLAPSE);
  r.turn(RIGHT_A,CONFIRM("11:00 AM"));r.turn(RIGHT_A,ADJUST("11:00 AM"));r.turn(RIGHT_A,CONFIRM("11:02 AM"));
  expect(texts(await r.send())).toEqual(["Play.","assistant 3","pressed. turn 3"]);
 });
 it("finds a run that starts inside an earlier one's last turns",async()=>{
  const r=rig(COLLAPSE);
  const third={...CLOCK,active_ui:ui("clock_confirmation","YES","10:58 AM")};
  r.turn(RIGHT_A,CONFIRM());r.turn(RIGHT_A,ADJUST());r.turn(RIGHT_A,third);r.turn(RIGHT_A,ADJUST());
  expect(texts(await r.send())).toEqual(["Play.","assistant 1","pressed. turn 1","assistant 4","pressed. turn 4"]);
  expect(r.recorded).toEqual([{stage:1,trigger:"ping_pong",repeats:3,collapsed:2,text:null}]);
 });
 it("leaves today's identical-turn collapse as it was, recorded as fixed_point",async()=>{
  const r=rig(COLLAPSE);
  for(let i=0;i<3;i++)r.turn({buttons:["A"]},IN_GAME,"Same.");
  expect(texts(await r.send())).toEqual(["Play.","assistant 3","pressed. turn 3"]);
  expect(r.recorded).toEqual([{stage:1,trigger:"fixed_point",repeats:3,collapsed:2,text:null}]);
 });
});

describe("OFF and the switches it acts through",()=>{
 it("OFF sends every ping-pong turn and records nothing, with the collapse on",async()=>{
  const r=rig({...COLLAPSE,[ID]:false});bounce(r,6);
  expect(await r.send()).toEqual(r.messages);
  expect(r.recorded).toEqual([]);
 });
 it("OFF is today's output for identical turns too",async()=>{
  const on=rig(COLLAPSE),off=rig({...COLLAPSE,[ID]:false});
  for(const r of [on,off])for(let i=0;i<4;i++)r.turn({buttons:["A"]},IN_GAME,"Same.");
  expect(texts(await on.send())).toEqual(texts(await off.send()));
  expect(on.recorded).toEqual(off.recorded);
 });
 it("does nothing alone: no collapse or breaker means no breaker at all",async()=>{
  const r=rig({...NONE,[ID]:true});bounce(r,6);
  expect(r.wiring.breaker).toBeNull();
  expect(await r.send()).toEqual(r.messages);
 });
 it("stage 2 under fixed-point-breaker-v1: the ping-pong note from the 4th alternating turn on",async()=>{
  const r=rig(BREAKER);
  bounce(r,3);
  expect((await r.send()).at(-1)).toMatchObject({role:"toolResult"});
  bounce(r,1,ADJUST,CONFIRM);
  const note=pingPongNote(4,["press"]);
  expect(note).toBe(`${BREAKER_NOTE} Your last 4 turns made the same press call and the game state went back and forth between the same two states after them.`);
  expect((await r.send()).at(-1)).toMatchObject({role:"user",content:note});
  expect(r.recorded.filter(b=>b.stage===2)).toEqual([{stage:2,trigger:"ping_pong",repeats:4,collapsed:0,text:note}]);
  const off=rig({...BREAKER,[ID]:false});bounce(off,6);
  expect((await off.send()).at(-1)).toMatchObject({role:"toolResult"});
  expect(off.recorded).toEqual([]);
 });
 it("stage 2 restarts the count after a third state, and keeps today's fixed-point note",async()=>{
  const r=rig(BREAKER);
  bounce(r,3);r.turn(RIGHT_A,{...CLOCK,active_ui:ui("clock_confirmation","YES","10:58 AM")});r.turn(RIGHT_A,ADJUST());
  expect(r.recorded.filter(b=>b.stage===2)).toEqual([]);
  await r.send();
  expect(r.recorded.filter(b=>b.stage===2)).toEqual([]);
  const same=rig(BREAKER);
  for(let i=0;i<4;i++)same.turn({buttons:["A"]},IN_GAME,"Same.");
  expect((await same.send()).at(-1)).toMatchObject({content:fixedPointNote(4,["press"])});
 });
 it("leaves auto-talk's fixed point alone: a ping-pong is not a turn that left the state the same",()=>{
  const breaker=new FixedPointBreaker(BREAKER,{recordLoopBreaker:()=>undefined});
  let seq=0;
  for(let n=1;n<=8;n++){
   const id=`c${String(n)}`;
   breaker.observe(checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T20:06:00.000-04:00",type:"assistant",turn:n,thinking:"",text:"",tool_calls:[{id,name:"press",args:RIGHT_A}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"}));
   const s=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T20:06:00.000-04:00",type:"state",turn:n,...(n%2===0?ADJUST():CONFIRM())});
   breaker.observe(s);
   breaker.observe(checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T20:06:00.000-04:00",type:"tool_result",turn:n,id,name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[],state_seq:s.seq}));
  }
  expect(breaker.fixedPoint().turns).toBe(1);
 });
});

describe("ping-pong-fixed-point-v1 on run ef9f (clock confirmation and adjustment, press RIGHT,A from turn 131)",()=>{
 const EF9F="ping-pong-ef9f.jsonl.gz";
 const events=():readonly RunEvent[]=>recorded(EF9F);
 const start=()=>{const s=events().find(e=>e.type==="run_start");if(s?.type!=="run_start")throw new Error("no run_start");return s;};
 const RUN=():FeatureSet=>featuresOf(start().harness_features);
 const ids=(turn:number):string[]=>events().flatMap(e=>e.type==="assistant"&&e.turn===turn?e.tool_calls.map(c=>c.id):[]);
 // Each request as the wiring builds it before the turn's model call, with every loop_breaker body it recorded.
 const replay=async(features:FeatureSet)=>{
  const subscribers:((e:RunEvent)=>void)[]=[];const records:(Body&{turn:number})[]=[];
  let upcoming=0;
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:(b:Body)=>{records.push({...b,turn:upcoming});}};
  const wiring=contextTools(features,recorder,m=>Promise.resolve(m));
  const messages:AgentMessage[]=[userText("Play.")];
  const requests=new Map<number,AgentMessage[]>();
  for(const e of events()){
   if(e.type==="run_start")continue;
   if(e.type==="turn_start"){upcoming=e.turn;requests.set(e.turn,await wiring.transformContext([...messages]));}
   for(const s of subscribers)s(e);
   if(e.type==="assistant")messages.push({...assistant({...(e.thinking===""?{}:{thinking:e.thinking}),...(e.text===""?{}:{text:e.text}),toolCalls:e.tool_calls.map(c=>toolCall(c.id,c.name,c.args as Record<string,unknown>))}),timestamp:e.turn});
   if(e.type==="tool_result")messages.push({role:"toolResult",toolCallId:e.id,toolName:e.name,content:[{type:"text",text:e.text}],isError:e.is_error,timestamp:e.turn});
  }
  return {records,requests};
 };
 const called=(messages:readonly AgentMessage[]):Set<string>=>new Set(messages.flatMap(m=>m.role==="assistant"?m.content.flatMap(p=>p.type==="toolCall"?[p.id]:[]):[]));
 it("ran with the collapse on, the breaker off and no ping-pong switch",()=>{
  expect(RUN()["duplicate-turn-collapse-v1"]).toBe(true);
  expect(RUN()["fixed-point-breaker-v1"]).toBe(false);
  expect(start().harness_features).not.toContain(ID);
 });
 it("records nothing with the switch off, as the run did",async()=>{
  const {records,requests}=await replay(RUN());
  expect(records).toEqual([]);
  expect([...called(requests.get(140)??[])]).toEqual(events().flatMap(e=>e.type==="assistant"&&e.turn<140?e.tool_calls.map(c=>c.id):[]));
 });
 it("first fires on the request for turn 134, leaving out turns 131 and 132 (press RIGHT,A to the confirmation, then back)",async()=>{
  const {records,requests}=await replay({...RUN(),[ID]:true});
  expect(records[0]).toEqual({stage:1,trigger:"ping_pong",repeats:3,collapsed:2,text:null,turn:134});
  const at134=called(requests.get(134)??[]);
  for(const t of [125,126,127,128,129,130,133])for(const id of ids(t))expect(at134.has(id)).toBe(true);
  for(const t of [131,132])for(const id of ids(t))expect(at134.has(id)).toBe(false);
  expect(records.filter(r=>r.turn<134)).toEqual([]);
  expect(records.map(r=>[r.turn,r.repeats,r.collapsed])).toEqual([[134,3,2],[135,4,3],[136,5,4],[137,6,5],[138,7,6],[139,8,7],[140,9,8]]);
  expect([...called(requests.get(140)??[])]).toEqual([...ids(125),...ids(126),...ids(127),...ids(128),...ids(129),...ids(130),...ids(139)]);
 });
 it("the decision probe rebuilds the turn 134 request without turns 131 and 132 with the switch on, and with them off",async()=>{
  const ports={frame:()=>"",rerender:()=>Promise.reject(new Error("no rerender")),thinkingSignature:"reasoning_content"};
  const run={start:start(),events:events()};
  // The probe's inert ports cannot build battle-text-auto-advance-v1's press tool or gym-heal-warning-v1's recorder
  // (an existing probe limit); neither changes a recorded call or state here, so both arms leave them off.
  const base={...RUN(),"battle-text-auto-advance-v1":false,"gym-heal-warning-v1":false};
  const on=await decisionContext(run,134,{...base,[ID]:true},ports,"replayed");
  const off=await decisionContext(run,134,base,ports,"replayed");
  const onIds=new Set(on.messages.flatMap(m=>m.role==="assistant"?m.content.flatMap(p=>p.type==="toolCall"?[p.id]:[]):[]));
  const offIds=new Set(off.messages.flatMap(m=>m.role==="assistant"?m.content.flatMap(p=>p.type==="toolCall"?[p.id]:[]):[]));
  for(const id of [...ids(131),...ids(132)]){expect(onIds.has(id)).toBe(false);expect(offIds.has(id)).toBe(true);}
  for(const id of ids(133)){expect(onIds.has(id)).toBe(true);expect(offIds.has(id)).toBe(true);}
  expect(off.messages.length-on.messages.length).toBe(4);
 });
});

describe("ping-pong-fixed-point-v1 registry, presets and experiments",()=>{
 it("registers a default-off guard with no dependency, appended last, with an exact OFF",()=>{
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-1)?.id).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"PING-PONG FIXED POINT"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("duplicate-turn-collapse-v1");
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(LEGACY_ALL_ON[ID]).toBe(false);
 });
 it("is registered as a pending one-switch experiment and joins only the bundle arm of the fixed experiments",()=>{
  const entry=parseExperiment(JSON.parse(readFileSync(new URL(`../../../experiments/${ID}.json`,import.meta.url),"utf8")));
  expect(entry.queuePosition).toBeUndefined();
  const {incumbent,candidate}=experimentArms(entry);
  expect(incumbent.features["duplicate-turn-collapse-v1"]).toBe(true);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof FeatureSet]!==incumbent.features[id as keyof FeatureSet])).toEqual([ID]);
  for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
   const fixed=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[]};
   expect(fixed.base.features[ID],name).toBe(false);
   expect(fixed.switches,name).toContain(ID);
   expect(fixed.onInBoth,name).toContain("duplicate-turn-collapse-v1");
  }
 });
});
