// untalked-people-header-v1: 47c3 (s2479) had "object 4, sprite WOMAN_4 … last talked to on turn 64 (… 5 story
// milestones since)" as one line among about 60 and left the room at T97. This puts who has not been talked to since
// the latest story milestone in the "Read from game memory, always true:" header.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {playGameTools} from "./play-wiring.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {TRUST_HEADER,withHarnessTrust} from "./harness-trust.js";
import {UNTALKED_HEADER} from "./people-ledger.js";

const ID="untalked-people-header-v1" as const;
const room=(extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>parseGameState({...IN_GAME,screen:"overworld",location:"ROOM",map_id:[1,2],position:{x:2,y:2},facing:"up",in_battle:false,
 interaction_targets:[
  {name:"WOMAN_4",kind:"object",x:2,y:1,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:4,destination:null},
  {name:"BOY_1",kind:"object",x:5,y:5,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:2,destination:null},
  {name:"ITEM_BALL",kind:"object",x:7,y:7,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:6,destination:null},
  {name:"Sign",kind:"background",x:2,y:3,elevation:0,activation:"A",availability:"conditional",facing:null,local_id:null,destination:null},
 ],...extra});
let seq=0;
const ev=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-22T12:00:00.000-04:00",turn:1,seq:++seq,...body});
const stateEvent=(s:GameStateSnapshot,turn:number):RunEvent=>ev({type:"state",turn,...s});
const talk=(state:RunEvent,turn:number,id:string):RunEvent[]=>[
 ev({type:"dialogue_auto_advance",turn,tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:state.seq,map:"ROOM",map_id:[1,2],position:{x:2,y:2},speaker:null,speaker_source:"faced_sprite",text:"Hi."}],stop:"field_free",detail:"closed",duration_ms:1}),
 ev({type:"tool_result",turn,id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}),
];
const milestone=(name:string,turn:number,origin:"observed"|"present_at_start"="observed"):RunEvent=>ev({type:"milestone",turn,name,server_timestamp:1,kind:"story",origin});

function harness(untalked:boolean){
 const subs:((e:RunEvent)=>void)[]=[];
 let current:AgentToolResult<{state:GameStateSnapshot}>={content:[{type:"text",text:"Location: ROOM"}],details:{state:room()}};
 const observe:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve(current)};
 const [tool]=withHarnessTrust([observe],true,{subscribe:fn=>{subs.push(fn);},storyGoalAway:()=>undefined},{places:()=>Promise.resolve({places:[]})},{supervisor:false,untalkedPeople:untalked});
 const emit=(...events:RunEvent[]):void=>{for(const e of events)for(const s of subs)s(e);};
 const read=async(state:GameStateSnapshot=room(),text="Location: ROOM"):Promise<string>=>{
  current={content:[{type:"text",text}],details:{state}};
  const r=await tool?.execute("id",{});
  const part=r?.content.find(c=>c.type==="text");
  return part?.type==="text"?part.text:"";
 };
 return {emit,read};
}
const headerOf=(text:string):string=>text.slice(0,text.indexOf("\n\n"));

