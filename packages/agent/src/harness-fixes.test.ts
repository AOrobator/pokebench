import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it} from "vitest";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON} from "./features.js";
import {DialogueLog} from "./dialogue-log.js";
import {FrameStore} from "./frames.js";
import {InstructionLedger} from "./instruction-ledger.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {NavigationMemory} from "./navigation-memory.js";
import {playSystemPrompt} from "./play-config.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";
import {nextMilestoneHint} from "./milestone-hint.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {Governor,attachLoopGuard} from "./harness.js";
import {LOOP_POLICY} from "./loop-detection.js";
import {ObjectiveTracker} from "./objectives.js";
import {NAVIGATE_RULES,withNavigation} from "./navigation.js";
import {observeTool,pressTool} from "./game-tools.js";

const ev=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"fix-test",t:"2026-10-15T12:00:00.000-04:00",turn,seq,...body});
const SCIENTIST={name:"SCIENTIST_1",kind:"object",x:9,y:7,elevation:0,activation:"press_a",availability:"live",facing:null,local_id:1,destination:null};
const EXIT={name:null,kind:"warp",x:8,y:8,elevation:0,activation:"walk into it",availability:"observed",facing:null,local_id:null,destination:[0,9,0]};
const st=(seq:number,extra:Record<string,unknown>={})=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"LAB",map_id:[1,4],position:{x:9,y:8},facing:"up",field_controls_locked:false,interaction_targets:[SCIENTIST,EXIT],world_context:{objects:[],triggers:[],dialogue:null},...extra},seq);
const STORY_RIVAL="Story: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received; rival met";
const result=(b:{observe:(e:RunEvent)=>void},seq:number,extra:Record<string,unknown>={},id="t",text=`ok\n${STORY_RIVAL}`)=>{b.observe(st(seq,extra));b.observe(ev({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text,frames:[],state_seq:seq},seq+1));};
const press=(b:{observe:(e:RunEvent)=>void},seq:number,buttons:string[],extra:Record<string,unknown>,id:string,text?:string)=>{b.observe(ev({type:"tool_call",id,name:"press",args:{buttons}},seq));result(b,seq+1,extra,id,text);};
const msg=(dialogue:string|null,phase:string|null,cursor=0)=>({world_context:{objects:[],triggers:[],dialogue,...(phase===null?{message:null}:{message:{phase,cursor,ready:true}})}});
const AIDE="The PROF isn't one for doing desk work. He's the type of person who would rather go outside and experience things than read about them here.";

it("states the story steps exactly as the readout's Story line does, including staged steps like rival met",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 result(b,1);
 expect(b.text("cycle",3)).toContain("- Story steps the game confirms are done: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received; rival met\n");
 expect(b.textOnly(3,1,3)).toContain("rival met");
});

it("keeps the last available story line while a map loads",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 result(b,1);
 result(b,3,{},"t2","ok\nStory: unavailable (story state not readable right now)");
 expect(b.text("cycle",5)).toContain("Mom rival instruction received; rival met");
 expect(b.text("cycle",5)).not.toContain("not readable right now");
});

it("grades reading a conversation with B as progress, and a repeat A as a restarted conversation",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 result(b,1,msg(null,null));
 press(b,3,["A"],msg(AIDE,"printing",9),"a1");
 press(b,6,["B"],msg(AIDE,"scroll_wait",74),"b1");
 press(b,9,["B"],msg(AIDE,"dismiss_wait",141),"b2");
 press(b,12,["B"],msg(null,null),"b3");
 press(b,15,["A"],msg(AIDE,"printing",9),"a2");
 const text=b.text("cycle",20);
 expect(text).toMatch(/press B ×2 in LAB \(map 1\/4\) → dialogue advanced/);
 expect(text).toMatch(/press B in LAB \(map 1\/4\) → dialogue closed/);
 expect(text).toMatch(/A facing SCIENTIST_1 at 9,7 in LAB \(map 1\/4\) → restarted a conversation already shown/);
 expect(text).not.toMatch(/press B[^;]*→ no change/);
});

