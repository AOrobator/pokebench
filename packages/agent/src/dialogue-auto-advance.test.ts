import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {AUTO_ADVANCE_LIMITS,DialogueRecord,withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {gameTools,isCheckedPress,observeTool,pressTool,type CheckedPressTool,type Clock} from "./game-tools.js";
import {withNavigation} from "./navigation.js";
import {playGameTools} from "./play-wiring.js";
import {flagFeatures} from "./play-preset.js";
import {playSystemPrompt,playTools,toolSwitches} from "./play-config.js";
import {dependencyProblems,featureInfo,playHarnessFeatures,stateOnlyProblems,ALL_ON,type FeatureSet} from "./features.js";
import {checkEvent,type Button,type RunEvent} from "./events.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META,IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";

const URL_BASE="http://127.0.0.1";
const BASE:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true};
const ON:FeatureSet={...BASE,"dialogue-auto-advance-v1":true};
const OFF:FeatureSet={...BASE,"dialogue-auto-advance-v1":false};
const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
const DIRECTIONS=new Set(["UP","DOWN","LEFT","RIGHT"]);

type Then="free"|"yesno"|"locked"|"long-lock"|"battle"|"naming"|"endless"|"second";
interface Convo{readonly text:string;readonly ends:readonly number[];readonly then:Then;readonly phases?:readonly ("page_wait"|"scroll_wait"|"button_wait"|"dismiss_wait")[]}
const SCIENTIST:Convo={text:"If you use a PC, you can store items\nand POKéMON.\nThe power of science is staggering!",ends:[50,85],then:"free"};
const ID=(text:string)=>Buffer.from(text).toString("hex").padEnd(64,"0").slice(0,64);

// A game server that prints each page over several reads and only accepts A/B once a page waits.
class FakeGame{
 posts:{buttons:Button[];phase:string|null}[]=[];reads=0;opened=0;
 place:{location:string;map_id:[number,number];location_display?:string}={location:"LITTLEROOT TOWN PROFESSOR BIRCHS LAB",map_id:[1,4]};
 private mode:"free"|"message"|"yesno"|"locked"|"battle"|"naming"="free";
 private convo:Convo|null=null;private page=0;private printing=0;private locked=0;private position={x:13,y:14};private facing="right";
 constructor(private readonly npc:Convo,private readonly printReads=2,private readonly lockReads=3){}
 openNow(){this.open();}
 private open(){this.convo=this.npc;this.mode="message";this.page=0;this.printing=this.printReads;this.opened++;}
 private close(){
  const then=this.convo?.then??"free";
  if(then==="yesno"){this.mode="yesno";return;}
  if(then==="locked"){this.mode="locked";this.locked=this.lockReads;return;}
  if(then==="long-lock"){this.mode="locked";this.locked=1_000_000;return;}
  if(then==="battle"){this.mode="battle";return;}
  if(then==="naming"){this.mode="naming";return;}
  if(then==="second"){this.convo={text:"MOM: And be careful!",ends:[20],then:"free"};this.page=0;this.printing=this.printReads;return;}
  this.mode="free";this.convo=null;
 }
 private phase():string|null{
  if(this.mode!=="message"||this.convo===null)return null;
  if(this.printing>0)return "printing";
  return this.convo.phases?.[this.page]??(this.page===this.convo.ends.length-1?"button_wait":"page_wait");
 }
 press(buttons:Button[]){
  for(const b of buttons){
   this.posts.push({buttons:[b],phase:this.phase()});
   if(this.mode==="free"){
    if(b==="A"&&this.facing==="right"&&this.position.x===13)this.open();
    else if(DIRECTIONS.has(b)){this.facing=b.toLowerCase();if(b==="LEFT")this.position={...this.position,x:this.position.x-1};if(b==="RIGHT"&&this.position.x<13)this.position={...this.position,x:this.position.x+1};}
   }else if(this.mode==="message"&&(b==="A"||b==="B")&&this.printing===0&&this.convo!==null){
    if(this.convo.then==="endless"&&this.page===this.convo.ends.length-1){this.page=0;this.printing=this.printReads;continue;}
    this.page++;
    if(this.page>=this.convo.ends.length)this.close();else this.printing=this.printReads;
   }else if(this.mode==="yesno"&&b==="A"){this.mode="free";this.convo=null;}
  }
 }
 tick(){
  this.reads++;
  if(this.mode==="message"&&this.printing>0)this.printing--;
  else if(this.mode==="locked"&&--this.locked<=0)this.mode="free";
 }
 state():GameStateSnapshot{
  const npc={local_id:2,map_id:[0,9] as [number,number],graphics_id:17,sprite_kind:"SCIENTIST_1",x:14,y:14};
  const base:GameStateSnapshot={...IN_GAME,...this.place,position:this.position,facing:this.facing,active_ui:null,naming:null,field_controls_locked:false,
   interaction_targets:[{kind:"object",x:14,y:14,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:2,destination:null,name:"SCIENTIST_1"}],
   world_context:{objects:[npc],triggers:[],dialogue:null,message:null}};
  const c=this.convo;
  if(this.mode==="message"&&c!==null){
   const phase=this.phase()??"printing";const end=c.ends[this.page]??c.text.length;
   return {...base,field_controls_locked:true,world_context:{objects:[npc],triggers:[],dialogue:c.text,message:{phase:phase as "printing",cursor:phase==="printing"?Math.max(0,end-10):end,ready:phase!=="printing",identity:ID(c.text)}}};
  }
  if(this.mode==="yesno")return {...base,field_controls_locked:true,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"Directions select; A chooses; B cancels",diagnostic:null,details:{options:["YES","NO"],selected_index:0}},world_context:{objects:[npc],triggers:[],dialogue:"Will you help me?",message:null}};
  if(this.mode==="locked")return {...base,field_controls_locked:true};
  if(this.mode==="battle")return {...base,screen:"battle",in_battle:true,field_controls_locked:null};
  if(this.mode==="naming")return {...base,screen:"naming",naming:{text:"",page:"uppercase",column:0,row:0,key:"A",ready:true},active_ui:{phase:"naming_editor",selected:"A",ready:true,controls:"",diagnostic:null}};
  return base;
 }
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");const sent=JSON.parse(init.body) as {buttons:Button[]};this.press(sent.buttons);body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation")){this.tick();const s=this.state();body={state_text:`Location: ${s.location??""}\nDialog: ${s.world_context?.dialogue??"none"}`,screenshot_base64:png,state:s};}
  else if(url.endsWith("/pokebench/state")){this.tick();body=this.state();}
  else throw new Error(`Unexpected request ${url}`);
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 read={read:()=>{this.tick();return Promise.resolve(this.state());}};
}

