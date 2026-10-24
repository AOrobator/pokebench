import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import {gunzipSync} from "node:zlib";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {AgentMessage,AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {BATTLE_BUSY_BOUNDS,BattleJournal,advanceBattle,battleEngaged,battlePage,classifyBattle,type BattleRun,type BattleTextEntry,type BattleTextSource} from "./battle-text-auto-advance.js";
import {AUTO_ADVANCE_LIMITS,DialogueRecord,withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {DialogueLog} from "./dialogue-log.js";
import {observeTool,pressTool,type Clock} from "./game-tools.js";
import {StateWatcher,parseGameState,type GameStateSnapshot} from "./game-state.js";
import {battleDecisionContext,playGameTools} from "./play-wiring.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {FEATURES,SERVER_FEATURES,serverFeatureEnv,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {checkEvent,type Button,type RunEvent} from "./events.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";

const ID="battle-text-auto-advance-v1";
const URL_BASE="http://127.0.0.1";
const BASE:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-auto-advance-v1":true};
const ON:FeatureSet={...BASE,[ID]:true};
const OFF:FeatureSet={...BASE,[ID]:false};
const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();

// The showcase run 2026-10-16T00-34-26_qwen36-gpu1_show, raw RAM 7753-7836 (turns 719-731), decoded by the
// production reader (read_state) with the battle text journal run over the same frames.
interface Frame {readonly raw_ram:string;readonly journal_last_id:number;readonly state:unknown}
const SHOW=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/battle-text-show-7753.json.gz",import.meta.url))).toString("utf8")) as {frames:Frame[];journal:{entries:BattleTextEntry[]}};
const SHOW_STATES=SHOW.frames.map(f=>parseGameState(f.state));
const at=(raw:number):number=>{const i=SHOW.frames.findIndex(f=>f.raw_ram===`${String(raw).padStart(8,"0")}.json.gz`);if(i<0)throw new Error(String(raw));return i;};
const show=(raw:number):GameStateSnapshot=>{const s=SHOW_STATES[at(raw)];if(s===undefined)throw new Error(String(raw));return s;};

type Phase="waiting"|"busy"|"input"|"field_waiting"|"field_printing"|"field_locked"|"other";
function phaseOf(s:GameStateSnapshot):Phase {
 if(s.in_battle){const p=s.battle?.text_phase;return p==="message_waiting"?"waiting":p==="busy"||p==null?"busy":p==="input"?"input":"other";}
 const m=s.world_context?.message;
 if(m!=null)return m.ready?"field_waiting":"field_printing";
 if(s.screen==="overworld")return s.field_controls_locked===true?"field_locked":"other";
 return "busy";
}
const identity=(s:GameStateSnapshot)=>JSON.stringify([s.screen,s.battle?.message?.identity,s.battle?.message?.cursor,s.battle?.text_phase,s.world_context?.message]);

// Replays a recorded or scripted sequence of states as a game server. A/B on a waiting page moves to the next
// different state; a battle wait skips busy states (bounded); a field read moves past a printing page; the
// journal shows the entries recorded at or before the current position.
class ScriptServer{
 i:number;posts:{button:Button;phase:Phase}[]=[];paths:string[]=[];waitBound=30;readout:(s:GameStateSnapshot)=>string=s=>`Screen: ${s.screen}`;
 constructor(private readonly states:readonly GameStateSnapshot[],private readonly entries:readonly BattleTextEntry[],start=0){this.i=start;}
 get now():GameStateSnapshot{const s=this.states[this.i];if(s===undefined)throw new Error("past the script");return s;}
 private next(){const from=identity(this.now);while(this.i<this.states.length-1&&identity(this.states[this.i]??this.now)===from)this.i++;}
 press(button:Button){
  const phase=phaseOf(this.now);this.posts.push({button,phase});
  if(phase==="waiting"||phase==="field_waiting"){if(button==="A"||button==="B")this.next();return;}
  if(phase==="busy"||phase==="input"||phase==="field_printing"||phase==="field_locked")this.i=Math.min(this.i+1,this.states.length-1);
 }
 wait(){
  const start=this.i;
  while(phaseOf(this.now)==="busy"&&this.i-start<this.waitBound&&this.i<this.states.length-1)this.i++;
  const s=this.now;const p=phaseOf(s);
  const reason=p==="busy"?"bound":p==="waiting"?"message_waiting":p==="input"?"input":s.in_battle?(s.battle?.text_phase==="prompt"?"prompt":"screen"):"field";
  return {reason,frames:this.i-start,state:s};
 }
 messages(after:number){
  const seen=this.entries.filter(e=>e.frame<=this.i+1);
  const last=seen.at(-1)?.id??0;
  if(after>last)return null;
  return {frame:this.i+1,first_id:1,last_id:last,errors:0,last_error:null,entries:seen.filter(e=>e.id>after)};
 }
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  this.paths.push(new URL(url).pathname);
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");for(const b of (JSON.parse(init.body) as {buttons:Button[]}).buttons)this.press(b);body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state_text:this.readout(this.now),screenshot_base64:png,state:this.now};
  else if(url.endsWith("/pokebench/state")){body=this.now;const p=phaseOf(this.now);if(p==="field_printing"||p==="field_locked")this.i++;}
  else if(url.endsWith("/pokebench/battle/wait"))body=this.wait();
  else if(url.includes("/pokebench/battle/messages?after=")){body=this.messages(Number(new URL(url).searchParams.get("after")));if(body===null)return Promise.resolve(new Response("{}",{status:409}));}
  else throw new Error(`Unexpected request ${url}`);
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 battlePaths(){return this.paths.filter(p=>p.startsWith("/pokebench/battle/"));}
}

function fakeClock():Clock&{t:number}{const c={t:0,now:()=>c.t,sleep:(ms:number)=>{c.t+=ms;return Promise.resolve();}};return c;}
function memoryRecorder(){
 const events:RunEvent[]=[];const subs:((e:RunEvent)=>void)[]=[];let seq=0;
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-10-16T02:00:00.000-04:00",turn:722,...body} as RunEvent;events.push(e);for(const s of subs)s(e);return {seq:e.seq,turn:722};};
 const api:AutoAdvanceRecorder&{lowHpTrainerWarning:()=>void;peopleIdCard:()=>void}={lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:o=>{subs.push(o);}};
 return {events,api,advances:()=>events.filter((e):e is Extract<RunEvent,{type:"dialogue_auto_advance"}>=>e.type==="dialogue_auto_advance")};
}
function wire(server:ScriptServer,features:FeatureSet=ON,extra:AgentTool[]=[],clock=fakeClock()){
 const rec=memoryRecorder();
 const base=[observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},server.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()}),...extra];
 const tools=withDialogueAutoAdvance(base,features,{state:new StateWatcher(URL_BASE,server.fetch),recorder:rec.api,clock});
 const tool=(name:string):AgentTool=>{const t=tools.find(x=>x.name===name);if(t===undefined)throw new Error(`missing ${name}`);return t;};
 return {tools,tool,rec,clock,base};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
const showServer=(raw:number)=>new ScriptServer(SHOW_STATES,SHOW.journal.entries,at(raw));

