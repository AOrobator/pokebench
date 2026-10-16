import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {PeopleLedger,facedObject,withPeopleLedger} from "./people-ledger.js";
import {playGameTools} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {parsePlayPreset,presetFeatures} from "./play-preset.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {IN_GAME} from "../test-support/events.js";

interface Fixture {readonly run:string;readonly harness_features:readonly string[];readonly events:readonly unknown[]}
const SHOW=JSON.parse(readFileSync(new URL("../test-support/people-ledger-show.json",import.meta.url),"utf8")) as Fixture;
const EVENTS:RunEvent[]=SHOW.events.map(e=>checkEvent(e));
type StateEvent=Extract<RunEvent,{type:"state";started:boolean}>;
type ToolResultEvent=Extract<RunEvent,{type:"tool_result"}>;
function snapshot(e:StateEvent):GameStateSnapshot {
 const {v:_v,run:_run,seq:_seq,t:_t,type:_type,turn:_turn,...body}=e;
 return parseGameState(body);
}
const stateAt=(seq:number)=>{const e=EVENTS.find(x=>x.seq===seq);if(e?.type!=="state"||!("started" in e))throw Error(`no state ${String(seq)}`);return snapshot(e);};
const resultAt=(turn:number)=>{const e=EVENTS.find((x):x is ToolResultEvent=>x.type==="tool_result"&&x.turn===turn);if(e===undefined)throw Error(`no result ${String(turn)}`);return e;};
const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as Record<(typeof SWITCHABLE_FEATURES)[number],boolean>;
const ON:FeatureSet={...ALL_ON,"state-only-decisions-v1":false,"people-ledger-v1":true};

const T418_BLOCK=[
 "People and objects here (this map's live objects; a sprite kind is a graphic, not a name):",
 "- object 4, sprite WOMAN_4, at (8,7): last talked to on turn 145 (273 turns ago; 5 story milestones since)",
 "- object 6, sprite NINJA_BOY, at (8,5): not talked to this run",
 "Story characters here: none. Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN.",
].join("\n");

function replay(ledger:PeopleLedger,until:number):void {for(const e of EVENTS){if(e.seq>until)break;ledger.observe(e);}}

describe("people-ledger-v1 on the 2026-10-16T00-34-26_qwen36-gpu1_show recording",()=>{
 it("lists May's mom as last talked to on turn 145 and the boy as never talked to, right after the Position line at T418",()=>{
  const ledger=new PeopleLedger();
  const result=resultAt(418);
  replay(ledger,result.seq-1);
  const text=ledger.annotate(result.text,stateAt(12555),result.id);
  expect(ledger.block(stateAt(12555),result.text,result.id)).toBe(T418_BLOCK);
  expect(text).toContain(`Location: LITTLEROOT TOWN MAYS HOUSE 1F\nPosition: X=2, Y=6, facing up\n${T418_BLOCK}\nParty (player): TORCHIC Lv5 HP 19/19\n`);
  // Nothing else in the readout changes, and nothing is clipped.
  expect(text.replace(`${T418_BLOCK}\n`,"")).toBe(result.text);
 });
 it("counts a talk in the call that shows it, before its result is recorded (T424 NINJA_BOY)",()=>{
  const ledger=new PeopleLedger();
  const result=resultAt(424);
  replay(ledger,result.seq-1);
  const block=ledger.block(stateAt(12680),"Location: X\nPosition: X=9, Y=5, facing right",result.id);
  expect(block).toContain("- object 6, sprite NINJA_BOY, at (10,5): last talked to on turn 424 (this turn; 0 story milestones since)");
  expect(block).toContain("- object 4, sprite WOMAN_4, at (8,7): last talked to on turn 145 (279 turns ago; 5 story milestones since)");
  // Another call's result does not count a talk whose own result has not been delivered.
  expect(ledger.block(stateAt(12680),"Location: X",`${result.id}-other`)).toContain("NINJA_BOY, at (10,5): not talked to this run");
  ledger.observe(result);
  expect(ledger.block(stateAt(12680),"Location: X","later")).toContain("NINJA_BOY, at (10,5): last talked to on turn 424");
 });
 it("resolves the faced object the game itself would talk to",()=>{
  expect(facedObject(stateAt(2842))).toMatchObject({local_id:4,sprite_kind:"WOMAN_4",map_id:[1,2]});
  expect(facedObject(stateAt(12680))).toMatchObject({local_id:6,sprite_kind:"NINJA_BOY"});
  expect(facedObject(stateAt(12555))).toBeNull();
 });
});

