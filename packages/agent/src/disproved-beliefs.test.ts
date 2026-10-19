import {readFileSync} from "node:fs";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {DisprovedBeliefs,disprovedBeliefs,locatingClaims} from "./disproved-beliefs.js";
import {checkEvent,type BodyOf,type RunEvent} from "./events.js";
import {contextTools} from "./play-wiring.js";
import {decisionContext,recordedNotes} from "./decision-probe.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {IN_GAME} from "../test-support/events.js";

const ID="disproved-beliefs-v1";
interface Fixture {readonly source:string;readonly events:readonly RunEvent[]}
// Real events of run 2026-10-16T02-23-17_qwen36-gpu1_sh02 (turns 48–60, 72–100, 108–126, 140–148, 171–180, 219–230, 257–266, 316–322, 846–853).
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/beliefs-sh02.json",import.meta.url),"utf8")) as Fixture;
const RUN:FeatureSet=featuresOf(FIXTURE.events.flatMap(e=>e.type==="run_start"?e.harness_features:[]));
const ON:FeatureSet={...RUN,[ID]:true};
const OFF:FeatureSet={...RUN,[ID]:false};
const DERIVED=new Set<RunEvent["type"]>(["loop_guard","belief_ledger","ledger_context","navigation_context","milestone_hint","text_only_supervisor"]);
type Body=Omit<BodyOf<"belief_ledger">,"type"|"turn">;
const textOf=(m:AgentMessage|undefined):string=>m!==undefined&&"role"in m&&m.role==="user"&&typeof m.content==="string"?m.content:"";

// The production context chain over the recorded stream: one model call per turn_start, as the agent loop makes it.
async function replay(features:FeatureSet,events:readonly RunEvent[]=FIXTURE.events):Promise<{byTurn:Map<number,string>;bodies:Body[];messages:Map<number,AgentMessage[]>}> {
 const subscribers:((e:RunEvent)=>void)[]=[];const bodies:Body[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:(b:Body)=>{bodies.push(b);}};
 const context=contextTools(features,recorder,m=>Promise.resolve(m));
 const byTurn=new Map<number,string>();const messages=new Map<number,AgentMessage[]>();
 for(const e of events){
  if(DERIVED.has(e.type))continue;
  if(e.type==="turn_start"){
   const before=bodies.length;
   const out=await context.transformContext([{role:"user",content:"Play.",timestamp:0}]);
   messages.set(e.turn,out);
   if(bodies.length>before)byTurn.set(e.turn,textOf(out.at(-1)));
  }
  for(const s of subscribers)s(e);
 }
 return {byTurn,bodies,messages};
}

describe("registry and presets",()=>{
 it("registers a default-off guidance switch recorded last but one",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"story-state-v1",switchable:true,title:"DISPROVED BELIEFS LEDGER"});
  expect(featureInfo(ID).description).toContain(" Off: no ledger.");
  expect(featureInfo(ID).description).toContain("Things the game has contradicted");
  expect(SWITCHABLE_FEATURES.at(-60)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-60)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(featuresOf(playHarnessFeatures({...ALL_ON,[ID]:false},null))[ID]).toBe(false);
  // Entries leave on a story-flag change, which needs the story state (review round 1).
  expect(dependencyProblems({...ALL_ON,"story-state-v1":false})).toContain(`${ID} needs story-state-v1`);
 });
 it("defaults off for presets that omit it and for legacy flag presets",()=>{
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});

