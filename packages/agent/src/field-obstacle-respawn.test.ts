// field-obstacle-respawn-v1: run 6056 smashed Route 111's BREAKABLE_ROCKs at turns 993-995, whited out at 1068 and spent
// about 45 minutes failing to go north. At turn 1090 the readout listed the rocks as last talked to on turns 993 and 995,
// and navigate_to (14,96) said only "no supported path on the current map". The fixture is the turn-1089 state that
// result was built from (test-support/field-obstacle-respawn-6056.json).
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import fixture from "../test-support/field-obstacle-respawn-6056.json" with {type:"json"};
import current from "../../../experiments/feature-configs/current.json" with {type:"json"};
import {rayquazaLaneFeatures} from "../test-support/rayquaza-lane.js";
import {serverOff,serverOffWith} from "../test-support/server-features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {BACK,ObstacleRespawn,blockerNote,clearInstruction,respawnLine} from "./field-obstacle-respawn.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {withNavigation} from "./navigation.js";
import {PeopleLedger,withPeopleLedger} from "./people-ledger.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {observeTool,pressTool} from "./game-tools.js";

const ID="field-obstacle-respawn-v1";
const STATE=parseGameState(fixture.state);
const ROCK16='ROCK SMASH it: navigate_to_target target {"kind":"object","local_id":16}, answer YES';
const ROCK15='ROCK SMASH it: navigate_to_target target {"kind":"object","local_id":15}, answer YES';
const NO_FULL="no supported path on the current map; choose a reachable waypoint";
type Obstacles=NonNullable<GameStateSnapshot["field_obstacles"]>;

// The recorded state with only these rocks still in place (the others smashed), optionally moved or on another map.
function rocks(ids:readonly number[],over:Partial<GameStateSnapshot>={}):GameStateSnapshot {
 const field=STATE.field_obstacles as Obstacles;
 const gone=(id:number|null)=>(id===15||id===16)&&!ids.includes(id);
 return {...STATE,field_obstacles:{...field,obstacles:field.obstacles.filter(o=>!gone(o.local_id))},interaction_targets:(STATE.interaction_targets??[]).filter(t=>t.kind!=="object"||!gone(t.local_id)),...over};
}
const MAUVILLE:Partial<GameStateSnapshot>={map_id:[0,2],location:"MAUVILLE CITY",field_obstacles:{capabilities:(STATE.field_obstacles as Obstacles).capabilities,obstacles:[]},interaction_targets:[]};
const event=(seq:number,turn:number,body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r6056",seq,t:"2026-11-07T11:26:53.000-05:00",turn,...body});
const state=(seq:number,turn:number,s:GameStateSnapshot):RunEvent=>event(seq,turn,{type:"state",...s});
// The model's own smash: A on the faced rock, its pages, then the tool result (how the ledger records a talk).
function smash(seq:number,turn:number,at:{x:number;y:number},id:string):RunEvent[] {
 return [
  state(seq,turn,{...rocks([15,16]),position:at,facing:"up"}),
  event(seq+1,turn,{type:"dialogue_auto_advance",tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,stop:"field_free",detail:"",duration_ms:1,pages:[{state_seq:seq,map:"ROUTE 111",map_id:[0,26],position:at,speaker:null,speaker_source:null,text:"This rock appears to be breakable.\nWould you like to use ROCK SMASH?"}]}),
  event(seq+2,turn,{type:"tool_result",id,name:"press",text:"Location: ROUTE 111",is_error:false,duration_ms:1,frames:[]}),
 ];
}
// Turns 993-1089: smash 16, then 15, white out to Mauville at 1068, walk back onto ROUTE 111 at 1069.
const HISTORY:readonly RunEvent[]=[
 state(1,988,rocks([15,16])),
 ...smash(2,993,{x:19,y:101},"c993"),state(5,993,rocks([15])),
 ...smash(6,995,{x:18,y:102},"c995"),state(9,995,rocks([])),
 state(10,1068,rocks([],MAUVILLE)),state(11,1069,rocks([15,16])),state(12,1089,STATE),
];
const READOUT="Location: ROUTE 111 (map 0/26) — southwest terrain section [9,61]\nPosition: X=16, Y=102, facing up, elevation 3";
function ledgerLines(on:boolean,events:readonly RunEvent[]=HISTORY,s:GameStateSnapshot=STATE):string[] {
 const ledger=new PeopleLedger(false,on?{tracker:new ObstacleRespawn(),semantic:true}:null);
 for(const e of events)ledger.observe(e);
 return (ledger.block(s,READOUT,"c1089")??"").split("\n").filter(line=>line.startsWith("- object"));
}

describe(`${ID}: registry`,()=>{
 it("is the last switch, an observation switch that needs field-move-gates-v1, with an Off clause",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(372);
  const info=FEATURES.find(f=>f.id===ID);
  expect(info?.needs).toBe("field-move-gates-v1");
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,"play")).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},"play")).not.toContain(ID);
 });
 it("is a server switch the game server gets only when on",()=>{
  expect(SERVER_FEATURES).toContain(ID);
  expect(serverOff({...ALL_ON,[ID]:false})).toEqual(serverOffWith(ALL_ON,{off:[ID]}));
 });
 it("defaults off when a preset or flag set omits it, and is on in both arms of current",()=>{
  const {[ID]:_omitted,...rest}=ALL_ON;
  expect(normalizeFeatures(rest)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(current.onInBoth).toContain(ID);
  expect((current.features as Record<string,boolean>)[ID]).toBe(true);
  expect(rayquazaLaneFeatures()[ID]).toBe(true);
 });
});

