import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {Value} from "typebox/value";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {classifyBattle,levelUpListedPage,levelUpPage,type BattleTextEntry} from "./battle-text-auto-advance.js";
import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {observeTool,pressTool,type Clock} from "./game-tools.js";
import {StateWatcher,parseGameState,type GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
import {BattleWaitSchema,checkEvent,type Button,type RunEvent} from "./events.js";

const ID="levelup-box-v1";
const URL_BASE="http://127.0.0.1";
const BASE:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-auto-advance-v1":true,"battle-text-auto-advance-v1":true};
const ON:FeatureSet={...BASE,[ID]:true};
const OFF:FeatureSet={...BASE,[ID]:false};
const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();

// Bundle run 2026-10-16T04-51-03_qwen36-gpu0_54a7, raw RAM 5073-5130 (T357-T362): the WINGULL faints, TORCHIC
// grows to Lv6 and the level-up stats box shows page 1 (5088-5102) and page 2 (5103-5124), decoded by the
// production reader (read_state, state_json) with the battle text journal run over the same samples.
interface Frame {readonly raw_ram:string;readonly state:unknown}
const RUN=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/levelup-box-54a7.json.gz",import.meta.url))).toString("utf8")) as {frames:Frame[];journal:{entries:BattleTextEntry[]}};
const STATES=RUN.frames.map(f=>parseGameState(f.state));
const at=(raw:number):number=>{const i=RUN.frames.findIndex(f=>f.raw_ram===`${String(raw).padStart(8,"0")}.json.gz`);if(i<0)throw new Error(String(raw));return i;};
const state=(raw:number):GameStateSnapshot=>{const s=STATES[at(raw)];if(s===undefined)throw new Error(String(raw));return s;};
const PAGE1="Level-up stats box, page 1 of 2 (stat increases): MAX. HP +2, ATTACK +2, DEFENSE +1, SP. ATK +1, SP. DEF +1, SPEED +1";
const PAGE2="Level-up stats box, page 2 of 2 (new totals): MAX. HP 21, ATTACK 11, DEFENSE 10, SP. ATK 15, SP. DEF 11, SPEED 10";

type Phase="waiting"|"box"|"busy"|"input"|"field";
const phaseOf=(s:GameStateSnapshot):Phase=>{
 if(!s.in_battle)return "field";
 const b=s.battle,p=b?.text_phase;
 if(p==="message_waiting")return "waiting";
 if(p==="input")return "input";
 return p==="busy"&&b?.levelup_box?.waiting===true?"box":"busy";
};
const identity=(s:GameStateSnapshot)=>JSON.stringify([s.screen,s.battle?.message?.identity,s.battle?.message?.cursor,s.battle?.text_phase,s.battle?.levelup_box?.state??null]);

// Replays the recorded samples as a game server. Any button on a waiting page or box page moves to the next
// different state; the battle wait skips busy samples (the box too, unless the server runs levelup-box-v1).
class Replay{
 i:number;posts:{button:Button;phase:Phase}[]=[];waits:string[]=[];
 constructor(start:number,private readonly levelup:boolean,private readonly bound=5,private readonly states:readonly GameStateSnapshot[]=STATES){this.i=start;}
 get now():GameStateSnapshot{const s=this.states[this.i];if(s===undefined)throw new Error("past the script");return s;}
 private step(){this.i=Math.min(this.i+1,this.states.length-1);}
 private next(){const from=identity(this.now);while(this.i<this.states.length-1&&identity(this.now)===from)this.step();}
 press(button:Button){const phase=phaseOf(this.now);this.posts.push({button,phase});if(phase==="waiting"||phase==="box")this.next();else this.step();}
 private held(p:Phase){return p==="busy"||(p==="box"&&!this.levelup);}
 wait(){
  const start=this.i;
  while(this.held(phaseOf(this.now))&&this.i-start<this.bound&&this.i<this.states.length-1)this.step();
  const p=phaseOf(this.now);
  const reason=this.held(p)?"bound":p==="box"?"levelup_box":p==="waiting"?"message_waiting":p==="input"?"input":"field";
  this.waits.push(reason);
  return {reason,frames:this.i-start,state:this.now};
 }
 messages(after:number){
  const seen=RUN.journal.entries.filter(e=>e.frame<=this.i+1);
  return {frame:this.i+1,first_id:1,last_id:seen.at(-1)?.id??0,errors:0,last_error:null,entries:seen.filter(e=>e.id>after)};
 }
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");for(const b of (JSON.parse(init.body) as {buttons:Button[]}).buttons)this.press(b);body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state_text:`Screen: ${this.now.screen}`,screenshot_base64:png,state:this.now};
  else if(url.endsWith("/pokebench/state")){body=this.now;if(!this.now.in_battle)this.step();}
  else if(url.endsWith("/pokebench/battle/wait"))body=this.wait();
  else if(url.includes("/pokebench/battle/messages?after="))body=this.messages(Number(new URL(url).searchParams.get("after")));
  else throw new Error(`Unexpected request ${url}`);
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
}

function fakeClock():Clock&{t:number}{const c={t:0,now:()=>c.t,sleep:(ms:number)=>{c.t+=ms;return Promise.resolve();}};return c;}
function wire(server:Replay,features:FeatureSet){
 const events:RunEvent[]=[];let seq=0;const clock=fakeClock();
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-10-16T05:23:42.000-04:00",turn:357,...body} as RunEvent;events.push(e);return {seq:e.seq,turn:357};};
 const recorder:AutoAdvanceRecorder={recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:()=>undefined};
 const base=[observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},server.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()})];
 const tools=withDialogueAutoAdvance(base,features,{state:new StateWatcher(URL_BASE,server.fetch),recorder,clock});
 const press=tools.find(t=>t.name==="press") as AgentTool;
 const advance=()=>events.find((e):e is Extract<RunEvent,{type:"dialogue_auto_advance"}>=>e.type==="dialogue_auto_advance");
 return {press,advance};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");

