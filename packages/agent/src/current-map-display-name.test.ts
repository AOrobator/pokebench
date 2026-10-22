// current-map-display-name-v1 (frontier report H7): navigate_to_target's "Current map:" line names the map as the
// readout's Location line does. Fixture test-support/current-map-display-47c3.json: run
// 2026-10-22T02-08-18_qwen36-gpu1_47c3, the state at seq 4775 (map 1/3, location LITTLEROOT TOWN MAYS HOUSE 2F,
// location_display PROF. BIRCH'S HOUSE 2F), the model's navigate_to_target call for map [1,2], and tool result 4776,
// after which the model thought the game used map 1/3 for both PROF. BIRCH'S HOUSE 2F and MAY's house.
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {FEATURES,featureInfo,playHarnessFeatures,dependencyProblems,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {withNavigation} from "./navigation.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {observedInstructions} from "./observed-instructions.js";
import {checkEvent,type RunEvent} from "./events.js";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {CheckedPressTool} from "./game-tools.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";

const ID="current-map-display-name-v1";
interface Fixture {readonly state:unknown;readonly call:{map_id:[number,number];target:unknown};readonly result:string}
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/current-map-display-47c3.json",import.meta.url),"utf8")) as Fixture;
const STATE=parseGameState(FIXTURE.state);
const RECORDED_LINE=FIXTURE.result.split("\n").find(l=>l.startsWith("Current map: "))??"";
const BASE:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"semantic-navigation-v2":true,"semantic-current-map-feedback-v1":true};

async function refusal(features:FeatureSet,state:GameStateSnapshot):Promise<string> {
 const result=():Promise<AgentToolResult<unknown>>=>Promise.resolve({content:[{type:"text",text:"observed"}],details:{state}});
 const observe={name:"observe",label:"o",description:"o",parameters:{},execute:result} as unknown as AgentTool;
 const press={name:"press",label:"p",description:"p",parameters:{},execute:()=>{throw new Error("no press");},executeChecked:()=>{throw new Error("no press");}} as unknown as CheckedPressTool;
 const source={read:()=>Promise.resolve(state)};
 const tools=withSemanticNavigation(withNavigation([observe,press],features,source),features,source);
 const tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("no navigate_to_target");
 const out=await tool.execute("t",FIXTURE.call);
 const first=out.content[0];
 return first?.type==="text"?first.text:"";
}

describe("current-map-display-name-v1 at 47c3 seq 4776",()=>{
 it("OFF reproduces the recorded line: the map-table name",async()=>{
  expect(RECORDED_LINE).toBe("Current map: LITTLEROOT TOWN MAYS HOUSE 2F (map 1/3). Position: (1,2). No input was sent.");
  expect(await refusal({...BASE,[ID]:false},STATE)).toBe(RECORDED_LINE);
 });
 it("ON: the name the Location line and the header use",async()=>{
  expect(await refusal({...BASE,[ID]:true},STATE)).toBe("Current map: PROF. BIRCH'S HOUSE 2F (map 1/3). Position: (1,2). No input was sent.");
 });
 it("ON without a displayed name keeps the map-table name, and without either says so",async()=>{
  const bare=Object.fromEntries(Object.entries(STATE).filter(([key])=>key!=="location_display")) as GameStateSnapshot;
  expect(await refusal({...BASE,[ID]:true},bare)).toBe(RECORDED_LINE);
  expect(await refusal({...BASE,[ID]:true},{...bare,location:null})).toBe("Current map: name unavailable (map 1/3). Position: (1,2). No input was sent.");
 });
});

describe("registry and presets",()=>{
 it("is a default-off switch that needs the current-map feedback and says what OFF does",()=>{
  expect(featureInfo(ID)).toMatchObject({switchable:true,needs:"semantic-current-map-feedback-v1",group:"observation"});
  expect(featureInfo(ID).description).toContain(" Off: the map-table name (LITTLEROOT TOWN MAYS HOUSE 2F) in both places.");
  expect(FEATURES.filter(f=>f.id===ID)).toHaveLength(1);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"semantic-current-map-feedback-v1":false})).toContain(`${ID} needs semantic-current-map-feedback-v1`);
 });
});

describe("current-map-display-name-v1 in the observed instruction memory (47c3 seq 4777 printed the map-table name five times)",()=>{
 // MOM's page in PROF. BIRCH'S HOUSE 2F, recorded as dialogue auto-advance records it, then its delivered result.
 const events:RunEvent[]=[
  checkEvent({v:1,run:"r",seq:1,t:"2026-10-22T02:20:00.000-04:00",type:"dialogue_auto_advance",turn:66,tool_call_id:"pc",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:5,map:"LITTLEROOT TOWN MAYS HOUSE 2F",map_display:"PROF. BIRCH'S HOUSE 2F",map_id:[1,3],position:{x:5,y:2},speaker:"MAY",speaker_source:"name_prefix",text:"MAY: Oh, hi!"}],stop:"field_free",detail:"d",duration_ms:1}),
  checkEvent({v:1,run:"r",seq:2,t:"2026-10-22T02:20:00.000-04:00",type:"tool_result",turn:66,id:"pc",name:"press",is_error:false,duration_ms:1,text:"Location: PROF. BIRCH'S HOUSE 2F",frames:[]}),
 ];
 const delivered=async(features:FeatureSet):Promise<string>=>{
  const subs:((e:RunEvent)=>void)[]=[];let sent="";
  const transform=observedInstructions(features,{subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordLedgerContext:()=>({seq:1,turn:1})},(m:AgentMessage[])=>Promise.resolve(m));
  for(const e of events)for(const s of subs)s(e);
  const out=await transform([]);
  const last=out.at(-1);if(last!==undefined&&"content" in last&&typeof last.content==="string")sent=last.content;
  return sent;
 };
 const memory:FeatureSet={...BASE,"observed-instructions-v1":true};
 it("OFF: the map-table name",async()=>{
  const text=await delivered({...memory,[ID]:false});
  expect(text).toContain('map: "LITTLEROOT TOWN MAYS HOUSE 2F"');
  expect(text).not.toContain('map: "PROF. BIRCH\'S HOUSE 2F"');
 });
 it("ON: the displayed name the readout showed",async()=>{
  const text=await delivered({...memory,[ID]:true});
  expect(text).toContain('map: "PROF. BIRCH\'S HOUSE 2F"');
  expect(text).not.toContain("MAYS HOUSE");
 });
});