describe("untalked-people-header-v1",()=>{
 it("OFF: the header has no people line",async()=>{
  const h=harness(false);
  expect(headerOf(await h.read())).not.toContain(UNTALKED_HEADER);
 });
 it("ON: lists everyone not talked to since the latest story milestone, with when they were last talked to; never item balls or signs",async()=>{
  expect(UNTALKED_HEADER).toBe("People on this map you have not talked to since your last story milestone:");
  const h=harness(true);
  const facing=stateEvent(room({facing:"up"}),3);
  h.emit(facing,...talk(facing,3,"t1"));
  h.emit(milestone("PLAYER_HOUSE_EXITED",5));
  const header=headerOf(await h.read());
  expect(header.startsWith(TRUST_HEADER)).toBe(true);
  expect(header.split("\n").at(-1)).toBe(`${UNTALKED_HEADER} object 4, sprite WOMAN_4, at (2,1), last talked to on turn 3; object 2, sprite BOY_1, at (5,5), not talked to this run.`);
 });
 it("ON: someone talked to since the milestone drops off, and none says so",async()=>{
  const h=harness(true);
  const a=stateEvent(room({facing:"up"}),3);
  h.emit(a,...talk(a,3,"t1"));
  expect(headerOf(await h.read()).split("\n").at(-1)).toBe(`${UNTALKED_HEADER} object 2, sprite BOY_1, at (5,5), not talked to this run.`);
  const b=stateEvent(room({position:{x:5,y:6},facing:"up"}),4);
  h.emit(b,...talk(b,4,"t2"));
  expect(headerOf(await h.read(room({position:{x:5,y:6}}))).split("\n").at(-1)).toBe(`${UNTALKED_HEADER} none.`);
 });
 it("ON: a harness auto-talk counts as talking, though it has no tool result of its own",async()=>{
  const h=harness(true);
  h.emit(milestone("PLAYER_HOUSE_EXITED",2));
  h.emit(ev({type:"auto_talk",turn:3,trigger:"quiet_map",repeats:10,outcome:"talked",target:{kind:"person",name:"WOMAN_4",character:null,key:"1/2#4",x:2,y:1,map_id:[1,2]},walks:1,tried:1,text:"SUPERVISOR: x"}));
  expect(headerOf(await h.read()).split("\n").at(-1)).toBe(`${UNTALKED_HEADER} object 2, sprite BOY_1, at (5,5), not talked to this run.`);
 });
 it("ON: a measurement-only or present-at-start milestone does not count as the latest story milestone",async()=>{
  const h=harness(true);
  const a=stateEvent(room({facing:"up"}),3);
  h.emit(a,...talk(a,3,"t1"),milestone("RIVAL_BATTLE_STARTED",4),milestone("STARTER_CHOSEN",4,"present_at_start"));
  expect(headerOf(await h.read()).split("\n").at(-1)).toBe(`${UNTALKED_HEADER} object 2, sprite BOY_1, at (5,5), not talked to this run.`);
 });
 it("ON: names a story character the character-presence line places on the object's tile",async()=>{
  const h=harness(true);
  const text="Location: ROOM\nStory characters here (from this map's own object list): MOM at 2,1. Not on this map: MAY. Sprite kinds such as SCIENTIST_1 are graphics.";
  expect(headerOf(await h.read(room(),text))).toContain(`${UNTALKED_HEADER} object 4, MOM (sprite WOMAN_4), at (2,1), not talked to this run;`);
 });
 it("ON: no line in a battle or off the overworld",async()=>{
  const h=harness(true);
  expect(headerOf(await h.read(room({screen:"battle",in_battle:true})))).not.toContain(UNTALKED_HEADER);
  expect(headerOf(await h.read(room({in_battle:true})))).not.toContain(UNTALKED_HEADER);
 });
 it("is registered as a default-off agent-only observation that needs harness-trust-v1",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"harness-trust-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
 it("the production factory honors the switch",async()=>{
  const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
  const factory=async(features:FeatureSet):Promise<string>=>{
   const recorder={subscribe:()=>undefined,storyGoalAway:()=>undefined,destinationCitation:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
   const observe:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROOM"}],details:{state:room()}})};
   const tools=playGameTools([observe],features,{read:()=>Promise.resolve(room()),places:()=>Promise.resolve({places:[]})},recorder);
   const r=await tools.find(t=>t.name==="observe")?.execute("o",{});
   return r?.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("|")??"";
  };
  expect(await factory({...OFF,"harness-trust-v1":true,[ID]:true})).toContain(`${UNTALKED_HEADER} object 4, sprite WOMAN_4, at (2,1), not talked to this run; object 2, sprite BOY_1, at (5,5), not talked to this run.`);
  expect(await factory({...OFF,"harness-trust-v1":true})).not.toContain(UNTALKED_HEADER);
 });
});