describe("locating claims: the readout's own names only, conservatively",()=>{
 it("finds sentences that place a story character on a tile, whole",()=>{
  expect(locatingClaims("I moved to (7,8). Prof. Birch is at (7,7). I'll move to (7,7) to talk to him.","PROF. BIRCH")).toEqual(["Prof. Birch is at (7,7)."]);
  expect(locatingClaims("I am at (7,9). Professor Birch is standing at (7,8). I need to face him.","PROF. BIRCH")).toEqual(["Professor Birch is standing at (7,8)."]);
  expect(locatingClaims("PROF. BIRCH is at ( 4 , 13 )\nthen talk","PROF. BIRCH")).toEqual(["PROF. BIRCH is at ( 4 , 13 )"]);
  // No verb: a target, not a claim about where he is (review round 4).
  expect(locatingClaims("PROF. BIRCH at ( 4 , 13 )\nthen talk","PROF. BIRCH")).toEqual([]);
 });
 it("ignores possessives, sprite kinds, parenthetical labels, negations, other names and sentences with no tile",()=>{
  expect(locatingClaims("I will go to Professor Birch's lab at (7,16).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("A RIVAL_MAY_NORMAL has appeared at (2,5).","MAY")).toEqual([]);
  expect(locatingClaims("I see a woman (MOM) at (8,7).","MOM")).toEqual([]);
  expect(locatingClaims("The scientist (Prof. Birch) is at (8,3).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Professor Birch is not at (7,1). Prof. Birch isn't at (7,2). Prof. Birch is away, I am at (1,1).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Birch is at (7,7).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("I need to find Professor Birch. I am at (6,12).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Mayor MAYBE at (1,1).","MAY")).toEqual([]);
 });
 it("matches the readout's spelling or its title case only, so the word 'may' is never MAY (review round 1)",()=>{
  expect(locatingClaims("Professor Birch may be at (7,7), so I will walk there.","MAY")).toEqual([]);
  expect(locatingClaims("I think mom is at (2,6).","MOM")).toEqual([]);
  expect(locatingClaims("May is at (3,4).","MAY")).toEqual(["May is at (3,4)."]);
  expect(locatingClaims("MAY is at (3,4).","MAY")).toEqual(["MAY is at (3,4)."]);
  expect(locatingClaims("prof. birch is at (3,4).","PROF. BIRCH")).toEqual([]);
 });
 it("skips sentences with a negation or hedge anywhere in them (review round 1)",()=>{
  expect(locatingClaims("I don't know if Professor Birch is at (7,7).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Professor Birch might be at (7,7), or maybe not.","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Prof. Birch is at (7,1) which is a 'Book' tile (background object, not walkable).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Professor Birch is probably at (7,7).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Perhaps Prof. Birch is at (7,7).","PROF. BIRCH")).toEqual([]);
 });
 it("skips capitalized hedges and questions (review round 2)",()=>{
  expect(locatingClaims("Could Professor Birch be at (7,7).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Professor Birch Could be at (7,7).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Is Professor Birch at (7,7)? I will check.","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Professor Birch cannot be at (7,7).","PROF. BIRCH")).toEqual([]);
 });
});

describe("disproved-beliefs-v1 on run sh02",()=>{
 it("OFF delivers nothing and records nothing: the context is the chain's own, byte for byte",async()=>{
  const off=await replay(OFF);
  expect(off.bodies).toEqual([]);
  for(const out of off.messages.values())expect(out).toEqual([{role:"user",content:"Play.",timestamp:0}]);
 });

 it("pins Birch's absence from the lab before the second lab trip (T117), with the model's own sentence, the readout line and the scientist's pages",async()=>{
  const {byTurn}=await replay(ON);
  const t117=byTurn.get(117)??"";
  expect(t117).toBe(`Things the game has contradicted (from this run's own readouts and dialogue; an entry is dropped when a story flag changes or the game shows otherwise):
- PROF. BIRCH on LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4): you wrote at turn 88: "Prof. Birch is at (7,1)." and called navigate_to (7,1) (you placed PROF. BIRCH on this map at turns 82, 83, 84, 85, 86, 87, 88). The readout on that map said at turn 87: "Story characters here (from this map's own object list): none. Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters." On that map at turn 98 you were shown: SCIENTIST_1 (sprite kind, not a name): "Hunh? PROF. BIRCH?" | SCIENTIST_1 (sprite kind, not a name): "The PROF's away on fieldwork.
Ergo, he isn't here." | SCIENTIST_1 (sprite kind, not a name): "Oh, let me explain what fieldwork is." | SCIENTIST_1 (sprite kind, not a name): "It is to study things in the natural
environment, like fields and mountains," | SCIENTIST_1 (sprite kind, not a name): "instead of a laboratory." | SCIENTIST_1 (sprite kind, not a name): "The PROF isn't one for doing desk work.
He's the type of person who would" | SCIENTIST_1 (sprite kind, not a name): "rather go outside and experience" | SCIENTIST_1 (sprite kind, not a name): "things than read about them here."`);
  // It stays pinned through the second lab trip (T117-T126) and adds the new claims there.
  for(let turn=99;turn<=124;turn++)expect(byTurn.get(turn)).toBe(t117);
  // T124 goes on past the tile ("and the scientist is at …", round 6) and T125 hedges ("Or I can …", round 7): no new claim.
  expect(byTurn.get(126)).toBe(t117);
  // Not before the first claim: the readout alone is not a belief.
  expect(byTurn.has(82)).toBe(false);
 });

 it("keeps the twin's push-back with every turn it was tried, and the pages whole",async()=>{
  const {byTurn}=await replay(ON);
  const t148=byTurn.get(148)??"";
  expect(t148).toContain(`- Moving UP from (11,1) in LITTLEROOT TOWN (map 0/9): you tried it 3 times, at turns 142, 144, 146 (latest: press UP). Each time a script moved you back to (11,2); the latest time (turn 146) it showed: TWIN (sprite kind, not a name): "Um, um, um!" | TWIN (sprite kind, not a name): "If you go outside and go in the grass,\nwild POKéMON will jump out!" | TWIN (sprite kind, not a name): "It's dangerous if you don't have\nyour own POKéMON."`);
  // Birch's lab entry still holds: the story has not changed since turn 98.
  expect(t148).toContain("- PROF. BIRCH on LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4)");
  expect(t148.indexOf("PROF. BIRCH on")).toBeLessThan(t148.indexOf("Moving UP"));
 });

 it("its pending experiment's incumbent has both entry sources on, so the treatment is not inert (review round 1)",()=>{
  const entry=JSON.parse(readFileSync(new URL("../../../experiments/disproved-beliefs.json",import.meta.url),"utf8")) as {changedFeature:string;incumbent:{features:Record<string,boolean>}};
  expect(entry.changedFeature).toBe(ID);
  for(const source of ["character-presence-v1","dialogue-auto-advance-v1","story-state-v1"])expect(entry.incumbent.features[source]).toBe(true);
  expect(entry.incumbent.features[ID]).toBe(false);
 });

 it("records Mom's push-back at the front door (T59) and drops it when the story changes",async()=>{
  const {byTurn}=await replay(ON);
  expect(byTurn.get(60)).toBe(`Things the game has contradicted (from this run's own readouts and dialogue; an entry is dropped when a story flag changes or the game shows otherwise):
- Moving DOWN from (8,8) in LITTLEROOT TOWN BRENDANS HOUSE 1F (map 1/0): you tried it 1 time, at turn 59 (latest: press DOWN). Each time a script moved you back to (8,7); the latest time (turn 59) it showed: MOM: "MOM: Well, GMREEN?" | MOM: "Aren't you interested in seeing your\nvery own room?"`);
  // intro_stage 4 -> 5 at T60: a story flag changed, so the entry may no longer hold.
  expect(byTurn.has(61)).toBe(false);
 });

 it("drops every entry when a story flag changes (rival_stage 0 -> 2 at T213), so the third lab trip (T225-T227) is shown none of them",async()=>{
  const {byTurn}=await replay(ON);
  expect(byTurn.get(213)).toContain("Moving UP from (11,1)");
  expect(byTurn.get(213)).toContain("PROF. BIRCH on LITTLEROOT TOWN PROFESSOR BIRCHS LAB");
  for(const turn of [214,215,216,219,220,221,222,223,224,225,226,227,228])expect(byTurn.has(turn)).toBe(false);
 });

 it("records Birch's Route 101 push-back from navigate_to and from presses",async()=>{
  const {byTurn}=await replay(ON);
  expect(byTurn.get(262)).toContain(`- Moving LEFT from (6,15) in ROUTE101 (map 0/16): you tried it 1 time, at turn 261 (latest: navigate_to (4,12)). Each time a script moved you back to (7,15); the latest time (turn 261) it showed: "Wh-Where are you going?!\nDon't leave me like this!"`);
  expect(byTurn.get(266)).toContain("you tried it 5 times, at turns 261, 262, 263, 264, 265 (latest: press LEFT,LEFT,LEFT,UP,UP,UP)");
 });

 it("records each delivery as a schema-valid belief_ledger event with the cited events",async()=>{
  const {bodies,byTurn}=await replay(ON);
  expect(bodies.length).toBe(byTurn.size);
  const last=bodies.at(-1);
  expect(last).toBeDefined();
  expect(()=>checkEvent({v:1,run:"r",t:"2026-10-16T03:00:00.000-04:00",seq:1,turn:1,type:"belief_ledger",...last})).not.toThrow();
  const t117=bodies.find(b=>b.text===byTurn.get(117));
  // The seven claims (assistant events), the readout result the latest claim answered and the scientist's conversation.
  const claims=FIXTURE.events.filter(e=>e.type==="assistant"&&e.turn>=82&&e.turn<=88).map(e=>e.seq);
  const readout=FIXTURE.events.find(e=>e.type==="tool_result"&&e.turn===87)?.seq;
  const scientist=FIXTURE.events.find(e=>e.type==="dialogue_auto_advance"&&e.turn===98)?.seq;
  expect(t117?.entries).toBe(1);
  expect(t117?.evidence).toEqual([...claims,readout,scientist].sort((a,b)=>(a??0)-(b??0)));
 });
});

// Synthetic, production-shaped events for the rules the run does not exercise.
describe("leaving the ledger and never clipping",()=>{
 let seq=0;
 const ev=(body:Record<string,unknown>,turn=1):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-16T03:00:00.000-04:00",seq:++seq,turn,...body});
 const LAB={location:"LAB",map_id:[1,4]};
 const story=(stage:number)=>({name_confirmed:true,intro_stage:7,rival_stage:stage,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:true,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false});
 const LINE=(here:string,absent:string)=>`Story characters here (from this map's own object list): ${here}. Not on this map: ${absent}. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.`;
 function observeResult(l:DisprovedBeliefs,id:string,text:string,extra:Record<string,unknown>,turn:number):void {
  l.observe(ev({type:"tool_call",id,name:"observe",args:{}},turn));
  const s=ev({type:"state",...IN_GAME,...LAB,position:{x:5,y:5},facing:"up",field_controls_locked:false,story:story(0),world_context:{objects:[],triggers:[],dialogue:null},...extra},turn);
  l.observe(s);
  l.observe(ev({type:"tool_result",id,name:"observe",is_error:false,duration_ms:1,text,frames:[],state_seq:s.seq},turn));
 }
 // A reply and the tool call it made; by default it walks to (3,3), the tile these tests claim.
 const say=(l:DisprovedBeliefs,thinking:string,turn:number,call:{name:string;args:Record<string,unknown>}={name:"navigate_to",args:{x:3,y:3,map_id:[1,4]}})=>{l.observe(ev({type:"assistant",thinking,text:"",tool_calls:[{id:`a${String(turn)}`,...call}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},turn));};

 it("keeps a claim only when the same reply walks to exactly that tile (review rounds 8 and 9)",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  observeResult(l,"o1",LINE("none","PROF. BIRCH"),{},1);
  // Retractions the vocabulary rule cannot see, and replies that act elsewhere: the model did not pursue the tile.
  say(l,"Professor Birch is at (7,7). Actually, he is elsewhere.",2,{name:"navigate_to",args:{x:1,y:12,map_id:[1,4]}});
  say(l,"Professor Birch is at (7,7). Scratch that, he is elsewhere.",3,{name:"press",args:{buttons:["DOWN"]}});
  say(l,"Professor Birch is at (7,7). Or so I thought.",4,{name:"observe",args:{}});
  // A walk to a neighbouring tile for another purpose is not the pursuit either (review round 9).
  say(l,"Professor Birch is at (8,7). Scratch that, he is elsewhere. The scientist is at (8,8), so I'll walk there.",5,{name:"navigate_to",args:{x:8,y:8,map_id:[1,4]}});
  say(l,"Professor Birch is at (7,7).",6,{name:"navigate_to",args:{x:7,y:8,map_id:[1,4]}});
  expect(l.text()).toBeNull();
  // The same coordinates on another map are another tile (review round 10).
  say(l,"Professor Birch is at (7,7).",7,{name:"navigate_to",args:{x:7,y:7,map_id:[0,9]}});
  expect(l.text()).toBeNull();
  say(l,"Professor Birch is at (7,7).",7,{name:"navigate_to",args:{x:7,y:7,map_id:[1,4]}});
  expect(l.text()).toContain(`you wrote at turn 7: "Professor Birch is at (7,7)." and called navigate_to (7,7).`);
 });
 it("drops an absent-character entry when that map's readout lists the character as here, and when a story flag changes",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  observeResult(l,"o1",LINE("none","PROF. BIRCH, MAY"),{},1);
  say(l,"Prof. Birch is at (3,3).",2);
  expect(l.text()).toContain("- PROF. BIRCH on LAB (map 1/4)");
  observeResult(l,"o2",LINE("PROF. BIRCH at 3,3","MAY"),{},3);
  expect(l.text()).toBeNull();
  say(l,"May is at (3,3).",4);
  expect(l.text()).toContain("- MAY on LAB (map 1/4)");
  observeResult(l,"o3",LINE("PROF. BIRCH at 3,3","MAY"),{story:story(1)},5);
  expect(l.text()).toBeNull();
  expect(l.size()).toBe(0);
 });

 it("never clips the evidence: long pages and a long readout line are quoted whole",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  const page=`Hunh? PROF. BIRCH? ${"He went out to study the wild POKéMON in the tall grass. ".repeat(100)}`.trim();
  call(l,"a","press",{buttons:["A"]},{position:{x:5,y:5}},[{text:page,position:{x:5,y:5}}],{position:{x:5,y:5}});
  const absent=`PROF. BIRCH, ${Array.from({length:200},(_,i)=>`PERSON${String(i)}`).join(", ")}`;
  observeResult(l,"o1",LINE("none",absent),{},2);
  say(l,"Prof. Birch is at (3,3).",3);
  expect(l.text()).toContain(`"${page}"`);
  expect(l.text()).toContain(LINE("none",absent));
 });

 it("drops a push-back entry when the player reaches the refused tile",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  const before=ev({type:"state",...IN_GAME,...LAB,position:{x:2,y:2},facing:"up",field_controls_locked:false,story:story(0),world_context:{objects:[],triggers:[],dialogue:null}});
  l.observe(before);
  l.observe(ev({type:"tool_call",id:"p1",name:"press",args:{buttons:["UP"]}}));
  l.observe(ev({type:"button_press",tool_call_id:"p1",buttons:["UP"],before_state_seq:before.seq}));
  l.observe(ev({type:"dialogue_auto_advance",tool_call_id:"p1",tool:"press",requested:["UP"],sent:["UP"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"LAB",map_id:[1,4],position:{x:2,y:1},speaker:null,speaker_source:null,text:"Wait!"}],stop:"field_free",detail:"closed",duration_ms:1}));
  const after=ev({type:"state",...IN_GAME,...LAB,position:{x:2,y:2},facing:"up",field_controls_locked:false,story:story(0),world_context:{objects:[],triggers:[],dialogue:null}});
  l.observe(after);
  l.observe(ev({type:"tool_result",id:"p1",name:"press",is_error:false,duration_ms:1,text:"pressed UP",frames:[],state_seq:after.seq}));
  expect(l.text()).toContain(`- Moving UP from (2,1) in LAB (map 1/4): you tried it 1 time, at turn 1 (latest: press UP). Each time a script moved you back to (2,2); the latest time (turn 1) it showed: "Wait!"`);
  observeResult(l,"o1","Screen: overworld",{position:{x:2,y:0}},2);
  expect(l.text()).toBeNull();
 });

 // The inputs a call sends: a press sends its buttons (no message opened before the last one); navigate_to records none.
 const sentOf=(args:Record<string,unknown>):string[]=>Array.isArray(args["buttons"])?args["buttons"].map(String):[];
 // One press or navigate_to call: the state before, any script pages, and the state it ended in.
 function call(l:DisprovedBeliefs,id:string,name:"press"|"navigate_to",args:Record<string,unknown>,from:Record<string,unknown>|null,pages:Record<string,unknown>[],to:Record<string,unknown>,result:Record<string,unknown>={}):void {
  const base={type:"state",...IN_GAME,...LAB,facing:"up",field_controls_locked:false,story:story(0),world_context:{objects:[],triggers:[],dialogue:null}};
  const before=from===null?null:ev({...base,...from});
  if(before!==null)l.observe(before);
  l.observe(ev({type:"tool_call",id,name,args}));
  l.observe(ev({type:"button_press",tool_call_id:id,buttons:["UP"],...(before===null?{}:{before_state_seq:before.seq})}));
  if(pages.length>0)l.observe(ev({type:"dialogue_auto_advance",tool_call_id:id,tool:name,requested:sentOf(args),sent:sentOf(args),dropped:[],auto_presses:1,pages:pages.map(p=>({state_seq:null,map:"LAB",map_id:[1,4],position:{x:2,y:1},speaker:null,speaker_source:null,text:"Wait!",...p})),stop:"field_free",detail:"closed",duration_ms:1}));
  const after=ev({...base,...to});l.observe(after);
  l.observe(ev({type:"tool_result",id,name,is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:after.seq,...result}));
 }
 it("records a push-back only for a script move one tile back against the way the model went",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  const at=(x:number,y:number)=>({position:{x,y}});
  call(l,"a","press",{buttons:["A"]},at(2,2),[{}],at(2,2));
  call(l,"b","press",{buttons:["LEFT"]},at(2,2),[{}],at(2,2));
  call(l,"c","press",{buttons:["UP"]},at(2,2),[{}],at(2,3));
  call(l,"d","press",{buttons:["UP"]},at(2,2),[{map_id:[0,9]}],at(2,2));
  call(l,"e","press",{buttons:["UP"]},at(2,2),[{position:null}],at(2,2));
  call(l,"f","press",{buttons:["UP"]},at(2,2),[],at(2,2));
  call(l,"g","navigate_to",{x:2,y:0},at(2,4),[{}],at(2,0));
  call(l,"h","navigate_to",{x:2,y:0},null,[{}],at(2,2));
  call(l,"i","press",{buttons:["UP"]},at(2,2),[{}],at(2,2),{is_error:true});
  call(l,"j","press",{buttons:["UP"]},at(2,2),[{}],at(2,2),{name:"get_dialogue"});
  call(l,"k","press",{buttons:["UP"]},at(2,2),[{}],{...at(2,2),started:false,screen:"title"});
  expect(l.text()).toBeNull();
  call(l,"m","navigate_to",{x:2,y:0},at(2,4),[{}],at(2,2));
  expect(l.text()).toContain("- Moving UP from (2,1) in LAB (map 1/4): you tried it 1 time, at turn 1 (latest: navigate_to (2,0)).");
 });
 it("binds a push-back to the inputs actually sent, not the ones requested (review round 3)",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  const base={type:"state",...IN_GAME,...LAB,facing:"up",field_controls_locked:false,story:story(0),world_context:{objects:[],triggers:[],dialogue:null}};
  const before=ev({...base,position:{x:2,y:2}});l.observe(before);
  l.observe(ev({type:"tool_call",id:"s1",name:"press",args:{buttons:["A","UP"]}}));
  l.observe(ev({type:"button_press",tool_call_id:"s1",buttons:["A"],before_state_seq:before.seq}));
  // A started a script at (2,2); UP was dropped; the script then moved the player down.
  l.observe(ev({type:"dialogue_auto_advance",tool_call_id:"s1",tool:"press",requested:["A","UP"],sent:["A"],dropped:["UP"],auto_presses:1,pages:[{state_seq:null,map:"LAB",map_id:[1,4],position:{x:2,y:2},speaker:null,speaker_source:null,text:"Wait!"}],stop:"field_free",detail:"closed",duration_ms:1}));
  const after=ev({...base,position:{x:2,y:3}});l.observe(after);
  l.observe(ev({type:"tool_result",id:"s1",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:after.seq}));
  expect(l.text()).toBeNull();
 });
 it("accepts only a sentence that opens with the name as the subject of is/stands at a tile (review round 4)",()=>{
  for(const s of ["I doubt Professor Birch is at (7,7).","There is no evidence Professor Birch is at (7,7).","It is false that Professor Birch is at (7,7).","Suppose Professor Birch is at (7,7).","I will go to Professor Birch at (4,13)."])expect(locatingClaims(s,"PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("I moved. The Prof. Birch is at (7,7).","PROF. BIRCH")).toEqual(["The Prof. Birch is at (7,7)."]);
  expect(locatingClaims("Professor Birch is standing at (7,8).","PROF. BIRCH")).toEqual(["Professor Birch is standing at (7,8)."]);
 });
 it("ends the claim at the tile, and drops it when the same reply names the character in a negated sentence (review round 6)",()=>{
  for(const s of ["Professor Birch is at (7,7), I think.","Professor Birch is at (7,7), apparently.","Prof. Birch is at (7,7), in his lab.","Prof. Birch is at (7,7) (in his lab).","Prof. Birch is at (7,7) back in the lab.","Prof. Birch is at (7,7) earlier, but he left.","Professor Birch is at (9,8) and the scientist is at (9,9)."])expect(locatingClaims(s,"PROF. BIRCH")).toEqual([]);
  for(const s of ["May is at (14,8), in her house.","May is at (14,8), under the table in her house."])expect(locatingClaims(s,"MAY")).toEqual([]);
  for(const s of ["Mom is at (8,2), upstairs.","Mom is at (8,2) — downstairs."])expect(locatingClaims(s,"MOM")).toEqual([]);
  expect(locatingClaims("Professor Birch is at (7,7). Actually, the readout says Professor Birch isn't here, so I will leave.","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Professor Birch is at (7,7). I will walk to (7,8) and face up.","PROF. BIRCH")).toEqual(["Professor Birch is at (7,7)."]);
  // A retraction by pronoun, or any negation or hedge elsewhere in the reply, takes no claim from it (review round 7).
  for(const s of ["Professor Birch is at (7,7). Actually, the readout says he isn't here, so I will leave.","Professor Birch is at (7,7). Hmm, wait: he's not listed on this map.","Professor Birch is at (7,7). I was wrong about that, maybe.","I can't go north. Professor Birch is at (7,7)."])expect(locatingClaims(s,"PROF. BIRCH")).toEqual([]);
 });
 it("accepts only the present tense straight to the tile, with no place after it (review round 5)",()=>{
  for(const s of ["Professor Birch, I think, is at (7,7).","Professor Birch, the professor, is standing at (7,8).","Professor Birch is apparently at (7,7).","Prof. Birch was at (7,7) in his lab.","Professor Birch is standing next to the red carpet at (7,8)."])expect(locatingClaims(s,"PROF. BIRCH")).toEqual([]);
  for(const s of ["May is in her house at (14,8).","May is at (14,8) in her house."])expect(locatingClaims(s,"MAY")).toEqual([]);
  expect(locatingClaims("Mom is downstairs at (8,2).","MOM")).toEqual([]);
  // Anything after the tile ends the claim (review round 6).
  expect(locatingClaims("Prof. Birch is at (9,8) and the scientist is at (9,9).","PROF. BIRCH")).toEqual([]);
 });
 it("binds a navigate_to push-back to the last step the walk sent (review round 4)",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  const base={type:"state",...IN_GAME,...LAB,facing:"up",field_controls_locked:false,story:story(0),world_context:{objects:[],triggers:[],dialogue:null}};
  const before=ev({...base,position:{x:1,y:4}});l.observe(before);
  l.observe(ev({type:"tool_call",id:"n1",name:"navigate_to",args:{x:2,y:0}}));
  l.observe(ev({type:"button_press",tool_call_id:"n1",buttons:["RIGHT"],before_state_seq:before.seq}));
  l.observe(ev({type:"button_press",tool_call_id:"n1",buttons:["UP"]}));
  l.observe(ev({type:"button_press",tool_call_id:"n1",buttons:["UP"]}));
  // The walk's last step was UP onto (2,2); the script moved the player LEFT to (1,2), which is closer to the start,
  // but the walk was not moving RIGHT when it met the script: no entry.
  l.observe(ev({type:"dialogue_auto_advance",tool_call_id:"n1",tool:"navigate_to",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"LAB",map_id:[1,4],position:{x:2,y:2},speaker:null,speaker_source:null,text:"Wait!"}],stop:"field_free",detail:"closed",duration_ms:1}));
  const after=ev({...base,position:{x:1,y:2}});l.observe(after);
  l.observe(ev({type:"tool_result",id:"n1",name:"navigate_to",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:after.seq}));
  expect(l.text()).toBeNull();
 });
 it("skips modal questions without a question mark (review round 3)",()=>{
  expect(locatingClaims("Can Professor Birch be at (7,7).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Is Professor Birch at (7,7).","PROF. BIRCH")).toEqual([]);
  expect(locatingClaims("Where is Prof. Birch, at (7,7).","PROF. BIRCH")).toEqual([]);
 });
 it("binds a push-back to the first direction of the call (review round 2)",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  const at=(x:number,y:number)=>({position:{x,y}});
  // UP appears in the batch, but the call first went LEFT and the pages began one tile left: not "moving UP".
  call(l,"a","press",{buttons:["LEFT","UP"]},at(2,2),[{position:{x:1,y:2}}],at(1,3));
  expect(l.text()).toBeNull();
  // The first step went LEFT onto the trigger tile and the script put the player back: "moving LEFT".
  call(l,"b","press",{buttons:["LEFT","LEFT","UP"]},at(2,2),[{position:{x:1,y:2}}],at(2,2));
  expect(l.text()).toContain("- Moving LEFT from (1,2) in LAB (map 1/4): you tried it 1 time");
 });
 it("drops conversations shown under an earlier story, so a later entry never quotes them (review round 2)",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  call(l,"a","press",{buttons:["A"]},{position:{x:5,y:5}},[{text:"Hunh? PROF. BIRCH?",position:{x:5,y:5}}],{position:{x:5,y:5}});
  observeResult(l,"o1",LINE("none","PROF. BIRCH"),{story:story(1)},2);
  say(l,"Prof. Birch is at (3,3).",3);
  expect(l.text()).toContain("- PROF. BIRCH on LAB (map 1/4)");
  expect(l.text()).not.toContain("you were shown");
 });
 it("keeps going with no story readout, forgets unanswered calls, and drops a stale readout on another map",()=>{
  const l=new DisprovedBeliefs(ALL_ON);
  for(let i=0;i<20;i++){l.observe(ev({type:"tool_call",id:`x${String(i)}`,name:"press",args:{buttons:["UP"]}}));l.observe(ev({type:"dialogue_auto_advance",tool_call_id:`x${String(i)}`,tool:"press",requested:["UP"],sent:["UP"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"LAB",map_id:[1,4],position:{x:2,y:1},speaker:null,speaker_source:null,text:`Page ${String(i)}`}],stop:"field_free",detail:"closed",duration_ms:1}));}
  for(let i=0;i<20;i++)call(l,`p${String(i)}`,"press",{buttons:["A"]},null,[{text:`Said ${String(i)}`}],{position:{x:5,y:5},story:null});
  observeResult(l,"o1",LINE("none","PROF. BIRCH"),{story:null},1);
  say(l,"Prof. Birch is at (3,3).",2);
  expect(l.text()).toContain("- PROF. BIRCH on LAB (map 1/4)");
  observeResult(l,"o2","no presence line",{location:"TOWN",map_id:[0,9]},3);
  say(l,"Prof. Birch is at (4,4).",4);
  expect(l.text()).toContain("at turn 2:");
  expect(l.text()).not.toContain("turn 4");
 });
 it("the production factory is null when the switch is off",()=>{
  const recorder={subscribe:()=>undefined,recordBeliefLedger:()=>undefined};
  expect(disprovedBeliefs({...ALL_ON,[ID]:false},recorder,m=>Promise.resolve(m))).toBeNull();
  expect(disprovedBeliefs({...ALL_ON,[ID]:true},recorder,m=>Promise.resolve(m))).not.toBeNull();
 });
});