describe("levelup-box-v1 on the recorded T357 level-up (run 54a7)",()=>{
 it("ON: B through fainted, EXP, grew to LV. 6!, then both box pages, listed in order, and on to the field",async()=>{
  const server=new Replay(at(5076),true);const {press,advance}=wire(server,ON);
  const result=await press.execute("t357",{buttons:["A","A"]});
  expect(server.posts.map(p=>`${p.button}:${p.phase}`)).toEqual(["A:input","B:waiting","B:waiting","B:waiting","B:box","B:box"]);
  const event=advance();
  expect(event).toMatchObject({sent:["A"],dropped:["A"],battle_auto_presses:5,stop:"field_free"});
  expect(event?.pages.map(p=>p.text)).toEqual(["Wild WINGULL\nfainted!","TORCHIC gained\n27 EXP. Points!","TORCHIC grew to\nLV. 6!",PAGE1,PAGE2]);
  expect(event?.pages.slice(3)).toEqual([PAGE1,PAGE2].map(text=>({state_seq:expect.any(Number) as number,map:"ROUTE103",map_id:[0,18],position:null,speaker:null,speaker_source:null,text,battle_turn:6})));
  expect(()=>checkEvent(event)).not.toThrow();
  const text=textOf(result);
  expect(text).toContain("Battle text auto-advance: the harness pressed B 5 times to advance battle messages; stopped: the battle ended and field controls are free.");
  expect(text).toContain(`4. turn 357 · ROUTE103 (map 0/18) · battle turn 6: "${PAGE1}"\n5. turn 357 · ROUTE103 (map 0/18) · battle turn 6: "${PAGE2}"`);
 });

 it("OFF: the box is waited out and the advance stops with the battle busy, as the run did",async()=>{
  const server=new Replay(at(5076),false);const {press,advance}=wire(server,OFF);
  const result=await press.execute("t357",{buttons:["A","A"]});
  expect(server.posts.map(p=>`${p.button}:${p.phase}`)).toEqual(["A:input","B:waiting","B:waiting","B:waiting"]);
  expect(server.waits).not.toContain("levelup_box");
  expect(advance()).toMatchObject({battle_auto_presses:3,stop:"battle_busy"});
  expect(advance()?.pages.map(p=>p.text)).toEqual(["Wild WINGULL\nfainted!","TORCHIC gained\n27 EXP. Points!","TORCHIC grew to\nLV. 6!"]);
  expect(phaseOf(server.now)).toBe("box");
  expect(textOf(result)).toContain("stopped: the battle kept running on its own for 3 waits of 600 emulated frames");
 });

 it("ON: page 2 drawing (state 7, never sampled) is waited out on frames and the wait ends on the box",async()=>{
  const p1=state(5102),box=p1.battle?.levelup_box;
  if(p1.battle==null||box==null)throw new Error("box");
  const drawing:GameStateSnapshot={...p1,battle:{...p1.battle,levelup_box:{...box,state:7,page:2,waiting:false,text:"MAX. HP 21, ATTACK 11, DEFENSE 10, SP. ATK 15, SP. DEF 11, SPEED 10"}}};
  const states=[...STATES.slice(0,at(5103)),drawing,...STATES.slice(at(5103))];
  const server=new Replay(at(5076),true,5,states);const {press,advance}=wire(server,ON);
  await press.execute("t357",{buttons:["A","A"]});
  expect(server.waits.filter(w=>w==="levelup_box")).toEqual(["levelup_box"]);
  expect(server.posts.map(p=>`${p.button}:${p.phase}`).slice(-2)).toEqual(["B:box","B:box"]);
  expect(advance()?.pages.map(p=>p.text).slice(3)).toEqual([PAGE1,PAGE2]);
 });

 it("ON with a server wait that never ends on the box (bound 40): the press results land on the box and it is still pressed through",async()=>{
  const server=new Replay(at(5076),false,40);const {advance,press}=wire(server,ON);
  await press.execute("t357",{buttons:["A","A"]});
  // The press after "grew to LV. 6!" lands straight on the box, so every box press comes from a press result.
  expect(advance()?.pages.map(p=>p.text).slice(3,5)).toEqual([PAGE1,PAGE2]);
 });

 it("a server that ends its wait on the box, with the agent's switch OFF: counted as busy, never a loop",async()=>{
  const server=new Replay(at(5076),true);const {press,advance}=wire(server,OFF);
  await press.execute("t357",{buttons:["A","A"]});
  expect(server.waits.slice(-3)).toEqual(["levelup_box","levelup_box","levelup_box"]);
  expect(advance()).toMatchObject({battle_auto_presses:3,stop:"battle_busy"});
 });

 it("a box wait whose captured state shows no readable box (agent switch ON): counted as busy, never a tight loop",async()=>{
  // Claude review round 1: the server saw the box, but the captured state's text read failed (levelup_box null).
  class Unreadable extends Replay{boxWaits=0;override wait(){const w=super.wait();if(w.reason!=="bound")return w;this.boxWaits++;return {...w,reason:"levelup_box"};}}
  const p1=state(5093);if(p1.battle==null)throw new Error("box");
  const blind:GameStateSnapshot={...p1,battle:{...p1.battle,levelup_box:null}};
  const states=[...STATES.slice(0,at(5088)),...Array.from({length:20},()=>blind)];
  const server=new Unreadable(at(5076),true,5,states);const {press,advance}=wire(server,ON);
  await press.execute("t357",{buttons:["A","A"]});
  expect(advance()).toMatchObject({battle_auto_presses:3,stop:"battle_busy"});
  expect(server.boxWaits).toBe(3);
 });

 it("classifies the box as a page to press only with the switch, and lists a page once",()=>{
  expect(classifyBattle(state(5093))).toEqual({kind:"wait"});
  expect(classifyBattle(state(5093),true)).toEqual({kind:"press",levelUp:PAGE1});
  expect(classifyBattle(state(5108),true)).toEqual({kind:"press",levelUp:PAGE2});
  expect(classifyBattle(state(5086),true)).toEqual({kind:"press"});
  expect(classifyBattle(state(5125),true)).toEqual({kind:"wait"});
  const box=state(5093).battle;
  expect(levelUpPage(box)).toBe(PAGE1);
  if(box?.levelup_box==null)throw new Error("box");
  expect(levelUpPage({...box,text_phase:"screen"})).toBeNull();
  expect(levelUpPage({...box,levelup_box:{...box.levelup_box,waiting:false}})).toBeNull();
  expect(levelUpPage({...box,levelup_box:{...box.levelup_box,page:null}})).toBeNull();
  expect(levelUpPage({...box,levelup_box:{...box.levelup_box,text:null,diagnostic:"harness bug: level-up box: x"}})).toBe("Level-up stats box, page 1 of 2 (stat increases): the stats it shows could not be read (harness bug: level-up box: x)");
  expect(levelUpPage({...box,levelup_box:{...box.levelup_box,text:null,diagnostic:null}})).toBe("Level-up stats box, page 1 of 2 (stat increases): the stats it shows could not be read (unknown)");
  expect(levelUpPage(null)).toBeNull();
  const s=state(5093);
  expect(levelUpListedPage("x",{...s,battle:{...box,turn:null}},1)).not.toHaveProperty("battle_turn");
  expect(levelUpListedPage("x",{...s,location_display:"ROUTE 103"},1)).toMatchObject({map_display:"ROUTE 103",battle_turn:6});
 });

 it("parses the recorded box and the levelup_box wait reason",()=>{
  expect(state(5093).battle?.levelup_box).toEqual({state:6,page:1,waiting:true,party_slot:0,labels:["MAX. HP","ATTACK","DEFENSE","SP. ATK","SP. DEF","SPEED"],before:[19,9,9,14,10,9],after:[21,11,10,15,11,10],text:"MAX. HP +2, ATTACK +2, DEFENSE +1, SP. ATK +1, SP. DEF +1, SPEED +1",diagnostic:null});
  expect(Value.Check(BattleWaitSchema,{reason:"levelup_box",frames:0,state:RUN.frames[at(5093)]?.state})).toBe(true);
  expect(Value.Check(BattleWaitSchema,{reason:"levelup",frames:0,state:RUN.frames[at(5093)]?.state})).toBe(false);
 });
});

