import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {PEOPLE_HEADER,PeopleLedger,facedObject,mapObjects,withPeopleLedger} from "./people-ledger.js";
import {playGameTools} from "./play-wiring.js";
import {REMINDER,REMINDER_EVERY} from "./navigate-first.js";
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
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
}
const stateAt=(seq:number)=>{const e=EVENTS.find(x=>x.seq===seq);if(e?.type!=="state"||!("started" in e))throw Error(`no state ${String(seq)}`);return snapshot(e);};
const resultAt=(turn:number)=>{const e=EVENTS.find((x):x is ToolResultEvent=>x.type==="tool_result"&&x.turn===turn);if(e===undefined)throw Error(`no result ${String(turn)}`);return e;};
const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as Record<(typeof SWITCHABLE_FEATURES)[number],boolean>;
const ON:FeatureSet={...ALL_ON,"state-only-decisions-v1":false,"people-ledger-v1":true};

const T418_BLOCK=[
 "People and objects here (every object the game has loaded on this map; a sprite kind is a graphic, not a name):",
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
 it("names PROF. BIRCH on his own object from the character-presence line at T406, and the lab aide talked to at T204",()=>{
  const ledger=new PeopleLedger();
  const result=resultAt(406);
  replay(ledger,result.seq-1);
  expect(ledger.block(stateAt(12258),result.text,result.id)).toBe([
   "People and objects here (every object the game has loaded on this map; a sprite kind is a graphic, not a name):",
   "- object 1, sprite SCIENTIST_1, at (9,8): last talked to on turn 204 (202 turns ago; 2 story milestones since)",
   "- object 2, PROF. BIRCH (sprite PROF_BIRCH), at (6,4): not talked to this run",
   "Story characters here: PROF. BIRCH at 6,4. Not on this map: MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN.",
  ].join("\n"));
 });
 it("lists objects the game has loaded beyond the 7-tile field-object list (state 889: BOY_2 far off in Littleroot) and leaves out objects with no script (the truck)",()=>{
  const s=stateAt(889);
  expect(s.world_context?.objects.map(o=>o.local_id)).toEqual([5,4]);
  expect(mapObjects(s)?.map(o=>`${String(o.local_id)} ${o.sprite ?? ""}`)).toEqual(["3 BOY_2","4 MOM"]);
  expect(new PeopleLedger().block(s,"Location: LITTLEROOT TOWN","x")).toBe(`${PEOPLE_HEADER}\n- object 3, sprite BOY_2, at (14,17): not talked to this run\n- object 4, sprite MOM, at (5,9): not talked to this run`);
 });
 it("counts nobody for a scriptless cutscene object: May walking up at T161 has no object script, so she is not a listed object",()=>{
  expect(facedObject(stateAt(3183))).toBeNull();
  expect(stateAt(3183).world_context?.objects.some(o=>o.local_id===7&&o.sprite_kind==="RIVAL_MAY_NORMAL")).toBe(true);
  expect(mapObjects(stateAt(3183))?.map(o=>o.local_id)).toEqual([4,6]);
 });
 it("resolves the faced object the game itself would talk to",()=>{
  expect(facedObject(stateAt(2842))).toMatchObject({key:"1/2#4",local_id:4,sprite:"WOMAN_4"});
  expect(facedObject(stateAt(12680))).toMatchObject({key:"1/2#6",local_id:6,sprite:"NINJA_BOY"});
  expect(facedObject(stateAt(12555))).toBeNull();
 });
});