describe("battle-text-auto-advance-v1 on the recorded showcase battle",()=>{
 it("seq 18431 (raw RAM 7765): the model's A batch becomes one A, one B on Wild WURMPLE appeared!, and a stop at the action menu",async()=>{
  const server=showServer(7765);const {tool,rec}=wire(server);
  const result=await tool("press").execute("c722",{buttons:["A","A","A"]});
  expect(server.posts).toEqual([{button:"A",phase:"busy"},{button:"B",phase:"waiting"}]);
  expect(server.now).toBe(show(7782));
  const text=textOf(result);
  expect(text.split("\n")[0]).toBe("pressed A");
  expect(text).toContain("Battle text auto-advance: the harness pressed B 1 time to advance battle messages; stopped: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT.");
  expect(text).toContain("the harness took over the battle text; 2 remaining inputs not sent: A, A.");
  expect(text).toContain(`Dialogue shown during this call (1 page, in order, whole):\n1. turn 722 · ROUTE101 (map 0/16) · battle turn 1: "Wild WURMPLE appeared!"`);
  const [event]=rec.advances();
  expect(event).toMatchObject({tool:"press",requested:["A","A","A"],sent:["A"],dropped:["A","A"],auto_presses:1,battle_auto_presses:1,stop:"battle_input"});
  expect(event?.pages).toEqual([{state_seq:expect.any(Number) as number,map:"ROUTE101",map_id:[0,16],position:null,speaker:null,speaker_source:null,text:"Wild WURMPLE appeared!",battle_turn:1,battle_message_id:1}]);
  expect(()=>checkEvent(event)).not.toThrow();
 });

 it("a move choice: the leftover input is dropped and both attack messages, which pass on their own, are listed",async()=>{
  const server=showServer(7789);const {tool,rec}=wire(server);
  const result=await tool("press").execute("c728",{buttons:["A","A"]});
  expect(server.posts.map(p=>p.button)).toEqual(["A"]);
  expect(server.now).toBe(show(7804));
  expect(rec.advances()[0]).toMatchObject({auto_presses:0,battle_auto_presses:0,dropped:["A"],stop:"battle_input"});
  expect(rec.advances()[0]?.pages.map(p=>[p.text,p.battle_turn])).toEqual([[",VQ  SOC  used\nSCRATCH!",1],["Wild WURMPLE used\nTACKLE!",1]]);
  expect(textOf(result)).toContain("the harness pressed B 0 times to advance battle messages");
 });

 it("the last turn: fainted and EXP wait for B, the battle ends and the free field is confirmed",async()=>{
  const server=showServer(7809);const {tool,rec}=wire(server);
  const result=await tool("press").execute("c731",{buttons:["A"]});
  expect(server.posts.map(p=>[p.button,p.phase])).toEqual([["A","input"],["B","waiting"],["B","waiting"]]);
  expect(server.now.screen).toBe("overworld");
  const [event]=rec.advances();
  expect(event).toMatchObject({auto_presses:2,battle_auto_presses:2,stop:"field_free",detail:"the battle ended and field controls are free"});
  expect(event?.pages.map(p=>p.text)).toEqual([",VQ  SOC  used\nSCRATCH!","Wild WURMPLE\nfainted!",",VQ  SOC  gained\n15 EXP. Points!"]);
  expect(textOf(result)).toContain("stopped: the battle ended and field controls are free.");
 });

 it("composes with battle-triage-guidance-v1: the stop's summary comes first, then the readout with its triage line, unchanged",async()=>{
  // The game server's readout for raw RAM 7782 with the player's HP set to 7/23, battle-triage-guidance-v1 and
  // battle-details-v2 on (rendered by pokebench_env.rerender.render).
  const triage=readFileSync(new URL("./fixtures/battle-text-triage-7782.txt",import.meta.url),"utf8");
  const line="Your TORCHIC has 7/23 HP (below half). This is a wild battle: RUN is allowed (bottom-right of the battle menu).";
  expect(triage).toContain(line);
  const server=showServer(7765);server.readout=s=>s===show(7782)?triage:`Screen: ${s.screen}`;
  const features={...ON,"battle-triage-guidance-v1":true};
  const result=await wire(server,features).tool("press").execute("t722",{buttons:["A"]});
  const text=textOf(result);
  const block=text.indexOf("Battle text auto-advance: the harness pressed B 1 time");
  expect(block).toBeGreaterThan(0);
  expect(text.indexOf(`\n\n${triage}`)).toBeGreaterThan(block);
  expect(text.endsWith(triage)).toBe(true);
  expect(text.split(line)).toHaveLength(2);
  const prompt=playSystemPrompt(features,null);
  expect(prompt).toContain("Battle text auto-advance: in a battle");
  expect(prompt.indexOf("Battle text auto-advance:")).toBeGreaterThan(prompt.indexOf("Dialogue auto-advance:"));
 });

 it("OFF: the same press sends every requested button and calls no battle endpoint, as before",async()=>{
  const off=showServer(7765);const {tool:offTool}=wire(off,OFF);
  const plain=showServer(7765);const {base}=wire(plain,OFF);
  const single=await offTool("press").execute("o1",{buttons:["A"]});
  const press=base[1];if(press===undefined)throw new Error("press");
  expect(single).toEqual(await press.execute("o1",{buttons:["A"]}));
  await offTool("press").execute("o2",{buttons:["A","A","A"]});
  expect(off.posts.map(p=>p.button)).toEqual(["A","A","A","A"]);
  expect(off.battlePaths()).toEqual([]);
  expect(textOf(single)).not.toContain("Battle text");
 });
});

// Scripted states built from the recorded ones.
const WAITING=show(7772),BUSY=show(7774),INPUT=show(7782),FIELD=show(7836),TRANSITION=show(7753);
type Battle=NonNullable<GameStateSnapshot["battle"]>;
const battleOf=(s:GameStateSnapshot):Battle=>{if(s.battle==null)throw new Error("not a battle state");return s.battle;};
const battleWith=(s:GameStateSnapshot,battle:Partial<Battle>,extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({...s,...extra,battle:{...battleOf(s),...battle}});
const INPUT_ROW=(()=>{const row=battleOf(show(7782)).player_inputs?.[0];if(row===undefined)throw new Error("no input row");return row;})();
const page=(text:string,n:number):GameStateSnapshot=>battleWith(WAITING,{message:{state:"waiting_for_input",render_state:"page_wait",text,cursor:text.length+1,identity:`id-${String(n)}`,diagnostic:null}});
const fieldMessage=(text:string,ready:boolean,cursor=text.length):GameStateSnapshot=>({...FIELD,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:text,message:{phase:ready?"button_wait":"printing",cursor,ready,identity:Buffer.from(text).toString("hex").padEnd(64,"0").slice(0,64)}}});
const entry=(id:number,frame:number,text:string,turn=1):BattleTextEntry=>({id,frame,recorded_ms:0,battle:1,battle_turn:turn,text,waited_for_input:true});