function fakeClock():Clock&{t:number}{const c={t:0,now:()=>c.t,sleep:(ms:number)=>{c.t+=ms;return Promise.resolve();}};return c;}
function memoryRecorder(){
 const events:RunEvent[]=[];const subs:((e:RunEvent)=>void)[]=[];let seq=0;
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-10-15T12:00:00.000-04:00",turn:7,...body} as RunEvent;events.push(e);for(const s of subs)s(e);return {seq:e.seq,turn:7};};
 const api:AutoAdvanceRecorder&{lowHpTrainerWarning:()=>void}={lowHpTrainerWarning:()=>undefined,recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:o=>{subs.push(o);}};
 return {events,api,advances:()=>events.filter((e):e is Extract<RunEvent,{type:"dialogue_auto_advance"}>=>e.type==="dialogue_auto_advance")};
}
function wire(game:FakeGame,features:FeatureSet=ON,clock=fakeClock()){
 const rec=memoryRecorder();
 const base=[observeTool(URL_BASE,game.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()})];
 const tools=withDialogueAutoAdvance(base,features,{state:game.read,recorder:rec.api,clock});
 const tool=(name:string):AgentTool=>{const t=tools.find(x=>x.name===name);if(t===undefined)throw new Error(`missing ${name}`);return t;};
 return {tools,tool,rec,clock,base};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");

