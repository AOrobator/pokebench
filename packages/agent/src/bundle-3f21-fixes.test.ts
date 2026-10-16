// M5 pre-launch fixes F5–F8 inside default-off bundle switches, replayed from the real bundle
// qualification run 2026-10-15T23-47-41_qwen36-gpu1_3f21 (test-support/bundle-3f21/*, states copied
// from its recorded state events). Forensics: runs/reviews/2026-10-16-qualification-forensics/bundle-3f21.md.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {gameTools,type Clock} from "./game-tools.js";
import {playGameTools} from "./play-wiring.js";
import {toolSwitches} from "./play-config.js";
import {SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import type {Button,RunEvent} from "./events.js";
import {afterAdvance,navigationAfter,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {MESSAGE_WAITING} from "./navigation.js";
import type {GameStateSnapshot} from "./game-state.js";

const URL_BASE="http://127.0.0.1";
const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
interface Replay {source:string;features:Record<string,boolean>;buttons?:Button[];goal?:{x:number;y:number;map_id:[number,number]};state_seqs:number[];states:GameStateSnapshot[];recorded:{advance:Pick<Advance,"requested"|"sent"|"dropped"|"stop"|"pages">;result_head:string}}
interface NavCase {turn:number;goal:{x:number;y:number;map_id:[number,number]};state:GameStateSnapshot;recorded_head:string}
const fixture=(name:string):string=>readFileSync(new URL(`../test-support/bundle-3f21/${name}`,import.meta.url),"utf8");
const replay=(name:string):Replay=>JSON.parse(fixture(`${name}.json`)) as Replay;
// The run's own switch set; switches registered after the run default to off.
const featuresOf=(recorded:Record<string,boolean>):FeatureSet=>Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,recorded[id]??false])) as Record<(typeof SWITCHABLE_FEATURES)[number],boolean>;