const world=(objects:{local_id:number;x:number;y:number;sprite_kind:string|null;map_id?:[number,number]}[],extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>parseGameState({...IN_GAME,screen:"overworld",location:"ROOM",map_id:[1,2],position:{x:2,y:2},facing:"up",world_context:{objects:objects.map(o=>({graphics_id:1,map_id:[1,2],...o})),triggers:[],dialogue:null},...extra});
let seq=0;
const ev=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-16T02:00:00.000-04:00",turn:1,seq:++seq,...body});
const stateEvent=(s:GameStateSnapshot,turn:number):RunEvent=>ev({type:"state",turn,...s});
const talk=(state:RunEvent,turn:number,id:string,body:Partial<{tool:"press"|"navigate_to";sent:string[];speaker_source:"name_prefix"|"faced_sprite"|"faced_target"|null}>={}):RunEvent=>ev({type:"dialogue_auto_advance",turn,tool_call_id:id,tool:body.tool??"press",requested:body.sent??["A"],sent:body.sent??["A"],dropped:[],auto_presses:1,pages:[{state_seq:state.seq,map:"ROOM",map_id:[1,2],position:{x:2,y:2},speaker:"X",speaker_source:body.speaker_source===undefined?"name_prefix":body.speaker_source,text:"Hi."}],stop:"field_free",detail:"closed",duration_ms:1});
const delivered=(id:string,turn:number,is_error=false):RunEvent=>ev({type:"tool_result",turn,id,name:"press",is_error,duration_ms:1,text:"ok"});
const story=(name:string,turn:number):RunEvent=>ev({type:"milestone",turn,name,server_timestamp:1,kind:"story",origin:"observed"});
const nav=(name:string,turn:number):RunEvent=>ev({type:"milestone",turn,name,server_timestamp:1,kind:"navigation",origin:"observed"});

describe("people-ledger-v1 ledger rules",()=>{
 it("counts an A press facing someone, a faced speaker without A, and across a counter; never an unfaced or unpressed one",()=>{
  const ledger=new PeopleLedger();
  const room=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"},{local_id:2,x:5,y:5,sprite_kind:"GIRL"},{local_id:3,x:2,y:0,sprite_kind:"CLERK"}]);
  const s1=stateEvent(room,1);ledger.observe(s1);ledger.observe(talk(s1,1,"a"));ledger.observe(delivered("a",1));
  // B pressed facing the same man while the game names no speaker: it is still counted from the faced attribution.
  const s2=stateEvent(room,2);ledger.observe(s2);ledger.observe(talk(s2,2,"b",{sent:["B"],speaker_source:"faced_sprite"}));ledger.observe(delivered("b",2));
  expect(ledger.block(room,"Location: ROOM","c")).toContain("- object 1, sprite MAN, at (2,1): last talked to on turn 2 (this turn; 0 story milestones since)");
  // A navigate_to that ends in a named speaker while facing nobody counts for no one.
  const away=world([{local_id:2,x:5,y:5,sprite_kind:"GIRL"}]);
  const s3=stateEvent(away,3);ledger.observe(s3);ledger.observe(talk(s3,3,"d",{tool:"navigate_to",sent:[]}));ledger.observe(delivered("d",3));
  // A scripted name-prefixed message without an A press does not count for the faced object.
  const s4=stateEvent(room,4);ledger.observe(s4);ledger.observe(talk(s4,4,"e",{sent:["UP"]}));ledger.observe(delivered("e",4));
  ledger.observe(nav("SOMEWHERE",4));ledger.observe(story("ONE",4));ledger.observe(story("TWO",5));
  ledger.observe(ev({type:"turn_start",turn:6,context:{messages:1,images:0,est_tokens:1}}));
  const block=ledger.block(room,"Location: ROOM","f");
  expect(block).toContain("- object 1, sprite MAN, at (2,1): last talked to on turn 2 (4 turns ago; 2 story milestones since)");
  expect(block).toContain("- object 2, sprite GIRL, at (5,5): not talked to this run");
  // Counter: nobody on the faced tile, which is a counter; the clerk beyond it is who the game talks to.
  const counter=world([{local_id:3,x:2,y:0,sprite_kind:"CLERK"}],{navigation_grid:{elevation:3,tiles:[{x:2,y:1,collision:1,behavior:0x80,elevation:3}],objects:[],warps:[]}});
  expect(facedObject(counter)).toMatchObject({local_id:3});
  const s5=stateEvent(counter,7);ledger.observe(s5);ledger.observe(talk(s5,7,"g"));ledger.observe(delivered("g",7));
  expect(ledger.block(counter,"Location: ROOM","h")).toContain("- object 3, sprite CLERK, at (2,0): last talked to on turn 7 (this turn; 0 story milestones since)");
  // A plain wall tile in between is not a counter.
  expect(facedObject(world([{local_id:3,x:2,y:0,sprite_kind:"CLERK"}],{navigation_grid:{elevation:3,tiles:[{x:2,y:1,collision:1,behavior:0,elevation:3}],objects:[],warps:[]}}))).toBeNull();
 });
 it("drops a talk whose result failed, and keys people by their own map and local id",()=>{
  const ledger=new PeopleLedger();
  const room=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]);
  const s1=stateEvent(room,1);ledger.observe(s1);ledger.observe(talk(s1,1,"a"));ledger.observe(delivered("a",1,true));
  expect(ledger.block(room,"Location: ROOM","b")).toContain("not talked to this run");
  ledger.observe(story("ONE",1));
  const s2=stateEvent(room,2);ledger.observe(s2);ledger.observe(talk(s2,2,"c"));ledger.observe(delivered("c",2));
  // The same local id on another map is another person.
  const other=world([{local_id:1,x:2,y:1,sprite_kind:"MAN",map_id:[1,3]}]);
  expect(ledger.block(other,"Location: ROOM","d")).toBe("People and objects here (this map's live objects; a sprite kind is a graphic, not a name):\n- object 1 of map 1/3, sprite MAN, at (2,1): not talked to this run");
  // A talk whose page cites a state the ledger never saw counts for no one.
  ledger.observe(talk(ev({type:"turn_start",turn:3,context:{messages:1,images:0,est_tokens:1}}),3,"e"));ledger.observe(delivered("e",3));
  expect(ledger.block(world([{local_id:9,x:2,y:1,sprite_kind:null}]),"Location: ROOM","f")).toContain("- object 9, sprite unknown, at (2,1): not talked to this run");
 });
 it("names story characters where character presence places them and repeats its absent list",()=>{
  const ledger=new PeopleLedger();
  const s=world([{local_id:7,x:2,y:5,sprite_kind:"RIVAL_MAY_NORMAL"},{local_id:4,x:8,y:7,sprite_kind:"WOMAN_4"}]);
  const readout="Location: ROOM\nStory characters here (from this map's own object list): MAY at 2,5, PROF. BIRCH (on this map, out of view). Not on this map: BRENDAN, MOM. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.";
  expect(ledger.block(s,readout,"a")).toBe([
   "People and objects here (this map's live objects; a sprite kind is a graphic, not a name):",
   "- object 7, MAY (sprite RIVAL_MAY_NORMAL), at (2,5): not talked to this run",
   "- object 4, sprite WOMAN_4, at (8,7): not talked to this run",
   "Story characters here: MAY at 2,5, PROF. BIRCH (on this map, out of view). Not on this map: BRENDAN, MOM.",
  ].join("\n"));
  expect(ledger.block(world([]),"Location: ROOM","b")).toBe("People and objects here (this map's live objects; a sprite kind is a graphic, not a name): none");
 });
 it("adds nothing outside a started overworld readout",()=>{
  const ledger=new PeopleLedger();
  const s=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]);
  for(const state of [{...s,screen:"battle"},{...s,in_battle:true},{...s,started:false},{...s,map_id:null},{...s,world_context:null}])expect(ledger.block(state,"Location: ROOM","a")).toBeNull();
  expect(ledger.annotate("Screen: battle",s,"a")).toBe("Screen: battle");
  expect(ledger.annotate("Location: ROOM\nParty: x",s,"a")).toBe(`Location: ROOM\n${ledger.block(s,"","a") ?? ""}\nParty: x`);
  expect(ledger.annotate("Location: ROOM\nPosition: X=2, Y=2, facing up\nParty: x",s,"a")).toBe(`Location: ROOM\nPosition: X=2, Y=2, facing up\n${ledger.block(s,"","a") ?? ""}\nParty: x`);
 });
});