it("counts only actions as tried: standing on a door mat leaves that exit untried, and story progress clears the list",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 result(b,1,{position:{x:8,y:8}});
 const untried=(t:string)=>t.slice(t.indexOf("not tried yet"));
 expect(untried(b.text("cycle",3))).toContain("warp at 8,8");
 b.observe(ev({type:"tool_call",id:"n",name:"navigate_to",args:{x:8,y:8,map_id:[1,4]}},4));result(b,5,{position:{x:8,y:8}},"n");
 result(b,6,{position:{x:9,y:8},facing:"up"});
 press(b,7,["A"],{position:{x:9,y:8},facing:"up"},"a");
 expect(untried(b.text("cycle",9))).not.toContain("8,8");
 expect(untried(b.text("cycle",9))).not.toContain("9,7");
 result(b,10,{},"s",`ok\n${STORY_RIVAL}; sent to save Birch`);
 expect(untried(b.text("cycle",12))).toContain("SCIENTIST_1 at 9,7");
 expect(untried(b.text("cycle",12))).toContain("warp at 8,8");
});

it("never cuts text it sends: long dialogue, every target and every attempt arrive whole",()=>{
 const may=`Huh? Who… Who are you? ${"… ".repeat(16)}Oh, you're AAA. So your move was today. Um… I'm MAY. Glad to meet you! I heard about you from my dad, PROF. BIRCH. I was supposed to go help Dad catch some wild POKéMON!`;
 const b=new SupervisorBriefing(ALL_ON);
 const many=Array.from({length:30},(_,i)=>({...SCIENTIST,name:`NPC${String(i)}`,x:i,y:i}));
 result(b,1,{interaction_targets:many,...msg(may,"dismiss_wait",200)});
 for(let i=0;i<20;i++)press(b,10+i*4,[i%2===0?"UP":"DOWN","LEFT","RIGHT","UP","DOWN","LEFT","RIGHT","A"],{interaction_targets:many},`c${String(i)}`);
 const text=b.text("cycle",200);
 expect(text).toContain(may);
 expect(text).toContain("NPC0 at 0,0");expect(text).toContain("NPC29 at 29,29");
 expect(text).not.toMatch(/truncated|more$|; \d+ more/);
 expect(b.textOnly(3,1,3)).toContain(may);
});

it("keeps the instruction ledger, dialogue log and navigation memory whole",()=>{
 const long=`MOM: ${"PROF. BIRCH is his name. He lives right next door. ".repeat(40)}END`;
 const ledger=new InstructionLedger({...ALL_ON,"instruction-ledger-v1":true});
 result(ledger,1,msg(long,"dismiss_wait",500));
 expect(ledger.text()).toContain(long);
 expect(ledger.text().match(new RegExp(long.slice(-60).replace(/[.]/g,"\\."),"g"))?.length).toBeGreaterThanOrEqual(2);
 const log=new DialogueLog(ALL_ON);
 for(let i=0;i<20;i++)result(log,1+i*2,msg(`${long} #${String(i)}`,"dismiss_wait",500));
 const recalled=log.recall({last:20});
 for(let i=0;i<20;i++)expect(recalled).toContain(`${long} #${String(i)}`);
 expect(recalled).not.toMatch(/truncated|omitted/);
 const memory=new NavigationMemory({...ALL_ON,"navigation-evidence-memory-v1":true});
 const targets=Array.from({length:20},(_,i)=>({...SCIENTIST,name:`OBJ${String(i)}`,x:i,y:1}));
 result(memory,1,{interaction_targets:targets,...msg(long,"dismiss_wait",500)});
 const shown=memory.text();
 expect(shown).toContain(long);expect(shown).toContain("OBJ19 at 19,1");
 expect(shown).not.toMatch(/truncated|omitted \)|first 8 of/);
});

it("replays milestones present at the start to observers that subscribe later",async()=>{
 const runsRoot=mkdtempSync(join(tmpdir(),"pokebench-fix-"));
 const log=RunLog.create(runsRoot,"2026-10-15T12-00-00_think-fast_fix0");
 const polls=[[{name:"CLOCK_SET",kind:"story" as const,origin:"present_at_start" as const,serverTimestamp:1}]];
 const recorder=new RunRecorder({log,frames:new FrameStore(runsRoot,1_000_000,()=>undefined),milestones:{poll:()=>Promise.resolve(polls.shift()??[])},gameState:{read:()=>Promise.resolve({screen:"overworld" as const,started:true,name:"AAA",location:"LITTLEROOT TOWN",map_id:[0,9] as [number,number],position:{x:5,y:8},facing:"down" as const,in_battle:false,party:[],money:0,badges:[],play_time_s:12})}});
 await recorder.start(RUN_START_META);
 const seen:string[]=[];
 recorder.subscribe(e=>{if(e.type==="milestone")seen.push(`${e.name}:${e.origin ?? "none"}`);},true);
 expect(seen).toEqual(["CLOCK_SET:present_at_start"]);
 const plain:string[]=[];recorder.subscribe(e=>{plain.push(e.type);});
 expect(plain).toEqual([]);
 rmSync(runsRoot,{recursive:true,force:true});
});