describe("battle-text-auto-advance-v1 hand-offs",()=>{
 it("navigate_to into tall grass: the battle start is waited out and the opening page advanced",async()=>{
  const server=new ScriptServer(SHOW_STATES,SHOW.journal.entries,at(7753));
  const nav:AgentTool={name:"navigate_to",label:"n",description:"walk",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Navigation: walk interrupted"}],details:{state:TRANSITION}})};
  const {tool,rec}=wire(server,ON,[nav]);
  expect(battleEngaged(TRANSITION)).toBe(true);
  const result=await tool("navigate_to").execute("n1",{});
  expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(rec.advances()[0]).toMatchObject({tool:"navigate_to",stop:"battle_input",battle_auto_presses:1});
  expect(textOf(result)).toContain(`battle turn 1: "Wild WURMPLE appeared!"`);
  expect(tool("navigate_to").description).toContain("If it ends in dialogue or a battle, the text advances automatically");
 });

 it("battle-move-tool-v1: a battle_action that chose a move has the turn's text advanced and listed after its own status line",async()=>{
  const busy=SHOW_STATES.findIndex((s,i)=>i>at(7789)&&phaseOf(s)==="busy");
  const server=new ScriptServer(SHOW_STATES,SHOW.journal.entries,busy);
  const chosen=SHOW_STATES[busy];if(chosen===undefined)throw new Error("no busy state");
  const act:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Battle action: chose FIGHT, then SCRATCH; buttons pressed: A, A; the battle is running its own text or animation."}],details:{state:chosen,battle_action:{refused:false}}})};
  const {tool,rec}=wire(server,ON,[act]);
  const result=await tool("battle_action").execute("b1",{});
  const [event]=rec.advances();
  expect(event).toMatchObject({tool:"battle_action",stop:"battle_input",requested:[],sent:[],dropped:[]});
  expect(()=>checkEvent(event)).not.toThrow();
  expect(result.content[0]).toEqual({type:"text",text:"Battle action: chose FIGHT, then SCRATCH; buttons pressed: A, A; the battle is running its own text or animation."});
  expect(textOf(result)).toContain(`"Wild WURMPLE used\nTACKLE!"`);
  expect(tool("battle_action").description).toBe("choose If the battle then runs its own text, the text advances automatically to the next decision point and its pages are listed.");
  // A refused call pressed nothing, and auto-advance presses nothing after it either.
  const waiting=SHOW_STATES.findIndex(s=>phaseOf(s)==="waiting");const shown=SHOW_STATES[waiting];if(shown===undefined)throw new Error("no waiting state");
  const refused:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Battle action: nothing pressed: the battle is not waiting for a choice."}],details:{state:shown,battle_action:{refused:true}}})};
  const quiet=new ScriptServer(SHOW_STATES,SHOW.journal.entries,waiting);const r2=wire(quiet,ON,[refused]);
  const kept=await r2.tool("battle_action").execute("b2",{});
  expect(quiet.posts).toEqual([]);expect(r2.rec.advances()).toEqual([]);expect(kept.content).toHaveLength(1);
  const off=wire(new ScriptServer(SHOW_STATES,SHOW.journal.entries,busy),{...ON,[ID]:false},[act]);
  expect(off.tool("battle_action")).toBe(act);
 });

 it("a trainer's field challenge, the battle, then Birch's field thanks, all in one call and in order",async()=>{
  const states=[fieldMessage("YOUNGSTER: Let's battle!",true),TRANSITION,BUSY,page("YOUNGSTER sent out POOCHYENA!",1),BUSY,page("POOCHYENA fainted!",2),BUSY,show(7835),fieldMessage("PROF. BIRCH: You saved me!",false,0),fieldMessage("PROF. BIRCH: You saved me!",true),FIELD,FIELD];
  const server=new ScriptServer(states,[entry(1,4,"YOUNGSTER sent out POOCHYENA!"),entry(2,6,"POOCHYENA fainted!",2)]);
  const {tool,rec}=wire(server);
  const result=await tool("press").execute("t",{buttons:["B"]});
  expect(server.posts.map(p=>[p.button,p.phase])).toEqual([["B","field_waiting"],["B","waiting"],["B","waiting"],["B","field_waiting"]]);
  const [event]=rec.advances();
  expect(event?.pages.map(p=>[p.text,p.battle_turn??null])).toEqual([["YOUNGSTER: Let's battle!",null],["YOUNGSTER sent out POOCHYENA!",1],["POOCHYENA fainted!",2],["PROF. BIRCH: You saved me!",null]]);
  expect(event).toMatchObject({auto_presses:3,battle_auto_presses:2,stop:"field_free",detail:"the conversation closed and field controls are free"});
  expect(textOf(result)).toContain("pressed B 2 times to advance battle messages and 1 time to advance field dialogue");
 });

 it("with script-line-presence-v1 on: unattributed field pages on each side of the battle name their own on-screen objects; battle pages carry none",async()=>{
  const obj=(local_id:number,graphics_id:number,sprite_kind:string,x:number,y:number)=>({local_id,map_id:[0,16] as [number,number],graphics_id,sprite_kind,x,y});
  const withObjects=(s:GameStateSnapshot,objects:ReturnType<typeof obj>[]):GameStateSnapshot=>({...s,world_context:{...(s.world_context??{triggers:[],dialogue:null,message:null}),objects}});
  const before=[obj(2,64,"PROF_BIRCH",9,8)],after=[obj(3,97,"BIRCHS_BAG",13,12)];
  const states=[withObjects(fieldMessage("H-help me!",true),before),TRANSITION,BUSY,page("YOUNGSTER sent out POOCHYENA!",1),BUSY,page("POOCHYENA fainted!",2),BUSY,show(7835),withObjects(fieldMessage("Thanks!",false,0),after),withObjects(fieldMessage("Thanks!",true),after),FIELD,FIELD];
  const entries=[entry(1,4,"YOUNGSTER sent out POOCHYENA!"),entry(2,6,"POOCHYENA fainted!",2)];
  const both:FeatureSet={...ON,"script-line-presence-v1":true,"character-presence-v1":true};
  const server=new ScriptServer(states,entries);
  const {tool,rec}=wire(server,both);
  const text=textOf(await tool("press").execute("p",{buttons:["B"]}));
  const [event]=rec.advances();
  expect(event?.pages.map(p=>[p.text,p.battle_turn??null,"on_screen" in p?p.on_screen:"absent"])).toEqual([
   ["H-help me!",null,[{local_id:2,graphics_id:64,sprite_kind:"PROF_BIRCH",x:9,y:8,character:"PROF. BIRCH"}]],
   ["YOUNGSTER sent out POOCHYENA!",1,"absent"],
   ["POOCHYENA fainted!",2,"absent"],
   ["Thanks!",null,[{local_id:3,graphics_id:97,sprite_kind:"BIRCHS_BAG",x:13,y:12,character:null}]],
  ]);
  expect(()=>checkEvent(event)).not.toThrow();
  expect(text).toContain(`(no speaker shown by the game; on screen: PROF. BIRCH (sprite PROF_BIRCH) at 9,8): "H-help me!"`);
  expect(text).toContain(`(no speaker shown by the game; on screen: BIRCHS_BAG at 13,12): "Thanks!"`);
  expect(text.split("\n").filter(l=>l.includes("battle turn")).every(l=>!l.includes("no speaker shown"))).toBe(true);
  const off=new ScriptServer(states,entries);
  const plain=wire(off,{...both,"script-line-presence-v1":false});
  await plain.tool("press").execute("p",{buttons:["B"]});
  expect(plain.rec.advances()[0]?.pages.every(p=>!("on_screen" in p))).toBe(true);
 });

 it.each([
  ["a YES/NO question",battleWith(BUSY,{text_phase:"prompt",prompt:{kind:"learn_move",ready:true,selected:"NO"}}),"battle_prompt","a battle YES/NO question is open (forget a move to make room for the new one); highlighted NO; B answers NO"],
  ["the naming screen",battleWith(BUSY,{text_phase:"screen"},{screen:"naming",naming:{text:"",page:"uppercase",column:0,row:0,key:"A",ready:true}}),"naming","the naming screen is open"],
  ["the bag",battleWith(BUSY,{text_phase:"screen"},{screen:"bag_menu",active_ui:{phase:"bag_menu",selected:"POTION",ready:true,controls:"",diagnostic:null}}),"menu","menu bag_menu is open; highlighted POTION"],
  ["an evolution",battleWith(BUSY,{text_phase:"screen"},{screen:"evolution",active_ui:null}),"screen_change","the screen changed to evolution"],
  ["the move menu",battleWith(INPUT,{player_inputs:[{...INPUT_ROW,phase:"move",selected:"TACKLE"}]}),"battle_input","the move menu is ready; highlighted TACKLE"],
 ])("stops at %s and lists the pages before it",async(_label,stop,kind,detail)=>{
  const server=new ScriptServer([BUSY,page("Use next POKéMON?",1),stop,stop],[entry(1,2,"Use next POKéMON?")]);
  const {tool,rec}=wire(server);
  await tool("press").execute("s",{buttons:["A"]});
  expect(rec.advances()[0]).toMatchObject({stop:kind,detail,pages:[{text:"Use next POKéMON?"}]});
 });
});

describe("battlePage",()=>{
 it("carries the displayed place name when the readout has one, as field pages do",()=>{
  const e=SHOW.journal.entries[0];if(e===undefined)throw new Error("entry");
  expect(battlePage(e,show(7772),3)).not.toHaveProperty("map_display");
  expect(battlePage(e,{...show(7772),location_display:"ROUTE 101"},3)).toMatchObject({map:"ROUTE101",map_display:"ROUTE 101",battle_turn:1});
 });
});

describe("classifyBattle",()=>{
 it("waits through a battle start, an initializing battle and the way back to the field",()=>{
  expect(classifyBattle(TRANSITION)).toEqual({kind:"wait"});
  expect(classifyBattle(show(7834))).toEqual({kind:"wait"});
  expect(classifyBattle(FIELD)).toEqual({kind:"over"});
  expect(classifyBattle(battleWith(BUSY,{phase:"initializing",text_phase:null}))).toEqual({kind:"wait"});
  expect(battleEngaged(battleWith(BUSY,{phase:"initializing",text_phase:null}))).toBe(true);
  expect(battleEngaged(INPUT)).toBe(false);
  expect(battleEngaged(FIELD)).toBe(false);
  expect(battleEngaged({...FIELD,screen:"overworld",active_ui:{phase:"battle_transition",selected:null,ready:false,controls:"",diagnostic:null}})).toBe(true);
 });
 it("hands back an unreadable battle and names an input or prompt without a selection",()=>{
  expect(classifyBattle(battleWith(BUSY,{phase:"unavailable",text_phase:null,diagnostic:"harness bug: x"}))).toEqual({kind:"stop",stop:"battle_unreadable",detail:"the battle state could not be read (harness bug: x); inspect before acting"});
  expect(classifyBattle({...BUSY,battle:null})).toEqual({kind:"stop",stop:"battle_unreadable",detail:"the battle state could not be read; inspect before acting"});
  expect(classifyBattle(battleWith(BUSY,{text_phase:"prompt",prompt:null}))).toMatchObject({detail:"a battle YES/NO question is open"});
  expect(classifyBattle(battleWith(BUSY,{text_phase:"prompt",prompt:{kind:"nickname_caught",ready:true,selected:null}}))).toMatchObject({detail:"a battle YES/NO question is open (give the caught POKéMON a nickname); highlighted unknown; B answers NO"});
  expect(classifyBattle(battleWith(BUSY,{text_phase:"input",player_inputs:[]}))).toMatchObject({stop:"battle_input",detail:"the battle is waiting for input"});
  expect(classifyBattle(battleWith(BUSY,{text_phase:"input",player_inputs:[{...INPUT_ROW,phase:"safari_action",selected:null},{...INPUT_ROW,battler:2,phase:"other_owner",selected:"X"}]}))).toMatchObject({detail:"the Safari action menu is ready (SAFARI BALL, POKEBLOCK, GO NEAR, RUN); battle input other_owner is ready; highlighted X"});
  expect(classifyBattle(battleWith(BUSY,{text_phase:"screen"},{screen:"party_menu",active_ui:{phase:"party_menu",selected:null,ready:true,controls:"",diagnostic:null,details:{options:["TORCHIC"]}}}))).toMatchObject({stop:"menu",detail:"menu party_menu is open: options TORCHIC; highlighted unknown"});
  expect(classifyBattle(battleWith(BUSY,{text_phase:"screen"},{screen:"party_menu",active_ui:{phase:"party_menu",selected:null,ready:true,controls:"",diagnostic:null}}))).toMatchObject({stop:"menu",detail:"menu party_menu is open"});
 });
});

function stubRun(over:Partial<BattleRun>&{waits?:{reason:string;state:GameStateSnapshot}[];after?:GameStateSnapshot}):BattleRun&{presses:number}{
 const waits=[...(over.waits??[])];let presses=0;
 const source:BattleTextSource={battleWait:()=>{const w=waits.shift();if(w===undefined)return Promise.reject(new Error("no more waits"));return Promise.resolve({reason:w.reason as "bound",frames:600,state:w.state});},battleMessages:()=>Promise.resolve({frame:1,first_id:1,last_id:0,errors:0,last_error:null,entries:[]})};
 const run={source,journal:new BattleJournal(source,0,0),known:{last:0},clock:fakeClock(),limits:AUTO_ADVANCE_LIMITS,began:0,used:0,
  press:()=>{presses++;return Promise.resolve({content:[],details:{state:over.after??WAITING}});},
  stateOf:(r:AgentToolResult<unknown>)=>parseGameState((r.details as {state:unknown}).state),extraText:()=>[],addPages:()=>undefined,...over,
  get presses(){return presses;}};
 return run;
}

describe("advanceBattle caps and stops",()=>{
 it("stops at the shared press cap with a message still waiting",async()=>{
  const out=await advanceBattle(WAITING,stubRun({used:AUTO_ADVANCE_LIMITS.presses-2}));
  expect(out).toMatchObject({stop:"press_cap",presses:2,over:false});
  expect(out.detail).toBe("AUTO-ADVANCE CAP: stopped after 50 automatic presses; a battle message is still waiting");
 });
 it("stops at the call's time cap",async()=>{
  const clock=fakeClock();clock.t=AUTO_ADVANCE_LIMITS.callMs;
  expect(await advanceBattle(BUSY,stubRun({clock}))).toMatchObject({stop:"time_cap",detail:"AUTO-ADVANCE CAP: stopped after 90 s of automatic advancing; the battle is still running"});
 });
 it(`hands back after ${String(BATTLE_BUSY_BOUNDS)} bounded waits in a row, and a non-bound wait resets the count`,async()=>{
  const bound={reason:"bound",state:BUSY};
  const out=await advanceBattle(BUSY,stubRun({waits:[bound,bound,{reason:"message_waiting",state:BUSY},bound,bound,bound]}));
  expect(out).toMatchObject({stop:"battle_busy",detail:"the battle kept running on its own for 3 waits of 600 emulated frames with no message waiting and no input open; inspect before acting"});
 });
 it("stops when the game is paused, and on a wait or press error",async()=>{
  expect(await advanceBattle(BUSY,stubRun({waits:[{reason:"paused",state:BUSY}]}))).toMatchObject({stop:"paused",detail:"the game is paused, so the battle did not advance; observe after the pause ends"});
  expect(await advanceBattle(BUSY,stubRun({}))).toMatchObject({stop:"error",detail:"battle text auto-advance stopped: no more waits"});
  expect(await advanceBattle(WAITING,stubRun({press:()=>Promise.reject(new Error("press failed"))}))).toMatchObject({stop:"error",detail:"battle text auto-advance stopped: press failed"});
 });
 it("rethrows when the run is aborted",async()=>{
  const controller=new AbortController();controller.abort(new Error("stopped"));
  await expect(advanceBattle(BUSY,stubRun({}),controller.signal)).rejects.toThrow("stopped");
  const mid=new AbortController();
  await expect(advanceBattle(WAITING,stubRun({press:()=>{mid.abort(new Error("mid"));return Promise.reject(new Error("press failed"));}}),mid.signal)).rejects.toThrow("press failed");
 });
});

describe("BattleJournal",()=>{
 const journal=(responses:(number|Error|{first_id?:number;errors?:number;last_error?:string|null;entries?:BattleTextEntry[];last_id?:number})[])=>{
  const calls:number[]=[];
  const source:BattleTextSource={battleWait:()=>Promise.reject(new Error("unused")),battleMessages:(after)=>{calls.push(after);const r=responses.shift();if(r instanceof Error||r===undefined)return Promise.reject(r??new Error("none"));const j=typeof r==="number"?{last_id:r}:r;return Promise.resolve({frame:1,first_id:j.first_id??1,last_id:j.last_id??0,errors:j.errors??0,last_error:j.last_error??null,entries:j.entries??[]});}};
  return {source,calls};
 };
 it("starts from the known cursor, and from 0 when a restarted server refuses it",async()=>{
  const ok=journal([7]);const known={last:5};
  await BattleJournal.open(ok.source,known);
  expect([ok.calls,known.last]).toEqual([[5],7]);
  const restarted=journal([new Error("HTTP 409"),2]);const k2={last:9};
  const j=await BattleJournal.open(restarted.source,k2);
  expect([restarted.calls,k2.last,j.note()]).toEqual([[9,0],2,null]);
 });
 it("says when pages may be missing: unreadable journal, a gap or a journal error",async()=>{
  const down=journal([new Error("HTTP 503"),new Error("still down")]);
  const j=await BattleJournal.open(down.source,{last:3});
  expect(await j.collect({last:3})).toEqual([]);
  expect(j.note()).toBe("Some battle pages may be missing from this list: still down.");
  const first=await BattleJournal.open(journal([new Error("refused")]).source,{last:0});
  expect(first.note()).toBe("Some battle pages may be missing from this list: refused.");
  const gap=journal([2,{first_id:6,last_id:7,entries:[entry(6,1,"six"),entry(7,1,"seven")]}]);
  const g=await BattleJournal.open(gap.source,{last:0});
  expect((await g.collect({last:2})).map(e=>e.text)).toEqual(["six","seven"]);
  expect(g.note()).toBe("Some battle pages may be missing from this list: 3 battle pages left the server's journal before they were read.");
  const broken=journal([{last_id:1,errors:1},{last_id:1,errors:2,last_error:"harness bug: battle text journal: x"}]);
  const b=await BattleJournal.open(broken.source,{last:0});await b.collect({last:1});
  expect(b.note()).toBe("Some battle pages may be missing from this list: harness bug: battle text journal: x.");
  const silent=journal([{last_id:1,errors:1},{last_id:1,errors:2,last_error:null}]);
  const s=await BattleJournal.open(silent.source,{last:0});await s.collect({last:1});
  expect(s.note()).toContain("the battle text journal recorded an error");
  const failing=journal([1,new Error("gone")]);
  const f=await BattleJournal.open(failing.source,{last:0});
  expect(await f.collect({last:1})).toEqual([]);
  expect(f.note()).toBe("Some battle pages may be missing from this list: gone.");
 });
 it("rethrows an abort while opening or collecting",async()=>{
  const controller=new AbortController();controller.abort(new Error("aborted"));
  await expect(BattleJournal.open(journal([new Error("x")]).source,{last:0},controller.signal)).rejects.toThrow("aborted");
  await expect(BattleJournal.open(journal([new Error("x"),new Error("y")]).source,{last:4},controller.signal)).rejects.toThrow("aborted");
  const live=new AbortController();
  const j=await BattleJournal.open(journal([0,new Error("x")]).source,{last:0});
  live.abort(new Error("late"));
  await expect(j.collect({last:0},live.signal)).rejects.toThrow("late");
 });
});

describe("the battle pages beyond the result",()=>{
 it("the journal note reaches the result when pages may be missing",async()=>{
  const server=showServer(7765);let fail=true;
  const fetchFn:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;if(fail&&url.includes("/battle/messages")){fail=false;return Promise.resolve(new Response("{}",{status:503}));}return server.fetch(input,init);};
  const rec=memoryRecorder();const clock=fakeClock();
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,fetchFn),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})],ON,{state:new StateWatcher(URL_BASE,fetchFn),recorder:rec.api,clock});
  const result=await tools[1]?.execute("j",{buttons:["A"]});
  expect(result===undefined?"":textOf(result)).toContain("Some battle pages may be missing from this list: Battle text journal returned HTTP 503.");
  expect(rec.advances()[0]?.pages).toEqual([]);
 });

 it("get_dialogue finds battle pages, labelled with their battle turn; the dialogue log and supervisors skip them",async()=>{
  const server=showServer(7765);const {tool,rec}=wire(server);
  await tool("press").execute("g1",{buttons:["A"]});
  const recall=await tool("get_dialogue").execute("g2",{contains:"wurmple"});
  expect(textOf(recall)).toContain(`· battle turn 1: "Wild WURMPLE appeared!"`);
  const record=new DialogueRecord();for(const e of rec.events)record.observe(e);
  expect(record.recall({})).toContain("ROUTE101 (map 0/16) · battle turn 1");
  const log=new DialogueLog(ON);
  for(const e of rec.events)log.observe(e);
  log.observe({v:1,run:"r",seq:99,t:"2026-10-16T02:00:00.000-04:00",turn:722,type:"tool_result",id:"g1",name:"press",is_error:false,text:"x"} as RunEvent);
  expect(log.entries()).toEqual([]);
 });

 it("needs the game server's battle wait and journal when ON",()=>{
  const server=showServer(7765);
  const base=[observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},server.fetch)];
  expect(()=>withDialogueAutoAdvance(base,ON,{state:{read:()=>Promise.resolve(BUSY)},recorder:memoryRecorder().api})).toThrow("Battle text auto-advance requires the game server's battle wait and battle message journal");
  expect(()=>withDialogueAutoAdvance(base,OFF,{state:{read:()=>Promise.resolve(BUSY)},recorder:memoryRecorder().api})).not.toThrow();
 });
});