describe("dialogue-auto-advance-v1 press path",()=>{
 it("reads a multi-page line to the end with B, waiting out printing, and lists each page with its speaker",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool,rec}=wire(game);
  const result=await tool("press").execute("c1",{buttons:["A"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","B","B"]);
  expect(game.posts.slice(1).every(p=>p.phase!=="printing"&&p.phase!==null)).toBe(true);
  const text=textOf(result);
  expect(text.split("\n")[0]).toBe("pressed A");
  expect(text).toContain("Dialogue auto-advance: the harness pressed B 2 times");
  expect(text).toContain("conversation closed and field controls are free");
  expect(text).toContain("Dialogue shown during this call (2 pages, in order, whole):");
  expect(text).toContain(`1. turn 7 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 13,14 · SCIENTIST_1 (sprite kind, not a name): "If you use a PC, you can store items\nand POKéMON."`);
  expect(text).toContain(`2. turn 7 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 13,14 · SCIENTIST_1 (sprite kind, not a name): "The power of science is staggering!"`);
  expect(text).not.toContain("remaining input");
  expect(result.content[0]?.type).toBe("image");
  const [event]=rec.advances();
  expect(event).toMatchObject({tool:"press",tool_call_id:"c1",requested:["A"],sent:["A"],dropped:[],auto_presses:2,stop:"field_free"});
  expect(event?.pages.map(p=>[p.speaker,p.speaker_source,p.text])).toEqual([["SCIENTIST_1","faced_sprite","If you use a PC, you can store items\nand POKéMON."],["SCIENTIST_1","faced_sprite","The power of science is staggering!"]]);
  expect(event?.pages.every(p=>typeof p.state_seq==="number")).toBe(true);
  expect(()=>checkEvent(event)).not.toThrow();
 });

 it("displayed-place-names-v1: page headers and the map filter use the displayed name; identity keeps the source name",async()=>{
  // Cook #2 (2026-10-16T02-23-17_qwen36-gpu1_sh02) seq 2378: the Location line said PROF. BIRCH'S HOUSE 1F while every page said MAYS HOUSE.
  const game=new FakeGame(SCIENTIST);game.place={location:"LITTLEROOT TOWN MAYS HOUSE 1F",map_id:[1,2],location_display:"PROF. BIRCH'S HOUSE 1F"};
  const {tool,rec}=wire(game);
  const text=textOf(await tool("press").execute("n1",{buttons:["A"]}));
  expect(text).toContain(`1. turn 7 · PROF. BIRCH'S HOUSE 1F (map 1/2) · at 13,14`);
  expect(text.split("\n").filter(l=>/^\d+\. turn /.test(l)).join("\n")).not.toContain("MAYS HOUSE");
  const [event]=rec.advances();
  expect(event?.pages.map(p=>[p.map,p.map_display])).toEqual([["LITTLEROOT TOWN MAYS HOUSE 1F","PROF. BIRCH'S HOUSE 1F"],["LITTLEROOT TOWN MAYS HOUSE 1F","PROF. BIRCH'S HOUSE 1F"]]);
  expect(()=>checkEvent(event)).not.toThrow();
  const recall=textOf(await tool("get_dialogue").execute("g",{map:"birch's house"}));
  expect(recall).toContain("2 of 2 pages match");expect(recall).not.toContain("MAYS HOUSE");
 });

 it("displayed-place-names-v1 off: pages carry no displayed name and headers keep the source name",async()=>{
  const game=new FakeGame(SCIENTIST);game.place={location:"LITTLEROOT TOWN MAYS HOUSE 1F",map_id:[1,2]};
  const {tool,rec}=wire(game);
  const text=textOf(await tool("press").execute("n2",{buttons:["A"]}));
  expect(text).toContain(`1. turn 7 · LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2) · at 13,14`);
  expect(rec.advances()[0]?.pages.every(p=>!("map_display" in p))).toBe(true);
 });

 it("stops an A batch from re-opening the conversation: leftover inputs are not sent",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool,rec}=wire(game);
  const result=await tool("press").execute("c2",{buttons:["A","A","A","A","A","A","A","A"]});
  expect(game.opened).toBe(1);
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","B","B"]);
  expect(textOf(result)).toContain("dialogue closed; 7 remaining inputs not sent: A, A, A, A, A, A, A.");
  expect(rec.advances()[0]).toMatchObject({requested:["A","A","A","A","A","A","A","A"],sent:["A"],dropped:["A","A","A","A","A","A","A"]});
 });

 it("records the page already waiting when the call begins, then continues the conversation",async()=>{
  const game=new FakeGame(SCIENTIST,0);game.openNow();const {tool,rec}=wire(game);
  const result=await tool("press").execute("c3",{buttons:["B","B","B"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["B","B"]);
  expect(rec.advances()[0]?.pages.map(p=>p.text)).toEqual(["If you use a PC, you can store items\nand POKéMON.","The power of science is staggering!"]);
  expect(textOf(result)).toContain("dialogue closed; 2 remaining inputs not sent: B, B.");
 });

 it("drops the rest of a batch that started in a conversation, so a B never reaches the YES/NO it opened",async()=>{
  const game=new FakeGame({text:"Will you help me?",ends:[17],then:"yesno"},0);game.openNow();const {tool,rec}=wire(game);
  const result=await tool("press").execute("y",{buttons:["B","B"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["B"]);
  const [event]=rec.advances();
  expect(event).toMatchObject({stop:"menu",auto_presses:0,sent:["B"],dropped:["B"]});
  expect(event?.pages.map(p=>p.text)).toEqual(["Will you help me?"]);
  expect(textOf(result)).toContain("remaining input not sent: B.");
 });

 it("keeps the recorded position across a failed state read and a navigate_to that opens no dialogue",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"endless"});const rec=memoryRecorder();const clock=fakeClock();
  const reads=game.read.read;let fail=false;
  const state={read:()=>{if(fail){fail=false;return Promise.reject(new Error("read failed"));}return reads();}};
  const nav:AgentTool={name:"navigate_to",label:"n",description:"walk",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Navigation: blocked"}],details:{state:{...game.state(),world_context:{objects:[],triggers:[],dialogue:null,message:null},active_ui:{phase:"start_menu",selected:null,ready:true,controls:"",diagnostic:null,details:null}}}})};
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,game.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()}),nav],ON,{state,recorder:rec.api,clock});
  const tool=(name:string):AgentTool=>{const x=tools.find(y=>y.name===name);if(x===undefined)throw new Error(name);return x;};
  await tool("press").execute("k1",{buttons:["A"]});
  await tool("navigate_to").execute("n",{});
  fail=true;
  await tool("press").execute("k2",{buttons:["B"]});
  const [first,second]=rec.advances();
  expect(first?.pages.at(-1)?.text).toBe("If you use a PC, you can store items\nand POKéMON.");
  expect(second?.pages[0]?.text).toBe("The power of science is staggering!");
 });

 it("treats a message the last call left open as dialogue when the next before-read fails",async()=>{
  const game=new FakeGame({text:"Will you help me?",ends:[17],then:"yesno"},0);game.openNow();const rec=memoryRecorder();const clock=fakeClock();
  const reads=game.read.read;let fail=false;
  const state={read:()=>{if(fail){fail=false;return Promise.reject(new Error("read failed"));}return reads();}};
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,game.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()})],ON,{state,recorder:rec.api,clock});
  const press=tools.find(x=>x.name==="press");if(press===undefined)throw new Error("press");
  await press.execute("q1",{buttons:["UP"]});
  game.posts.length=0;fail=true;
  await press.execute("q2",{buttons:["B","B"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["B"]);
  expect(rec.advances().at(-1)).toMatchObject({stop:"menu",dropped:["B"]});
 });

 it("does not repeat a capped page when navigate_to returns that message still open",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"endless"});const rec=memoryRecorder();const clock=fakeClock();
  const nav:AgentTool={name:"navigate_to",label:"n",description:"walk",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Navigation: refused, a message is waiting"}],details:{state:game.state()}})};
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,game.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()}),nav],ON,{state:game.read,recorder:rec.api,clock});
  const tool=(name:string):AgentTool=>{const x=tools.find(y=>y.name===name);if(x===undefined)throw new Error(name);return x;};
  await tool("press").execute("k1",{buttons:["A"]});
  await tool("navigate_to").execute("n",{});
  const [first,second]=rec.advances();
  expect(first?.pages.at(-1)?.text).toBe("If you use a PC, you can store items\nand POKéMON.");
  expect(second?.tool).toBe("navigate_to");
  expect(second?.pages[0]?.text).toBe("The power of science is staggering!");
 });

 it("keeps the carried page when the model's own press fails, so the retry does not repeat it",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"endless"});const rec=memoryRecorder();const clock=fakeClock();
  let failNext=false;
  const fetchFn:typeof fetch=(input,init)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
   if(failNext&&url.endsWith("/action")){failNext=false;return Promise.resolve(new Response(JSON.stringify({status:"error",message:"emulator busy"}),{status:500}));}
   return game.fetch(input,init);
  };
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,fetchFn),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>clock.t,sleep:()=>Promise.resolve()})],ON,{state:game.read,recorder:rec.api,clock});
  const press=tools.find(x=>x.name==="press");if(press===undefined)throw new Error("press");
  await press.execute("k1",{buttons:["A"]});
  failNext=true;
  await expect(press.execute("k2",{buttons:["B"]})).rejects.toThrow();
  await press.execute("k3",{buttons:["B"]});
  const events=rec.advances();
  expect(events.at(-1)?.tool_call_id).toBe("k3");
  expect(events.at(-1)?.pages[0]?.text).toBe("The power of science is staggering!");
 });

 it("confirms free field only on a later frame, and says so when the frame never advances",async()=>{
  const framed=(frame:number,s:GameStateSnapshot):GameStateSnapshot=>({...s,raw_ram:{v:1,sequence:frame,frame,path:`raw-ram/${String(frame).padStart(8,"0")}.json.gz`,sha256:"0".repeat(64)}});
  const stuck=new Scripted([framed(1,MSG("page_wait")),framed(2,MSG("page_wait")),framed(5,FREE)]);
  const a=scriptedTools(stuck);await a.press.execute("s1",{buttons:["A"]});
  const [stale]=a.rec.advances();
  expect(stale?.stop).toBe("field_free");expect(stale?.detail).toContain("did not reach a later frame");
  const moving=new Scripted([framed(1,MSG("page_wait")),framed(2,MSG("page_wait")),framed(5,FREE),framed(6,FREE)]);
  const b=scriptedTools(moving);await b.press.execute("s2",{buttons:["A"]});
  const [confirmed]=b.rec.advances();
  expect(confirmed?.stop).toBe("field_free");expect(confirmed?.detail).toBe("the conversation closed and field controls are free");
 });

 it("does not repeat the page an earlier capped call already recorded",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"endless"});const {tool,rec}=wire(game);
  await tool("press").execute("k1",{buttons:["A"]});
  await tool("press").execute("k2",{buttons:["B"]});
  const [first,second]=rec.advances();
  expect(first?.stop).toBe("press_cap");expect(second?.stop).toBe("press_cap");
  expect(first?.pages.at(-1)?.text).toBe("If you use a PC, you can store items\nand POKéMON.");
  expect(second?.pages[0]?.text).toBe("The power of science is staggering!");
 });


 it("stops at a YES/NO question, names the options and the highlighted one, and keeps the question page",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"yesno"});const {tool,rec}=wire(game);
  const result=await tool("press").execute("c4",{buttons:["A","A"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","B","B"]);
  const text=textOf(result);
  expect(text).toContain("stopped: menu field_yes_no is open: options YES, NO; highlighted YES");
  expect(text).toContain("dialogue reached a decision point; 1 remaining input not sent: A.");
  expect(rec.advances()[0]?.stop).toBe("menu");
  expect(rec.advances()[0]?.pages.at(-1)?.text).toBe("Will you help me?");
 });

 it("waits out a short scripted lock after the message, then returns with field control",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"locked"});const {tool,rec}=wire(game);
  await tool("press").execute("c5",{buttons:["A"]});
  expect(rec.advances()[0]?.stop).toBe("field_free");
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","B","B"]);
 });

 it("returns loudly from a cutscene that keeps controls locked with no message",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"long-lock"});const {tool,rec,clock}=wire(game);
  const result=await tool("press").execute("c6",{buttons:["A"]});
  expect(rec.advances()[0]?.stop).toBe("locked_no_message");
  expect(textOf(result)).toContain(`field controls stayed locked with no message for ${String(AUTO_ADVANCE_LIMITS.waitMs/1000)} s`);
  expect(clock.t).toBeGreaterThanOrEqual(AUTO_ADVANCE_LIMITS.waitMs);
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","B","B"]);
 });

 it("caps automatic presses per call and does not claim unshown pages",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"endless"});const {tool,rec}=wire(game);
  const result=await tool("press").execute("c7",{buttons:["A"]});
  const event=rec.advances()[0];
  expect(event?.stop).toBe("press_cap");expect(event?.auto_presses).toBe(AUTO_ADVANCE_LIMITS.presses);
  expect(game.posts).toHaveLength(AUTO_ADVANCE_LIMITS.presses+1);
  expect(textOf(result)).toContain(`AUTO-ADVANCE CAP: stopped after ${String(AUTO_ADVANCE_LIMITS.presses)} automatic presses; the message is still open`);
  expect(event?.pages.length).toBe(AUTO_ADVANCE_LIMITS.presses+1);
 });

 it("caps wall time per call across many slow pages",async()=>{
  const game=new FakeGame({...SCIENTIST,then:"endless"},40);const {tool,rec,clock}=wire(game);
  const result=await tool("press").execute("c7b",{buttons:["A"]});
  expect(rec.advances()[0]?.stop).toBe("time_cap");
  expect(clock.t).toBeGreaterThanOrEqual(AUTO_ADVANCE_LIMITS.callMs);
  expect(textOf(result)).toContain(`AUTO-ADVANCE CAP: stopped after ${String(AUTO_ADVANCE_LIMITS.callMs/1000)} s`);
 });

 it("returns loudly when a message never becomes ready",async()=>{
  const game=new FakeGame(SCIENTIST,1_000_000);const {tool,rec}=wire(game);
  const result=await tool("press").execute("c8",{buttons:["A"]});
  expect(rec.advances()[0]?.stop).toBe("message_not_ready");
  expect(textOf(result)).toContain("message stayed printing or waiting without accepting input");
  expect(rec.advances()[0]?.pages).toEqual([]);
 });

 it("stops when a battle starts or the naming screen opens",async()=>{
  for(const [then,stop] of [["battle","battle"],["naming","naming"]] as const){
   const game=new FakeGame({...SCIENTIST,then});const {tool,rec}=wire(game);
   await tool("press").execute("c9",{buttons:["A","A"]});
   expect(rec.advances()[0]?.stop).toBe(stop);
   expect(rec.advances()[0]?.pages).toHaveLength(2);
  }
 });

 it("takes the speaker from the game's NAME: prefix and carries it over the following message",async()=>{
  const game=new FakeGame({text:"MOM: Welcome home, dear!\nDad is at the GYM.",ends:[25,44],then:"second"});const {tool,rec}=wire(game);
  const result=await tool("press").execute("c10",{buttons:["A"]});
  expect(rec.advances()[0]?.pages.map(p=>[p.speaker,p.speaker_source,p.text])).toEqual([["MOM","name_prefix","MOM: Welcome home, dear!"],["MOM","name_prefix","Dad is at the GYM."],["MOM","name_prefix","MOM: And be careful!"]]);
  expect(textOf(result)).toContain(`· MOM: "MOM: Welcome home, dear!"`);
 });

 it("lets a free-field walking batch through whole and leaves results byte-identical when no dialogue opens",async()=>{
  const game=new FakeGame(SCIENTIST);const on=wire(game);
  const plain=new FakeGame(SCIENTIST);const off=wire(plain,OFF);
  const a=await on.tool("press").execute("w",{buttons:["LEFT","LEFT"]});
  const b=await off.tool("press").execute("w",{buttons:["LEFT","LEFT"]});
  expect(textOf(a)).toBe(textOf(b));
  expect(game.posts.map(p=>p.buttons)).toEqual([["LEFT"],["LEFT"]]);
  expect(on.rec.advances()).toEqual([]);
 });

 it("advances a conversation already open when the model presses a direction",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool}=wire(game);
  game.openNow();
  const before=game.posts.length;
  await tool("press").execute("w2",{buttons:["UP"]});
  expect(game.posts.slice(before).map(p=>p.buttons[0])).toEqual(["UP","B","B"]);
 });
});