it("tells the model how navigate_to targets work, in the prompt and the tool",()=>{
 for(const full of [true,false]){
  const prompt=playSystemPrompt({...ALL_ON,"full-map-navigation-v1":full,"bounded-navigation-v1":true},null);
  expect(prompt).toContain("target the walkable tile next to it, face it and press A");
  expect(prompt).toContain("cannot walk while a message is open");
  expect(prompt).toContain("target the warp's own coordinates");
 }
});

it("wires the hint and both supervisors to receive start milestones",()=>{
 const replays:boolean[]=[];
 const recorder={subscribe:(_fn:(e:RunEvent)=>void,replay?:boolean)=>{replays.push(replay===true);},textOnlySupervisor:()=>undefined,recordMilestoneHint:()=>undefined};
 loopSupervisor(ALL_ON,recorder);textOnlySupervisor(ALL_ON,recorder);nextMilestoneHint(ALL_ON,recorder,m=>Promise.resolve(m));
 expect(replays).toEqual([true,true,true]);
});

it("records long ledger and navigation contexts as valid events",()=>{
 const long="x".repeat(25_000);
 expect(()=>checkEvent({v:1,run:"r",t:"2026-10-15T12:00:00.000-04:00",turn:1,seq:1,type:"ledger_context",text:long,evidence:[]})).not.toThrow();
 expect(()=>checkEvent({v:1,run:"r",t:"2026-10-15T12:00:00.000-04:00",turn:1,seq:2,type:"navigation_context",text:long,evidence:[]})).not.toThrow();
});

it("takes the story line only from a game readout paired with its state, never from other tools or errors",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 result(b,1);
 b.observe(ev({type:"tool_result",id:"m",name:"remember_destination",is_error:false,duration_ms:1,text:"x\nStory: ROXANNE defeated",frames:[]},3));
 b.observe(st(4));b.observe(ev({type:"tool_result",id:"r",name:"recall_dialogue",is_error:false,duration_ms:1,text:"Story: ROXANNE defeated",frames:[],state_seq:4},5));
 b.observe(st(6));b.observe(ev({type:"tool_result",id:"e",name:"press",is_error:true,duration_ms:1,text:"Story: ROXANNE defeated",frames:[],state_seq:6},7));
 expect(b.textOnly(3,1,3)).not.toContain("ROXANNE");
 expect(b.textOnly(3,1,3)).toContain("rival met");
});

it("delivers objective evidence whole",()=>{
 const tracker=new ObjectiveTracker("Reach gym",()=>undefined);
 const tail="SENTINEL-AFTER-1500";
 tracker.observe(ev({type:"tool_result",id:"o",name:"observe",is_error:false,duration_ms:1,text:`${"y".repeat(3000)}${tail}`,frames:[]},1));
 const out=tracker.context([],0);
 const last=out.at(-1);
 expect(typeof last?.content==="string"&&last.content.includes(tail)).toBe(true);
});

it("puts the navigate_to rules in both tool descriptions",()=>{
 const state={read:()=>Promise.resolve({...IN_GAME})};
 for(const full of [true,false]){
  const tools=withNavigation([observeTool("http://127.0.0.1"),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()})],{...ALL_ON,"bounded-navigation-v1":true,"full-map-navigation-v1":full},state);
  expect(tools.find(t=>t.name==="navigate_to")?.description).toContain(NAVIGATE_RULES);
 }
});