describe("battle-text-auto-advance-v1 registry and production wiring",()=>{
 it("is a default-off guidance switch, recorded last, that needs dialogue auto-advance and no server switch",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"dialogue-auto-advance-v1",switchable:true,title:"BATTLE TEXT AUTO-ADVANCE"});
  expect(featureInfo(ID).description).toContain(" Off: field auto-advance stops when a battle starts");
  expect(SWITCHABLE_FEATURES.at(68)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(68)?.id).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-72)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(dependencyProblems({...ON,"dialogue-auto-advance-v1":false})).toContain(`${ID} needs dialogue-auto-advance-v1`);
  expect(dependencyProblems(ON)).toEqual([]);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  const rest=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(rest)[ID]).toBe(false);
  expect(normalizeFeatures({...rest,[ID]:true})[ID]).toBe(true);
 });

 it("normalized presets list every switch in registry order, so this switch comes just before battle-message-waiting-v1, even from a preset that already names it",()=>{
  // Codex merge review round 5: a preset written before the newest switches, which already names this one.
  const newer=new Set<string>(["explorer-guidance-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1","offscreen-objects-v1","navigate-first-prompt-v1","presence-penalty-v1"]);
  const frozen=Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false}).filter(([id])=>!newer.has(id)));
  const preset=parsePlayPreset({version:2,id:"frozen-base",target:null,limits:{maxTurns:10,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...frozen,"state-only-decisions-v1":false}});
  expect(Object.keys(presetFeatures(preset))).toEqual([...SWITCHABLE_FEATURES]);
  expect(Object.keys(presetFeatures(preset)).slice(68,74)).toEqual([ID,"battle-message-waiting-v1","script-line-presence-v1","offscreen-objects-v1","navigate-first-prompt-v1","presence-penalty-v1"]);
  for(const id of ["offscreen-objects-v1","navigate-first-prompt-v1","presence-penalty-v1"] as const)expect(presetFeatures(preset)[id]).toBe(false);
 });

 it("is the key before battle-message-waiting-v1 wherever a preset or default lists switches, and in the registry",()=>{
  const later=new Set<string>(["battle-triage-guidance-v1","adjacent-tiles-v1","readout-rules-in-prompt-v1","explorer-guidance-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1",ID,"script-line-presence-v1","offscreen-objects-v1","navigate-first-prompt-v1","presence-penalty-v1"]);
  const old=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>!later.has(id))) as Omit<FeatureSet,"battle-triage-guidance-v1"|"adjacent-tiles-v1"|"readout-rules-in-prompt-v1"|"explorer-guidance-v1"|"connection-edge-tiles-v1"|"in-game-naming-readout-v1"|"no-nickname-guidance-v1"|typeof ID|"script-line-presence-v1"|"offscreen-objects-v1"|"navigate-first-prompt-v1"|"presence-penalty-v1">;
  expect(Object.keys(normalizeFeatures(old)).slice(68,74)).toEqual([ID,"battle-message-waiting-v1","script-line-presence-v1","offscreen-objects-v1","navigate-first-prompt-v1","presence-penalty-v1"]);
  for(const id of ["offscreen-objects-v1","navigate-first-prompt-v1","presence-penalty-v1"] as const)expect(normalizeFeatures(old)[id]).toBe(false);
  expect(Object.keys(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})).at(68)).toBe(ID);
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("no-nickname-guidance-v1")+1);
 });

 it("tells the model only when ON",()=>{
  expect(playSystemPrompt(ON,null)).toContain("Battle text auto-advance: in a battle the harness also advances the battle messages itself");
  expect(playSystemPrompt(OFF,null)).not.toContain("Battle text auto-advance");
  const server=showServer(7765);
  expect(wire(server,ON).tool("press").description).toContain("Battle text advances the same way");
  expect(wire(server,OFF).tool("press").description).not.toContain("Battle text");
 });

 it("the production factory wires battle text through the real recorder and state watcher",async()=>{
  const root=mkdtempSync(join(tmpdir(),"pokebench-battle-text-"));
  try{
   const server=showServer(7765);
   const log=RunLog.create(root,"battle-text");
   const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(server.now)}});
   await recorder.start(RUN_START_META);
   const base=[observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:(id,buttons,timing,before)=>{recorder.buttonPress(id,buttons,timing,before);},afterPress:()=>recorder.afterPress()},server.fetch,{now:()=>0,sleep:()=>Promise.resolve()})];
   const watcher=new StateWatcher(URL_BASE,server.fetch);
   const tools=playGameTools(base,ON,watcher,recorder);
   expect(tools[1]?.description).toContain("Battle text advances the same way");
   const press=tools[1];if(press===undefined)throw new Error("press");
   await recorder.emit({type:"tool_execution_start",toolCallId:"p",toolName:"press",args:{buttons:["A","A","A"]}});
   const result=await press.execute("p",{buttons:["A","A","A"]});
   await recorder.emit({type:"tool_execution_end",toolCallId:"p",toolName:"press",result,isError:false});
   recorder.end("budget");
   const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
   expect(events.filter((e):e is Extract<RunEvent,{type:"button_press"}>=>e.type==="button_press").map(e=>e.buttons)).toEqual([["A"],["B"]]);
   const advance=events.find(e=>e.type==="dialogue_auto_advance");
   expect(advance).toMatchObject({stop:"battle_input",battle_auto_presses:1,dropped:["A","A"],pages:[{text:"Wild WURMPLE appeared!",battle_turn:1}]});
   const seqs=advance?.type==="dialogue_auto_advance"?advance.pages.map(p=>p.state_seq):[];
   for(const seq of seqs)expect(events.find(e=>e.seq===seq)?.type).toBe("state");
   const offServer=showServer(7765);
   const off=playGameTools([observeTool(URL_BASE,offServer.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},offServer.fetch,{now:()=>0,sleep:()=>Promise.resolve()})],OFF,new StateWatcher(URL_BASE,offServer.fetch),recorder);
   await off[1]?.execute("q",{buttons:["A","A"]});
   expect(offServer.posts.map(p=>p.button)).toEqual(["A","A"]);
   expect(offServer.battlePaths()).toEqual([]);
  }finally{rmSync(root,{recursive:true,force:true});}
 });
});


