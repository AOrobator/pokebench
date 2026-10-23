import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {featureInfo,playHarnessFeatures,stateOnlyProblems,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {ConversationLedger} from "./instruction-ledger-v2.js";
import {citationText,withCitedDestination,type DestinationCitationFacts} from "./cited-destination.js";
import {HarnessTrust,TRUST_HEADER} from "./harness-trust.js";
import {PeopleIdCards} from "./people-id-cards.js";
import {STORY_HEADER,type PlacesBody} from "./story-destinations.js";
import {playGameTools} from "./play-wiring.js";
import {IN_GAME} from "../test-support/events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";

const ID="input-cuts-v1" as const;
const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const ON:FeatureSet={...OFF,[ID]:true};
const PLACES=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;

const page=(text:string,map:[number,number])=>({state_seq:1,map:"LITTLEROOT TOWN",map_id:map,position:{x:7,y:8},speaker:"MOM",speaker_source:"name_prefix" as const,text});
const advance=(id:string,turn:number,text:string):RunEvent=>checkEvent({v:1,run:"r",seq:turn,t:"2026-10-17T22:00:00.000-04:00",turn,type:"dialogue_auto_advance",tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[page(text,[0,9])],stop:"field_free",detail:"closed",duration_ms:1});
const done=(id:string,turn:number):RunEvent=>checkEvent({v:1,run:"r",seq:100+turn,t:"2026-10-17T22:00:01.000-04:00",turn,type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]});