it("carries the corrected briefing through the production recorder, loop guard and supervisor wiring into the recorded loop_guard event",async()=>{
 const runsRoot=mkdtempSync(join(tmpdir(),"pokebench-fix-"));
 try{
  const log=RunLog.create(runsRoot,"2026-10-15T12-00-00_think-fast_fix1");
  const field={screen:"overworld" as const,started:true,name:"AAA",location:"LITTLEROOT TOWN",map_id:[0,9] as [number,number],position:{x:5,y:8},facing:"up" as const,in_battle:false,party:[],money:0,badges:[],play_time_s:12,field_controls_locked:false};
  const recorder=new RunRecorder({log,frames:new FrameStore(runsRoot,1_000_000,()=>undefined),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(field)}});
  await recorder.start(RUN_START_META);
  const governor=new Governor({limits:{maxTurns:100,maxWallMs:60_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  const detector=attachLoopGuard(recorder,governor,LOOP_POLICY,"enforced",true,loopSupervisor(ALL_ON,recorder));
  for(let i=0;i<20;i++){
   await recorder.emit({type:"tool_execution_start",toolCallId:`p${String(i)}`,toolName:"press",args:{buttons:["UP"]}});
   recorder.buttonPress(`p${String(i)}`,["UP"],{hold_frames:10,release_frames:8},field);await recorder.afterPress();
   await recorder.emit({type:"tool_execution_end",toolCallId:`p${String(i)}`,toolName:"press",result:{content:[{type:"text",text:`pressed UP\n${STORY_RIVAL}`}],details:{state:field}},isError:false});
   detector.context();
  }
  const briefings=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(l=>JSON.parse(l) as {type:string;phase?:string;message?:string}).filter(e=>e.type==="loop_guard"&&e.phase==="supervisor");
  expect(briefings.length).toBeGreaterThan(0);
  expect(briefings[0]?.message).toContain("- Story steps the game confirms are done: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received; rival met\n");
 }finally{rmSync(runsRoot,{recursive:true,force:true});}
});

it("never cuts any context builder's entry, whatever its length (INV-1)",()=>{
 for(const n of [10_000,40_000]){
  const long=`${"Q".repeat(n)}END`;
  const sup=new SupervisorBriefing(ALL_ON);result(sup,1,msg(long,"dismiss_wait",9));
  const ledger=new InstructionLedger(ALL_ON);result(ledger,1,msg(long,"dismiss_wait",9));
  const log=new DialogueLog(ALL_ON);result(log,1,msg(long,"dismiss_wait",9));
  const memory=new NavigationMemory(ALL_ON);result(memory,1,msg(long,"dismiss_wait",9));
  for(const text of [sup.text("cycle",2),sup.textOnly(3,1,3),ledger.text(),log.recall({}),memory.text()])expect(text).toContain(long);
 }
});

it("repeats every staged Story line the readout prints, word for word (INV-2)",()=>{
 const lines=["Story: no completion confirmed","Story: player name confirmed; Mom clock instruction received","Story: player name confirmed; Mom clock instruction received; clock set","Story: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received",STORY_RIVAL,`${STORY_RIVAL}; sent to save Birch; Birch rescue complete; Birch starter handoff complete`];
 for(const line of lines){const b=new SupervisorBriefing(ALL_ON);result(b,1,{},"t",`ok\n${line}`);expect(b.text("cycle",2)).toContain(`- Story steps the game confirms are done: ${line.slice("Story: ".length)}\n`);}
});

it("lists a room's exits before its objects among the targets not tried yet (truck run dc0e)",()=>{
 const box=(x:number,y:number)=>({...SCIENTIST,name:"MOVING_BOX",x,y});
 const exit=(y:number)=>({...EXIT,name:"Dynamic warp",x:4,y,destination:[127,127,0]});
 const b=new SupervisorBriefing(ALL_ON);
 result(b,1,{location:"INSIDE OF TRUCK",map_id:[25,40],position:{x:3,y:3},interaction_targets:[box(0,0),box(0,3),box(2,3),exit(1),exit(2),exit(3)]});
 const listed=b.text("cycle",2).split("not tried yet: ")[1]?.split("\n")[0]??"";
 expect(listed.indexOf("Dynamic warp at 4,1")).toBe(0);
 expect(listed.indexOf("Dynamic warp at 4,3")).toBeLessThan(listed.indexOf("MOVING_BOX at 0,0"));
 expect(listed).toContain("MOVING_BOX at 2,3");
});