describe("dialogue-auto-advance-v1 OFF",()=>{
 it("returns the very same tools, prompt and tool list",()=>{
  const game=new FakeGame(SCIENTIST);const {tools,base,rec}=wire(game,OFF);
  expect(tools).toHaveLength(base.length);tools.forEach((t,i)=>{expect(t).toBe(base[i]);});
  expect(rec.events).toEqual([]);
  const without=Object.fromEntries(Object.entries(OFF).filter(([id])=>id!=="dialogue-auto-advance-v1")) as FeatureSet;
  expect(playSystemPrompt(OFF,null)).toBe(playSystemPrompt({...without,"dialogue-auto-advance-v1":false},null));
  expect(playSystemPrompt(OFF,null)).not.toContain("auto-advance");
  expect(playTools(OFF)).not.toContain("get_dialogue");
  expect(playHarnessFeatures(OFF,null)).not.toContain("dialogue-auto-advance-v1");
 });

 it("leaves an A batch at the scientist exactly as before: every input is sent",async()=>{
  const game=new FakeGame(SCIENTIST,0);const {tool}=wire(game,OFF);
  const result=await tool("press").execute("o",{buttons:["A","A","A","A"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","A","A","A"]);
  expect(textOf(result).split("\n")[0]).toBe("pressed A, A, A, A");
  expect(textOf(result)).not.toContain("Dialogue auto-advance");
 });
});

describe("navigate_to and the dialogue record",()=>{
 const tile=(x:number,y:number)=>({x,y,collision:0,behavior:0,elevation:3});
 it("advances dialogue that navigate_to ends in",async()=>{
  const game=new FakeGame(SCIENTIST);const clock=fakeClock();const rec=memoryRecorder();
  const grid=(s:GameStateSnapshot):GameStateSnapshot=>({...s,navigation_grid:{elevation:3,tiles:[tile(12,14),tile(13,14)],objects:[],warps:[]}});
  const source={read:async()=>grid(await game.read.read())};
  let armed=true;
  const fetchFn:typeof fetch=async(input,init)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;const r=await game.fetch(input,init);
   if(url.endsWith("/action")&&armed&&game.state().position?.x===13){armed=false;game.openNow();}
   if(url.endsWith("/pokebench/state"))return new Response(JSON.stringify(grid(await r.json() as GameStateSnapshot)));
   if(url.endsWith("/pokebench/observation")){const body=await r.json() as {state:GameStateSnapshot};return new Response(JSON.stringify({...body,state:grid(body.state)}));}
   return r;
  };
  game.press(["LEFT"]);
  const base=[observeTool(URL_BASE,fetchFn),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})];
  const tools=withDialogueAutoAdvance(withNavigation(base,{...ON,"bounded-navigation-v1":true},source),{...ON,"bounded-navigation-v1":true},{state:source,recorder:rec.api,clock});
  const nav=tools.find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("nav");
  expect(nav.description).toContain("dialogue advances automatically");
  const result=await nav.execute("n1",{x:13,y:14,map_id:[1,4]});
  expect(textOf(result).split("\n")[0]).toMatch(/^Navigation: /);
  expect(textOf(result)).toContain("Dialogue shown during this call (2 pages");
  expect(rec.advances()[0]).toMatchObject({tool:"navigate_to",requested:[],sent:[],dropped:[],stop:"field_free"});
  expect(result.details).toMatchObject({navigation:{target:{x:13,y:14}}});
 });

 it("leaves a navigate_to result alone when no dialogue opens",async()=>{
  const game=new FakeGame(SCIENTIST);const rec=memoryRecorder();
  const result={content:[{type:"text" as const,text:"Navigation: arrived"}],details:{state:game.state()}};
  const nav:AgentTool={name:"navigate_to",label:"n",description:"walk",parameters:Type.Object({}),execute:()=>Promise.resolve(result)};
  const press=pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch);
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,game.fetch),press,nav],ON,{state:game.read,recorder:rec.api});
  expect(await tools.find(t=>t.name==="navigate_to")?.execute("n",{})).toBe(result);
 });

 it("get_dialogue returns whole pages newest first, filtered by speaker, words, map and count",async()=>{
  const log=new DialogueRecord();
  const page=(text:string,speaker:string|null,map:string|null)=>({state_seq:3,map,map_id:map===null?null:[1,4] as [number,number],position:{x:1,y:2},speaker,speaker_source:speaker===null?null:speaker==="MOM"?"name_prefix" as const:"faced_sprite" as const,text});
  const long="x".repeat(5000);
  log.observe(checkEvent({v:1,run:"r",seq:10,t:"2026-10-15T12:00:00.000-04:00",turn:3,type:"dialogue_auto_advance",tool_call_id:"a",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:2,pages:[page("Hello there","SCIENTIST_1","LAB"),page(long,"SCIENTIST_1","LAB")],stop:"field_free",detail:"closed",duration_ms:5}));
  log.observe(checkEvent({v:1,run:"r",seq:20,t:"2026-10-15T12:00:01.000-04:00",turn:4,type:"dialogue_auto_advance",tool_call_id:"b",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[page("MOM: Go see Birch","MOM","HOUSE"),page("No speaker here",null,null)],stop:"field_free",detail:"closed",duration_ms:5}));
  const all=log.recall({});
  expect(all.indexOf("No speaker here")).toBeLessThan(all.indexOf("Hello there"));
  expect(all).toContain(long);
  expect(all).toContain("4 of 4 pages match");
  expect(log.recall({speaker:"mom"})).toContain(`#20 turn 4 · HOUSE (map 1/4) · at 1,2 · MOM: "MOM: Go see Birch"`);
  expect(log.recall({speaker:"mom"})).not.toContain("Hello there");
  expect(log.recall({contains:"HELLO"})).toContain("1 of 4 pages match");
  expect(log.recall({map:"lab"})).toContain("2 of 4 pages match");
  expect(log.recall({map:"1/4"})).toContain("3 of 4 pages match");
  expect(log.recall({contains:"No speaker"})).toContain(`#20 turn 4 · unknown location · at 1,2: "No speaker here"`);
  expect(log.recall({last:1})).toContain("No speaker here");expect(log.recall({last:1})).not.toContain("MOM: Go");
  expect(log.recall({contains:"zzz"})).toBe("No recorded dialogue matches (4 pages recorded this run).");
  expect(()=>log.recall({last:0})).toThrow("last");
  const tool=log.tool();expect(tool.name).toBe("get_dialogue");
  expect(textOf(await tool.execute("g",{speaker:"MOM"}))).toContain("MOM: Go see Birch");
 });
});

