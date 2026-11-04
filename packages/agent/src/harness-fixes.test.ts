import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";

import {DialogueLog} from "./dialogue-log.js";
import {InstructionLedger} from "./instruction-ledger.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {NavigationMemory} from "./navigation-memory.js";
import {playSystemPrompt} from "./play-config.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";
import {nextMilestoneHint} from "./milestone-hint.js";
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
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
 result(b,1);
 expect(b.text("cycle",3)).toContain("- Story steps the game confirms are done: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received; rival met\n");
 expect(b.textOnly(3,1,3)).toContain("rival met");
});

it("keeps the last available story line while a map loads",()=>{
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
 result(b,1);
 result(b,3,{},"t2","ok\nStory: unavailable (story state not readable right now)");
 expect(b.text("cycle",5)).toContain("Mom rival instruction received; rival met");
 expect(b.text("cycle",5)).not.toContain("not readable right now");
});

it("grades reading a conversation with B as progress, and a repeat A as a restarted conversation",()=>{
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
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

it("calls the same text at another tile or map a new conversation, not a restart",()=>{
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
 result(b,1,msg(null,null));
 press(b,3,["A"],msg(AIDE,"printing",9),"a1");
 press(b,6,["B"],msg(null,null),"b1");
 press(b,9,["UP"],{...msg(null,null),position:{x:9,y:7}},"u1");
 press(b,12,["A"],{...msg(AIDE,"printing",9),position:{x:9,y:7}},"a2");
 press(b,15,["B"],{...msg(null,null),position:{x:9,y:7}},"b2");
 press(b,18,["A"],{...msg(AIDE,"printing",9),position:{x:9,y:7},location:"LAB 2F",map_id:[1,5]},"a3");
 const text=b.text("cycle",20);
 expect(text).not.toMatch(/restarted a conversation already shown/);
 expect(text).toMatch(/→ dialogue changed/);
 press(b,21,["B"],{...msg(null,null),position:{x:9,y:7},location:"LAB 2F",map_id:[1,5]},"b3");
 press(b,24,["A"],{...msg(AIDE,"printing",9),position:{x:9,y:7},location:"LAB 2F",map_id:[1,5]},"a4");
 expect(b.text("cycle",26)).toMatch(/restarted a conversation already shown/);
});

it("semantic-navigation-v2: a navigate_to_target or explore_map receipt counts its target as tried only once it acted on it",()=>{
 const run=(name:string,attempted:boolean)=>{
  const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":true});
  result(b,1);
  b.observe(ev({type:"tool_call",id:"s",name,args:name==="explore_map"?{}:{map_id:[1,4],target:{kind:"object",local_id:1}}},3));
  b.observe(st(4));
  b.observe(ev({type:"tool_result",id:"s",name,is_error:false,duration_ms:1,text:`Semantic navigation: x. Selected map object 1.\n${STORY_RIVAL}`,frames:[],state_seq:4,semantic_navigation:{target:{kind:"object",local_id:1},activation_attempted:attempted}},5));
  const text=b.text("cycle",6);return text.slice(text.indexOf("not tried yet"));
 };
 for(const name of ["navigate_to_target","explore_map"]){
  expect(run(name,true).split("\n")[0]).not.toContain("SCIENTIST_1");
  expect(run(name,false).split("\n")[0]).toContain("SCIENTIST_1");
 }
});

it("semantic-navigation-v2 OFF: without briefing exits, an object key the faced history writes does not hide a person who moved",()=>{
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false,"briefing-exits-v1":false,"faced-interaction-history-v1":true});
 const internal=b as unknown as {touch(room:string,key:string):void;room(s:unknown):string;latest:unknown};
 result(b,1);
 const moved={...SCIENTIST,x:10,y:7};
 result(b,3,{interaction_targets:[moved,EXIT]});
 internal.touch(internal.room(internal.latest),"object:1");
 const text=b.text("cycle",5);
 expect(text.slice(text.indexOf("not tried yet")).split("\n")[0]).toContain("SCIENTIST_1");
});

