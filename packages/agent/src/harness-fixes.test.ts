import {mkdtempSync} from "node:fs";
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
 result(b,3,{},"t2","ok\nStory: unavailable while the map loads");
 expect(b.text("cycle",5)).toContain("Mom rival instruction received; rival met");
 expect(b.text("cycle",5)).not.toContain("unavailable while the map loads");
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
