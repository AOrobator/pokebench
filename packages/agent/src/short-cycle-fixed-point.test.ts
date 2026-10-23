import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
// short-cycle-fixed-point-v1 (the operator 2026-10-21 00:08 UTC: "lets do those fixes and put them in the bundle"; widened by
// the coordinator to 2-4 turn cycles on run 97a0). Run 2026-10-20T19-58-04_qwen36-gpu0_ef9f pressed RIGHT,A every turn
// from turn 131 while the clock bounced between its confirmation (NO highlighted) and its adjustment; run
// 2026-10-20T20-26-22_qwen36-gpu1_97a0 from turn 116 walked into PROF. BIRCH'S HOUSE and back out with two
// navigate_to_target calls in turn. duplicate-turn-collapse-v1 acted on neither.
// short-cycle-ef9f.jsonl.gz (turns 125-140) and short-cycle-97a0.jsonl.gz (turns 104-136) are those runs' run_start plus
// every turn_start, assistant, tool_call, button_press, state, tool_result, milestone and dialogue_auto_advance event of
// those turns, made by the test author; tool results drop `frames` and states drop the optional `raw_ram` reference;
// other event types are dropped. Both are schema-valid and are read through parseRun (checkEvent) below.
import {readFileSync} from "node:fs";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {gunzipSync} from "node:zlib";
import {IN_GAME} from "../test-support/events.js";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {decisionContext,parseRun} from "./decision-probe.js";
import {checkEvent,type EventBody,type LoopBreakerBody,type RunEvent} from "./events.js";
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,FEATURES,SWITCHABLE_FEATURES,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
const RAW_PROGRESS_ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
const ALL_ON={...RAW_PROGRESS_ALL_ON,"coherent-battle-observation-v1":false,"progress-aware-cycles-v1":false};
import {SUMMARY_FACT_KEYS} from "./party-facts.js";
import {BREAKER_NOTE,CYCLE_COPIES,CYCLE_STATE_EXCLUDED,FixedPointBreaker,cycleFields,cycleNote,cycleRuns,cycleState,fixedPointNote} from "./fixed-point-breaker.js";
import type {GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";

const ID="short-cycle-fixed-point-v1";
const NONE=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const COLLAPSE:FeatureSet={...NONE,"duplicate-turn-collapse-v1":true,[ID]:true};
const BREAKER:FeatureSet={...NONE,"fixed-point-breaker-v1":true,[ID]:true};
type Body=LoopBreakerBody;

// The two clock interfaces of ef9f, as the readout reports them on the clock screen.
const ui=(phase:string,selected:string|null,value:string)=>({phase,selected,ready:true,controls:"",diagnostic:null,value});
const CLOCK={...IN_GAME,screen:"clock",map_id:[1,1],position:{x:5,y:2},facing:"up"} satisfies GameStateSnapshot;
const ADJUST=(value="10:58 AM"):GameStateSnapshot=>({...CLOCK,active_ui:ui("clock_adjustment",null,value)});
const CONFIRM=(value="10:58 AM"):GameStateSnapshot=>({...CLOCK,active_ui:ui("clock_confirmation","NO",value)});
const YES:GameStateSnapshot={...CLOCK,active_ui:ui("clock_confirmation","YES","10:58 AM")};
const RIGHT_A={buttons:["RIGHT","A"]};
// 97a0's walk: into PROF. BIRCH'S HOUSE through LITTLEROOT TOWN's door, and back out.
const IN={x:14,y:8,map_id:[0,9]},OUT={x:2,y:8,map_id:[1,2]};
const HOUSE:GameStateSnapshot={...IN_GAME,map_id:[1,2],position:{x:2,y:8},facing:"up",field_controls_locked:false};
const TOWN:GameStateSnapshot={...IN_GAME,map_id:[0,9],position:{x:14,y:9},facing:"down",field_controls_locked:false};
const LAB:GameStateSnapshot={...IN_GAME,map_id:[1,4],position:{x:6,y:12},facing:"up",field_controls_locked:false};

function rig(features:FeatureSet){
 const subscribers:((e:RunEvent)=>void)[]=[];const recorded:Body[]=[];
 let seq=0;
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:(b:Body)=>{recorded.push(b);}};
 const wiring=contextTools(features,recorder,m=>Promise.resolve(m));
 const emit=(body:EventBody):RunEvent=>{const e=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T20:06:00.000-04:00",...body});for(const s of subscribers)s(e);return e;};
 const messages:AgentMessage[]=[userText("Play.")];
 const states:GameStateSnapshot[]=[];
 let n=0;
 // One completed turn whose result left `state`; every turn's thinking differs, as in ef9f and 97a0.
 const turn=(args:Record<string,unknown>,state:GameStateSnapshot,name="press",thinking=`Turn ${String(n+1)}: my plan.`):void=>{
  const id=`c${String(++n)}`;
  emit({type:"assistant",turn:n,thinking,text:"",tool_calls:[{id,name,args}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"});
  emit({type:"tool_call",turn:n,id,name,args});
  const s=emit({type:"state",turn:n,...state});
  states.push(state);
  emit({type:"tool_result",turn:n,id,name,is_error:false,duration_ms:1,text:`done. turn ${String(n)}`,frames:[],state_seq:s.seq});
  messages.push({...assistant({thinking,toolCalls:[toolCall(id,name,args)]}),timestamp:n});
  messages.push({role:"toolResult",toolCallId:id,toolName:name,content:[{type:"text",text:`done. turn ${String(n)}`}],isError:false,timestamp:n});
 };
 // One turn with two press calls (RIGHT then A), each leaving its own state; on odd turns the results arrive in reverse order.
 const pair=(states:readonly [GameStateSnapshot,GameStateSnapshot]):void=>{
  n++;
  const ids=[`c${String(n)}a`,`c${String(n)}b`];
  const calls=ids.map((id,k)=>({id,name:"press",args:{buttons:[k===0?"RIGHT":"A"]}}));
  emit({type:"assistant",turn:n,thinking:`Turn ${String(n)}.`,text:"",tool_calls:calls,usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"});
  for(const c of calls)emit({type:"tool_call",turn:n,id:c.id,name:c.name,args:c.args});
  const results=(n%2===1?[1,0]:[0,1]).map(k=>{const s=emit({type:"state",turn:n,...(k===0?states[0]:states[1])});emit({type:"tool_result",turn:n,id:ids[k]??"",name:"press",is_error:false,duration_ms:1,text:`done ${String(k)}`,frames:[],state_seq:s.seq});return k;});
  messages.push({...assistant({thinking:`Turn ${String(n)}.`,toolCalls:calls.map(c=>toolCall(c.id,c.name,c.args))}),timestamp:n});
  for(const k of results.sort())messages.push({role:"toolResult",toolCallId:ids[k]??"",toolName:"press",content:[{type:"text",text:`done ${String(k)}`}],isError:false,timestamp:n});
 };
 // A turn whose call never got a result recorded.
 const unfinished=():void=>{
  const id=`c${String(++n)}`;
  emit({type:"assistant",turn:n,thinking:"x",text:"",tool_calls:[{id,name:"press",args:{buttons:["B"]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"});
  messages.push({...assistant({thinking:"x",toolCalls:[toolCall(id,"press",{buttons:["B"]})]}),timestamp:n});
 };
 const silent=():void=>{
  n++;
  emit({type:"assistant",turn:n,thinking:"Hmm.",text:"",tool_calls:[],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"stop"});
  messages.push({...assistant({thinking:"Hmm."}),timestamp:n});
  messages.push(userText("Keep playing."));
 };
 return {turn,pair,unfinished,silent,messages,states,recorded,wiring,send:()=>wiring.transformContext([...messages])};
}
const texts=(out:readonly AgentMessage[]):string[]=>out.flatMap(m=>m.role==="user"?[typeof m.content==="string"?m.content:"(parts)"]:m.role==="toolResult"?[m.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("")]:[`assistant ${String(m.timestamp)}`]);
const kept=(out:readonly AgentMessage[]):number[]=>out.flatMap(m=>m.role==="assistant"?[m.timestamp]:[]);
// The clock bounce: the same call, results alternating confirmation, adjustment, ...
const bounce=(r:ReturnType<typeof rig>,count:number,first=CONFIRM,second=ADJUST):void=>{for(let i=0;i<count;i++)r.turn(RIGHT_A,i%2===0?first():second());};
// The door walk: two different calls taking turns, each leaving its own state.
const doors=(r:ReturnType<typeof rig>,count:number):void=>{for(let i=0;i<count;i++)if(i%2===0)r.turn({map_id:[0,9],target:{kind:"warp",...IN}},HOUSE,"navigate_to_target");else r.turn({map_id:[1,2],target:{kind:"warp",...OUT}},TOWN,"navigate_to_target");};

describe("the cycle state fingerprint",()=>{
 const state=(s:GameStateSnapshot)=>checkEvent({v:1,run:"r",seq:1,t:"2026-10-20T20:06:00.000-04:00",type:"state",turn:1,...s}) as Extract<RunEvent,{type:"state";started:boolean}>;
 it("qualifies a ready interface on any screen and leaves out only the clock's time",()=>{
  expect(cycleState(state(ADJUST("10:58 AM")))).toBe(cycleState(state(ADJUST("11:00 AM"))));
  expect(cycleState(state(CONFIRM("10:58 AM")))).toBe(cycleState(state(CONFIRM("11:00 AM"))));
  const naming=(value:string)=>({...CLOCK,screen:"naming",active_ui:ui("naming_keyboard","A",value)});
  expect(cycleState(state(naming("MA")))).not.toBe(cycleState(state(naming("MAY"))));
  expect(cycleState(state(IN_GAME))).not.toBe(cycleState(state({...IN_GAME,money:2900})));
  const quantity=(maximum:number)=>({...CLOCK,screen:"pc",active_ui:{...ui("pc_quantity",null,"x1"),details:{kind:"quantity",maximum}}}) as unknown as GameStateSnapshot;
  expect(cycleState(state(quantity(9)))).not.toBe(cycleState(state(quantity(8))));
  const tree=(watered:boolean,minutes:number,stage=2)=>({tree_id:1,berry:3,item_id:135,stage,stop_growth:false,minutes_until_next_stage:minutes,yield_count:0,regrowth_count:0,watered:[watered,false,false,false]});
  const garden=(t:ReturnType<typeof tree>,diagnostics:{owner:string;message:string;raw_hex:string|null}[]=[])=>({...IN_GAME,resources:{bag:[],pc_items:[],storage:{current_box:0,occupied:[]},berry_trees:[t],planted_berries:1,diagnostics,script_pc:1,script_mode:1,script_status:1,selected_tree_id:null,berry_script_owner:null,daycare:[]}}) as unknown as GameStateSnapshot;
  // Watering, the berry, its stage and yield stay in the state; only the growth timer is left out.
  expect(cycleState(state(garden(tree(false,60))))).not.toBe(cycleState(state(garden(tree(true,60)))));
  expect(cycleState(state(garden(tree(false,60))))).not.toBe(cycleState(state(garden(tree(false,60,3)))));
  expect(cycleState(state(garden(tree(false,60))))).toBe(cycleState(state(garden(tree(false,59)))));
  // The party and battle records are whole: PP and experience are progress.
  const moves=(pp:number,exp:number)=>({...IN_GAME,party:[{species:"TORCHIC",level:5,hp:18,max_hp:20,experience:exp,moves:[{move_id:10,name:"SCRATCH",pp,pp_bonus:0}]}]}) as unknown as GameStateSnapshot;
  expect(cycleFields(state(moves(35,100)))).not.toBeNull();
  expect(cycleState(state(moves(35,100)))).not.toBe(cycleState(state(moves(34,100))));
  expect(cycleState(state(moves(35,100)))).not.toBe(cycleState(state(moves(35,120))));
  // Fields that change on their own do not count.
  const base=state(IN_GAME);
  expect(cycleState({...base,seq:99,turn:7,t:"2026-10-20T21:00:00.000-04:00",play_time_s:9999,settle:{frames:12,reason:"fade"},raw_ram:{path:"raw-ram/x.gz",sha256:"0".repeat(64),frame:5,sequence:3}} as typeof base)).toBe(cycleState(base));
  // Any diagnostic anywhere qualifies nothing: party, battle, interface, resources.
  expect(cycleState(state({...IN_GAME,party:[{species:"TORCHIC",level:5,hp:18,max_hp:20,diagnostic:"checksum mismatch"}]}))).toBeNull();
  expect(cycleState({...state({...IN_GAME,in_battle:true,screen:"battle",active_ui:ui("battle_action","FIGHT","")}),battle:{phase:"action",turn:2,outcome:null,battlers:[],diagnostic:"battle struct unreadable"}} as unknown as Parameters<typeof cycleState>[0])).toBeNull();
  expect(cycleState(state({...ADJUST(),active_ui:{...ui("clock_adjustment",null,"x"),diagnostic:"unknown task"}}))).toBeNull();
  // A resource the readout failed to decode qualifies nothing.
  expect(cycleState(state(garden(tree(false,60),[{owner:"bag",message:"pocket pointer out of range",raw_hex:null}])))).toBeNull();
  expect(cycleState(state(ADJUST()))).not.toBeNull();
  expect(cycleState(state(ADJUST()))).not.toBe(cycleState(state(CONFIRM())));
 });
 it("is null where the readout cannot qualify the state, and keeps the field and battle fields",()=>{
  expect(cycleState(state({...ADJUST(),active_ui:{...ui("clock_adjustment",null,"x"),ready:false}}))).toBeNull();
  expect(cycleState(state({...ADJUST(),active_ui:{...ui("clock_adjustment",null,"x"),diagnostic:"unknown task"}}))).toBeNull();
  expect(cycleState(state({...CLOCK,active_ui:null}))).toBeNull();
  expect(cycleState(state({...CLOCK,started:false}))).toBeNull();
  expect(cycleState(state({...IN_GAME,position:null}))).toBeNull();
  expect(cycleState(state(IN_GAME))).not.toBe(cycleState(state({...IN_GAME,position:{x:8,y:9}})));
  expect(cycleState(state({...IN_GAME,in_battle:true}))).toBeNull();
  const battle={...IN_GAME,in_battle:true,screen:"battle",active_ui:ui("battle_action","FIGHT","")};
  expect(cycleState(state(battle))).not.toBeNull();
  expect(cycleState(state(battle))).not.toBe(cycleState(state({...battle,party:[{species:"TORCHIC",level:5,hp:9,max_hp:20}]})));
  // Only the battle fields the fingerprint reads (the full battle readout is long); not schema-checked.
  const fought=(turn:number)=>({...state(battle),battle:{phase:"action",turn,outcome:null,battlers:[{battler:0,species_id:255,hp:18,status1:0}]}}) as unknown as Parameters<typeof cycleState>[0];
  expect(cycleState(fought(2))).not.toBe(cycleState(state(battle)));
  expect(cycleState(fought(2))).not.toBe(cycleState(fought(3)));
  expect(cycleState(fought(2))).toBe(cycleState(fought(2)));
 });
});

describe("cycleRuns",()=>{
 const items=(s:string)=>Array.from(s,c=>c==="."?null:c);
 it("finds 2-, 3- and 4-turn cycles once they have 3 copies",()=>{
  expect(CYCLE_COPIES).toBe(3);
  expect(cycleRuns(items("ABABA"))).toEqual([]);
  expect(cycleRuns(items("ABABAB"))).toEqual([{start:0,end:5,period:2}]);
  expect(cycleRuns(items("xABCABCAB"))).toEqual([]);
  expect(cycleRuns(items("xABCABCABC"))).toEqual([{start:1,end:9,period:3}]);
  expect(cycleRuns(items("ABCDABCDABCD"))).toEqual([{start:0,end:11,period:4}]);
  expect(cycleRuns(items("AABAABAAB"))).toEqual([{start:0,end:8,period:3}]);
 });
 it("counts a cycle by its shortest period, and leaves identical turns and longer cycles to others",()=>{
  expect(cycleRuns(items("ABABABAB"))).toEqual([{start:0,end:7,period:2}]);
  expect(cycleRuns(items("AAAAAAAAAAAA"))).toEqual([]);
  expect(cycleRuns(items("ABCDEABCDEABCDE"))).toEqual([]);
 });
 it("is broken by a different turn or a null one, and finds a new cycle that starts inside an old one",()=>{
  expect(cycleRuns(items("ABAB.BAB"))).toEqual([]);
  expect(cycleRuns(items("ABACABAB"))).toEqual([]);
  expect(cycleRuns(items("ABABABCBCBCB"))).toEqual([{start:0,end:5,period:2},{start:5,end:11,period:2}]);
 });
});

describe("stage 1 with the switch on: a short cycle collapses to its newest copy",()=>{
 it("keeps only the last copy of a 2-turn cycle with the same call once it has come round 3 times, whatever the thinking",async()=>{
  const r=rig(COLLAPSE);
  r.turn({buttons:["DOWN","A"]},ADJUST());
  bounce(r,5);
  expect(await r.send()).toEqual(r.messages);
  bounce(r,1,ADJUST,CONFIRM);
  const out=await r.send();
  expect(kept(out)).toEqual([1,6,7]);
  expect(out[3]).toBe(r.messages[11]);
  expect(r.recorded).toEqual([{stage:1,trigger:"short_cycle",repeats:6,collapsed:4,text:null,period:2}]);
 });
 it("keeps the last copy of a 2-turn cycle of two different calls (97a0's door)",async()=>{
  const r=rig(COLLAPSE);doors(r,7);
  expect(kept(await r.send())).toEqual([6,7]);
  expect(r.recorded).toEqual([{stage:1,trigger:"short_cycle",repeats:7,collapsed:5,text:null,period:2}]);
 });
 it("keeps the last copy of a 3-turn cycle",async()=>{
  const r=rig(COLLAPSE);
  const legs=[[{target:"lab"},LAB],[{target:"house"},HOUSE],[{target:"town"},TOWN]] as const;
  for(let i=0;i<9;i++){const [args,state]=legs[i%3]??legs[0];r.turn(args,state,"navigate_to_target");}
  expect(texts(await r.send())).toEqual(["Play.","assistant 7","done. turn 7","assistant 8","done. turn 8","assistant 9","done. turn 9"]);
  expect(r.recorded).toEqual([{stage:1,trigger:"short_cycle",repeats:9,collapsed:6,text:null,period:3}]);
 });
 it("records the longest of two cycles in one request",async()=>{
  const r=rig(COLLAPSE);
  bounce(r,8);doors(r,6);
  expect(kept(await r.send())).toEqual([7,8,13,14]);
  expect(r.recorded).toEqual([{stage:1,trigger:"short_cycle",repeats:8,collapsed:10,text:null,period:2}]);
 });
 it("records again only when new turns join the cycle",async()=>{
  const r=rig(COLLAPSE);
  bounce(r,6);await r.send();await r.send();
  bounce(r,1);
  expect(kept(await r.send())).toEqual([6,7]);
  expect(r.recorded.map(b=>[b.repeats,b.collapsed])).toEqual([[6,4],[7,5]]);
 });
 it("does not fire before 3 copies, on three distinct states, or on identical turns with different thinking",async()=>{
  const short=rig(COLLAPSE);bounce(short,5);
  expect(await short.send()).toEqual(short.messages);
  const three=rig(COLLAPSE);
  for(let i=0;i<6;i++)three.turn(RIGHT_A,i<2?CONFIRM():i<4?ADJUST():YES);
  expect(await three.send()).toEqual(three.messages);
  const same=rig(COLLAPSE);for(let i=0;i<6;i++)same.turn(RIGHT_A,ADJUST());
  expect(await same.send()).toEqual(same.messages);
  expect([...short.recorded,...three.recorded,...same.recorded]).toEqual([]);
 });
 it("is broken by a real state change, a different call, a reply with no tool call or a state the readout cannot qualify",async()=>{
  const moved=rig(COLLAPSE);
  bounce(moved,3);moved.turn(RIGHT_A,{...ADJUST(),position:{x:5,y:3}});bounce(moved,2);
  expect(await moved.send()).toEqual(moved.messages);
  const party=rig(COLLAPSE);
  bounce(party,3);party.turn(RIGHT_A,{...ADJUST(),party:[]});bounce(party,2);
  expect(await party.send()).toEqual(party.messages);
  const call=rig(COLLAPSE);
  bounce(call,3);call.turn({buttons:["DOWN","A"]},ADJUST());bounce(call,2);
  expect(await call.send()).toEqual(call.messages);
  const unready=rig(COLLAPSE);
  bounce(unready,3);unready.turn(RIGHT_A,{...ADJUST(),active_ui:{...ui("clock_adjustment",null,"10:58 AM"),ready:false}});bounce(unready,2);
  expect(await unready.send()).toEqual(unready.messages);
  const quiet=rig(COLLAPSE);
  bounce(quiet,3);quiet.silent();bounce(quiet,3,ADJUST,CONFIRM);
  expect(kept(await quiet.send())).toEqual([1,2,3,5,6,7]);
  expect([...moved.recorded,...party.recorded,...call.recorded,...unready.recorded,...quiet.recorded.filter(b=>b.trigger==="short_cycle")]).toEqual([]);
 });
 it("ignores the clock's time, as its two minutes a cycle in ef9f",async()=>{
  const r=rig(COLLAPSE);
  for(let i=0;i<6;i++)r.turn(RIGHT_A,i%2===0?CONFIRM(`11:0${String(i)} AM`):ADJUST(`11:0${String(i)} AM`));
  expect(kept(await r.send())).toEqual([5,6]);
 });
 it("leaves today's identical-turn collapse as it was, recorded as fixed_point",async()=>{
  const r=rig(COLLAPSE);
  for(let i=0;i<3;i++)r.turn({buttons:["A"]},IN_GAME,"press","Same.");
  expect(kept(await r.send())).toEqual([3]);
  expect(r.recorded).toEqual([{stage:1,trigger:"fixed_point",repeats:3,collapsed:2,text:null}]);
 });
});

describe("OFF and the switches it acts through",()=>{
 it("OFF sends every cycle turn and records nothing, with the collapse on",async()=>{
  const r=rig({...COLLAPSE,[ID]:false});bounce(r,8);doors(r,8);
  expect(await r.send()).toEqual(r.messages);
  expect(r.recorded).toEqual([]);
 });
 it("OFF is today's output for identical turns too",async()=>{
  const on=rig(COLLAPSE),off=rig({...COLLAPSE,[ID]:false});
  for(const r of [on,off])for(let i=0;i<4;i++)r.turn({buttons:["A"]},IN_GAME,"press","Same.");
  expect(texts(await on.send())).toEqual(texts(await off.send()));
  expect(on.recorded).toEqual(off.recorded);
 });
 it("does nothing alone: no collapse or breaker means no breaker at all",async()=>{
  const r=rig({...NONE,[ID]:true});bounce(r,8);
  expect(r.wiring.breaker).toBeNull();
  expect(await r.send()).toEqual(r.messages);
 });
 it("stage 2 under fixed-point-breaker-v1: the cycle note from one turn past 3 copies",async()=>{
  const r=rig(BREAKER);
  doors(r,6);
  expect((await r.send()).at(-1)).toMatchObject({role:"toolResult"});
  doors(r,1);
  const note=cycleNote(7,2,["navigate_to_target"]);
  expect(note).toBe(`${BREAKER_NOTE} Your last 7 turns repeated the same 2 turns of navigate_to_target calls, and each time round the game came back to the same sequence of screens, positions and highlighted choices.`);
  expect((await r.send()).at(-1)).toMatchObject({role:"user",content:note});
  expect(r.recorded.filter(b=>b.stage===2)).toEqual([{stage:2,trigger:"short_cycle",repeats:7,collapsed:0,text:note,period:2}]);
  const off=rig({...BREAKER,[ID]:false});doors(off,8);
  expect((await off.send()).at(-1)).toMatchObject({role:"toolResult"});
  expect(off.recorded).toEqual([]);
 });
 it("stage 2 counts a long cycle whole, and a 3-turn cycle from 10 turns",async()=>{
  const r=rig(BREAKER);
  bounce(r,41);
  expect((await r.send()).at(-1)).toMatchObject({content:cycleNote(41,2,["press"])});
  const legs=[[{target:"lab"},LAB],[{target:"house"},HOUSE],[{target:"town"},TOWN]] as const;
  const three=rig(BREAKER);
  for(let i=0;i<10;i++){const [args,state]=legs[i%3]??legs[0];three.turn(args,state,"navigate_to_target");}
  expect((await three.send()).at(-1)).toMatchObject({content:cycleNote(10,3,["navigate_to_target"])});
 });
 it("stage 2's note stays true when the clock's time moves (ef9f's bounce with the breaker on)",async()=>{
  const r=rig(BREAKER);
  for(let i=0;i<7;i++)r.turn(RIGHT_A,i%2===0?CONFIRM(`11:0${String(i)} AM`):ADJUST(`11:0${String(i)} AM`));
  const note=cycleNote(7,2,["press"]);
  expect(note).toBe(`${BREAKER_NOTE} Your last 7 turns repeated the same 2 turns of press calls, and each time round the game came back to the same sequence of screens, positions and highlighted choices.`);
  expect(note.slice(BREAKER_NOTE.length)).not.toMatch(/\bstates?\b/);
  expect(note).not.toMatch(/same \d+ screens/);
  expect((await r.send()).at(-1)).toMatchObject({content:note});
  // What the note claims, checked against the states the cycle left: each turn's screen, position and highlighted
  // choice equals the one 2 turns before it, while the clock's time did not repeat.
  const left=r.states.slice(-7);
  const shown=left.map(x=>JSON.stringify([x.screen,x.position,x.active_ui?.selected??null]));
  for(let k=2;k<shown.length;k++)expect(shown[k]).toBe(shown[k-2]);
  expect(new Set(left.map(x=>x.active_ui?.value)).size).toBe(7);
  expect(new Set(left.map(x=>x.screen)).size).toBe(1);
 });
 it("watering a berry tree is progress, not a cycle, and a snapshot with a resource diagnostic never joins one",async()=>{
  const tree=(watered:number)=>({tree_id:1,berry:3,item_id:135,stage:2,stop_growth:false,minutes_until_next_stage:300-watered,yield_count:0,regrowth_count:0,watered:[0,1,2,3].map(k=>k<watered)});
  const at=(watered:number,facing:"up"|"down",diagnostics:{owner:string;message:string;raw_hex:string|null}[]=[])=>({...IN_GAME,facing,resources:{bag:[],pc_items:[],storage:{current_box:0,occupied:[]},berry_trees:[tree(watered)],planted_berries:1,diagnostics,script_pc:1,script_mode:1,script_status:1,selected_tree_id:null,berry_script_owner:null,daycare:[]}}) as unknown as GameStateSnapshot;
  // Each round the tree gets one more watering; the screens, positions and calls repeat exactly.
  const watering=rig(COLLAPSE);
  for(let i=0;i<8;i++)watering.turn(i%2===0?{buttons:["A"]}:{buttons:["B"]},at(Math.floor(i/2),i%2===0?"up":"down"));
  expect(texts(await watering.send()).filter(t=>t.startsWith("assistant"))).toHaveLength(8);
  expect(watering.recorded).toEqual([]);
  const failed=rig(COLLAPSE);
  const bad=[{owner:"bag",message:"pocket pointer out of range",raw_hex:null}];
  for(let i=0;i<8;i++)failed.turn(i%2===0?{buttons:["A"]}:{buttons:["B"]},at(0,i%2===0?"up":"down",bad));
  expect(texts(await failed.send()).filter(t=>t.startsWith("assistant"))).toHaveLength(8);
  expect(failed.recorded).toEqual([]);
  // The same walk with nothing watered and clean reads is a cycle.
  const idle=rig(COLLAPSE);
  for(let i=0;i<6;i++)idle.turn(i%2===0?{buttons:["A"]}:{buttons:["B"]},at(0,i%2===0?"up":"down"));
  expect(kept(await idle.send())).toEqual([5,6]);
 });
 it("taking one item at a time out of the PC is progress, not a cycle",async()=>{
  const r=rig(COLLAPSE);
  // The quantity box shows the same maximum each time, so only the inventory says an item was taken out.
  const pc=(left:number,phase:string,tick=0)=>({...IN_GAME,play_time_s:3723+tick,screen:"pc",active_ui:{...ui(phase,phase==="pc_quantity"?null:"POTION","x1"),details:{kind:"quantity",maximum:9}},resources:{bag:[{slot:0,pocket:"items",item_id:13,quantity:10-left,name:"POTION"}],pc_items:[{slot:0,pocket:null,item_id:13,quantity:left,name:"POTION"}],storage:{current_box:0,occupied:[]},berry_trees:[{tree_id:1,berry:3,item_id:135,stage:5,stop_growth:true,minutes_until_next_stage:720-tick,yield_count:0,regrowth_count:0,watered:[false,false,false,false]}],planted_berries:0,diagnostics:[],script_pc:1000,script_mode:1,script_status:1,selected_tree_id:null,berry_script_owner:null,daycare:[]}}) as unknown as GameStateSnapshot;
  for(let i=0;i<8;i++){const left=9-Math.floor(i/2);r.turn({buttons:["A"]},i%2===0?pc(left,"pc_quantity"):pc(left,"pc_item_list"));}
  expect(texts(await r.send()).filter(t=>t.startsWith("assistant"))).toHaveLength(8);
  expect(r.recorded).toEqual([]);
  // The same screens with nothing taken out are a cycle while only the berry timer and the play clock move.
  const still=rig(COLLAPSE);
  for(let i=0;i<6;i++)still.turn({buttons:["A"]},i%2===0?pc(9,"pc_quantity",i):pc(9,"pc_item_list",i));
  expect(kept(await still.send())).toEqual([5,6]);
 });
 it("a name being typed or money being spent is progress, not a cycle",async()=>{
  const typing=rig(BREAKER);
  for(let i=0;i<8;i++)typing.turn(i%2===0?{buttons:["A"]}:{buttons:["RIGHT"]},{...CLOCK,screen:"naming",active_ui:ui("naming_keyboard",i%2===0?"A":"B","MAY".slice(0,1+Math.floor(i/2)))});
  expect(texts(await typing.send()).filter(t=>t.startsWith("assistant"))).toHaveLength(8);
  const buying=rig(BREAKER);
  for(let i=0;i<8;i++)buying.turn({buttons:["A"]},i%2===0?{...IN_GAME,money:3000-100*i}:{...IN_GAME,money:3000-100*i,active_ui:ui("mart_quantity","1","x1")});
  expect(texts(await buying.send()).filter(t=>t.startsWith("assistant"))).toHaveLength(8);
  expect([...typing.recorded,...buying.recorded]).toEqual([]);
 });
 it("a 4-turn cycle collapses at 12 turns and gets the note at 13",async()=>{
  const r=rig(BREAKER);
  const legs=[[{target:"lab"},LAB],[{target:"house"},HOUSE],[{target:"town"},TOWN],[{target:"door"},{...TOWN,position:{x:5,y:9}}]] as const;
  for(let i=0;i<12;i++){const [args,state]=legs[i%4]??legs[0];r.turn(args,state,"navigate_to_target");}
  expect(kept(await r.send())).toEqual([9,10,11,12]);
  expect(r.recorded).toEqual([{stage:1,trigger:"short_cycle",repeats:12,collapsed:8,text:null,period:4}]);
  r.turn(legs[0][0],legs[0][1],"navigate_to_target");
  expect((await r.send()).at(-1)).toMatchObject({content:cycleNote(13,4,["navigate_to_target"])});
 });
 it("a turn with two calls counts as one turn of the cycle, in call order",async()=>{
  const r=rig(BREAKER);
  for(let i=0;i<7;i++)r.pair(i%2===0?[CONFIRM(),ADJUST()]:[ADJUST(),CONFIRM()]);
  const out=await r.send();
  expect(kept(out)).toEqual([6,7]);
  expect(r.recorded.map(b=>[b.stage,b.trigger,b.repeats])).toEqual([[1,"short_cycle",7],[2,"short_cycle",7]]);
  // Two calls a turn leave four results a cycle; the note claims a repeating sequence, not a count of screens.
  expect(out.at(-1)).toMatchObject({content:cycleNote(7,2,["press"])});
  expect(cycleNote(7,2,["press"])).toContain("came back to the same sequence of screens, positions and highlighted choices.");
 });
 it("a turn whose result never came breaks the cycle for stage 2 as it does for stage 1",async()=>{
  const r=rig(BREAKER);
  doors(r,4);r.unfinished();doors(r,3);
  const out=await r.send();
  expect(out.at(-1)).toMatchObject({role:"toolResult"});
  expect(r.recorded).toEqual([]);
 });
 it("stage 2 names every tool in the cycle, stops when the cycle breaks, and keeps today's fixed-point note",async()=>{
  const r=rig(BREAKER);
  for(let i=0;i<7;i++)if(i%2===0)r.turn(RIGHT_A,CONFIRM());else r.turn({x:5,y:2},ADJUST(),"navigate_to");
  expect((await r.send()).at(-1)).toMatchObject({content:cycleNote(7,2,["navigate_to","press"])});
  r.turn(RIGHT_A,YES);
  expect((await r.send()).at(-1)).toMatchObject({role:"toolResult"});
  const same=rig(BREAKER);
  for(let i=0;i<4;i++)same.turn({buttons:["A"]},IN_GAME,"press","Same.");
  expect((await same.send()).at(-1)).toMatchObject({content:fixedPointNote(4,["press"])});
 });
 it("leaves auto-talk's fixed point alone: a cycle is not a turn that left the state the same",()=>{
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

// Each recorded run's requests as the production wiring builds them before each turn's model call.
// Each fixture is parsed once, through checkEvent like any recorded run (parseRun), so the replay reads schema-valid events.
const parsed=new Map<string,readonly RunEvent[]>();
const fixture=(name:string):readonly RunEvent[]=>{
 const hit=parsed.get(name);if(hit!==undefined)return hit;
 const events=parseRun(gunzipSync(readFileSync(new URL(`./fixtures/${name}`,import.meta.url))).toString("utf8")).events;
 parsed.set(name,events);return events;
};
function recordedRun(name:string){
 const events=():readonly RunEvent[]=>fixture(name);
 const start=()=>{const s=events().find(e=>e.type==="run_start");if(s?.type!=="run_start")throw new Error("no run_start");return s;};
 const features=():FeatureSet=>featuresOf(start().harness_features);
 const ids=(turn:number):string[]=>events().flatMap(e=>e.type==="assistant"&&e.turn===turn?e.tool_calls.map(c=>c.id):[]);
 const replay=async(switches:FeatureSet)=>{
  const subscribers:((e:RunEvent)=>void)[]=[];const records:(Body&{turn:number})[]=[];
  let upcoming=0;
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:(b:Body)=>{records.push({...b,turn:upcoming});}};
  const wiring=contextTools(switches,recorder,m=>Promise.resolve(m));
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
 const turnsIn=(messages:readonly AgentMessage[]):number[]=>messages.flatMap(m=>m.role==="assistant"?[m.timestamp]:[]);
 const thinking=(turn:number):string=>events().flatMap(e=>e.type==="assistant"&&e.turn===turn?[e.thinking]:[]).join("");
 // The probe's inert ports cannot build battle-text-auto-advance-v1's press tool or gym-heal-warning-v1's recorder
 // (an existing probe limit); neither changes a recorded call or state here, so both arms leave them off.
 const probe=async(turn:number,on:boolean)=>{
  const ports={frame:()=>"",rerender:()=>Promise.reject(new Error("no rerender")),thinkingSignature:"reasoning_content"};
  const base={...features(),"battle-text-auto-advance-v1":false,"gym-heal-warning-v1":false};
  const context=await decisionContext({start:start(),events:events()},turn,{...base,[ID]:on},ports,"replayed");
  return new Set(context.messages.flatMap(m=>m.role==="assistant"?m.content.flatMap(p=>p.type==="toolCall"?[p.id]:[]):[]));
 };
 return {events,start,features,ids,replay,turnsIn,thinking,probe};
}

describe("short-cycle-fixed-point-v1 on run ef9f (clock confirmation and adjustment, press RIGHT,A from turn 131)",()=>{
 const run=recordedRun("short-cycle-ef9f.jsonl.gz");
 it("ran with the collapse on, the breaker off and no short-cycle switch, and every bounce's thinking differs",()=>{
  expect(run.features()["duplicate-turn-collapse-v1"]).toBe(true);
  expect(run.features()["fixed-point-breaker-v1"]).toBe(false);
  expect(run.start().harness_features).not.toContain(ID);
  expect(new Set([131,132,133,134,135,136].map(run.thinking)).size).toBe(6);
 });
 it("records nothing with the switch off, as the run did",async()=>{
  const {records,requests}=await run.replay(run.features());
  expect(records).toEqual([]);
  expect(run.turnsIn(requests.get(140)??[])).toEqual([125,126,127,128,129,130,131,132,133,134,135,136,137,138,139]);
 });
 it("first fires on the request for turn 137 (3 copies of the bounce, 131-136), keeping 135 and 136",async()=>{
  const {records,requests}=await run.replay({...run.features(),[ID]:true});
  expect(records[0]).toEqual({stage:1,trigger:"short_cycle",repeats:6,collapsed:4,text:null,period:2,turn:137});
  expect(run.turnsIn(requests.get(136)??[])).toEqual([125,126,127,128,129,130,131,132,133,134,135]);
  expect(run.turnsIn(requests.get(137)??[])).toEqual([125,126,127,128,129,130,135,136]);
  expect(records.map(r=>[r.turn,r.repeats,r.collapsed])).toEqual([[137,6,4],[138,7,5],[139,8,6],[140,9,7]]);
  expect(run.turnsIn(requests.get(140)??[])).toEqual([125,126,127,128,129,130,138,139]);
 });
 it("the decision probe rebuilds the turn 137 request without turns 131-134 with the switch on, and with them off",async()=>{
  const on=await run.probe(137,true),off=await run.probe(137,false);
  for(const t of [131,132,133,134])for(const id of run.ids(t)){expect(on.has(id)).toBe(false);expect(off.has(id)).toBe(true);}
  for(const t of [130,135,136])for(const id of run.ids(t)){expect(on.has(id)).toBe(true);expect(off.has(id)).toBe(true);}
 });
});

describe("short-cycle-fixed-point-v1 on run 97a0 (in and out of PROF. BIRCH'S HOUSE from turn 116)",()=>{
 const run=recordedRun("short-cycle-97a0.jsonl.gz");
 it("ran with the collapse on and the breaker off, and the walk's thinking varies",()=>{
  expect(run.features()["duplicate-turn-collapse-v1"]).toBe(true);
  expect(run.features()["fixed-point-breaker-v1"]).toBe(false);
  expect(run.start().harness_features).not.toContain(ID);
  expect(new Set([116,118,120,122].map(run.thinking)).size).toBe(3);
  expect(new Set([117,119,121].map(run.thinking)).size).toBe(2);
 });
 it("records nothing with the switch off, as the run did",async()=>{
  const {records}=await run.replay(run.features());
  expect(records).toEqual([]);
 });
 it("first fires on the request for turn 122 (3 copies of the in-and-out walk, 116-121), keeping 120 and 121",async()=>{
  const {records,requests}=await run.replay({...run.features(),[ID]:true});
  expect(records[0]).toEqual({stage:1,trigger:"short_cycle",repeats:6,collapsed:4,text:null,period:2,turn:122});
  expect(run.turnsIn(requests.get(122)??[])).toEqual([104,105,106,107,108,109,110,111,112,113,114,115,120,121]);
  // Turn 123 repeated 122's call but stayed in the house, so the 2-turn cycle ended; its newest copy stays.
  expect(run.turnsIn(requests.get(124)??[])).toEqual([104,105,106,107,108,109,110,111,112,113,114,115,121,122,123]);
 });
 it("does not take the 3-turn rotation from turn 120 for a cycle: the NINJA_BOY in the house at turn 120 is gone at turn 123",async()=>{
  const {records,requests}=await run.replay({...run.features(),[ID]:true});
  const legs=[120,121,122].map(t=>run.events().flatMap(e=>e.type==="assistant"&&e.turn===t?e.tool_calls.map(c=>JSON.stringify(c.args)):[]).join());
  for(let t=123;t<=132;t++)expect(run.events().flatMap(e=>e.type==="assistant"&&e.turn===t?e.tool_calls.map(c=>JSON.stringify(c.args)):[]).join(),String(t)).toBe(legs[(t-120)%3]);
  // The calls rotate, but the house the first leg walks into is not the same house each time round.
  const left=(turn:number)=>{const r=run.events().find(e=>e.type==="tool_result"&&e.turn===turn);const s=r?.type==="tool_result"?run.events().find(e=>e.seq===r.state_seq):undefined;if(s?.type!=="state"||!("started"in s))throw new Error(`no state for ${String(turn)}`);return s;};
  const differ=(a:number,b:number)=>{const x=cycleFields(left(a))??{},y=cycleFields(left(b))??{};return Object.keys(x).filter(k=>JSON.stringify(x[k])!==JSON.stringify(y[k]));};
  expect(differ(120,123).sort()).toEqual(["interaction_object_slots","interaction_targets","local_map","map_grid","navigation_grid","world_context"]);
  const objects=(turn:number)=>{const s=left(turn);return (s.world_context?.objects??[]).map(o=>`${o.sprite_kind??"?"} (${String(o.x)},${String(o.y)})`);};
  expect(objects(120)).toEqual(["WOMAN_4 (8,7)","NINJA_BOY (9,5)"]);
  expect(objects(123)).toEqual(["WOMAN_4 (8,7)"]);
  expect(differ(121,124)).toEqual([]);
  expect(differ(122,125)).toEqual([]);
  expect(records.some(r=>"period"in r&&r.period===3)).toBe(false);
  expect(records.map(r=>[r.turn,r.repeats,r.collapsed,"period"in r?r.period:null])).toEqual([[122,6,4,2],[123,7,5,2]]);
  expect(run.turnsIn(requests.get(136)??[])).toEqual([104,105,106,107,108,109,110,111,112,113,114,115,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135]);
 });
 it("the decision probe rebuilds the turn 122 request without turns 116-119 with the switch on",async()=>{
  const on=await run.probe(122,true),off=await run.probe(122,false);
  for(const t of [116,117,118,119])for(const id of run.ids(t)){expect(on.has(id)).toBe(false);expect(off.has(id)).toBe(true);}
  for(const t of [115,120,121])for(const id of run.ids(t))expect(on.has(id)).toBe(true);
 });
});

describe("the cycle state is the whole recorded state minus a documented list",()=>{
 // Every path of a real recorded state is either in the fingerprint or on CYCLE_STATE_EXCLUDED, so a field the
 // readout adds later is fingerprinted unless someone lists it.
 const paths=(value:unknown,prefix:string,out:Set<string>):Set<string>=>{
  if(Array.isArray(value)){for(const v of value)paths(v,`${prefix}[]`,out);if(value.length===0)out.add(prefix);return out;}
  if(value!==null&&typeof value==="object"){const entries=Object.entries(value);for(const [k,v] of entries)paths(v,prefix===""?k:`${prefix}.${k}`,out);if(entries.length===0)out.add(prefix);return out;}
  out.add(prefix);return out;
 };
 // An exclusion applies to its path, and only in its phases where it names them.
 const excluded=(path:string,state:{active_ui?:{phase:string}|null}):boolean=>CYCLE_STATE_EXCLUDED.some(x=>(path===x.path||path.startsWith(`${x.path}.`)||path.startsWith(`${x.path}[]`))&&(x.phases===undefined||x.phases.includes(state.active_ui?.phase??"")));
 const recordedState=(name:string,turn:number)=>{
  const events=fixture(name);
  const result=events.find(e=>e.type==="tool_result"&&e.turn===turn);
  const s=result?.type==="tool_result"?events.find(e=>e.seq===result.state_seq):undefined;
  if(s?.type!=="state"||!("started"in s))throw new Error("no state");
  return s;
 };
 // The same recorded field state with a naming keyboard open: a non-clock interface whose value counts.
 const naming=()=>({...recordedState("short-cycle-97a0.jsonl.gz",121),screen:"naming",active_ui:ui("naming_keyboard","A","MAY")}) as Parameters<typeof cycleFields>[0];
 const cases:readonly [string,()=>Parameters<typeof cycleFields>[0]][]=[
  ["ef9f turn 133 (clock confirmation)",()=>recordedState("short-cycle-ef9f.jsonl.gz",133)],
  ["97a0 turn 120 (in PROF. BIRCH'S HOUSE)",()=>recordedState("short-cycle-97a0.jsonl.gz",120)],
  ["97a0 turn 121 (LITTLEROOT TOWN)",()=>recordedState("short-cycle-97a0.jsonl.gz",121)],
  ["97a0 turn 121 with a naming keyboard open",naming],
 ];
 for(const [label,make] of cases){
  it(`covers every key of the recorded state at ${label}`,()=>{
   const s=make();
   const fields=cycleFields(s);
   if(fields===null)throw new Error("the recorded state does not qualify");
   const kept=paths(fields,"",new Set());
   const all=paths(s,"",new Set());
   expect([...all].filter(path=>!kept.has(path)&&!excluded(path,s))).toEqual([]);
   expect([...all].filter(path=>excluded(path,s)&&kept.has(path))).toEqual([]);
   expect(all.size).toBeGreaterThan(100);
  });
 }
 it("keeps a non-clock interface's value and leaves out only the clock's",()=>{
  expect(cycleFields(naming())?.active_ui).toMatchObject({phase:"naming_keyboard",value:"MAY"});
  const clock=recordedState("short-cycle-ef9f.jsonl.gz",133);
  expect(clock.active_ui?.value).toBe("11:02 AM");
  expect(cycleFields(clock)?.active_ui).not.toHaveProperty("value");
 });
 // Every key of a recorded state that ends in diagnostic(s), given a failure, makes the state unusable.
 const diagnosticPaths=(value:unknown,at:readonly (string|number)[],out:(string|number)[][]):(string|number)[][]=>{
  if(Array.isArray(value)){value.forEach((v,k)=>{diagnosticPaths(v,[...at,k],out);});return out;}
  if(value!==null&&typeof value==="object")for(const [k,v] of Object.entries(value)){if(k.endsWith("diagnostic")||k.endsWith("diagnostics"))out.push([...at,k]);diagnosticPaths(v,[...at,k],out);}
  return out;
 };
 const fail=(state:unknown,path:readonly (string|number)[])=>{
  const copy=structuredClone(state) as Record<string|number,unknown>;
  let at:Record<string|number,unknown>=copy;
  for(const key of path.slice(0,-1))at=at[key] as Record<string|number,unknown>;
  const last=path.at(-1)??"";
  at[last]=String(last).endsWith("diagnostics")?[{owner:"test",message:"synthetic read failure",raw_hex:null}]:"synthetic read failure";
  return copy as Parameters<typeof cycleFields>[0];
 };
 for(const [label,make] of cases){
  it(`turns every recorded diagnostic key of ${label} into a state the cycle rule never uses`,()=>{
   const s=make();
   const found=diagnosticPaths(s,[],[]);
   expect(found.length).toBeGreaterThan(0);
   for(const path of found)expect(cycleFields(fail(s,path)),path.join(".")).toBeNull();
  });
 }
 it("treats each named diagnostic key as a failed read",()=>{
  const field=recordedState("short-cycle-97a0.jsonl.gz",121);
  const party=field.party.map((p,k)=>k===0?{...p,nickname_diagnostic:"nickname bytes unreadable"}:p);
  expect(field.party.length).toBeGreaterThan(0);
  expect(cycleFields({...field,party})).toBeNull();
  expect(cycleFields({...field,world_context:{...field.world_context,message_diagnostic:"field message owner unqualified"}} as typeof field)).toBeNull();
  const details=(extra:Record<string,unknown>)=>({...field,screen:"daycare",active_ui:{...ui("daycare_menu","CHECK",null as unknown as string),details:extra}}) as unknown as typeof field;
  expect(cycleFields(details({daycare_left_diagnostic:"slot unreadable"}))).toBeNull();
  expect(cycleFields(details({party_pokemon_diagnostics:[{slot:1,message:"checksum"}]}))).toBeNull();
  // The same keys with nothing to report do not.
  expect(cycleFields(details({daycare_left_diagnostic:null,party_pokemon_diagnostics:[]}))).not.toBeNull();
  expect(cycleFields({...field,party:field.party.map(p=>({...p,nickname_diagnostic:null}))})).not.toBeNull();
 });
 it("requires a period on every short_cycle record, and none on the other triggers",()=>{
  const body={v:1,run:"r",seq:1,t:"2026-10-20T22:00:00.000-04:00",turn:5,type:"loop_breaker",stage:1,repeats:6,collapsed:4,text:null};
  expect(()=>checkEvent({...body,trigger:"short_cycle",period:2})).not.toThrow();
  expect(()=>checkEvent({...body,trigger:"short_cycle"})).toThrow();
  expect(()=>checkEvent({...body,trigger:"short_cycle",period:5})).toThrow();
  expect(()=>checkEvent({...body,trigger:"fixed_point"})).not.toThrow();
  expect(()=>checkEvent({...body,trigger:"fixed_point",period:2})).toThrow();
 });
 it("documents why each excluded field is left out",()=>{
  for(const x of CYCLE_STATE_EXCLUDED)expect(x.why.length,x.path).toBeGreaterThan(5);
  expect(CYCLE_STATE_EXCLUDED.map(x=>x.path)).toEqual(["v","run","type","seq","turn","t","raw_ram","settle","play_time_s","active_ui.value","resources.berry_trees[].minutes_until_next_stage",...["party[]","resources.storage.occupied[].pokemon","resources.daycare[].pokemon"].flatMap(owner=>SUMMARY_FACT_KEYS.map(key=>`${owner}.${key}`))]);
 });
});

describe("short-cycle-fixed-point-v1 registry, presets and experiments",()=>{
 it("registers a default-off guard with no dependency, appended last, with an exact OFF",()=>{
  expect(SWITCHABLE_FEATURES.at(-79)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-79)?.id).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"SHORT-CYCLE FIXED POINT"});
  // OFF is exactly the previous behavior: the copy says so, and the production wiring with the switch off builds the
  // same request and records the same events as with the switch absent from the preset.
  expect(featureInfo(ID).description.endsWith(" Off: duplicate-turn-collapse-v1 and fixed-point-breaker-v1 act as before: only identical turns that left the same state, and replies with no tool call, are left out of the request, and only their notes are sent.")).toBe(true);
  expect(featureInfo(ID).description).toContain("duplicate-turn-collapse-v1");
  expect(featureInfo(ID).description).toContain(cycleNote(7,2,["navigate_to_target"]).replace("7 turns","N turns").replace("2 turns of navigate_to_target","P turns of <tool>"));
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-44)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(LEGACY_ALL_ON[ID]).toBe(false);
 });
 it("OFF builds the same requests and records as a preset that never heard of the switch, on both recorded runs",async()=>{
  for(const name of ["short-cycle-ef9f.jsonl.gz","short-cycle-97a0.jsonl.gz"]){
   const run=recordedRun(name);
   const without=normalizeFeatures(Object.fromEntries(Object.entries(run.features()).filter(([id])=>id!==ID)) as Parameters<typeof normalizeFeatures>[0]);
   const off=await run.replay({...run.features(),[ID]:false});
   const absent=await run.replay(without);
   expect(off.records).toEqual(absent.records);
   expect([...off.requests.entries()].map(([t,m])=>[t,run.turnsIn(m)])).toEqual([...absent.requests.entries()].map(([t,m])=>[t,run.turnsIn(m)]));
   for(const breaker of [true,false]){
    const a=await run.replay({...run.features(),[ID]:false,"fixed-point-breaker-v1":breaker});
    const b=await run.replay({...without,"fixed-point-breaker-v1":breaker});
    expect(a.records,`${name} breaker ${String(breaker)}`).toEqual(b.records);
   }
  }
 });
 it("is registered as a pending one-switch experiment and joins only the bundle arm of the fixed experiments",()=>{
  for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
   const fixed=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[]};
   expect(fixed.base.features[ID],name).toBe(false);
   expect(fixed.switches,name).toContain(ID);
   expect(fixed.onInBoth,name).toContain("duplicate-turn-collapse-v1");
  }
 });
});