// Serves the recorded states in order, one per read, observation or state request.
class Recorded {
 posts:Button[][]=[];private i=0;
 constructor(private readonly states:readonly GameStateSnapshot[]){}
 private next():GameStateSnapshot{const s=this.states[Math.min(this.i,this.states.length-1)];this.i++;if(s===undefined)throw new Error("no state");return s;}
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");this.posts.push((JSON.parse(init.body) as {buttons:Button[]}).buttons);body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state_text:"recorded",screenshot_base64:png,state:this.next()};
  else body=this.next();
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 read={read:()=>Promise.resolve(this.next())};
}
function memoryRecorder(){
 const events:RunEvent[]=[];const subs:((e:RunEvent)=>void)[]=[];let seq=0;
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-10-16T00:00:00.000-04:00",turn:1,...body} as RunEvent;events.push(e);for(const s of subs)s(e);return {seq:e.seq,turn:1};};
 const api:AutoAdvanceRecorder&{lowHpTrainerWarning:()=>void}={lowHpTrainerWarning:()=>undefined,recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:o=>{subs.push(o);}};
 return {api,advances:()=>events.filter((e):e is Advance=>e.type==="dialogue_auto_advance")};
}
// The production composition: shared observe/press tracker, navigate_to and dialogue auto-advance per switch.
function tools(game:Recorded,features:FeatureSet){
 const rec=memoryRecorder();const clock:Clock&{t:number}={t:0,now:()=>clock.t,sleep:(ms:number)=>{clock.t+=ms;return Promise.resolve();}};
 const base=gameTools(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,toolSwitches(features),{now:()=>clock.t,sleep:()=>Promise.resolve()});
 const all=playGameTools(base,features,game.read,rec.api);
 const tool=(name:string):AgentTool=>{const t=all.find(x=>x.name===name);if(t===undefined)throw new Error(`missing ${name}`);return t;};
 return {tool,rec};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
const pressLine=(r:AgentToolResult<unknown>)=>textOf(r).split("\n").find(l=>l.startsWith("Press result:"));

describe("F8 dialogue-auto-advance-v1: no queued button once a message has appeared (3f21 T95)",()=>{
 it("stops the batch when MOM's text is in the buffer before the message phase reads, and lists every unsent input",async()=>{
  const r=replay("t95-batch");const game=new Recorded(r.states);const {tool,rec}=tools(game,featuresOf(r.features));
  // Recorded: the second RIGHT went out at seq 1635 although state 1634 already held MOM's text.
  expect(r.recorded.advance.sent).toEqual(["RIGHT","RIGHT"]);
  expect(r.recorded.result_head).toContain("then RIGHT: dialogue advanced (message box still open; it locks field controls until it closes)");
  const result=await tool("press").execute("t95",{buttons:r.buttons??[]});
  expect(game.posts).toEqual([["RIGHT"],["B"],["B"],["B"],["B"],["B"]]);
  const [event]=rec.advances();
  expect(event).toMatchObject({requested:["RIGHT","RIGHT","DOWN","DOWN"],sent:["RIGHT"],dropped:["RIGHT","DOWN","DOWN"],stop:"field_free"});
  expect(event?.pages.map(p=>p.text)).toEqual(r.recorded.advance.pages.map(p=>p.text));
  expect(textOf(result)).toContain("dialogue closed; 3 remaining inputs not sent: RIGHT, DOWN, DOWN.");
  expect(textOf(result).split("\n")[0]).toBe("pressed RIGHT");
 });
});

describe("F6 dialogue-auto-advance-v1: results describe the state after auto-advance",()=>{
 it("press (3f21 T95): the opening press no longer claims the box still locks field controls",async()=>{
  const r=replay("t95-batch");const game=new Recorded(r.states);const {tool}=tools(game,featuresOf(r.features));
  const result=await tool("press").execute("t95",{buttons:r.buttons??[]});
  expect(pressLine(result)).toBe("Press result: dialogue opened; after auto-advance: the conversation closed and field controls are free");
 });
 it("press (3f21 T56): 'message box still open' becomes the post-advance state",async()=>{
  const r=replay("t56-press");const game=new Recorded(r.states);const {tool,rec}=tools(game,featuresOf(r.features));
  expect(r.recorded.result_head).toBe("Press result: dialogue advanced (message box still open; it locks field controls until it closes)");
  const result=await tool("press").execute("t56",{buttons:r.buttons??[]});
  expect(rec.advances()[0]?.pages.map(p=>p.text)).toEqual(r.recorded.advance.pages.map(p=>p.text));
  expect(pressLine(result)).toBe("Press result: dialogue advanced; after auto-advance: the conversation closed and field controls are free");
 });
 it("navigate_to (3f21 T98): no 'a message is waiting… dismiss it with B' once auto-advance closed it",async()=>{
  const r=replay("t98-navigate");const game=new Recorded(r.states);const {tool,rec}=tools(game,featuresOf(r.features));
  expect(r.recorded.result_head).toBe("Navigation: a message is waiting for A or B; dismiss it with B, then call navigate_to again; 0 ordinary button attempts.");
  const result=await tool("navigate_to").execute("t98",r.goal);
  expect(rec.advances()[0]?.pages.map(p=>p.text)).toEqual(r.recorded.advance.pages.map(p=>p.text));
  expect(game.posts.every(b=>b.length===1&&b[0]==="B")).toBe(true);
  expect(textOf(result).split("\n")[0]).toBe("Navigation: a message was open, so navigate_to did not walk; after auto-advance: the conversation closed and field controls are free; call navigate_to again; 0 ordinary button attempts.");
  expect(textOf(result)).not.toContain("dismiss it with B");
 });
});

describe("F7 navigation-refusal-reasons-v1: warp targets get their real reason (3f21)",()=>{
 const {features,cases}=JSON.parse(fixture("navigation-refusals.json")) as {features:Record<string,boolean>;cases:Record<string,NavCase>};
 const refuse=async(c:NavCase,f:FeatureSet=featuresOf(features))=>{const game=new Recorded([c.state]);const {tool}=tools(game,f);const result=await tool("navigate_to").execute("n",c.goal);expect(game.posts).toEqual([]);return textOf(result).split("\n")[0];};
 const DOOR="Navigation: (7,16) is a door to map 1/4; the game enters a door only when you walk UP into it from the tile below, (7,17), which is outside the local map navigate_to can see from here; call navigate_to (7,17) first, then navigate_to (7,16) again; 0 ordinary button attempts.";
 it.each(["t107-lab-door","t151-lab-door","t153-lab-door"])("%s: the lab door names its approach tile outside the local map",async name=>{
  const c=cases[name];if(c===undefined)throw new Error(name);
  expect(c.recorded_head).toBe("Navigation: no supported local path; choose a reachable local waypoint; 0 ordinary button attempts.");
  expect(await refuse(c)).toBe(DOOR);
 });
 it.each(["t57-exit-occupied","t61-exit-occupied"])("%s: the exit with MOM on it names her and the other exit to the same map",async name=>{
  const c=cases[name];if(c===undefined)throw new Error(name);
  expect(c.recorded_head).toBe("Navigation: no supported local path; choose a reachable local waypoint; 0 ordinary button attempts.");
  expect(await refuse(c)).toBe("Navigation: (9,8) is a warp to map 0/9, but MOM (person or object) is standing on it, so navigate_to cannot walk onto it; wait for it to move, or use another listed warp to map 0/9: (8,8); 0 ordinary button attempts.");
 });
 it("switch OFF keeps the recorded generic text",async()=>{
  for(const c of Object.values(cases))expect(await refuse(c,{...featuresOf(features),"navigation-refusal-reasons-v1":false})).toBe(c.recorded_head);
 });
});

describe("F5 stall-briefing-v1: the stall briefing cites the last story instruction and exits not entered (3f21 T166)",()=>{
 const events=gunzipSync(readFileSync(new URL("../test-support/bundle-3f21/briefing-events.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
 const start=events[0];if(start?.type!=="run_start")throw new Error("run_start");
 const features=featuresOf((start as unknown as {evaluation:{features:Record<string,boolean>}}).evaluation.features);
 const note=(seq:number):string=>{const e=events.find(x=>x.seq===seq);if(e?.type!=="loop_guard")throw new Error(String(seq));return e.message;};
 const upTo=(seq:number):SupervisorBriefing=>{const b=new SupervisorBriefing(features);for(const e of events){if(e.seq>=seq)break;b.observe(e);}return b;};
 it("keeps every line of the recorded T166 briefing, in order, and adds MOM's T98 pages whole with speakers",()=>{
  const text=upTo(3310).stallText({kind:"milestone_drought",minutes:5},166);
  const lines=text.split("\n");
  let at=0;for(const line of note(3310).split("\n")){const i=lines.indexOf(line,at);expect(i,line).toBeGreaterThanOrEqual(at);at=i+1;}
  expect(text).toContain(`- Dialogue shown with your latest story step that came with dialogue (mom rival instruction at turn 98), whole, in order: MOM: "MOM: Oh! RED, RED! Quick! Come quickly!" | MOM: "MOM: Look! It's PETALBURG GYM! Maybe DAD will be on!" | INTERVIEWER: "INTERVIEWER: …We brought you this report from in front of PETALBURG GYM." | MOM: "MOM: Oh… It's over." | MOM: "I think DAD was on, but we missed him. Too bad." | MOM (sprite kind, not a name): "Oh, yes. One of DAD's friends lives in town." | MOM (sprite kind, not a name): "PROF. BIRCH is his name." | MOM (sprite kind, not a name): "He lives right next door, so you should go over and introduce yourself."`);
  expect(text).toMatch(/\n- Exits to maps you have not entered since your last story progress: LITTLEROOT TOWN \(map 0\/9\): [^\n]*Warp to map 1\/2 at 14,8/);
  expect(text).not.toMatch(/Exits to maps[^\n]*Warp to map 1\/4/);
 });
 it("leaves the both-arm loop supervisor and text-only notes untouched: T65's recorded note is reproduced byte for byte",()=>{
  const b=upTo(1010);
  expect(b.text("ineffective",65)).toBe(note(1010));
  expect(b.textOnly(3,1,3)).not.toMatch(/story step that came with dialogue|Exits to maps|other maps/);
  expect(upTo(3310).text("cycle",166)).not.toMatch(/story step that came with dialogue|Exits to maps|other maps/);
 });
});

describe("F6 restated text, every case",()=>{
 const nav=(status:string,commands:number,unready=true)=>({navigation:{status,commands,unready}});
 const FREE={stop:"field_free" as const,detail:"the conversation closed and field controls are free"};
 it("restates navigate_to only when it stopped because field input was not ready",()=>{
  expect(navigationAfter(null,FREE)).toBeNull();
  expect(navigationAfter({},FREE)).toBeNull();
  expect(navigationAfter({navigation:null},FREE)).toBeNull();
  expect(navigationAfter(nav("arrived at requested coordinate",3,false),FREE)).toBeNull();
  expect(navigationAfter({navigation:{status:1,commands:0,unready:true}},FREE)).toBeNull();
  expect(navigationAfter({navigation:{status:"x",unready:true}},FREE)).toBeNull();
  expect(navigationAfter(nav(`walk interrupted: ${MESSAGE_WAITING}`,3),FREE)).toBe("Navigation: walk interrupted: a message opened; after auto-advance: the conversation closed and field controls are free; call navigate_to again; 3 ordinary button attempts.");
  expect(navigationAfter(nav("walk interrupted: field controls are locked by a script and no message is open; the game is acting on its own, so inspect the new state before calling navigate_to again",2),{stop:"menu",detail:"menu field_yes_no is open: options YES, NO; highlighted YES"})).toBe("Navigation: walk interrupted: field controls were locked; after auto-advance: menu field_yes_no is open: options YES, NO; highlighted YES; 2 ordinary button attempts.");
  expect(navigationAfter(nav("field input or navigation geometry unavailable",0),FREE)).toBe("Navigation: field controls were not free, so navigate_to did not walk; after auto-advance: the conversation closed and field controls are free; call navigate_to again; 0 ordinary button attempts.");
 });
 it("replaces only box-state notes the advance made stale",()=>{
  expect(afterAdvance("dialogue closed; field controls are still locked","the conversation closed and field controls are free")).toBe("dialogue closed; after auto-advance: the conversation closed and field controls are free");
  expect(afterAdvance("conversation restarted: this text was already shown (2nd time)","x")).toBe("conversation restarted: this text was already shown (2nd time)");
 });
});

describe("F5 stall briefing additions, every case",()=>{
 const ALL=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,true])) as FeatureSet;
 function run(features:FeatureSet){
  const b=new SupervisorBriefing(features);let seq=0,turn=0;
  const emit=(body:Record<string,unknown>):RunEvent=>{const e={v:1,run:"r",t:"2026-10-16T00:00:00.000-04:00",seq:++seq,turn,...body} as RunEvent;b.observe(e);return e;};
  const state=(extra:Record<string,unknown>)=>emit({type:"state",screen:"overworld",started:true,location:"HOUSE",map_id:[1,0],position:{x:1,y:1},facing:"up",in_battle:false,field_controls_locked:false,active_ui:null,interaction_targets:[],world_context:{objects:[],triggers:[],dialogue:null},...extra});
  const call=(extra:Record<string,unknown>,error=false,milestone?:{name:string;kind:string;origin?:string},pages?:Record<string,unknown>[])=>{
   turn++;const id=`c${String(turn)}`;emit({type:"tool_call",id,name:"press",args:{buttons:["A"]}});
   if(pages!==undefined)emit({type:"dialogue_auto_advance",tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages,stop:"field_free",detail:"x",duration_ms:1});
   const s=state(extra);
   if(milestone!==undefined)emit({type:"milestone",server_timestamp:0,origin:"observed",evidence:[s.seq],...milestone});
   emit({type:"tool_result",id,name:"press",is_error:error,duration_ms:1,text:"ok",frames:[],state_seq:s.seq});
  };
  return {b,call};
 }
 const line=(text:string,prefix:string)=>text.split("\n").find(l=>l.startsWith(prefix));
 it("quotes readout dialogue without a speaker, skips errored calls and start milestones, and lists exits with no destination as none",()=>{
  const {b,call}=run(ALL);
  call({world_context:{objects:[],triggers:[],dialogue:"Go next door."}},false,{name:"MOM_RIVAL_INSTRUCTION",kind:"story"});
  call({world_context:{objects:[],triggers:[],dialogue:"Ignored."}},true,{name:"CLOCK_SET",kind:"story"});
  call({},false,{name:"GAME_RUNNING",kind:"legacy"});
  call({map_id:null,location:null,interaction_targets:[{kind:"warp",x:2,y:2,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null}]});
  const text=b.stallText({kind:"milestone_drought",minutes:5},4);
  expect(line(text,"- Dialogue shown with your latest story step that came with dialogue")).toBe(`- Dialogue shown with your latest story step that came with dialogue (mom rival instruction at turn 1), whole, in order: "Go next door."`);
  expect(line(text,"- Exits to maps")).toBe("- Exits to maps you have not entered since your last story progress: none");
 });
 it("takes a page's own state, else its event, and keeps the earlier instruction when a story milestone came with no pages",()=>{
  const {b,call}=run(ALL);
  call({},false,{name:"MOM_CLOCK_INSTRUCTION",kind:"story"},[{state_seq:null,map:"HOUSE",map_id:[1,0],position:null,speaker:"MOM",speaker_source:"name_prefix",text:"MOM: Set the clock."}]);
  call({},false,{name:"CLOCK_SET",kind:"story"});
  expect(line(b.stallText({kind:"milestone_drought",minutes:5},2),"- Dialogue shown")).toBe(`- Dialogue shown with your latest story step that came with dialogue (mom clock instruction at turn 1), whole, in order: MOM: "MOM: Set the clock."`);
 });
 it("says what is not available when the readout lacks dialogue text or targets",()=>{
  const {b,call}=run({...ALL,"active-field-message-buffer-v1":false,"world-targets-v1":false});
  call({});
  const text=b.stallText({kind:"milestone_drought",minutes:5},1);
  expect(line(text,"- Dialogue shown")).toBe("- Dialogue shown with your latest story step that came with dialogue: not available (dialogue text is off)");
  expect(line(text,"- Not tried yet on other maps")).toBe("- Not tried yet on other maps you have been on since your last story progress: not available (world targets are off)");
  expect(line(text,"- Exits to maps")).toBe("- Exits to maps you have not entered since your last story progress: not available (world targets are off)");
 });
});