describe("replay: the decision probe rebuilds what the model saw",()=>{
 const start=FIXTURE.events.find((e):e is Extract<RunEvent,{type:"run_start"}>=>e.type==="run_start");
 if(start===undefined)throw new Error("fixture has no run_start");
 const run={start,events:FIXTURE.events};
 const ports={frame:()=>"",rerender:()=>Promise.reject(new Error("no rerender")),thinkingSignature:"reasoning_content"};
 it("replays the ledger into the T117 context with the switch on, and leaves it out with the switch off",async()=>{
  const on=await decisionContext(run,117,ON,ports,"replayed");
  const off=await decisionContext(run,117,OFF,ports,"replayed");
  const last=on.messages.at(-1);
  expect(last?.role).toBe("user");
  expect(last?.role==="user"&&typeof last.content==="string"?last.content:"").toMatch(/^Things the game has contradicted .*\n- PROF\. BIRCH on LITTLEROOT TOWN PROFESSOR BIRCHS LAB \(map 1\/4\): you wrote at turn 88:/s);
  expect(on.messages.length).toBe(off.messages.length+1);
  expect(on.messages.slice(0,-1)).toEqual(off.messages);
 });
 it("reads a recorded belief_ledger back as that turn's note",()=>{
  const recorded=[checkEvent({v:1,run:"r",t:"2026-10-16T03:00:00.000-04:00",seq:5,turn:3,type:"belief_ledger",text:"Things the game has contradicted: x",entries:1,evidence:[1]})];
  expect(recordedNotes(recorded,3)).toEqual(["Things the game has contradicted: x"]);
  expect(recordedNotes(recorded,4)).toEqual([]);
 });
 it("rebuilds the recorded notes in the order the production chain delivers them: guard, ledger, hint, instruction ledger, memory (review round 3)",()=>{
  const ev2=(body:Record<string,unknown>,seq:number,turn:number)=>checkEvent({v:1,run:"r",t:"2026-10-16T03:00:00.000-04:00",seq,turn,...body});
  const prior=[
   ev2({type:"milestone_hint",text:"HINT",milestone:"CLOCK_SET"},1,1),
   ev2({type:"loop_guard",kind:"same_plan",message:"SUPERVISOR: same",calls:3,evidence:[1],mode:"enforced",phase:"supervisor"},2,2),
   ev2({type:"belief_ledger",text:"BELIEFS",entries:1,evidence:[1]},3,3),
   ev2({type:"ledger_context",text:"LEDGER",evidence:[]},4,3),
   ev2({type:"navigation_context",text:"NAV",evidence:[]},5,3),
  ];
  expect(recordedNotes(prior,3)).toEqual(["SUPERVISOR: same","BELIEFS","HINT","LEDGER","NAV"]);
 });
 it("the production chain puts the ledger before the pinned hint, as recordedNotes does",async()=>{
  const subscribers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined};
  const context=contextTools({...ON,"next-milestone-hint-v1":true},recorder,m=>Promise.resolve(m));
  for(const e of FIXTURE.events){if(DERIVED.has(e.type))continue;if(e.type==="turn_start"&&e.turn===117)break;for(const s of subscribers)s(e);}
  const out=await context.transformContext([]);
  const texts=out.map(textOf);
  const ledger=texts.findIndex(t=>t.startsWith("Things the game has contradicted"));
  const hint=texts.findIndex(t=>t.startsWith("MILESTONE REACHED"));
  expect(ledger).toBeGreaterThanOrEqual(0);
  expect(hint).toBeGreaterThan(ledger);
 });
});