describe("battle-decision-ready-v1",()=>{
 const ready={...ON,"battle-decision-ready-v1":true} as FeatureSet;
 it("settles an encounter on observe before returning a decision, listing its pages",async()=>{
  const server=new ScriptServer([WAITING,BUSY,INPUT],[entry(1,1,"Wild WURMPLE appeared!")]);
  const {tool,rec}=wire(server,ready);
  const result=await tool("observe").execute("o-ready",{});
  expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(stateOfResult(result).battle?.text_phase).toBe("input");
  expect(textOf(result)).toContain("Wild WURMPLE appeared!");
  expect(rec.advances()).toMatchObject([{tool:"observe",stop:"battle_input",battle_auto_presses:1}]);
  expect(()=>checkEvent(rec.advances()[0])).not.toThrow();
 });
 it("settles before battle_action validation, and keeps the preflight text in the result",async()=>{
  const server=new ScriptServer([WAITING,BUSY,INPUT],[entry(1,1,"Wild WURMPLE appeared!")]);
  let called=0;
  const action:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>{
   called++;expect(server.now.battle?.text_phase).toBe("input");
   return Promise.resolve({content:[{type:"text",text:"Battle action: chose SCRATCH"}],details:{state:server.now,battle_action:{refused:false}}});
  }};
  const {tool}=wire(server,ready,[action]);
  const result=await tool("battle_action").execute("b-ready",{});
  expect(called).toBe(1);expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(textOf(result)).toContain("Wild WURMPLE appeared!");
  expect(textOf(result)).toContain("chose SCRATCH");
 });
 it.each(["prompt","screen"] as const)("stops at %s without executing a queued battle action",async phase=>{
  const boundary=battleWith(INPUT,{text_phase:phase},phase==="screen"?{screen:"party_menu"}:{});
  const server=new ScriptServer([WAITING,boundary],[]);let called=0;
  const action:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>{called++;throw new Error("must not execute");}};
  const {tool}=wire(server,ready,[action]);
  const result=await tool("battle_action").execute("b-boundary",{});
  expect(called).toBe(0);expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(textOf(result)).toContain("not executed");
  expect(stateOfResult(result).battle?.text_phase).toBe(phase);
 });
 it("OFF keeps observe unchanged and refuses battle_action without advancing",async()=>{
  const server=new ScriptServer([WAITING,INPUT],[]);
  const {tool,rec}=wire(server,ON);
  await tool("observe").execute("o-off",{});
  expect(server.posts).toEqual([]);expect(rec.advances()).toEqual([]);
 });
});
function stateOfResult(result:AgentToolResult<unknown>):GameStateSnapshot {
 const d=result.details;if(typeof d!=="object"||d===null||!("state" in d))throw new Error("missing state");return parseGameState(d.state);
}