describe("dialogue-auto-advance-v1 registry and production wiring",()=>{
 it("is a default-off guidance switch recorded last that needs the message buffer and phase",()=>{
  expect(featureInfo("dialogue-auto-advance-v1")).toMatchObject({group:"guidance",needs:"active-field-message-buffer-v1",switchable:true});
  expect(featureInfo("dialogue-auto-advance-v1").description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null).at(-30)).toBe("dialogue-auto-advance-v1");
  expect(dependencyProblems({...ON,"field-dialogue-phase-v1":false})).toEqual(["dialogue-auto-advance-v1 needs field-dialogue-phase-v1"]);
  expect(dependencyProblems({...ON,"active-field-message-buffer-v1":false})).toContain("dialogue-auto-advance-v1 needs active-field-message-buffer-v1");
  expect(dependencyProblems({...ON,"dialogue-safe-batches-v1":true})).toEqual([]);
  expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires dialogue-auto-advance-v1 OFF");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["dialogue-auto-advance-v1"]).toBe(false);
 });

 it("composes with safe interface batches: only the first input is sent, then the dialogue advances",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool}=wire(game,{...ON,"dialogue-safe-batches-v1":true});
  const result=await tool("press").execute("s",{buttons:["A","A","A"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","B","B"]);
  expect(textOf(result)).toContain("Interface safety: submitted 1 of 3 requested inputs");
 });

 it("tells the model only when ON",()=>{
  expect(playSystemPrompt(ON,null)).toContain("Dialogue auto-advance:");
  expect(playTools(ON).at(-1)).toBe("get_dialogue");
 });

 it("the production factory wires auto-advance, get_dialogue and recorded events through a real recorder",async()=>{
  const root=mkdtempSync(join(tmpdir(),"pokebench-auto-advance-"));
  try{
   const game=new FakeGame(SCIENTIST);
   const log=RunLog.create(root,"auto-advance");
   const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(game.state())}});
   await recorder.start(RUN_START_META);
   const base=[observeTool(URL_BASE,game.fetch),pressTool(URL_BASE,{beforePress:(id,buttons,timing,before)=>{recorder.buttonPress(id,buttons,timing,before);},afterPress:()=>recorder.afterPress()},game.fetch,{now:()=>0,sleep:()=>Promise.resolve()})];
   const off=playGameTools(base,OFF,game.read,recorder);
   expect(off.map(t=>t.name)).toEqual(["observe","press"]);expect(off[1]).toBe(base[1]);
   const tools=playGameTools(base,ON,game.read,recorder);
   expect(tools.map(t=>t.name)).toEqual(["observe","press","get_dialogue"]);
   expect(tools.map(t=>t.name).filter(n=>n!=="observe"&&n!=="press")).toEqual(playTools(ON).filter(n=>n==="get_dialogue"));
   expect(tools[1]?.description).toContain("Field dialogue advances automatically");
   const press=tools[1];if(press===undefined)throw new Error("press");
   await recorder.emit({type:"tool_execution_start",toolCallId:"p",toolName:"press",args:{buttons:["A","A","A"]}});
   const result=await press.execute("p",{buttons:["A","A","A"]});
   await recorder.emit({type:"tool_execution_end",toolCallId:"p",toolName:"press",result,isError:false});
   const recall=await tools[2]?.execute("g",{});
   expect(recall===undefined?"":textOf(recall)).toContain("The power of science is staggering!");
   recorder.end("budget");
   const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
   expect(events.filter((e):e is Extract<RunEvent,{type:"button_press"}>=>e.type==="button_press").map(e=>[e.tool_call_id,e.buttons])).toEqual([["p",["A"]],["p",["B"]],["p",["B"]]]);
   const advance=events.find(e=>e.type==="dialogue_auto_advance");
   expect(advance).toMatchObject({turn:0,stop:"field_free",dropped:["A","A"]});
   const seqs=advance?.type==="dialogue_auto_advance"?advance.pages.map(p=>p.state_seq):[];
   for(const seq of seqs)expect(events.find(e=>e.seq===seq)?.type).toBe("state");
   expect(events.filter(e=>e.type==="tool_result")).toHaveLength(1);
  }finally{rmSync(root,{recursive:true,force:true});}
 });
});

