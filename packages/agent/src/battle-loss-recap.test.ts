import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {BattleOutcomes} from "./battle-outcomes.js";
import {playGameTools} from "./play-wiring.js";
import type {RunEvent} from "./events.js";
import {recorded,recordedFeatures,stateAt,type RecordedState} from "../test-support/battle-facts.js";

const ID="battle-loss-recap-v1";
const LIVE="battle-facts-54a7.jsonl.gz",SH02="battle-facts-sh02.jsonl.gz";
const RECAP="Battle recap: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371 and whited out; the game returned you to GREE's HOUSE 2F (map 1/1). The game shows MAY (trainer 535) has not been defeated.";

type Result=Extract<RunEvent,{type:"tool_result"}>;
const GAME=new Set(["observe","press","navigate_to"]);
function replay(events:readonly RunEvent[],features:FeatureSet,edit:(s:RecordedState)=>RecordedState=s=>s):{result:Result;recap:string|null}[]{
 const outcomes=new BattleOutcomes(features);
 const out:{result:Result;recap:string|null}[]=[];
 for(const e of events){
  outcomes.observe(e);
  if(e.type==="tool_result"&&GAME.has(e.name)&&e.state_seq!==undefined)out.push({result:e,recap:outcomes.recap(edit(stateAt(events,e.state_seq)))});
 }
 return out;
}

describe("battle-loss-recap-v1 on live run 54a7 (lost to MAY on ROUTE103 at T371, whited out home)",()=>{
 const events=recorded(LIVE),features=recordedFeatures(events,{[ID]:true});
 const results=replay(events,features);
 const heal=events.find(e=>e.type==="milestone"&&e.name==="FIRST_POKECENTER_HEAL");
 it("is pinned from the T371 result (the whiteout) on every game result until FIRST_POKECENTER_HEAL",()=>{
  if(heal===undefined)throw new Error("fixture has the heal");
  for(const {result,recap} of results){
   if(result.seq<8983)expect(recap).toBeNull();
   else if(result.seq<heal.seq)expect(recap).toBe(RECAP);
   else expect(recap).toBeNull();
  }
  expect(results.find(r=>r.recap!==null)?.result.turn).toBe(371);
  expect(results.filter(r=>r.recap!==null).length).toBe(results.filter(r=>r.result.seq>=8983&&r.result.seq<heal.seq).length);
 });
 it("the defeat claim follows that result's own RAM: set reads defeated, another opponent id says nothing",()=>{
  const flagged=replay(events,features,s=>s.seq===9067&&s.trainer_opponent!=null?{...s,trainer_opponent:{...s.trainer_opponent,defeated:true}}:s);
  expect(flagged.find(r=>r.result.state_seq===9067)?.recap).toBe(RECAP.replace("The game shows MAY (trainer 535) has not been defeated.","The game now shows MAY (trainer 535) defeated."));
  const other=replay(events,features,s=>s.seq===9067&&s.trainer_opponent!=null?{...s,trainer_opponent:{...s.trainer_opponent,trainer_id:1,name:"SAWYER"}}:s);
  expect(other.find(r=>r.result.state_seq===9067)?.recap).toBe(RECAP.replace(" The game shows MAY (trainer 535) has not been defeated.",""));
 });
});

describe("battle-loss-recap-v1 on sh02 (beat MAY at T954): never shown",()=>{
 it("no recap on any result",()=>{
  const events=recorded(SH02);
  expect(replay(events,recordedFeatures(events,{[ID]:true})).every(r=>r.recap===null)).toBe(true);
 });
});

let seq=0;
function state(turn:number,fields:Record<string,unknown>):RecordedState{
 seq++;
 return {v:1,run:"r",seq,t:"t",type:"state",turn,started:true,screen:"overworld",in_battle:false,location:"ROUTE101",map_id:[0,16],position:{x:5,y:5},facing:"up",battle:null,...fields} as unknown as RecordedState;
}
const battle=(outcome:string,type:number)=>({screen:"battle",in_battle:true,battle:{active:true,outcome,outcome_code:0,battle_type:type,battlers:[{battler:0,species:"TORCHIC"},{battler:1,species:"POOCHYENA"}]}});
const opponent=(id:number,name:string,defeated:boolean,active:boolean)=>({trainer_opponent:{trainer_id:id,trainer_class:5,name,defeated,battle_active:active}});
const milestone=(name:string,kind:string):RunEvent=>({v:1,run:"r",seq:++seq,t:"t",type:"milestone",turn:99,name,kind,origin:"observed",evidence:[]} as unknown as RunEvent);

