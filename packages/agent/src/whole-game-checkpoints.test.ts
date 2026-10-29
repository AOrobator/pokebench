import {describe,expect,it} from "vitest";
import type {RunEvent} from "./events.js";
import {ALL_ON,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {InstructionMemoryCap,type CapEpisode} from "./instruction-memory-cap.js";
import {observedInstructions} from "./observed-instructions.js";
import {parseGameState} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {StateMilestones,ACTIVITY_MILESTONES,DEPTH_ORDER} from "./milestones.js";
import {progressReached} from "./story-progress.js";
import {STORY_CHECKPOINTS} from "./story-checkpoints.js";

const feature="story-checkpoints-whole-game-v1";
const event=(body:Record<string,unknown>):RunEvent=>({v:1,run:"whole-game",t:"2026-10-28T12:00:00.000Z",turn:5,...body}) as unknown as RunEvent;
const milestone=(name:string,turn=7):RunEvent=>event({seq:900,turn,type:"milestone",name,server_timestamp:0});
const render=(kept:readonly CapEpisode[])=>JSON.stringify(kept);
const late=()=>STORY_CHECKPOINTS.slice(15);

describe(feature,()=>{
 it("covers the required late story and preserves the legacy prefix",()=>{
  expect(STORY_CHECKPOINTS.slice(0,15).map(c=>c.id)).toEqual(["mom-home-instructions","rival-first-meeting","birch-rescue","birch-lab-pokedex","rival-route103","wally-catch-tutorial","woods-team-aqua","roxanne-gym","devon-goods-recovery","devon-president-errands","pokenav-match-call","briney-voyages","brawly-gym","steven-letter","stern-devon-goods"]);
  const closed=new Set(late().flatMap(c=>c.closes_after));
  for(const name of ["DYNAMO_BADGE","METEOR_FALLS_CONFRONTATION_RESOLVED","MT_CHIMNEY_STORY_COMPLETE","HEAT_BADGE","BALANCE_BADGE","WEATHER_INSTITUTE_AQUA_WITHDRAWN","FEATHER_BADGE","MAGMA_EMBLEM_RECEIVED","MAGMA_HIDEOUT_STORY_COMPLETE","SLATEPORT_SUBMARINE_THEFT_WITNESSED","AQUA_HIDEOUT_ESCAPE_COMPLETE","MIND_BADGE","SPACE_CENTER_STORY_COMPLETE","HM_DIVE_RECEIVED","SEAFLOOR_KYOGRE_RELEASE_CONFIRMED","RAYQUAZA_AWAKENED","SOOTOPOLIS_CRISIS_RESOLVED","RAIN_BADGE","VICTORY_ROAD_WALLY_DEFEATED","ELITE_FOUR_SIDNEY_DEFEATED","ELITE_FOUR_PHOEBE_DEFEATED","ELITE_FOUR_GLACIA_DEFEATED","ELITE_FOUR_DRAKE_DEFEATED","GAME_CLEAR_CONFIRMED","RAYQUAZA_ENCOUNTER_RETIRED"])
   expect(closed.has(name),name).toBe(true);
 });
 it("is registered, optional and OFF by default, with the table count in its description",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(feature)).toBe(304);
  expect(featureInfo(feature).description).toContain(`${String(STORY_CHECKPOINTS.length)} story checkpoints`);
  expect(featureInfo(feature).description).toContain(" Off: ");
  expect(featureInfo(feature)).toMatchObject({group:"guard",needs:"instruction-memory-cap-v1"});
  const legacy={...ALL_ON};Reflect.deleteProperty(legacy,feature);
  expect(normalizeFeatures(legacy)[feature]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[feature]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[feature]:true},null)).toContain(feature);
 });
 it("retires every late scope only when ON, every closing milestone is present, and every page was heard by then",()=>{
  expect(late().length).toBeGreaterThan(20);
  for(const checkpoint of late())for(const scope of checkpoint.scope)for(const speaker of scope.speakers){
   const episode:CapEpisode={result:10,dialogue:[9],turn:5,pages:[[speaker,speaker===null?null:"faced_sprite","scene page",scope.map,scope.map_id,null]]};
   const select=(on:boolean,names:readonly string[],turn=7,e=episode)=>{
    const cap=new InstructionMemoryCap(false,on);
    for(const n of names)cap.observe(milestone(n,turn));
    return cap.select([e],render).decisions[0];
   };
   expect(select(false,checkpoint.closes_after)?.step,checkpoint.id).not.toBe("done");
   expect(select(true,checkpoint.closes_after),checkpoint.id).toMatchObject({step:"done",kept:false});
   expect(select(true,checkpoint.closes_after,5)?.step,checkpoint.id).toBe("done");
   expect(select(true,checkpoint.closes_after,4)?.step,checkpoint.id).not.toBe("done");
   for(const missing of checkpoint.closes_after)expect(select(true,checkpoint.closes_after.filter(n=>n!==missing))?.step,`${checkpoint.id} missing ${missing}`).not.toBe("done");
   for(const [map,speaker] of [[[99,99],episode.pages[0]?.[0]],[scope.map_id,"OUT_OF_SCOPE"]] as const){
    const mixed:CapEpisode={...episode,pages:[...episode.pages,[speaker??null,"faced_sprite","uncompleted advice",scope.map,map,null]]};
    expect(select(true,checkpoint.closes_after,7,mixed)?.step,checkpoint.id).not.toBe("done");
   }
  }
 });
 it("keeps the optional Rayquaza battle separate from awakening, crisis resolution and frontier credit",()=>{
  const raw=(bit:number)=>{const flags=Buffer.alloc(300);flags[bit>>3]=1<<(bit&7);return parseGameState({...IN_GAME,story_progress:{flags:flags.toString("hex"),rustboro_stage:0,devon_stage:0,letter:false,variables:"00".repeat(512)}});};
  const before=raw(0),after=raw(0x1c0),name="RAYQUAZA_ENCOUNTER_RETIRED";
  expect(progressReached(name,before)).toBe(false);expect(progressReached(name,after)).toBe(true);
  expect(progressReached(name,raw(0x1c1))).toBe(false);
  expect(progressReached(name,{...after,story_progress:null})).toBe(null);
  expect(progressReached("RAYQUAZA_AWAKENED",after)).toBe(false);expect(progressReached("SOOTOPOLIS_CRISIS_RESOLVED",after)).toBe(false);
  expect(ACTIVITY_MILESTONES.has(name)).toBe(true);expect(DEPTH_ORDER).not.toContain(name);
  const tracker=new StateMilestones({read:()=>Promise.resolve(after)});tracker.initialize("save_state");
  expect(tracker.observe(after,1).find(m=>m.name===name)?.origin).toBe("present_at_start");expect(tracker.observe(after,2).filter(m=>m.name===name)).toEqual([]);
  const earned=new StateMilestones({read:()=>Promise.resolve(before)});earned.initialize("save_state");earned.observe(before,1);
  expect(earned.observe(after,2).find(m=>m.name===name)).toMatchObject({origin:"observed",evidence:[2]});
 });
 it("wires the production factory to model delivery and recorded memory, leaving OFF bytes intact",async()=>{
  const text="WATTSON: scene fixture";
  const events:RunEvent[]=[event({seq:1,type:"dialogue_auto_advance",tool_call_id:"a",tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"MAUVILLE CITY GYM",map_id:[10,0],position:null,speaker:"WATTSON",speaker_source:"name_prefix",text}],stop:"field_control",detail:"",duration_ms:1}),event({seq:2,type:"tool_result",id:"a",name:"press",is_error:false,text:"Location: MAUVILLE CITY GYM",state_seq:null}),milestone("DYNAMO_BADGE")];
  const sent=async(on?:boolean,cap=true)=>{
   const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"instruction-memory-cap-v1":cap,...(on===undefined?{}:{[feature]:on})} as FeatureSet;
   const subscriptions:((e:RunEvent)=>void)[]=[],records:string[]=[];
   const transform=observedInstructions(features,{subscribe:f=>{subscriptions.push(f);},recordLedgerContext:b=>{records.push(b.text);}},m=>Promise.resolve(m));
   for(const e of events)for(const f of subscriptions)f(e);
   const messages=(await transform([])).map(m=>m.role==="user"?{role:m.role,content:m.content}:{role:m.role});return {records,messages};
  };
  const off=await sent(false),omitted=await sent(),on=await sent(true),withoutCap=await sent(true,false);
  expect(off).toEqual(omitted);expect(off.records[0]).toContain(text);
  expect(on.records[0]).not.toContain(text);expect(on).not.toEqual(off);
  expect(withoutCap.records[0]).toContain(text);
  expect(on.messages).toEqual([expect.objectContaining({role:"user",content:on.records[0]})]);
 });
});
