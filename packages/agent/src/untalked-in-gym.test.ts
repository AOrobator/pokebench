import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import type {RunEvent} from "./events.js";
import {ALL_ON} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {PeopleLedger} from "./people-ledger.js";
import {UNTALKED_IN_GYM,untalkedInGymLine,withUntalkedInGym} from "./untalked-in-gym.js";

// Run 2026-10-24T19-31-52_qwen36-gpu1_d41e: its first state inside RUSTBORO CITY GYM (seq 11555, turn 305) and the
// navigate_to_target result text the model read with it (seq 11557).
const GYM=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/untalked-gym-d41e.json.gz",import.meta.url))).toString("utf8")) as {state:GameStateSnapshot&{seq:number;turn:number};readout:string};
export const UNTALKED_D41E=`${UNTALKED_IN_GYM} object 2, sprite YOUNGSTER, at (5,13); object 4, sprite MAN_2, at (3,18).`;
const ENVELOPE=new Set(["v","run","seq","t","type","turn"]);
const BODY=Object.fromEntries(Object.entries(GYM.state).filter(([k])=>!ENVELOPE.has(k)));
const details=(over:Partial<GameStateSnapshot>={})=>({state:{...BODY,...over}});
// The guide (object 4, MAN_2 at 3,18) faced and talked to with an A press, as the people ledger records a talk.
const talkToGuide=(ledger:PeopleLedger):void=>{
 ledger.observe({...GYM.state,seq:20,facing:"left",position:{x:4,y:18},type:"state"} as unknown as RunEvent);
 ledger.observe({type:"dialogue_auto_advance",seq:21,turn:309,tool_call_id:"c1",tool:"press",requested:["A"],sent:["A"],dropped:[],pages:[{state_seq:20,map:"RUSTBORO CITY GYM",map_id:[11,3],position:null,speaker:"MAN_2",speaker_source:"faced_sprite",text:"Yo, how's it going?"}]} as unknown as RunEvent);
 ledger.observe({type:"tool_result",seq:22,turn:309,id:"c1",name:"press",is_error:false} as unknown as RunEvent);
};

describe("untalked-in-gym-v1",()=>{
 it("lists d41e's untalked people on its first RUSTBORO CITY GYM result",()=>{
  expect(untalkedInGymLine(new PeopleLedger(true),details(),GYM.readout,"x")).toBe(UNTALKED_D41E);
 });
 it("drops a person once talked to this run, and says none when everyone has been",()=>{
  const ledger=new PeopleLedger(true);
  talkToGuide(ledger);
  expect(untalkedInGymLine(ledger,details(),GYM.readout,"x")).toBe(`${UNTALKED_IN_GYM} object 2, sprite YOUNGSTER, at (5,13).`);
  ledger.observe({type:"auto_talk",seq:30,turn:310,outcome:"talked",target:{key:"11/3#2"}} as unknown as RunEvent);
  expect(untalkedInGymLine(ledger,details(),GYM.readout,"x")).toBe(`${UNTALKED_IN_GYM} none.`);
 });
 it("names a story character the readout places on the tile and leaves item balls out",()=>{
  const targets=[...(GYM.state.interaction_targets??[]),{name:"ITEM_BALL",kind:"object",x:1,y:1,elevation:3,activation:"",availability:"",facing:null,local_id:9,destination:null},{name:"ROXANNE",kind:"object",x:5,y:2,elevation:3,activation:"",availability:"",facing:null,local_id:1,destination:null}];
  const readout=GYM.readout.replace(/ROXANNE at 5,2 \(out of view; [^)]*\)/g,"ROXANNE at 5,2");
  expect(untalkedInGymLine(new PeopleLedger(true),details({interaction_targets:targets}),readout,"x")).toBe(`${UNTALKED_IN_GYM} object 2, sprite YOUNGSTER, at (5,13); object 4, sprite MAN_2, at (3,18); object 1, ROXANNE (sprite ROXANNE), at (5,2).`);
 });
 it("is silent off gym maps, in battle and without a state",()=>{
  const ledger=new PeopleLedger(true);
  expect(untalkedInGymLine(ledger,details({location:"RUSTBORO CITY"}),GYM.readout,"x")).toBeNull();
  expect(untalkedInGymLine(ledger,details({in_battle:true}),GYM.readout,"x")).toBeNull();
  expect(untalkedInGymLine(ledger,{},GYM.readout,"x")).toBeNull();
  expect(untalkedInGymLine(ledger,null,GYM.readout,"x")).toBeNull();
 });
 it("puts the line first in a game-tool result only when the switch is on",async()=>{
  const observe:AgentTool={name:"observe",label:"observe",description:"",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:GYM.readout}],details:details()})};
  const other:AgentTool={...observe,name:"battle_action"};
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(f:(e:RunEvent)=>void)=>{subs.push(f);}};
  expect(withUntalkedInGym([observe],{...ALL_ON,"untalked-in-gym-v1":false},recorder)[0]).toBe(observe);
  const [tool,untouched]=withUntalkedInGym([observe,other],{...ALL_ON,"untalked-in-gym-v1":true},recorder);
  expect(untouched).toBe(other);
  const result=await tool?.execute("id",{},undefined,undefined);
  expect(result?.content).toEqual([{type:"text",text:UNTALKED_D41E},{type:"text",text:GYM.readout}]);
  const field:AgentTool={...observe,execute:()=>Promise.resolve({content:[{type:"text",text:"no readout"}],details:details({location:"RUSTBORO CITY"})})};
  const [quiet]=withUntalkedInGym([field],{...ALL_ON,"untalked-in-gym-v1":true},recorder);
  expect((await quiet?.execute("id",{},undefined,undefined))?.content).toEqual([{type:"text",text:"no readout"}]);
 });
});