it("battle decision request context settles through the production factory before ledgers and preserves OFF identity",async()=>{
 const ready={...ON,"battle-decision-ready-v1":true} as FeatureSet;
 const server=new ScriptServer([WAITING,BUSY,INPUT],[entry(1,1,"Wild WURMPLE appeared!")]);
 const clock=fakeClock(),rec=memoryRecorder(),source=new StateWatcher(URL_BASE,server.fetch);
 const base=[observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},server.fetch,clock)];
 const tools=playGameTools(base,ready,source,rec.api);
 const received:unknown[]=[];
 const snapshots:unknown[]=[];const snapshotRecorder={recordDecisionSnapshot:(snapshot:unknown)=>{snapshots.push(snapshot);}};
 const chain:Parameters<typeof battleDecisionContext>[3]=messages=>{received.push(server.now.battle?.text_phase);return Promise.resolve(messages);};
 expect(battleDecisionContext(ON,source,tools,chain,snapshotRecorder)).toBe(chain);
 const transform=battleDecisionContext(ready,source,tools,chain,snapshotRecorder);
 const messages=await transform([]);
 expect(received).toEqual(["input"]);
 expect(snapshots).toMatchObject([{state:{battle:{text_phase:"input"}}}]);
 expect(JSON.stringify(messages)).toContain("Wild WURMPLE appeared!");
 expect(JSON.stringify(messages)).toContain("Harness battle update");
 const canonical:AgentMessage[]=[];
 const next=await transform(canonical);
 expect(JSON.stringify(next)).toContain("Wild WURMPLE appeared!");
 expect(next).toHaveLength(1);expect(server.posts).toHaveLength(1);
 const contextTool:AgentMessage={role:"toolResult",toolCallId:"memory-1",toolName:"get_dialogue",isError:false,content:[{type:"text",text:"memory result"}],timestamp:2};
 const afterMemory=await transform([contextTool]);expect(JSON.stringify(afterMemory)).toContain("Wild WURMPLE appeared!");
 const failedObserve:AgentMessage={...contextTool,toolName:"observe",isError:true};
 expect(JSON.stringify(await transform([failedObserve]))).toContain("Wild WURMPLE appeared!");
 const gameResult:AgentMessage={role:"toolResult",toolCallId:"observe-new",toolName:"observe",isError:false,content:[{type:"image",data:png,mimeType:"image/png"},{type:"text",text:"newer game observation"}],timestamp:3};
 const observed=[gameResult];expect(await transform(observed)).toBe(observed);
 const cancelled=new AbortController();cancelled.abort();
 await expect(battleDecisionContext(ready,source,tools,chain,snapshotRecorder,cancelled.signal)([])).rejects.toThrow();
 expect(server.posts).toHaveLength(1);
});