it("semantic-navigation-v2: a talk that starts a battle still counts its target as tried, with or without briefing exits",()=>{
 for(const exits of [true,false]){
  const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":true,"briefing-exits-v1":exits});
  result(b,1);
  b.observe(ev({type:"tool_call",id:"s",name:"navigate_to_target",args:{map_id:[1,4],target:{kind:"object",local_id:1}}},3));
  b.observe(st(4,{screen:"battle",in_battle:true}));
  b.observe(ev({type:"tool_result",id:"s",name:"navigate_to_target",is_error:false,duration_ms:1,text:"Semantic navigation: activation handed control back: battle began. Selected map object 1.",frames:[],state_seq:4,semantic_navigation:{target:{kind:"object",local_id:1},activation_attempted:true}},5));
  result(b,6);
  const text=b.text("cycle",8);
  expect(text.slice(text.indexOf("not tried yet")).split("\n")[0]).not.toContain("SCIENTIST_1");
 }
});

it("counts only actions as tried: standing on a door mat leaves that exit untried, and story progress clears the list",()=>{
 // Today's rule; briefing-exits-v1 keeps tried things across a story step (briefing-exits.test.ts).
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false,"briefing-exits-v1":false});
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
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
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
 const ledger=new InstructionLedger({...ALL_ON,"semantic-navigation-v2":false,"instruction-ledger-v1":true});
 result(ledger,1,msg(long,"dismiss_wait",500));
 expect(ledger.text()).toContain(long);
 expect(ledger.text().match(new RegExp(long.slice(-60).replace(/[.]/g,"\\."),"g"))?.length).toBeGreaterThanOrEqual(2);
 const log=new DialogueLog({...ALL_ON,"semantic-navigation-v2":false});
 for(let i=0;i<20;i++)result(log,1+i*2,msg(`${long} #${String(i)}`,"dismiss_wait",500));
 const recalled=log.recall({last:20});
 for(let i=0;i<20;i++)expect(recalled).toContain(`${long} #${String(i)}`);
 expect(recalled).not.toMatch(/truncated|omitted/);
 const memory=new NavigationMemory({...ALL_ON,"semantic-navigation-v2":false,"navigation-evidence-memory-v1":true});
 const targets=Array.from({length:20},(_,i)=>({...SCIENTIST,name:`OBJ${String(i)}`,x:i,y:1}));
 result(memory,1,{interaction_targets:targets,...msg(long,"dismiss_wait",500)});
 const shown=memory.text();
 expect(shown).toContain(long);expect(shown).toContain("OBJ19 at 19,1");
 expect(shown).not.toMatch(/truncated|omitted \)|first 8 of/);
});

it("tells the model how navigate_to targets work, in the prompt and the tool",()=>{
 for(const full of [true,false]){
  const prompt=playSystemPrompt({...ALL_ON,"semantic-navigation-v2":false,"full-map-navigation-v1":full,"bounded-navigation-v1":true},null);
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
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
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
  const tools=withNavigation([observeTool("http://127.0.0.1"),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()})],{...ALL_ON,"semantic-navigation-v2":false,"bounded-navigation-v1":true,"full-map-navigation-v1":full},state);
  expect(tools.find(t=>t.name==="navigate_to")?.description).toContain(NAVIGATE_RULES);
 }
});

it("never cuts any context builder's entry, whatever its length (INV-1)",()=>{
 for(const n of [10_000,40_000]){
  const long=`${"Q".repeat(n)}END`;
  const sup=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});result(sup,1,msg(long,"dismiss_wait",9));
  const ledger=new InstructionLedger({...ALL_ON,"semantic-navigation-v2":false});result(ledger,1,msg(long,"dismiss_wait",9));
  const log=new DialogueLog({...ALL_ON,"semantic-navigation-v2":false});result(log,1,msg(long,"dismiss_wait",9));
  const memory=new NavigationMemory({...ALL_ON,"semantic-navigation-v2":false});result(memory,1,msg(long,"dismiss_wait",9));
  for(const text of [sup.text("cycle",2),sup.textOnly(3,1,3),ledger.text(),log.recall({}),memory.text()])expect(text).toContain(long);
 }
});

it("repeats every staged Story line the readout prints, word for word (INV-2)",()=>{
 const lines=["Story: no completion confirmed","Story: player name confirmed; Mom clock instruction received","Story: player name confirmed; Mom clock instruction received; clock set","Story: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received",STORY_RIVAL,`${STORY_RIVAL}; sent to save Birch; Birch rescue complete; Birch starter handoff complete`];
 for(const line of lines){const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});result(b,1,{},"t",`ok\n${line}`);expect(b.text("cycle",2)).toContain(`- Story steps the game confirms are done: ${line.slice("Story: ".length)}\n`);}
});