// Replays a fixed sequence of states, one per read, repeating the last; records every action.
class Scripted{
 posts:Button[][]=[];private i=0;
 constructor(private readonly states:GameStateSnapshot[],private readonly failOn:((buttons:Button[])=>boolean)|null=null){}
 next(){const s=this.states[Math.min(this.i,this.states.length-1)];this.i++;if(s===undefined)throw new Error("no state");return s;}
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");const sent=(JSON.parse(init.body) as {buttons:Button[]}).buttons;this.posts.push(sent);if(this.failOn?.(sent)===true)return Promise.resolve(new Response(JSON.stringify({status:"error",message:"emulator busy"}),{status:500}));body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state_text:"scripted",screenshot_base64:png,state:this.next()};
  else body=this.next();
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 read={read:()=>Promise.resolve(this.next())};
}
const FREE:GameStateSnapshot={...IN_GAME,active_ui:null,naming:null,field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null,message:null}};
const MSG=(phase:"printing"|"page_wait",text="Hello."):GameStateSnapshot=>({...FREE,position:null,facing:null,map_id:null,location:null,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:text,message:{phase,cursor:text.length,ready:phase!=="printing"}}});
function scriptedTools(game:Scripted,features:FeatureSet=ON){
 const rec=memoryRecorder();const clock=fakeClock();
 const tools=withDialogueAutoAdvance([observeTool(URL_BASE,game.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>0,sleep:()=>Promise.resolve()})],features,{state:game.read,recorder:rec.api,clock});
 const press=tools.find(t=>t.name==="press");if(press===undefined)throw new Error("press");
 return {press:press as CheckedPressTool,rec,clock};
}

describe("dialogue-auto-advance-v1 edges",()=>{
 it("sends a whole non-dialogue batch one input at a time and reports it like an ordinary press",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool,rec}=wire(game);
  const result=await tool("press").execute("m",{buttons:["LEFT","A","A"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["LEFT","A","A"]);
  expect(textOf(result).split("\n")[0]).toBe("pressed LEFT, A, A");
  expect(textOf(result)).toContain("Press result:");
  expect(textOf(result)).not.toContain("Dialogue auto-advance");
  expect(rec.advances()).toEqual([]);
 });

 it("applies the caller's before-press check to the first input only, through executeChecked",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool}=wire(game);
  const press=tool("press");if(!isCheckedPress(press))throw new Error("checked");
  await expect(press.executeChecked("k",{buttons:["A"]},()=>{throw new Error("stale");})).rejects.toThrow("stale");
  expect(game.posts).toEqual([]);
  let checks=0;await press.executeChecked("k",{buttons:["A"]},()=>{checks++;});
  expect(checks).toBe(1);expect(game.posts.map(p=>p.buttons[0])).toEqual(["A","B","B"]);
 });

 it("stops with an error note when an automatic press fails, and rethrows when the run is aborted",async()=>{
  const game=new Scripted([FREE,FREE,MSG("page_wait"),MSG("page_wait")],b=>b[0]==="B");const {press,rec}=scriptedTools(game);
  const result=await press.execute("e",{buttons:["A"]});
  expect(rec.advances()[0]).toMatchObject({stop:"error",auto_presses:0});
  expect(textOf(result)).toContain("auto-advance stopped: POST http://127.0.0.1/action failed: emulator busy");
  expect(rec.advances()[0]?.pages.map(p=>[p.text,p.speaker,p.map])).toEqual([["Hello.",null,null]]);
  expect(textOf(result)).toContain(`1. turn 7 · unknown location: "Hello."`);
  const aborted=new Scripted([FREE,FREE,MSG("printing")]);const controller=new AbortController();
  const {press:p2}=scriptedTools(aborted);
  const run=p2.execute("x",{buttons:["A"]},controller.signal);controller.abort();
  await expect(run).rejects.toThrow();
 });

 it("waits out a not-ready interface and a message still initializing, then stops at a screen change",async()=>{
  const transition:GameStateSnapshot={...FREE,screen:"field_transition",field_controls_locked:null,active_ui:{phase:"field_transition",selected:null,ready:false,controls:"",diagnostic:null}};
  const init:GameStateSnapshot={...FREE,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:null,field_activity:{phase:"message_initializing",owner:1}}};
  const game=new Scripted([FREE,FREE,init,init,transition,transition,{...FREE,screen:"title"}]);const {press,rec}=scriptedTools(game);
  await press.execute("t",{buttons:["A"]});
  expect(rec.advances()[0]).toMatchObject({stop:"screen_change",detail:"the screen changed to title"});
  const stuck=new Scripted([FREE,FREE,MSG("printing"),transition]);const s=scriptedTools(stuck);
  const result=await s.press.execute("u",{buttons:["A"]});
  expect(s.rec.advances()[0]?.stop).toBe("interface_not_ready");
  expect(textOf(result)).toContain("an interface stayed not ready");
 });

 it("names a menu without listed options by its highlighted choice, and a state read failure before the press does not block it",async()=>{
  const menu:GameStateSnapshot={...FREE,field_controls_locked:true,active_ui:{phase:"field_multichoice",selected:"LITTLEROOT",ready:true,controls:"",diagnostic:null}};
  const plain:GameStateSnapshot={...FREE,field_controls_locked:true,active_ui:{phase:"start_menu",selected:null,ready:true,controls:"",diagnostic:null}};
  for(const [stop,detail] of [[menu,"menu field_multichoice is open; highlighted LITTLEROOT"],[plain,"menu start_menu is open"]] as const){
   const game=new Scripted([FREE,FREE,MSG("page_wait"),stop]);const {press,rec}=scriptedTools(game);
   await press.execute("m",{buttons:["A"]});
   expect(rec.advances()[0]?.detail).toBe(detail);
  }
  let reads=0;const flaky=new Scripted([FREE]);
  const rec=memoryRecorder();
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,flaky.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},flaky.fetch,{now:()=>0,sleep:()=>Promise.resolve()})],ON,{state:{read:()=>{reads++;return Promise.reject(new Error("down"));}},recorder:rec.api,clock:fakeClock()});
  const result=await tools.find(t=>t.name==="press")?.execute("f",{buttons:["A"]});
  expect(reads).toBe(1);expect(flaky.posts).toEqual([["A"]]);expect(result===undefined?"":textOf(result)).toContain("pressed A");
 });

 it("refuses to wrap a tool list without the ordinary game tools",()=>{
  expect(()=>withDialogueAutoAdvance([],ON,{state:{read:()=>Promise.reject(new Error("unused"))},recorder:memoryRecorder().api})).toThrow("ordinary game tools");
 });
});