describe("input-cuts-v1",()=>{
 it("is registered fourth from the end, an observation, default off, and state-only refuses it",()=>{
  expect(SWITCHABLE_FEATURES.at(-130)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-21)).toBe(ID);
  expect(playHarnessFeatures(OFF,null)).not.toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,title:"INPUT CUTS",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(stateOnlyProblems({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":true})).toContain(`state-only-decisions-v1 requires ${ID} OFF`);
 });

 it("does not quote this call's pages again, and still quotes an earlier turn",()=>{
  const state=IN_GAME;
  const quote="Go next door.";
  for(const features of [OFF,ON]){
   const ledger=new ConversationLedger(features);
   ledger.observe(advance("then",2,`MOM: ${quote}`));
   ledger.observe(done("then",2));
   const past=ledger.block(state,"later");
   expect(past).toContain(`MOM: "${quote}"`);
   ledger.observe(advance("now",5,"MOM: Come inside."));
   const now=ledger.block(state,"now");
   if(features[ID]){
    expect(now).toContain("this result's dialogue list");
    expect(now).not.toContain("Come inside.");
    expect(now).not.toContain(`MOM: "${quote}"`);
   }else{
    expect(now).toContain("Come inside.");
    expect(now).not.toContain("this result's dialogue list");
   }
  }
 });

 it("drops a not-found Because line and still records the check; a too-short quote is still said",async()=>{
  const because="the LAB is in RUSTBORO CITY";
  const nav:AgentTool={name:"navigate_to",label:"Walk",description:"Walk.",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Navigation: arrived"}],details:undefined})};
  const run=async(silence:boolean,quote:string)=>{
   const checks:{facts:DestinationCitationFacts;text:string|null}[]=[];
   const tools=withCitedDestination([nav],true,{subscribe:()=>undefined,destinationCitation:(facts,text)=>{checks.push({facts,text});}},{fullMap:false,exitReach:false,silenceMiss:silence});
   const result=await tools[0]?.execute("n",{x:1,y:2,map_id:[0,9],because:quote});
   const text=(result?.content??[]).map(c=>c.type==="text"?c.text:"").join("");
   return {text,checks};
  };
  const loud=await run(false,because);
  expect(loud.text).toContain(citationText("not_found",because)??"");
  const quiet=await run(true,because);
  expect(quiet.text).toBe("Navigation: arrived");
  expect(quiet.checks[0]?.facts.verdict).toBe("not_found");
  expect(quiet.checks[0]?.text).toBeNull();
  const short=await run(true,"LAB");
  expect(short.text).toContain("too short");
 });

 it("states the Story goal once when this result already has the destinations block",()=>{
  const line="Well, it's time to head back to the LAB.";
  const event=advance("c",272,`MAY: ${line}`);
  const withMay={...event,pages:[{...page(`MAY: ${line}`,[0,18]),speaker:"MAY"}]};
  const text=`${STORY_HEADER}\n- MAY: "${line}"`;
  const once=new HarnessTrust({supervisor:false,goalOnce:true});
  once.observe(withMay);
  const hidden=once.lines(text,IN_GAME,"c",PLACES.places);
  expect(hidden.header).toBe(TRUST_HEADER);
  expect(hidden.header).not.toContain("Story goal:");
  const kept=once.lines("Location: LITTLEROOT TOWN",IN_GAME,"c",PLACES.places);
  expect(kept.header).toContain("Story goal:");
  expect(kept.header).toContain(line);
  const twice=new HarnessTrust({supervisor:false});
  twice.observe(withMay);
  expect(twice.lines(text,IN_GAME,"c",PLACES.places).header).toContain("Story goal:");
 });

 it("does not say a person has not spoken when this result shows their lines",()=>{
  const mom:GameStateSnapshot={...IN_GAME,world_context:{objects:[{local_id:1,map_id:[0,9],graphics_id:215,sprite_kind:"MOM",x:7,y:8}],triggers:[],dialogue:null}};
  const say=(cuts:boolean)=>{
   const cards=new PeopleIdCards(true,cuts);
   cards.observe(advance("now",4,"MOM: Go next door."));
   const out=cards.cards(mom,"now");
   return {card:out?.cards[0]?.text??"",summary:out?.summaries.get("name:MOM")??""};
  };
  const on=say(true);
  expect(on.card).not.toContain("Has not spoken");
  expect(on.card).toContain("Also spoke to you during this call");
  expect(on.summary).toContain("spoke during this call");
  const off=say(false);
  expect(off.card).toContain("Has not spoken to you in this run.");
  expect(off.summary).toContain("has not spoken to you");
 });
});

describe("input-cuts-v1 through playGameTools",()=>{
 const recorded=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as {readonly "4caa":{readonly events:readonly unknown[]}};
 const events=recorded["4caa"].events.map(e=>checkEvent(e));
 const state=(()=>{
  const tool=events.find(e=>e.type==="tool_result"&&e.turn===272);
  const found=events.find(e=>e.type==="state"&&e.seq===(tool?.type==="tool_result"?tool.state_seq:undefined));
  if(found?.type!=="state"||!("started" in found))throw Error("no state");
  const envelope=new Set(["v","run","seq","t","type","turn"]);
  return parseGameState(Object.fromEntries(Object.entries(found).filter(([key])=>!envelope.has(key))));
 })();
 const baseTools=():AgentTool[]=>[
  {name:"observe",label:"o",description:"o",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROUTE103\nPosition: (9, 3)"}],details:{state}})},
  {name:"press",label:"p",description:"p",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve({content:[{type:"text",text:"press"}],details:{state}}),executeChecked:()=>Promise.resolve({content:[{type:"text",text:"press"}],details:{state}})} as AgentTool,
 ];
 const tools=(features:FeatureSet,cites:{facts:DestinationCitationFacts;text:string|null}[])=>playGameTools(
  baseTools(),
  features,
  {read:()=>Promise.resolve(state),places:()=>Promise.resolve(PLACES)},
  {subscribe:(fn:(e:RunEvent)=>void)=>{for(const e of events)fn(e);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:()=>undefined,destinationCitation:(facts:DestinationCitationFacts,text:string|null)=>{cites.push({facts,text});},peopleIdCard:()=>undefined,lowHpTrainerWarning:()=>undefined},
 );
 const textOf=async(result:Promise<AgentToolResult<unknown>>)=>(await result).content.map(c=>c.type==="text"?c.text:"").join("");

 it("the production tools drop the repeated Story goal and the not-found line only when the switch is on",async()=>{
  const base={...OFF,"harness-trust-v1":true,"story-destinations-v1":true,"cited-destination-v1":true,"bounded-navigation-v1":true,"live-map-v1":true,"ram-state-v1":true};
  const offCites:{facts:DestinationCitationFacts;text:string|null}[]=[];
  const off=tools(base,offCites);
  const offObserve=await textOf(off.find(t=>t.name==="observe")?.execute("o",{})??Promise.reject(Error("no observe")));
  expect(offObserve).toContain(STORY_HEADER);
  expect(offObserve).toContain("Story goal:");
  const offNav=await textOf(off.find(t=>t.name==="navigate_to")?.execute("n",{x:9,y:3,map_id:[0,18],because:"the LAB is in RUSTBORO CITY"})??Promise.reject(Error("no nav")));
  expect(offNav).toContain("Because:");
  expect(offNav).toContain(STORY_HEADER);
  expect(offNav).toContain("Story goal:");
  const onCites:{facts:DestinationCitationFacts;text:string|null}[]=[];
  const on=tools({...base,[ID]:true},onCites);
  const onObserve=await textOf(on.find(t=>t.name==="observe")?.execute("o",{})??Promise.reject(Error("no observe")));
  expect(onObserve).toContain(STORY_HEADER);
  expect(onObserve).not.toContain("Story goal:");
  const onNav=await textOf(on.find(t=>t.name==="navigate_to")?.execute("n",{x:9,y:3,map_id:[0,18],because:"the LAB is in RUSTBORO CITY"})??Promise.reject(Error("no nav")));
  expect(onNav).not.toContain("Because:");
  expect(onNav).toContain(STORY_HEADER);
  expect(onNav).not.toContain("Story goal:");
  expect(onCites[0]?.facts.verdict).toBe("not_found");
  expect(onCites[0]?.text).toBeNull();
 });
});