describe("levelup-box-v1 registry, presets and server wiring",()=>{
 it("is the last switch: a default-off observation the game server applies, with OFF copy and no dependency",()=>{
  expect(SWITCHABLE_FEATURES.at(76)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(76)?.id).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-64)).toBe(ID);
  const info=featureInfo(ID);
  expect([info.group,info.needs,info.title]).toEqual(["observation",null,"LEVEL-UP STATS BOX"]);
  expect(info.description).toContain(" Off: the readout says resolving (no input until the game asks) while the box waits");
  expect(SERVER_FEATURES.at(34)).toBe(ID);
  expect(serverFeatureEnv({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false}).POKEBENCH_FEATURES_OFF).toBe(`${ID},safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1,post-battle-readout-v1,move-learn-early-comparison-v1,poison-readout-v1,berry-readout-v1,battle-move-learn-input-v1,static-npc-template-approach-v1,coherent-battle-observation-v1,window-escape-route-v1,elevation-aware-map-v1,screen-center-player-v1,blackout-transition-v1,player-elevation-readout-v1,party-menu-message-v1,bag-pocket-truth-v1`);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1,post-battle-readout-v1,move-learn-early-comparison-v1,poison-readout-v1,berry-readout-v1,battle-move-learn-input-v1,static-npc-template-approach-v1,coherent-battle-observation-v1,window-escape-route-v1,elevation-aware-map-v1,screen-center-player-v1,blackout-transition-v1,player-elevation-readout-v1,party-menu-message-v1,bag-pocket-truth-v1");
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"battle-effective-damage-v1":false,"battle-text-auto-advance-v1":false,"battle-message-waiting-v1":false,"battle-details-v2":false})).toEqual([]);
  const readout=readFileSync(new URL("../../../env/pokebench_env/readout.py",import.meta.url),"utf8");
  expect(readout).toContain(`"offscreen-objects-v1",\n    "${ID}",\n    "transition-coherence-v1",\n    "readout-truth-v1",`);
  expect(readout).toContain(`"offscreen-objects-v1,"\n        "${ID},"\n        "transition-coherence-v1,"\n        "readout-truth-v1,`);
 });

 it("defaults OFF for presets that omit it and for legacy flag presets",()=>{
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});