it("names a faced background object as the speaker when the text has no NAME: prefix",async()=>{
 const at={position:{x:1,y:2},facing:"up",map_id:[1,1] as [number,number],location:"HOUSE 2F",interaction_targets:[{kind:"background",x:1,y:1,elevation:0,activation:"A",availability:"always",facing:null,local_id:null,destination:null,name:"Notebook"}]};
 const game=new Scripted([{...FREE,...at},{...FREE,...at},{...MSG("page_wait","AAA flipped open the notebook."),...at},{...FREE,...at}]);const {press,rec}=scriptedTools(game);
 const result=await press.execute("n",{buttons:["A","A"]});
 expect(rec.advances()[0]?.pages.map(p=>[p.speaker,p.speaker_source])).toEqual([["Notebook","faced_target"]]);
 expect(textOf(result)).toContain(`1. turn 7 · HOUSE 2F (map 1/1) · at 1,2 · Notebook (faced object): "AAA flipped open the notebook."`);
});

it("records a page once when B does not advance it, cuts a page with no line break at the cursor, and honours walking and the press-result switch",async()=>{
 const text="Hello there. Bye now.";
 const page=(cursor:number):GameStateSnapshot=>({...MSG("page_wait",text),world_context:{objects:[],triggers:[],dialogue:text,message:{phase:"page_wait",cursor,ready:true}}});
 const game=new Scripted([FREE,FREE,page(13),page(13),page(13),{...page(21),world_context:{objects:[],triggers:[],dialogue:text,message:{phase:"button_wait",cursor:21,ready:true}}},FREE]);
 const {press,rec}=scriptedTools(game,{...ON,"press-result-v1":false});
 const result=await press.execute("r",{buttons:["A"],walking:true});
 expect(rec.advances()[0]?.pages.map(p=>p.text)).toEqual(["Hello there.","Bye now."]);
 expect(game.posts).toEqual([["A"],["B"],["B"]]);
 expect(textOf(result)).not.toContain("Press result:");
});

it("falls back to the faced object's sprite kind when no interaction target is listed",async()=>{
 const at={position:{x:1,y:2},facing:"left",interaction_targets:null};
 const objects=[{local_id:1,map_id:[0,9] as [number,number],graphics_id:5,sprite_kind:"FAT_MAN",x:0,y:2}];
 const msg={...MSG("page_wait","Science is amazing!"),...at};
 const withObjects:GameStateSnapshot={...msg,world_context:{objects,triggers:[],dialogue:"Science is amazing!",message:{phase:"page_wait",cursor:19,ready:true}}};
 const game=new Scripted([{...FREE,...at},{...FREE,...at},withObjects,{...FREE,...at}]);
 const {press,rec}=scriptedTools(game);
 await press.execute("f",{buttons:["A"]});
 expect(rec.advances()[0]?.pages.map(p=>[p.speaker,p.speaker_source])).toEqual([["FAT_MAN","faced_sprite"]]);
 const nobody=new Scripted([{...FREE,...at},{...FREE,...at},{...MSG("page_wait","Hm?"),...at},{...FREE,...at}]);const n=scriptedTools(nobody);
 await n.press.execute("g",{buttons:["A"]});
 expect(n.rec.advances()[0]?.pages.map(p=>[p.speaker,p.speaker_source])).toEqual([[null,null]]);
});

// Recorded from the real ROM on an isolated server (runs/auto-advance-qualify); states trimmed to the
// fields the wrapper reads. Expected pages are the game's own message buffers (gStringVar4) cut at its waits.
interface RealReplay {source:string;calls:{buttons:Button[]}[];actions:Button[][];states:GameStateSnapshot[]}
const realReplay=(name:string):RealReplay=>JSON.parse(readFileSync(new URL(`../test-support/auto-advance-replays/${name}.json`,import.meta.url),"utf8")) as RealReplay;
async function replayCalls(name:string){
 const replay=realReplay(name);const game=new Scripted(replay.states);const {press,rec}=scriptedTools(game);
 const results=[];for(const [i,call] of replay.calls.entries())results.push(await press.execute(`r${String(i)}`,{buttons:call.buttons}));
 return {results,rec,game,replay};
}

describe("dialogue-auto-advance-v1 real-game replays",()=>{
 it("records MOM's first page when it was already waiting as the model pressed A outside the truck",async()=>{
  const {rec}=await replayCalls("truck-late");
  const [event]=rec.advances();
  expect(event?.pages.map(p=>p.text).slice(0,3)).toEqual(["MOM: AA, we're here, honey!","It must be tiring riding with our things\nin the moving truck.","Well, this is LITTLEROOT TOWN."]);
  expect(event?.pages.map(p=>p.text).at(-1)).toBe("Don't forget to set it!");
  expect(event?.pages).toHaveLength(12);
  expect(new Set(event?.pages.map(p=>p.text)).size).toBe(12);
 });

 it("records a single page the model's own press closed into a locked cutscene, without pressing into the lock",async()=>{
  const {rec,game,results}=await replayCalls("helpme");
  const [event]=rec.advances();
  expect(event?.pages.map(p=>p.text)).toEqual(["H-help me!"]);
  expect(game.posts).toEqual([["A"]]);
  expect(event?.auto_presses).toBe(0);
  expect(event?.stop).toBe("locked_no_message");
  expect(textOf(results[0] as AgentToolResult<unknown>)).toContain("H-help me!");
 });

 it("records BIRCH's whole route and lab talk once each and stops at the nickname YES/NO without answering",async()=>{
  const {rec,game}=await replayCalls("lab");
  const [event]=rec.advances();
  const pages=event?.pages.map(p=>p.text)??[];
  expect(pages[0]).toBe("PROF. BIRCH: Whew…");
  expect(pages.at(-1)).toBe("PROF. BIRCH: While you're at it, why not\ngive a nickname to that TORCHIC?");
  expect(pages.join("\n")).toBe(["PROF. BIRCH: Whew…\nI was in the tall grass studying wild\nPOKéMON when I was jumped.\nYou saved me.\nThanks a lot!\nOh?\nHi, you're AA!\nThis is not the place to chat, so come\nby my POKéMON LAB later, okay?","PROF. BIRCH: So, AA.\nI've heard so much about you from\nyour father.\nI've heard that you don't have your\nown POKéMON yet.\nBut the way you battled earlier,\nyou pulled it off with aplomb!\nI guess you have your father's blood\nin your veins after all!\nOh, yes. As thanks for rescuing me,\nI'd like you to have the POKéMON you\nused earlier.\nAA received the TORCHIC!","PROF. BIRCH: While you're at it, why not\ngive a nickname to that TORCHIC?"].join("\n"));
  expect(event?.stop).toBe("menu");
  expect(event?.detail).toContain("YES");
  expect(game.posts.slice(1).every(b=>b.length===1&&b[0]==="B")).toBe(true);
 });

 it("does not stop as free field on the one unlocked frame between the lab warp and the lab's ON_FRAME script",async()=>{
  const {rec}=await replayCalls("lab-warp");
  const [event]=rec.advances();
  expect(event?.stop).not.toBe("field_free");
  expect(event?.pages[0]?.text).toBe("PROF. BIRCH: Whew…");
 });

 it("keeps one message when its buffer is readable a frame before its identity",async()=>{
  const text="PROF. BIRCH: So, AA.\nI've heard so much about you from\nyour father.";
  const at=(phase:"printing"|"page_wait"|"dismiss_wait",cursor:number,identity:string|undefined):GameStateSnapshot=>({...MSG("printing",text),world_context:{objects:[],triggers:[],dialogue:text,message:{phase,cursor,ready:phase!=="printing",...(identity===undefined?{}:{identity})}}});
  const id="d300a8ee9a970b1e5c4e716109d7242d4c7495f96db11a0259e5bec04117976d";
  const before=MSG("page_wait","You saved me.");
  const noId={...before,world_context:{objects:[],triggers:[],dialogue:text,message:null}};
  const game=new Scripted([before,noId,at("printing",11,id),at("page_wait",20,id),at("printing",40,id),at("dismiss_wait",text.length,id),FREE]);
  const {press,rec}=scriptedTools(game);
  await press.execute("k",{buttons:["A"]});
  expect(rec.advances()[0]?.pages.map(p=>p.text)).toEqual(["You saved me.","PROF. BIRCH: So, AA.","I've heard so much about you from\nyour father."]);
 });
});