it.each(["navigate_to_target","explore_map"])("retires a retained battle snapshot after %s delivers a newer game frame",async toolName=>{
 const ready={...ON,"battle-decision-ready-v1":true} as FeatureSet;
 const server=new ScriptServer([WAITING,BUSY,INPUT],[entry(1,1,"Wild WURMPLE appeared!")]);
 const clock=fakeClock(),rec=memoryRecorder(),source=new StateWatcher(URL_BASE,server.fetch);
 const tools=playGameTools([observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},server.fetch,clock)],ready,source,rec.api);
 const transform=battleDecisionContext(ready,source,tools,messages=>Promise.resolve(messages),{recordDecisionSnapshot:()=>undefined});
 expect(JSON.stringify(await transform([]))).toContain("Harness battle update");
 const semanticResult:AgentMessage={role:"toolResult",toolCallId:"semantic-new",toolName,isError:false,content:[{type:"image",data:png,mimeType:"image/png"},{type:"text",text:"newer semantic navigation frame"}],timestamp:3};
 const messages=[semanticResult];expect(await transform(messages)).toBe(messages);
});

it("battle readiness never executes a queued action after a cap or battle end",async()=>{
 const ready={...ON,"battle-decision-ready-v1":true} as FeatureSet;
 for(const states of [[WAITING],[WAITING,FIELD]]){
  const server=new ScriptServer(states,[]);let called=0;
  const action:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>{called++;throw new Error("must not execute");}};
  const {tool}=wire(server,ready,[action]);
  const result=await tool("battle_action").execute("b-cap",{});
  expect(called).toBe(0);expect(textOf(result)).toContain("not executed");
  expect(server.posts.length).toBeLessThanOrEqual(AUTO_ADVANCE_LIMITS.presses);
 }
});

it("battle readiness is append-only, default OFF for historical presets and dependent on native text advancing",()=>{
 const id="battle-decision-ready-v1" as const;
 expect(SWITCHABLE_FEATURES.at(134)).toBe(id);
 expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-6)).toBe(id);
 expect(featureInfo(id)).toMatchObject({needs:ID,group:"guidance"});
 const flags=flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false});
 expect(flags[id]).toBe(false);
 const legacy=Object.fromEntries(Object.entries(flags).filter(([key])=>key!==id)) as Omit<FeatureSet,typeof id>;
 expect(normalizeFeatures(legacy)[id]).toBe(false);
 expect(dependencyProblems({...flags,[id]:true})).toContain(`${id} needs ${ID}`);
});

it("production battle readiness waits for the operator pause gate before automatic inputs",async()=>{
 const ready={...ON,"battle-decision-ready-v1":true} as FeatureSet;
 const server=new ScriptServer([WAITING,BUSY,INPUT],[]),source=new StateWatcher(URL_BASE,server.fetch),rec=memoryRecorder(),clock=fakeClock();
 let resume:()=>void=()=>{throw new Error("gate not installed");};
 const paused=new Promise<void>(resolve=>{resume=resolve;});let gates=0;
 const base=[observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},server.fetch,clock)];
 const tools=playGameTools(base,ready,source,rec.api,()=>{gates++;return paused;});
 const observe=tools.find(t=>t.name==="observe");if(observe===undefined)throw new Error("observe missing");
 const result=observe.execute("paused-readiness",{});
 await new Promise<void>(resolve=>setImmediate(resolve));
 expect(gates).toBeGreaterThan(0);expect(server.posts).toEqual([]);expect(rec.advances()).toEqual([]);
 resume();await result;
 expect(server.posts.map(p=>p.button)).toEqual(["B"]);
 expect(server.now.battle?.text_phase).toBe("input");
});


it.each(["observe","battle_action"] as const)("battle settling preserves an intermediate whiteout notice for %s",async name=>{
 const notice="Whited out: your party had no usable Pokémon left; money halved: ₽3000 → ₽1500.";
 const receipt={frame:81,money_before:3000,notice};
 const recovery={...fieldMessage("You should rest your POKéMON.",true),blackout_receipt:receipt};
 const server=new ScriptServer([WAITING,recovery,FIELD],[]);
 server.readout=state=>`Screen: ${state.screen}${state.blackout_receipt===undefined?"":`\n${state.blackout_receipt.notice}`}`;
 const action:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>{throw new Error("queued action must not execute across battle end");}};
 const ready={...ON,"battle-decision-ready-v1":true} as FeatureSet;
 const {tool}=wire(server,ready,[action]);
 const result=await tool(name).execute("whiteout-ready",{});
 expect(textOf(result)).toContain(notice);
 expect(stateOfResult(result).blackout_receipt).toEqual(receipt);
 expect(server.posts.map(p=>p.button)).toEqual(["B","B"]);
});