describe("battle-loss-recap-v1 rules",()=>{
 const F:FeatureSet={...ALL_ON,"bounded-navigation-v1":true,"displayed-place-names-v1":false};
 const fold=(events:readonly RunEvent[])=>{const o=new BattleOutcomes(F);for(const e of events)o.observe(e);return o;};
 const home=state(12,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2]});
 it("a wild whiteout pins a recap with no defeat claim; a navigation milestone keeps it, a story milestone ends it",()=>{
  const o=fold([state(10,battle("ongoing",4)),state(11,battle("lost",4)),home]);
  expect(o.recap(home)).toBe("Battle recap: you lost to a wild POOCHYENA on ROUTE101 (map 0/16) at turn 11 and whited out; the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2).");
  o.observe(milestone("ROUTE_103","navigation"));
  expect(o.recap(home)).not.toBeNull();
  o.observe(milestone("RIVAL_BATTLE_STARTED","story"));
  expect(o.recap(home)).not.toBeNull();
  o.observe(milestone("FIRST_POKECENTER_HEAL","story"));
  expect(o.recap(home)).toBeNull();
 });
 it("a trainer loss that left the player on the same map is pinned without a whiteout",()=>{
  const o=fold([state(20,{...battle("lost",8),...opponent(1,"SAWYER",false,true)})]);
  const after=state(21,opponent(1,"SAWYER",false,false));
  expect(o.recap(after)).toBe("Battle recap: you lost to SAWYER (trainer 1) on ROUTE101 (map 0/16) at turn 20. The game shows SAWYER (trainer 1) has not been defeated.");
 });
 it("a won battle and a wild battle the player ran from pin nothing; a later loss replaces the earlier one",()=>{
  const o=fold([state(30,battle("won",4)),state(31,{}),state(40,battle("ran",4)),state(41,{})]);
  expect(o.recap(state(42,{}))).toBeNull();
  const p=fold([state(10,battle("lost",4)),home,state(50,{...battle("lost",8),...opponent(1,"SAWYER",false,true)}),state(51,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2],...opponent(1,"SAWYER",false,false)})]);
  expect(p.recap(null)).toBe("Battle recap: you lost to SAWYER (trainer 1) on ROUTE101 (map 0/16) at turn 50 and whited out; the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2).");
 });
 it("a drawn trainer battle reads drew with; a blackout callback with no outcome sampled is a loss",()=>{
  const o=fold([state(20,{...battle("drew",8),...opponent(1,"SAWYER",false,true)}),state(21,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2]})]);
  expect(o.recap(null)).toBe("Battle recap: you drew with SAWYER (trainer 1) on ROUTE101 (map 0/16) at turn 20 and whited out; the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2).");
  const p=fold([state(30,{...battle("ongoing",4),battle:{active:true,outcome:"ongoing",outcome_code:0,battle_type:4,battlers:null}}),state(30,{screen:"battle",in_battle:true,battle:null,blackout_active:true}),state(31,{location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_id:[1,1]})]);
  expect(p.recap(null)).toBe("Battle recap: you lost to a wild Pokémon on ROUTE101 (map 0/16) at turn 30 and whited out; the game returned you to LITTLEROOT TOWN BRENDANS HOUSE 2F (map 1/1).");
  const q=fold([state(40,battle("ongoing",4)),state(41,{screen:"field_transition",blackout_active:true,map_id:null}),state(42,{location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_id:[1,1]})]);
  expect(q.recap(null)).toContain("you lost to a wild POOCHYENA on ROUTE101 (map 0/16) at turn 40 and whited out");
 });
 it("the result that first leaves the battle is recapped from its own state before that state is recorded",()=>{
  const o=fold([state(10,battle("ongoing",4)),state(11,battle("lost",4))]);
  expect(o.recap(home)).toContain("and whited out; the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2).");
  expect(o.recap(state(11,battle("lost",4)))).toBeNull();
 });
});

describe("battle-loss-recap-v1 through playGameTools",()=>{
 const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
 async function first(on:boolean):Promise<{text:string;same:boolean}>{
  const events=recorded(LIVE);
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");}};
  // The whiteout call (T371, result seq 8983): its after state 8982 is recorded only after the tool returns.
  const result=events.find((e):e is Result=>e.type==="tool_result"&&e.seq===8983);
  if(result===undefined)throw new Error("fixture has seq 8983");
  const press:AgentTool={name:"press",label:"Press",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:result.text}],details:{state:stateAt(events,8982)}})};
  const features:FeatureSet={...recordedFeatures(events,{[ID]:on}),"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"navigate-first-prompt-v1":false,"bounded-navigation-v1":false};
  const tools=playGameTools([press],features,{read:()=>Promise.reject(new Error("unused"))},recorder);
  for(const e of events){if(e.seq>=8982)break;for(const o of observers)o(e);}
  const wrapped=tools.find(t=>t.name==="press");
  if(wrapped===undefined)throw new Error("no press");
  return {text:text(await wrapped.execute(result.id,{buttons:["A"]})),same:wrapped===press};
 }
 it("ON appends the recap to the whiteout result; OFF leaves the tool untouched",async()=>{
  const on=await first(true),off=await first(false);
  expect(on.text.endsWith(`\n${RECAP.replace(" (map 0/18)","").replace(" (map 1/1)","")}`)).toBe(true);
  expect(off.same).toBe(true);
 });
});

describe("battle-loss-recap-v1 registry",()=>{
 it("is an observation switch that needs ram-state-v1, default off",()=>{
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"ram-state-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(dependencyProblems({...ALL_ON,"ram-state-v1":false})).toContain(`${ID} needs ram-state-v1`);
 });
});