// fail-open-input-v1 (operator 2026-10-20: "a fail open design for boxes or ui we dont recognize and let the model
// make choices based on whats on screen. pressing b should also be able to dismiss that"): with levelup-box-v1 OFF
// the stats box is a hold the harness does not recognize, so the advance stops with the battle busy.
describe("fail-open-input-v1 on the unrecognized level-up box (run 54a7)",()=>{
 const FAIL_OPEN:FeatureSet={...OFF,"fail-open-input-v1":true};
 it("ON: the inputs left in the batch are sent after the unrecognized hold, and the result says so",async()=>{
  const server=new Replay(at(5076),false);const {press,advance}=wire(server,FAIL_OPEN);
  const result=await press.execute("t357",{buttons:["A","A"]});
  expect(server.posts.map(p=>`${p.button}:${p.phase}`)).toEqual(["A:input","B:waiting","B:waiting","B:waiting","A:box"]);
  expect(advance()).toMatchObject({sent:["A","A"],dropped:[],battle_auto_presses:3,stop:"battle_busy"});
  expect(()=>checkEvent(advance())).not.toThrow();
  const text=textOf(result);
  expect(text).toContain("The harness does not recognize what the game is waiting for, so it sent the rest of your inputs as you asked: A. Decide from the screen what they did.");
  expect(text).not.toContain("remaining input not sent");
 });
 it("ON with safe batches: the inputs the batch rule held back are sent, and the result does not also say they were not sent",async()=>{
  const server=new Replay(at(5076),false);const {press,advance}=wire(server,{...FAIL_OPEN,"dialogue-safe-batches-v1":true});
  const result=await press.execute("t357",{buttons:["A","B"]});
  expect(server.posts.at(-1)).toEqual({button:"B",phase:"box"});
  expect(advance()).toMatchObject({sent:["A","B"],dropped:[]});
  expect(textOf(result)).not.toContain("Interface safety");
  const off=new Replay(at(5076),false);const offWired=wire(off,{...OFF,"dialogue-safe-batches-v1":true});
  expect(textOf(await offWired.press.execute("t357",{buttons:["A","B"]}))).toContain("Interface safety: submitted 1 of 2 requested inputs");
 });
 it("ON: B in the batch is sent too, so it can dismiss the box",async()=>{
  const server=new Replay(at(5076),false);const {press}=wire(server,FAIL_OPEN);
  await press.execute("t357",{buttons:["A","B"]});
  expect(server.posts.at(-1)).toEqual({button:"B",phase:"box"});
 });
 it("OFF: the inputs left in the batch are dropped as before",async()=>{
  const server=new Replay(at(5076),false);const {press,advance}=wire(server,OFF);
  const result=await press.execute("t357",{buttons:["A","B"]});
  expect(server.posts.map(p=>p.button)).toEqual(["A","B","B","B"]);
  expect(advance()).toMatchObject({sent:["A"],dropped:["B"],stop:"battle_busy"});
  expect(textOf(result)).toContain("1 remaining input not sent: B.");
 });
 it("ON: a recognized stop (the battle ended) still drops the rest of the batch",async()=>{
  const server=new Replay(at(5076),true);const {press,advance}=wire(server,{...ON,"fail-open-input-v1":true});
  await press.execute("t357",{buttons:["A","A"]});
  expect(advance()).toMatchObject({sent:["A"],dropped:["A"],stop:"field_free"});
 });
 it("is registered as an agent switch, off by default, needing nothing",()=>{
  expect(SWITCHABLE_FEATURES).toContain("fail-open-input-v1");
  expect(featureInfo("fail-open-input-v1")).toMatchObject({needs:null});
  expect(featureInfo("fail-open-input-v1").description).toContain(" Off: ");
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])["fail-open-input-v1"]).toBe(false);
  expect(SERVER_FEATURES).not.toContain("fail-open-input-v1");
  expect(playHarnessFeatures({...ALL_ON,"fail-open-input-v1":true},null)).toContain("fail-open-input-v1");
 });
});