it("lists a room's exits before its objects among the targets not tried yet (truck run dc0e)",()=>{
 const box=(x:number,y:number)=>({...SCIENTIST,name:"MOVING_BOX",x,y});
 const exit=(y:number)=>({...EXIT,name:"Dynamic warp",x:4,y,destination:[127,127,0]});
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
 result(b,1,{location:"INSIDE OF TRUCK",map_id:[25,40],position:{x:3,y:3},interaction_targets:[box(0,0),box(0,3),box(2,3),exit(1),exit(2),exit(3)]});
 const listed=b.text("cycle",2).split("not tried yet: ")[1]?.split("\n")[0]??"";
 expect(listed.indexOf("Dynamic warp at 4,1")).toBe(0);
 expect(listed.indexOf("Dynamic warp at 4,3")).toBeLessThan(listed.indexOf("MOVING_BOX at 0,0"));
 expect(listed).toContain("MOVING_BOX at 2,3");
});

// dialogue-auto-advance-v1: the paired result state is after the conversation, so the pages come from its event.
const autoAdvance=(b:{observe:(e:RunEvent)=>void},seq:number,id:string,texts:string[])=>{
 b.observe(ev({type:"tool_call",id,name:"press",args:{buttons:["A"]}},seq));
 const pages=texts.map((text,i)=>{b.observe(st(seq+1+i,msg(AIDE,"page_wait",9)));return {state_seq:seq+1+i,map:"LAB",map_id:[1,4],position:{x:9,y:8},speaker:"SCIENTIST_1",speaker_source:"faced_target",text};});
 const at=seq+1+texts.length;
 b.observe(ev({type:"dialogue_auto_advance",tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:texts.length,pages,stop:"field_free",detail:"the conversation closed and field controls are free",duration_ms:5},at));
 result(b,at+1,msg(null,null),id);
 return at+3;
};
it("grades an auto-advanced conversation from its pages, and a repeat as a restarted conversation",()=>{
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});
 result(b,1,msg(null,null));
 const next=autoAdvance(b,3,"a1",["The PROF isn't one for doing desk work.","He's the type of person who would rather go outside."]);
 let text=b.text("cycle",20);
 expect(text).toMatch(/A facing SCIENTIST_1 at 9,7 in LAB \(map 1\/4\) → dialogue shown \(2 pages, advanced automatically\)/);
 expect(text).toContain(`- Recent dialogue you were shown, newest first: turn 1, LAB (map 1/4): "He's the type of person who would rather go outside." | turn 1, LAB (map 1/4): "The PROF isn't one for doing desk work."`);
 autoAdvance(b,next,"a2",["The PROF isn't one for doing desk work.","He's the type of person who would rather go outside."]);
 text=b.text("cycle",30);
 expect(text).toMatch(/A facing SCIENTIST_1 at 9,7 in LAB \(map 1\/4\) → restarted a conversation already shown \(2 pages, advanced automatically\)/);
 expect(text).not.toMatch(/A facing SCIENTIST_1[^;]*→ no change/);
});
it("lets the dialogue log and the instruction ledger cite auto-advanced pages",()=>{
 const log=new DialogueLog({...ALL_ON,"semantic-navigation-v2":false});const ledger=new InstructionLedger({...ALL_ON,"semantic-navigation-v2":false});
 const both={observe:(e:RunEvent)=>{log.observe(e);ledger.observe(e);}};
 result(both,1,msg(null,null));
 autoAdvance(both,3,"a1",["Go see your father at the GYM."]);
 expect(log.entries().map(e=>[e.seq,e.room,e.text])).toEqual([[4,"LAB (map 1/4)","Go see your father at the GYM."]]);
 expect(()=>{ledger.note("dad at home","dad at the GYM",[4]);}).not.toThrow();
 expect(ledger.text()).toContain(`#4 turn 1 · LAB (map 1/4): "Go see your father at the GYM."`);
});

