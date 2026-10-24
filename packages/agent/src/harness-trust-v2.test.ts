import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// harness-trust-v2: harness-trust-v1's header on battle_action results too.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,stateOnlyProblems,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {TRUST_HEADER,withHarnessTrust,type StoryGoalAwayFacts} from "./harness-trust.js";
import {playGameTools} from "./play-wiring.js";
import type {PlacesBody} from "./story-destinations.js";

const ID="harness-trust-v2" as const;
interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa",Recording>;
const PLACES=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const CAAA:RunEvent[]=RECORDED["4caa"].events.map(e=>checkEvent(e));
const T272=CAAA.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.turn===272);
const STATE=((): GameStateSnapshot=>{
 const e=CAAA.find(x=>x.seq===T272?.state_seq);
 if(e?.type!=="state"||!("started" in e))throw Error("no state");
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
})();
const LAB_GOAL="Story goal: \"Well, it's time to head back to the LAB.\" (MAY, turn 272) -> \"LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).";
const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const textOf=(r:AgentToolResult<unknown>|undefined)=>(r?.content??[]).map(c=>c.type==="text"?c.text:"").join("|");
let current:GameStateSnapshot=STATE;
const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:`${name}: result`}],details:{state:current}})});

describe("harness-trust-v2",()=>{
 it("with the option, battle_action results start with the same header; without it they are untouched",async()=>{
  for(const battleAction of [false,true]){
   const subs:((e:RunEvent)=>void)[]=[];
   const [battle]=withHarnessTrust([tool("battle_action")],true,{subscribe:fn=>{subs.push(fn);},storyGoalAway:()=>undefined},{places:()=>Promise.resolve(PLACES)},{supervisor:true,battleAction});
   for(const s of subs)for(const e of CAAA)s(e);
   const text=textOf(await battle?.execute("b",{}));
   expect(text).toBe(battleAction?`${TRUST_HEADER}\n${LAB_GOAL}\n\nbattle_action: result`:"battle_action: result");
  }
 });
 it("a battle_action result never counts as the player's own move for the walk-away note",async()=>{
  const notes:StoryGoalAwayFacts[]=[];const subs:((e:RunEvent)=>void)[]=[];
  const [battle]=withHarnessTrust([tool("battle_action")],true,{subscribe:fn=>{subs.push(fn);},storyGoalAway:(_t,f)=>{notes.push(f);}},{places:()=>Promise.resolve(PLACES)},{supervisor:true,battleAction:true});
  for(const s of subs)for(const e of CAAA)s(e);
  for(const y of [13,10,7]){current={...STATE,map_id:[0,18],position:{x:9,y},field_controls_locked:false};await battle?.execute(`b${String(y)}`,{});}
  current=STATE;
  expect(notes).toHaveLength(0);
 });
 it("is registered last, default off, needs harness-trust-v1, and the production factory honors it",async()=>{
  expect(SWITCHABLE_FEATURES.at(-149)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-33)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({switchable:true,group:"guidance",needs:"harness-trust-v1",title:"HARNESS TRUST ON BATTLE ACTIONS"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"harness-trust-v1":false})).toContain(`${ID} needs harness-trust-v1`);
  expect(stateOnlyProblems({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":true})).toContain(`state-only-decisions-v1 requires ${ID} OFF`);
  const rest=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(rest)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  const factory=async(features:FeatureSet)=>{
   const subs:((e:RunEvent)=>void)[]=[];
   const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},storyGoalAway:()=>undefined,destinationCitation:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
   const tools=playGameTools([tool("observe")],features,{read:()=>Promise.resolve(STATE),places:()=>Promise.resolve(PLACES)},recorder,undefined,[tool("battle_action")]);
   for(const s of subs)for(const e of CAAA)s(e);
   return textOf(await tools.find(t=>t.name==="battle_action")?.execute("b",{}));
  };
  expect(await factory({...OFF,"harness-trust-v1":true,[ID]:true})).toBe(`${TRUST_HEADER}\n${LAB_GOAL}\n\nbattle_action: result`);
  expect(await factory({...OFF,"harness-trust-v1":true})).toBe("battle_action: result");
 });
 it("reads the characters line from every text part, as battle_action puts its status first and the readout after the screenshot",async()=>{
  const readout=T272?.text ?? "";
  expect(readout).toContain("Story characters here (from this map's own object list): none.");
  const subs:((e:RunEvent)=>void)[]=[];
  const battle:AgentTool={name:"battle_action",label:"b",description:"b",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Battle action: chose EMBER."},{type:"image",data:"x",mimeType:"image/png"},{type:"text",text:readout}],details:{state:STATE}})};
  const [wrapped]=withHarnessTrust([battle],true,{subscribe:fn=>{subs.push(fn);},storyGoalAway:()=>undefined},{places:()=>Promise.resolve(PLACES)},{supervisor:true,battleAction:true});
  for(const s of subs)for(const e of CAAA)s(e);
  const r=await wrapped?.execute("b",{});
  const first=r?.content[0];
  expect(first?.type==="text"?first.text:"").toBe(`${TRUST_HEADER}\n${LAB_GOAL}\nStory characters on this map (from its own object list): none.\n\nBattle action: chose EMBER.`);
 });
});