type Details={state:GameStateSnapshot|undefined};
const READOUT="Screen: overworld\nLocation: ROOM\nPosition: X=2, Y=2, facing up\nParty (player): none";
function fakeObserve(state:GameStateSnapshot):AgentTool {
 return {name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"image",data:"x",mimeType:"image/png"},{type:"text",text:READOUT}],details:{state}} satisfies AgentToolResult<Details>)};
}
function fakePress(state:GameStateSnapshot):CheckedPressTool {
 const result=():Promise<AgentToolResult<Details>>=>Promise.resolve({content:[{type:"text",text:`pressed A\n\n${READOUT}`}],details:{state}});
 return {name:"press",label:"Press",description:"d",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:result,executeChecked:result} as unknown as CheckedPressTool;
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");

describe("people-ledger-v1 switch",()=>{
 const state=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]);
 it("OFF hands back the very same tools and subscribes to nothing",async()=>{
  const subs:unknown[]=[];const tools=[fakeObserve(state),fakePress(state)];
  const out=withPeopleLedger(tools,OFF,{subscribe:fn=>{subs.push(fn);}});
  expect(out).toHaveLength(2);out.forEach((t,i)=>{expect(t).toBe(tools[i]);});
  expect(subs).toHaveLength(0);
  expect(textOf(await out[0]?.execute("x",{}) ?? {content:[],details:undefined})).toBe(`|${READOUT}`);
 });
 it("ON adds the block to observe and press results, keeps press checkable and leaves other tools alone",async()=>{
  const subs:((e:RunEvent)=>void)[]=[];
  const other:AgentTool={name:"get_dialogue",label:"g",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROOM"}],details:undefined})};
  const out=withPeopleLedger([fakeObserve(state),fakePress(state),other],ON,{subscribe:fn=>{subs.push(fn);}});
  expect(subs).toHaveLength(1);
  const observed=textOf(await out[0]?.execute("o",{}) ?? {content:[],details:undefined});
  expect(observed).toContain("Position: X=2, Y=2, facing up\nPeople and objects here (this map's live objects; a sprite kind is a graphic, not a name):\n- object 1, sprite MAN, at (2,1): not talked to this run\nParty (player): none");
  const press=out[1];
  if(press===undefined||!isCheckedPress(press))throw Error("press lost executeChecked");
  expect(textOf(await press.execute("p",{buttons:["A"]}))).toContain("- object 1, sprite MAN");
  expect(textOf(await press.executeChecked("p",{buttons:["A"]},()=>undefined))).toContain("- object 1, sprite MAN");
  expect(out[2]).toBe(other);
 });
 it("the production factory honors the switch",async()=>{
  const subs:unknown[]=[];const recorder={subscribe:(fn:unknown)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const base=[fakeObserve(state)];const reader={read:()=>Promise.resolve(state)};
  const on=playGameTools(base,{...OFF,"people-ledger-v1":true},reader,recorder);
  expect(textOf(await on[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain("People and objects here");
  const off=playGameTools(base,OFF,reader,recorder);
  expect(textOf(await off[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe(`|${READOUT}`);
 });
 it("is registered default-off, needs dialogue auto-advance and records its id last",()=>{
  expect(featureInfo("people-ledger-v1")).toMatchObject({group:"observation",needs:"dialogue-auto-advance-v1",switchable:true});
  expect(featureInfo("people-ledger-v1").description).toContain(" Off: ");
  expect(dependencyProblems({...OFF,"people-ledger-v1":true})).toContain("people-ledger-v1 needs dialogue-auto-advance-v1");
  expect(playHarnessFeatures(ON,null).at(-1)).toBe("people-ledger-v1");
  expect(playHarnessFeatures({...ON,"people-ledger-v1":false},null)).not.toContain("people-ledger-v1");
  const features=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!=="people-ledger-v1"));
  const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features});
  expect(presetFeatures(preset)["people-ledger-v1"]).toBe(false);
 });
});