it("battle-text-auto-advance-v1: battle pages stay out of the supervisor's dialogue, the dialogue log and the ledger",()=>{
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});const log=new DialogueLog({...ALL_ON,"semantic-navigation-v2":false});
 const both={observe:(e:RunEvent)=>{b.observe(e);log.observe(e);}};
 result(both,1,msg(null,null));
 both.observe(ev({type:"tool_call",id:"w1",name:"press",args:{buttons:["A"]}},3));
 both.observe(st(4,msg(AIDE,"page_wait",9)));
 both.observe(ev({type:"dialogue_auto_advance",tool_call_id:"w1",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:2,battle_auto_presses:1,pages:[{state_seq:4,map:"LAB",map_id:[1,4],position:null,speaker:null,speaker_source:null,text:"Wild ZIGZAGOON appeared!",battle_turn:1,battle_message_id:1},{state_seq:4,map:"LAB",map_id:[1,4],position:{x:9,y:8},speaker:"PROF. BIRCH",speaker_source:"name_prefix",text:"PROF. BIRCH: You saved me!"}],stop:"field_free",detail:"the conversation closed and field controls are free",duration_ms:5},5));
 result(both,6,msg(null,null),"w1");
 expect(log.entries().map(e=>e.text)).toEqual(["PROF. BIRCH: You saved me!"]);
 const text=b.text("cycle",20);
 expect(text).toContain("PROF. BIRCH: You saved me!");
 expect(text).not.toContain("ZIGZAGOON");
 expect(text).toContain("1 page, advanced automatically");
});

it("counts auto-advanced pages as shown only when their result reached the model",()=>{
 const b=new SupervisorBriefing({...ALL_ON,"semantic-navigation-v2":false});const log=new DialogueLog({...ALL_ON,"semantic-navigation-v2":false});const ledger=new InstructionLedger({...ALL_ON,"semantic-navigation-v2":false});
 const all={observe:(e:RunEvent)=>{b.observe(e);log.observe(e);ledger.observe(e);}};
 result(all,1,msg(null,null));
 all.observe(ev({type:"tool_call",id:"a1",name:"press",args:{buttons:["A"]}},3));
 all.observe(st(4,msg(AIDE,"page_wait",9)));
 all.observe(ev({type:"dialogue_auto_advance",tool_call_id:"a1",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:4,map:"LAB",map_id:[1,4],position:{x:9,y:8},speaker:null,speaker_source:null,text:"Go see your father at the GYM."}],stop:"field_free",detail:"the conversation closed and field controls are free",duration_ms:5},5));
 all.observe(ev({type:"tool_result",id:"a1",name:"press",is_error:true,duration_ms:1,text:"Error: GET /pokebench/observation failed",frames:[]},6));
 expect(log.entries()).toEqual([]);
 expect(()=>{ledger.note("dad at home","dad at the GYM",[4]);}).toThrow();
 autoAdvance(all,7,"a2",["Go see your father at the GYM."]);
 expect(b.text("cycle",20)).toMatch(/A facing SCIENTIST_1 at 9,7 in LAB \(map 1\/4\) → dialogue shown \(1 page, advanced automatically\)/);
});
it("does not log the whole message buffer again when auto-advance stops at a decision with the pages already listed",()=>{
 const log=new DialogueLog({...ALL_ON,"semantic-navigation-v2":false});
 result(log,1,msg(null,null));
 log.observe(ev({type:"tool_call",id:"a1",name:"press",args:{buttons:["A"]}},3));
 log.observe(st(4,msg("Will you help?",null)));
 log.observe(ev({type:"dialogue_auto_advance",tool_call_id:"a1",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:4,map:"LAB",map_id:[1,4],position:{x:9,y:8},speaker:null,speaker_source:null,text:"I need a hand."},{state_seq:4,map:"LAB",map_id:[1,4],position:{x:9,y:8},speaker:null,speaker_source:null,text:"Will you help?"}],stop:"menu",detail:"a menu is open",duration_ms:5},5));
 result(log,6,msg("I need a hand.\nWill you help?","page_wait"),"a1");
 expect(log.entries().map(e=>e.text)).toEqual(["I need a hand.","Will you help?"]);
});

it("logs every auto-advanced page, even two pages with the same text on the same map",()=>{
 const log=new DialogueLog({...ALL_ON,"semantic-navigation-v2":false});
 result(log,1,msg(null,null));
 log.observe(ev({type:"tool_call",id:"a1",name:"press",args:{buttons:["A"]}},3));
 const page=(seq:number)=>({state_seq:seq,map:"LAB",map_id:[1,4] as [number,number],position:{x:9,y:8},speaker:null,speaker_source:null,text:"..."});
 log.observe(ev({type:"dialogue_auto_advance",tool_call_id:"a1",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:2,pages:[page(4),page(5)],stop:"field_free",detail:"the conversation closed and field controls are free",duration_ms:5},6));
 result(log,7,msg(null,null),"a1");
 expect(log.entries().map(e=>e.seq)).toEqual([4,5]);
});