describe(`${ID}: which obstacles are back`,()=>{
 it("a rock smashed on an earlier visit and placed again is back; one never cleared is not",()=>{
  const tracker=new ObstacleRespawn();
  tracker.observe(rocks([15,16]));tracker.observe(rocks([15]));
  expect(tracker.respawned(rocks([15]),15)).toBeNull();
  tracker.observe(rocks([],MAUVILLE));
  expect(tracker.respawned(STATE,16)).toBe("rock_smash");
  expect(tracker.respawned(STATE,15)).toBeNull();
 });
 it("a battle on the same map is no reload, and a state without field_obstacles says nothing",()=>{
  const tracker=new ObstacleRespawn();
  tracker.observe(rocks([15,16]));tracker.observe(rocks([15]));
  tracker.observe({...rocks([15]),in_battle:true,field_obstacles:null});tracker.observe({map_id:null,field_obstacles:null});
  expect(tracker.respawned(rocks([15]),16)).toBeNull();
 });
 it("smashing it again on this visit ends it",()=>{
  const tracker=new ObstacleRespawn();
  for(const s of [rocks([15,16]),rocks([15]),rocks([],MAUVILLE),STATE,rocks([15])])tracker.observe(s);
  expect(tracker.respawned(rocks([15]),16)).toBeNull();
 });
 it("a boulder pushed on an earlier visit is back with STRENGTH off",()=>{
  const field=STATE.field_obstacles as Obstacles;
  const boulder=(x:number):GameStateSnapshot=>({...STATE,field_obstacles:{capabilities:{...field.capabilities,strength:true},obstacles:[{id:0,gate:"strength",name:"PUSHABLE_BOULDER",kind:"object",local_id:4,loaded:true,tiles:[{x,y:90}],only:null,open:true,needs:"a field move you cannot use yet",text:"It's a big boulder, but a POKéMON may be able to push it aside.",beyond:null}]}});
  const tracker=new ObstacleRespawn();
  for(const s of [boulder(5),boulder(6),rocks([],MAUVILLE)])tracker.observe(s);
  expect(respawnLine(tracker,boulder(5),4,true)).toBe(`${BACK}; use STRENGTH again: navigate_to_target target {"kind":"object","local_id":4}, answer YES, then walk into it`);
  const unmoved=new ObstacleRespawn();
  for(const s of [boulder(5),rocks([],MAUVILLE)])unmoved.observe(s);
  expect(unmoved.respawned(boulder(5),4)).toBeNull();
 });
 it("the instruction is the game's question answered, with A in place of the tool when there is none",()=>{
  expect(clearInstruction("cut",3,false)).toBe("CUT it: face it and press A, answer YES");
  expect(clearInstruction("rock_smash",16,true)).toBe(ROCK16);
 });
});