// Object targets as the game server reports them (world.py read_targets), plus a sign that is not an object.
const world=(objects:{local_id:number;x:number;y:number;sprite_kind:string|null;elevation?:number}[],extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>parseGameState({...IN_GAME,screen:"overworld",location:"ROOM",map_id:[1,2],position:{x:2,y:2},facing:"up",
 interaction_targets:[...objects.map(o=>({name:o.sprite_kind,kind:"object",x:o.x,y:o.y,elevation:o.elevation??3,activation:"A",availability:"conditional",facing:null,local_id:o.local_id,destination:null})),{name:"Sign",kind:"background",x:2,y:3,elevation:0,activation:"A",availability:"conditional",facing:null,local_id:null,destination:null}],...extra});
let seq=0;
const ev=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-16T02:00:00.000-04:00",turn:1,seq:++seq,...body});
const stateEvent=(s:GameStateSnapshot,turn:number):RunEvent=>ev({type:"state",turn,...s});
const talk=(state:RunEvent,turn:number,id:string,body:Partial<{tool:"press"|"navigate_to";sent:string[];speaker_source:"name_prefix"|"faced_sprite"|"faced_target"|null}>={}):RunEvent=>ev({type:"dialogue_auto_advance",turn,tool_call_id:id,tool:body.tool??"press",requested:body.sent??["A"],sent:body.sent??["A"],dropped:[],auto_presses:1,pages:[{state_seq:state.seq,map:"ROOM",map_id:[1,2],position:{x:2,y:2},speaker:"X",speaker_source:body.speaker_source===undefined?"name_prefix":body.speaker_source,text:"Hi."}],stop:"field_free",detail:"closed",duration_ms:1});
const delivered=(id:string,turn:number,is_error=false):RunEvent=>ev({type:"tool_result",turn,id,name:"press",is_error,duration_ms:1,text:"ok",frames:[]});
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
  // Elevation: of two objects on one tile, the game talks to the one at the player's elevation;
  // elevation 0 (ELEVATION_TRANSITION) on the player's tile or the object matches any.
  const grid=(standing:number)=>({navigation_grid:{elevation:4,tiles:[{x:2,y:2,collision:0,behavior:0,elevation:standing}],objects:[],warps:[]}});
  const bridge=[{local_id:5,x:2,y:1,sprite_kind:"SHADOW",elevation:3},{local_id:6,x:2,y:1,sprite_kind:"KECLEON",elevation:4}];
  expect(facedObject(world(bridge,grid(4)))?.local_id).toBe(6);
  expect(facedObject(world([{local_id:5,x:2,y:1,sprite_kind:"SHADOW",elevation:3}],grid(4)))).toBeNull();
  expect(facedObject(world([{local_id:5,x:2,y:1,sprite_kind:"SHADOW",elevation:3}],grid(0)))?.local_id).toBe(5);
  expect(facedObject(world([{local_id:7,x:2,y:1,sprite_kind:"ANY",elevation:0}],grid(4)))?.local_id).toBe(7);
  // A plain wall tile in between is not a counter.
  expect(facedObject(world([{local_id:3,x:2,y:0,sprite_kind:"CLERK"}],{navigation_grid:{elevation:3,tiles:[{x:2,y:1,collision:1,behavior:0,elevation:3}],objects:[],warps:[]}}))).toBeNull();
 });
 it("composes with battle-text-auto-advance-v1: battle pages are no one's talk, and a battle readout gets no block",()=>{
  const ledger=new PeopleLedger();
  const room=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]);
  const battle={...room,in_battle:true,screen:"battle"} as GameStateSnapshot;
  const s1=stateEvent(battle,1);ledger.observe(s1);
  const battlePage={state_seq:s1.seq,map:"ROOM",map_id:[1,2],position:null,speaker:null,speaker_source:null,text:"Wild ZIGZAGOON appeared!",battle_turn:1,battle_message_id:3};
  ledger.observe(ev({type:"dialogue_auto_advance",turn:1,tool_call_id:"b",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:2,pages:[battlePage],stop:"menu",detail:"battle menu",duration_ms:1}));ledger.observe(delivered("b",1));
  expect(ledger.block(room,"Location: ROOM","c")).toContain("- object 1, sprite MAN, at (2,1): not talked to this run");
  // A trainer's field line before the battle in the same call still counts for the trainer faced.
  const s2=stateEvent(room,2);ledger.observe(s2);
  ledger.observe(ev({type:"dialogue_auto_advance",turn:2,tool_call_id:"d",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:3,pages:[battlePage,{state_seq:s2.seq,map:"ROOM",map_id:[1,2],position:{x:2,y:2},speaker:"MAN",speaker_source:"faced_sprite",text:"Let's battle!"}],stop:"menu",detail:"battle menu",duration_ms:1}));ledger.observe(delivered("d",2));
  expect(ledger.block(room,"Location: ROOM","e")).toContain("- object 1, sprite MAN, at (2,1): last talked to on turn 2");
  const head="pressed A\nBattle text auto-advance: the harness pressed B 2 times to advance battle messages; stopped: battle menu.\nDialogue shown during this call (1 page, in order, whole):\n1. turn 2 · ROOM (map 1/2): \"Wild ZIGZAGOON appeared!\"";
  const inBattle=`${head}\n\nScreen: battle\nLocation: ROOM\nPosition: X=2, Y=2, facing up\nIn battle: yes`;
  expect(ledger.annotate(inBattle,battle,"f")).toBe(inBattle);
  const after=`${head}\n\nScreen: overworld\nLocation: ROOM\nPosition: X=2, Y=2, facing up\nIn battle: no`;
  expect(ledger.annotate(after,room,"f")).toBe(`${head}\n\nScreen: overworld\nLocation: ROOM\nPosition: X=2, Y=2, facing up\n${ledger.block(room,"","f") ?? ""}\nIn battle: no`);
 });
 it("drops a talk whose result failed, and keys people by their own map and local id",()=>{
  const ledger=new PeopleLedger();
  const room=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]);
  const s1=stateEvent(room,1);ledger.observe(s1);ledger.observe(talk(s1,1,"a"));ledger.observe(delivered("a",1,true));
  expect(ledger.block(room,"Location: ROOM","b")).toContain("not talked to this run");
  ledger.observe(story("ONE",1));
  const s2=stateEvent(room,2);ledger.observe(s2);ledger.observe(talk(s2,2,"c"));ledger.observe(delivered("c",2));
  // The same local id on another map is another person.
  const other={...world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]),map_id:[1,3] as [number,number]};
  expect(ledger.block(other,"Location: ROOM","d")).toBe(`${PEOPLE_HEADER}\n- object 1, sprite MAN, at (2,1): not talked to this run`);
  // A talk whose page cites a state the ledger never saw counts for no one.
  ledger.observe(talk(ev({type:"turn_start",turn:3,context:{messages:1,images:0,est_tokens:1}}),3,"e"));ledger.observe(delivered("e",3));
  expect(ledger.block(world([{local_id:9,x:2,y:1,sprite_kind:null}]),"Location: ROOM","f")).toContain("- object 9, sprite unknown, at (2,1): not talked to this run");
 });
 it("names story characters where character presence places them and repeats its absent list",()=>{
  const ledger=new PeopleLedger();
  const s=world([{local_id:7,x:2,y:5,sprite_kind:"RIVAL_MAY_NORMAL"},{local_id:4,x:8,y:7,sprite_kind:"WOMAN_4"}]);
  const readout="Location: ROOM\nStory characters here (from this map's own object list): MAY at 2,5, PROF. BIRCH (on this map, out of view). Not on this map: BRENDAN, MOM. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.";
  expect(ledger.block(s,readout,"a")).toBe([
   "People and objects here (every object the game has loaded on this map; a sprite kind is a graphic, not a name):",
   "- object 7, MAY (sprite RIVAL_MAY_NORMAL), at (2,5): not talked to this run",
   "- object 4, sprite WOMAN_4, at (8,7): not talked to this run",
   "Story characters here: MAY at 2,5, PROF. BIRCH (on this map, out of view). Not on this map: BRENDAN, MOM.",
  ].join("\n"));
  expect(ledger.block(world([]),"Location: ROOM","b")).toBe(`${PEOPLE_HEADER} none`);
 });
 it("coexists with adjacent-tiles-v1: the block goes after Position, the Next tiles line under the map is untouched",()=>{
  const ledger=new PeopleLedger();
  const s=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]);
  const readout=["Screen: overworld","Location: ROOM","Position: X=2, Y=2, facing up","Party (player): none","Local map from live memory; top-left (0,0), north is up:","   0   .   N   .","@ player; N live object","Next tiles: up (2,1) person or object (MAN); down (2,3) clear terrain; left (1,2) clear terrain; right (3,2) clear terrain","Live objects: id 1 at (2,1)"].join("\n");
  const out=ledger.annotate(readout,s,"a").split("\n");
  expect(out.slice(0,3)).toEqual(readout.split("\n").slice(0,3));
  expect(out[3]).toBe(PEOPLE_HEADER);
  expect(out.slice(5)).toEqual(readout.split("\n").slice(3));
 });
 it("reads offscreen-objects-v1's presence entries: a loaded out-of-view tile names its object, a template tile names no one",()=>{
  const ledger=new PeopleLedger();
  const s=world([{local_id:7,x:12,y:3,sprite_kind:"RIVAL_MAY_NORMAL"},{local_id:2,x:6,y:4,sprite_kind:"BOY_1"}]);
  const here="MAY at 12,3 (out of view), PROF. BIRCH at 6,4 (out of view; where the map places this character, it may have moved)";
  const readout=`Location: ROOM\nStory characters here (from this map's own object list): ${here}. Not on this map: MOM. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.`;
  expect(ledger.block(s,readout,"a")).toBe([PEOPLE_HEADER,
   "- object 7, MAY (sprite RIVAL_MAY_NORMAL), at (12,3): not talked to this run",
   "- object 2, sprite BOY_1, at (6,4): not talked to this run",
   `Story characters here: ${here}. Not on this map: MOM.`].join("\n"));
 });
 it("adds nothing outside a started overworld readout",()=>{
  const ledger=new PeopleLedger();
  const s=world([{local_id:1,x:2,y:1,sprite_kind:"MAN"}]);
  for(const state of [{...s,screen:"battle"},{...s,in_battle:true},{...s,started:false},{...s,map_id:null},{...s,interaction_targets:null}])expect(ledger.block(state,"Location: ROOM","a")).toBeNull();
  expect(ledger.annotate("Screen: battle",s,"a")).toBe("Screen: battle");
  expect(ledger.annotate("Location: ROOM\nIn battle: yes",{...s,in_battle:true},"a")).toBe("Location: ROOM\nIn battle: yes");
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
  expect(observed).toContain("Position: X=2, Y=2, facing up\nPeople and objects here (every object the game has loaded on this map; a sprite kind is a graphic, not a name):\n- object 1, sprite MAN, at (2,1): not talked to this run\nParty (player): none");
  const press=out[1];
  if(press===undefined||!isCheckedPress(press))throw Error("press lost executeChecked");
  expect(textOf(await press.execute("p",{buttons:["A"]}))).toContain("- object 1, sprite MAN");
  expect(textOf(await press.executeChecked("p",{buttons:["A"]},()=>undefined))).toContain("- object 1, sprite MAN");
  expect(out[2]).toBe(other);
  // A result without state, or without a readout, passes through untouched.
  const bare:AgentTool={...other,name:"observe",execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROOM"}],details:undefined})};
  const noReadout:AgentTool={...other,name:"navigate_to",execute:()=>Promise.resolve({content:[{type:"text",text:"Navigation: refused"}],details:{state}})};
  const [b,n]=withPeopleLedger([bare,noReadout],ON,{subscribe:()=>undefined});
  expect(textOf(await b?.execute("b",{}) ?? {content:[],details:undefined})).toBe("Location: ROOM");
  expect(textOf(await n?.execute("n",{}) ?? {content:[],details:undefined})).toBe("Navigation: refused");
  // One turn and one story milestone later, in the singular.
  const s1=ev({type:"state",turn:20,...state});subs[0]?.(s1);subs[0]?.(talk(s1,20,"t"));subs[0]?.(delivered("t",20));subs[0]?.(story("ONE",20));subs[0]?.(ev({type:"turn_start",turn:21,context:{messages:1,images:0,est_tokens:1}}));
  expect(textOf(await out[0]?.execute("o2",{}) ?? {content:[],details:undefined})).toContain("- object 1, sprite MAN, at (2,1): last talked to on turn 20 (1 turn ago; 1 story milestone since)");
 });
 it("the production factory honors the switch",async()=>{
  const subs:unknown[]=[];const recorder={subscribe:(fn:unknown)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const base=[fakeObserve(state)];const reader={read:()=>Promise.resolve(state)};
  const on=playGameTools(base,{...OFF,"people-ledger-v1":true},reader,recorder);
  expect(textOf(await on[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain("People and objects here");
  // Unchanged with the prompt-side switches it sits beside: the map legend moved into the prompt, and the "Talk to people" section.
  const beside=playGameTools(base,{...OFF,"people-ledger-v1":true,"readout-rules-in-prompt-v1":true,"explorer-guidance-v1":true},reader,recorder);
  expect(textOf(await beside[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe(textOf(await on[0]?.execute("o",{}) ?? {content:[],details:undefined}));
  const off=playGameTools(base,OFF,reader,recorder);
  expect(textOf(await off[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe(`|${READOUT}`);
 });
 it("composes with untaken-exits-v1 and navigate-first-prompt-v1 in the production factory",async()=>{
  const recorder={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const reader={read:()=>Promise.resolve(state)};
  const both=playGameTools([fakeObserve(state)],{...OFF,"people-ledger-v1":true,"untaken-exits-v1":true},reader,recorder);
  const lines=(textOf(await both[0]?.execute("o",{}) ?? {content:[],details:undefined})).split("\n");
  const at=lines.indexOf("Position: X=2, Y=2, facing up");
  // Position, then the Untaken exits line, then the people block, then the rest unchanged.
  expect(lines[at+1]).toMatch(/^Exits here you have not taken: /);
  expect(lines[at+2]).toBe(PEOPLE_HEADER);
  expect(lines.at(-1)).toBe("Party (player): none");
  // navigate-first's reminder is its own text part; the ledger never edits it.
  const free={...state,field_controls_locked:false} as GameStateSnapshot;
  const nav=playGameTools([fakeObserve(free),fakePress(free)],{...OFF,"people-ledger-v1":true,"navigate-first-prompt-v1":true},reader,recorder);
  const press=nav.find(t=>t.name==="press");
  let last:AgentToolResult<unknown>|undefined;
  for(let i=0;i<REMINDER_EVERY;i++)last=await press?.execute(`p${String(i)}`,{buttons:["UP"]});
  const parts=(last?.content??[]).flatMap(c=>c.type==="text"?[c.text]:[]);
  expect(parts.some(t=>t.includes(PEOPLE_HEADER))).toBe(true);
  expect(parts.filter(t=>t.includes(PEOPLE_HEADER))).toHaveLength(1);
  expect(parts.at(-1)).toBe(REMINDER);
 });
 it("is registered default-off, needs dialogue auto-advance and records its id last",()=>{
  expect(featureInfo("people-ledger-v1")).toMatchObject({group:"observation",needs:"dialogue-auto-advance-v1",switchable:true});
  expect(featureInfo("people-ledger-v1").description).toContain(" Off: ");
  expect(dependencyProblems({...OFF,"people-ledger-v1":true})).toContain("people-ledger-v1 needs dialogue-auto-advance-v1");
  expect(playHarnessFeatures(ON,null).at(-52)).toBe("people-ledger-v1");
  expect(playHarnessFeatures({...ON,"people-ledger-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false},null)).not.toContain("people-ledger-v1");
  const features=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!=="people-ledger-v1"&&id!=="people-id-cards-v1"));
  const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features});
  expect(presetFeatures(preset)["people-ledger-v1"]).toBe(false);
 });
});