// The strong bundle runs transition-press-result-v1 and dialogue-auto-advance-v1 together on the shared observe/press tracker.
describe("dialogue-auto-advance-v1 with transition-press-result-v1 (strong-bundle composition)",()=>{
 const BUNDLE:FeatureSet={...ON,"transition-press-result-v1":true};
 function bundle(game:FakeGame,features:FeatureSet=BUNDLE){
  const rec=memoryRecorder();const clock=fakeClock();
  const base=gameTools(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,toolSwitches(features),{now:()=>clock.t,sleep:()=>Promise.resolve()});
  const tools=playGameTools(base,features,game.read,rec.api);
  const tool=(name:string):AgentTool=>{const t=tools.find(x=>x.name===name);if(t===undefined)throw new Error(`missing ${name}`);return t;};
  return {tool,rec};
 }
 const pressLine=(r:AgentToolResult<unknown>)=>textOf(r).split("\n").filter(l=>l.startsWith("Press result:"));
 it("names a conversation restarted at the same place when auto-advance read it to the end",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool}=bundle(game);
  await tool("press").execute("c1",{buttons:["A"]});
  const again=await tool("press").execute("c2",{buttons:["A"]});
  expect(pressLine(again)).toEqual(["Press result: conversation restarted: this text was already shown (2nd time)"]);
  expect(textOf(again)).toContain("Dialogue auto-advance: the harness pressed B 2 times");
 });
 it("keeps the carried-over warp when the press opens dialogue",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool}=bundle(game);
  await tool("observe").execute("o1",{});
  game.place={location:"LITTLEROOT TOWN",map_id:[0,9]};
  const result=await tool("press").execute("c1",{buttons:["A"]});
  expect(pressLine(result)).toHaveLength(1);
  expect(pressLine(result)[0]).toMatch(/^Press result: warped before this press \(carried over from your previous action; your last result still showed the old map\): LITTLEROOT TOWN PROFESSOR BIRCHS LAB \[map 1\/4\] \(13,14\) -> LITTLEROOT TOWN \[map 0\/9\] \(13,14\); this press: /);
 });
 it("keeps the carried-over warp on a batch sent one input at a time without dialogue",async()=>{
  const game=new FakeGame(SCIENTIST);const {tool}=bundle(game);
  await tool("observe").execute("o1",{});
  game.place={location:"LITTLEROOT TOWN",map_id:[0,9]};
  const result=await tool("press").execute("c1",{buttons:["LEFT","A"]});
  expect(game.posts.map(p=>p.buttons[0])).toEqual(["LEFT","A"]);
  const lines=pressLine(result);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^Press result: LEFT: warped before this press \(carried over[^)]*\): LITTLEROOT TOWN PROFESSOR BIRCHS LAB \[map 1\/4\] \(13,14\) -> LITTLEROOT TOWN \[map 0\/9\] \(13,14\); this press: moved \(13,14\) -> \(12,14\) \| then A: /);
 });
 it("records inputs the safe-batch rule withheld as dropped, so requested = sent + dropped",async()=>{
  const game=new FakeGame(SCIENTIST);const features:FeatureSet={...ON,"dialogue-safe-batches-v1":true};const {tool,rec}=wire(game,features);
  await tool("press").execute("c1",{buttons:["A","A","A"]});
  const [event]=rec.advances();
  expect(event).toMatchObject({requested:["A","A","A"],sent:["A"],dropped:["A","A"]});
 });
});

describe("dialogue-auto-advance-v1 records what the press tool really sent",()=>{
 it("takes sent from the inner press when the state changed between the two reads",async()=>{
  const game=new FakeGame(SCIENTIST);
  const free=await game.read.read();
  await game.fetch(`${URL_BASE}/action`,{method:"POST",body:JSON.stringify({buttons:["A"]})});
  game.posts.length=0;
  const features:FeatureSet={...ON,"dialogue-safe-batches-v1":true};
  const rec=memoryRecorder();const clock=fakeClock();
  const base=[observeTool(URL_BASE,game.fetch),pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()},toolSwitches(features))];
  const tools=withDialogueAutoAdvance(base,features,{state:{read:()=>Promise.resolve(free)},recorder:rec.api,clock});
  const press=tools.find(t=>t.name==="press");if(press===undefined)throw new Error("missing press");
  const result=await press.execute("c1",{buttons:["UP","UP"]});
  expect(game.posts[0]?.buttons).toEqual(["UP"]);
  const [event]=rec.advances();
  expect(event).toMatchObject({requested:["UP","UP"],sent:["UP"],dropped:["UP"]});
  expect(textOf(result).split("\n")[0]).toBe("pressed UP");
 });
});

describe("dialogue-auto-advance-v1 keeps what the inner tools appended",()=>{
 it("keeps the text a wrapped press appended after its observation on the walk path",async()=>{
  const game=new FakeGame(SCIENTIST);
  const free=await game.read.read();
  await game.fetch(`${URL_BASE}/action`,{method:"POST",body:JSON.stringify({buttons:["A"]})});
  const features:FeatureSet={...ON,"dialogue-safe-batches-v1":true};
  const rec=memoryRecorder();const clock=fakeClock();
  const inner=pressTool(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,{now:()=>clock.t,sleep:()=>Promise.resolve()},toolSwitches(features));
  const execute=inner.execute.bind(inner);
  inner.execute=async(...args)=>{const r=await execute(...args);return {...r,content:[...r.content,{type:"text" as const,text:"Objective warning: fixture"}]};};
  const tools=withDialogueAutoAdvance([observeTool(URL_BASE,game.fetch),inner],features,{state:{read:()=>Promise.resolve(free)},recorder:rec.api,clock});
  const press=tools.find(t=>t.name==="press");if(press===undefined)throw new Error("missing press");
  const result=await press.execute("c1",{buttons:["UP","UP"]});
  expect(rec.advances()).toHaveLength(1);
  expect(textOf(result)).toContain("Objective warning: fixture");
 });
});