describe(`${ID}: the people list at turn 1090`,()=>{
 it("off: the recorded ledger lines, byte for byte",()=>{
  expect(ledgerLines(false)).toEqual(fixture.recorded.people);
 });
 it("on: both rocks are back since you left the map, with how to smash them",()=>{
  expect(ledgerLines(true)).toEqual([
   `- object 15, sprite BREAKABLE_ROCK, at (18,101): ${BACK}; ${ROCK15}`,
   `- object 16, sprite BREAKABLE_ROCK, at (19,100): ${BACK}; ${ROCK16}`,
  ]);
 });
 it("on, without ROCK SMASH in the party: the ledger's own text stays",()=>{
  const field=STATE.field_obstacles as Obstacles;
  const weak={...STATE,field_obstacles:{...field,capabilities:{...field.capabilities,rock_smash:false}}};
  expect(ledgerLines(true,HISTORY,weak)).toEqual(fixture.recorded.people);
 });
});

// The lane recipe's tools around a fake game server that serves the turn-1089 state and refuses any press.
function navigate(features:FeatureSet):Promise<AgentToolResult<unknown>> {
 const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
 const fetchFn:typeof fetch=(input)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
  if(url.endsWith("/action"))throw new Error("pressed");
  const body=url.endsWith("/queue_status")?{queue_empty:true}:url.endsWith("/pokebench/observation")?{state:fixture.state,state_text:"observed",screenshot_base64:png.toString("base64")}:fixture.state;
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const tools:AgentTool[]=withNavigation([observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})],features,{read:()=>Promise.resolve(STATE)});
 const nav=tools.find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("no navigate_to");
 return nav.execute("c1089",fixture.source.navigate_to);
}
const status=(r:AgentToolResult<unknown>):string=>(r.details as {navigation:{status:string}}).navigation.status;
const lane=(on:boolean):FeatureSet=>({...rayquazaLaneFeatures(),"trainer-sight-check-v1":false,"story-battle-heal-gate-v1":false,[ID]:on});

describe(`${ID}: navigate_to (14,96) at turn 1089`,()=>{
 it("off: the recorded refusal, byte for byte",async()=>{
  const off=await navigate(lane(false));
  expect(status(off)).toBe(NO_FULL);
  expect(fixture.recorded.navigation).toContain(`Navigation: ${NO_FULL};`);
 });
 it("on: names the nearest rock whose smashing opens the route",async()=>{
  expect(status(await navigate(lane(true)))).toBe(`${NO_FULL}; BREAKABLE_ROCK object 15 at (18,101) stands in the way: ${ROCK15}`);
 });
 it("on: nothing to name when the party cannot smash the rocks, or no rock is on the way",()=>{
  const field=STATE.field_obstacles as Obstacles;
  const closed={...STATE,field_obstacles:{...field,obstacles:field.obstacles.map(o=>o.gate==="rock_smash"?{...o,open:false}:o)}};
  expect(blockerNote(closed,()=>true,true)).toBeNull();
  expect(blockerNote(STATE,()=>false,true)).toBeNull();
 });
 it("on: when neither rock alone opens it but both do, the nearest is named",()=>{
  const both=(s:GameStateSnapshot)=>(s.map_grid?.objects.length??2)===0;
  expect(blockerNote(STATE,both,false)).toBe("BREAKABLE_ROCK object 15 at (18,101) stands in the way: ROCK SMASH it: face it and press A, answer YES");
 });
});

describe(`${ID}: production wiring of the people list`,()=>{
 it("withPeopleLedger reads the switch from the FeatureSet",async()=>{
  const run=async(on:boolean):Promise<string>=>{
   const listeners:((e:RunEvent)=>void)[]=[];
   const observe:AgentTool={name:"observe",label:"observe",description:"",parameters:{type:"object",properties:{}} as AgentTool["parameters"],execute:()=>Promise.resolve({content:[{type:"text",text:READOUT}],details:{state:STATE}})};
   const [tool]=withPeopleLedger([observe],{...lane(on),"people-ledger-v1":true},{subscribe:f=>{listeners.push(f);}});
   for(const e of HISTORY)for(const f of listeners)f(e);
   const out=await tool?.execute("c1089",{});
   const part=out?.content[0];
   return part?.type==="text"?part.text:"";
  };
  expect(await run(true)).toContain(`at (19,100): ${BACK}; ${ROCK16}`);
  expect(await run(false)).toContain(fixture.recorded.people[1]);
 });
});