describe("pending-field-dialogue-v1",()=>{
 const recorded=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pending-field-dialogue-97a0.json.gz",import.meta.url))).toString("utf8")) as {state:unknown};
 const waiting=parseGameState(recorded.state);
 const free=parseGameState({...Object.fromEntries(Object.entries(waiting).filter(([key])=>key!=="raw_ram")),field_controls_locked:false,world_context:{...waiting.world_context,objects:waiting.world_context?.objects??[],triggers:[],dialogue:null,message:null}});
 const enabled={...ON,"battle-decision-ready-v1":true,"pending-field-dialogue-v1":true} as FeatureSet;
 it("advances the recorded trainer intro on observe and records the whole page",async()=>{
  const server=new ScriptServer([waiting,free],[]);
  const {tool,rec}=wire(server,enabled);
  const result=await tool("observe").execute("late-field",{});
  expect(server.posts).toEqual([{button:"B",phase:"field_waiting"}]);
  expect(stateOfResult(result).field_controls_locked).toBe(false);
  expect(textOf(result)).toContain(waiting.world_context?.dialogue);
  expect(rec.advances()).toMatchObject([{tool:"observe",stop:"field_free",auto_presses:1,pages:[{text:waiting.world_context?.dialogue}]}]);
  expect(()=>checkEvent(rec.advances()[0])).not.toThrow();
 });
 it.each(["field","battle"] as const)("settles pending field dialogue before battle_action and leaves the %s boundary to a new decision",async boundary=>{
  const server=new ScriptServer([waiting,boundary==="battle"?INPUT:free],[]);
  let called=0;
  const action:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>{called++;return Promise.resolve({content:[{type:"text",text:"Battle action: nothing pressed: no battle is in progress."}],details:{state:server.now,battle_action:{refused:true}}});}};
  const {tool,rec}=wire(server,enabled,[action]);
  const result=await tool("battle_action").execute("late-action",{});
  expect(called).toBe(0);
  expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(textOf(result)).toContain("Battle action: requested action not executed; inspect the decision reached after advancing field dialogue.");
  expect(rec.advances()).toMatchObject([{tool:"battle_action",auto_presses:1,stop:boundary==="battle"?"battle_input":"field_free"}]);
  expect(stateOfResult(result).in_battle).toBe(boundary==="battle");
 });
 it("works without battle text advancing or battle readiness enabled",async()=>{
  const server=new ScriptServer([waiting,free],[]);
  const {tool,rec}=wire(server,{...enabled,"battle-text-auto-advance-v1":false,"battle-decision-ready-v1":false});
  await tool("observe").execute("field-only",{});
  expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(rec.advances()).toMatchObject([{stop:"field_free",auto_presses:1}]);
 });
 it("describes and settles field dialogue on battle_action without claiming disabled battle-text advancing",async()=>{
  const server=new ScriptServer([waiting,free],[]);
  let called=0;
  const action:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>{called++;throw new Error("stale action must not execute");}};
  const {tool,rec}=wire(server,{...enabled,"battle-text-auto-advance-v1":false,"battle-decision-ready-v1":false},[action]);
  const battle=tool("battle_action");
  expect(battle.description).toContain("Pending ordinary field dialogue advances first");
  expect(battle.description).not.toContain("If the battle then runs its own text");
  await battle.execute("field-only-action",{});
  expect(called).toBe(0);expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(rec.advances()).toMatchObject([{tool:"battle_action",stop:"field_free",auto_presses:1}]);
 });
 it("stops at a menu reached after dialogue without choosing its highlighted option",async()=>{
  const menu={...free,active_ui:{phase:"yes_no",selected:"YES",ready:true,controls:"A chooses",diagnostic:null,value:null}};
  const server=new ScriptServer([waiting,menu],[]);
  const {tool,rec}=wire(server,enabled);
  await tool("observe").execute("field-menu",{});
  expect(server.posts.map(p=>p.button)).toEqual(["B"]);
  expect(rec.advances()).toMatchObject([{stop:"menu"}]);
 });
 it("leaves unknown field locks alone",async()=>{
  const server=new ScriptServer([{...free,field_controls_locked:true},free],[]);
  const {tool,rec}=wire(server,enabled);
  await tool("observe").execute("unknown",{});
  expect(server.posts).toEqual([]);expect(rec.advances()).toEqual([]);
 });
 it("honors the existing automatic press cap on an unchanged waiting message",async()=>{
  const server=new ScriptServer([waiting],[]);
  const {tool,rec}=wire(server,enabled);
  await tool("observe").execute("capped",{});
  expect(server.posts).toHaveLength(AUTO_ADVANCE_LIMITS.presses);
  expect(rec.advances()).toMatchObject([{stop:"press_cap",auto_presses:AUTO_ADVANCE_LIMITS.presses}]);
 });
 it("the production factory honors ON/OFF and records pages and input attribution",async()=>{
  const root=mkdtempSync(join(tmpdir(),"pending-field-factory-"));
  try{
   let server=new ScriptServer([waiting,free],[]);
   const log=RunLog.create(root,"production"),recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(server.now)}});
   await recorder.start(RUN_START_META);
   for(const on of [false,true]){
    server=new ScriptServer([waiting,free],[]);
    const watcher=new StateWatcher(URL_BASE,server.fetch);
    const base=[observeTool(URL_BASE,server.fetch),pressTool(URL_BASE,{beforePress:(id,buttons,timing,before)=>{recorder.buttonPress(id,buttons,timing,before);},afterPress:()=>recorder.afterPress()},server.fetch,{now:()=>0,sleep:()=>Promise.resolve()})];
    const tools=playGameTools(base,{...enabled,"pending-field-dialogue-v1":on},watcher,recorder);
    const tool=tools.find(t=>t.name==="observe");if(tool===undefined)throw new Error("observe missing");
    const result=await tool.execute(on?"factory-on":"factory-off",{});
    expect(server.posts.map(p=>p.button)).toEqual(on?["B"]:[]);
    expect(stateOfResult(result).field_controls_locked).toBe(!on);
   }
   recorder.end("budget");
   const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
   expect(events.filter(e=>e.type==="button_press")).toMatchObject([{tool_call_id:"factory-on",buttons:["B"]}]);
   expect(events.filter(e=>e.type==="dialogue_auto_advance")).toMatchObject([{tool_call_id:"factory-on",tool:"observe",stop:"field_free",pages:[{text:waiting.world_context?.dialogue}]}]);
  }finally{rmSync(root,{recursive:true,force:true});}
 });
 it("is appended, agent-only, default OFF and requires field dialogue auto advance",()=>{
  const id="pending-field-dialogue-v1";
  expect(SWITCHABLE_FEATURES.at(175)).toBe(id);
  expect(FEATURES.filter(f=>f.switchable).at(175)?.id).toBe(id);
  expect(playHarnessFeatures(withoutFrontierTreatments({...ALL_ON,[id]:true}),null).at(-1)).toBe(id);
  expect(featureInfo(id)).toMatchObject({needs:"dialogue-auto-advance-v1",group:"guidance"});
  expect(SERVER_FEATURES).not.toContain(id);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
  const {[id]:omitted,...historical}=BASE;expect(omitted).toBe(false);
  expect(normalizeFeatures(historical)[id]).toBe(false);
  expect(dependencyProblems({...enabled,"dialogue-auto-advance-v1":false})).toContain(`${id} needs dialogue-auto-advance-v1`);
 });
 it("OFF preserves the observed message and the existing refusal without pressing",async()=>{
  const server=new ScriptServer([waiting,free],[]);
  const action:AgentTool={name:"battle_action",label:"b",description:"choose",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Battle action: nothing pressed: no battle is in progress."}],details:{state:server.now,battle_action:{refused:true}}})};
  const {tool,rec}=wire(server,{...enabled,"pending-field-dialogue-v1":false},[action]);
  const result=await tool("observe").execute("off-observe",{});
  expect(textOf(result)).toBe(`Screen: ${waiting.screen}`);
  expect(stateOfResult(result)).toEqual(waiting);
  expect(textOf(await tool("battle_action").execute("off-action",{}))).toBe("Battle action: nothing pressed: no battle is in progress.");
  expect(server.posts).toEqual([]);expect(rec.advances()).toEqual([]);
 });
});



describe("caught-dex-input-v1 archived registration page",()=>{
 const dex=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/caught-dex-c6c2.json.gz",import.meta.url))).toString("utf8")) as {off:{state:unknown;readout:string};on:{state:unknown;readout:string}};
 it("hands input back to the native A/B page instead of waiting on a busy battle",async()=>{
  const off=parseGameState(dex.off.state),on=parseGameState(dex.on.state);
  expect(battleEngaged(off)).toBe(true);expect(classifyBattle(off)).toEqual({kind:"wait"});
  expect(battleEngaged(on)).toBe(false);expect(classifyBattle(on)).toMatchObject({kind:"stop",stop:"menu",detail:expect.stringContaining("pokedex_caught_entry") as string});
  expect(dex.on.readout).toContain("A or B closes the registration page");
  const server=new ScriptServer([on],[]);server.readout=()=>dex.on.readout;
  const {tool}=wire(server,{...ON,"caught-dex-input-v1":true});
  const observed=await tool("observe").execute("dex-observe",{});
  expect(textOf(observed)).toContain("A or B closes the registration page");
  await tool("press").execute("dex-close",{buttons:["A"]});
  expect(server.posts).toEqual([{button:"A",phase:"other"}]);
  expect(server.battlePaths()).not.toContain("/pokebench/battle/wait");
 });
});


it("registers caught-dex-input-v1 default OFF and enables only the fixed bundle arms",()=>{
 const id="caught-dex-input-v1";
 expect(SWITCHABLE_FEATURES.at(184)).toBe(id);expect(SERVER_FEATURES.at(-17)).toBe(id);
 expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[id]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
 expect(serverFeatureEnvForDex(false)).toContain(id);expect(serverFeatureEnvForDex(true)).not.toContain(id);
 for(const name of ["bundle-v-control","bundle-cook-1h"]){
  const raw=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(raw.base.features[id]).toBe(false);expect(raw.switches).toContain(id);
 }
});
function serverFeatureEnvForDex(on:boolean):string[]{return serverFeatureEnv({...ALL_ON,"caught-dex-input-v1":on}).POKEBENCH_FEATURES_OFF.split(",");}
