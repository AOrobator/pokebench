import {describe,expect,it} from "vitest";
import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {GymReadiness,LEADER_CLASS,gymEvent,withGymReadiness,type GymEvent} from "./gym-readiness.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import type {RunEvent} from "./events.js";

// Run 2026-10-20T16-14-34_qwen36-gpu0_a8f9: JOSH (turn 817), three losses to ROXANNE (827, 907-912, 1027-1031; she
// sent out GEODUDE Lv12 in slots 0 and 1), the gym guide's advice (turn 1105), and the RUSTBORO CITY GYM field
// state right after it (TORCHIC Lv15 at 41/41). The events are trimmed to the fields the line reads.
const RUN=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/gym-readiness-a8f9.json.gz",import.meta.url))).toString("utf8")) as {events:GymEvent[];state:unknown};
// The recorded state event without its event envelope is the /pokebench/state body.
const ENVELOPE=new Set(["v","run","seq","t","type","turn"]);
const BODY=Object.fromEntries(Object.entries(RUN.state as Record<string,unknown>).filter(([k])=>!ENVELOPE.has(k)));
const STATE=parseGameState(BODY);
const ID="gym-readiness-readout-v1";
const replay=(events:readonly GymEvent[]=RUN.events)=>{const gym=new GymReadiness();for(const e of events)gym.observe(e);return gym;};
const GUIDE='Said on this map: "ROXANNE, the GYM LEADER, is a user of ROCK-type POKéMON." "The ROCK type is very durable, but it can\'t stand WATER-type and GRASS-type moves."';

describe("gym-readiness-readout-v1 on the recorded Rustboro gym (run a8f9)",()=>{
 it("puts the party's levels next to the leader's POKéMON seen in battle and the type words said here",()=>{
  expect(replay().block(STATE)).toBe([
   "Gym: RUSTBORO CITY GYM · GYM LEADER ROXANNE",
   "Your party: TORCHIC Lv15 HP 41/41",
   "ROXANNE's POKéMON seen in battle this run: GEODUDE Lv12 ×2; any others not seen yet",
   GUIDE,
  ].join("\n"));
 });
 it("before any leader battle says none seen and names no leader; before the guide talks it quotes nothing",()=>{
  const early=RUN.events.filter(e=>!(e.type==="state"&&e.trainer_opponent?.trainer_class===LEADER_CLASS)&&e.type==="state");
  expect(replay(early).block(STATE)).toBe(["Gym: RUSTBORO CITY GYM","Your party: TORCHIC Lv15 HP 41/41","The GYM LEADER's POKéMON seen in battle this run: none yet"].join("\n"));
 });
 it("lists the map's trainers from the game's trainer flags, by the name a battle showed, else the sprite kind",()=>{
  const trainers=[{local_id:2,x:5,y:13,graphics_id:4,sprite_kind:"YOUNGSTER",trainer_id:320,defeated:true},{local_id:3,x:2,y:9,graphics_id:4,sprite_kind:"YOUNGSTER",trainer_id:321,defeated:false},{local_id:5,x:8,y:6,graphics_id:9,sprite_kind:"HIKER",trainer_id:571,defeated:false},{local_id:1,x:5,y:2,graphics_id:80,sprite_kind:"ROXANNE",trainer_id:265,defeated:false}];
  // ROXANNE beat the player three times in a8f9: her flag is clear, but a battle showed her name (Claude review round 1).
  const facts={trainers,move_power:[],last_heal:null,home:null,mom_heals:false};
  const state:GameStateSnapshot={...STATE,heal_before_trainers:facts};
  expect(replay().block(state)?.split("\n").at(-1)).toBe("Trainers on this map: JOSH at (5,13) (beaten), YOUNGSTER at (2,9) (not beaten), HIKER at (8,6) (not beaten), ROXANNE at (5,2) (battled, not beaten)");
  const nobody:GameStateSnapshot={...state,heal_before_trainers:{...facts,trainers:[]}};
  expect(replay().block(nobody)?.split("\n").at(-1)).toBe(GUIDE);
 });
 it("says nothing off a gym map, in battle or before the game starts, and keeps a leader to the map it was fought on",()=>{
  const gym=replay();
  expect(gym.block({...STATE,location:"RUSTBORO CITY",map_id:[0,3]})).toBeNull();
  expect(gym.block({...STATE,in_battle:true})).toBeNull();
  expect(gym.block({...STATE,started:false})).toBeNull();
  expect(gym.block({...STATE,screen:"battle"})).toBeNull();
  expect(gym.block({...STATE,map_id:null})).toBeNull();
  expect(gym.block({...STATE,location:"PETALBURG CITY GYM",map_id:[8,1]})?.split("\n").slice(0,1)).toEqual(["Gym: PETALBURG CITY GYM"]);
 });
 it("keeps each slot's highest level and counts a slot once",()=>{
  const battle=(level:number,slot:number):GymEvent=>({type:"state",map_id:[11,3],trainer_opponent:{trainer_id:265,trainer_class:LEADER_CLASS,name:"ROXANNE",battle_active:true},battlers:[{position:0,party_slot:0,species:"TORCHIC",level:15},{position:1,party_slot:slot,species:slot===2?"NOSEPASS":"GEODUDE",level}]});
  const gym=replay([battle(12,0),battle(12,0),battle(13,0),battle(12,1),battle(15,2),{type:"state",map_id:[11,3],trainer_opponent:{trainer_id:265,trainer_class:LEADER_CLASS,name:"ROXANNE",battle_active:false},battlers:[]},{type:"state",map_id:[11,3],trainer_opponent:null,battlers:[]},{type:"state",map_id:null,trainer_opponent:{trainer_id:265,trainer_class:LEADER_CLASS,name:"ROXANNE",battle_active:true},battlers:[]},{type:"state",map_id:[11,3],trainer_opponent:{trainer_id:265,trainer_class:LEADER_CLASS,name:null,battle_active:true},battlers:[]},{type:"state",map_id:[11,3],trainer_opponent:{trainer_id:265,trainer_class:LEADER_CLASS,name:"ROXANNE",battle_active:true},battlers:[{position:1,party_slot:null,species:null,level:null}]}]);
  expect(gym.block(STATE)?.split("\n")[2]).toBe("ROXANNE's POKéMON seen in battle this run: GEODUDE Lv13, GEODUDE Lv12, NOSEPASS Lv15; any others not seen yet");
 });
 it("quotes a type page once, skips battle pages and pages with no map",()=>{
  const page=(text:string,extra:object={})=>({type:"dialogue_auto_advance" as const,pages:[{map_id:[11,3] as [number,number],text,...extra}]});
  const gym=replay([page("Use FIRE-type moves!"),page("Use FIRE-type\nmoves!"),page("A GRASS-type foe",{battle_message_id:4}),{type:"dialogue_auto_advance",pages:[{map_id:null,text:"WATER-type"}]},page("no type here")]);
  expect(gym.block(STATE)?.split("\n").at(-1)).toBe('Said on this map: "Use FIRE-type moves!"');
 });
 it("adds the block after Location/Position only when there is one",()=>{
  const gym=replay();
  expect(gym.annotate("Screen: overworld\nLocation: RUSTBORO CITY GYM\nPosition: 5,19\nMoney: 1",STATE)).toBe(`Screen: overworld\nLocation: RUSTBORO CITY GYM\nPosition: 5,19\n${gym.block(STATE) ?? ""}\nMoney: 1`);
  expect(gym.annotate("no location line",STATE)).toBe("no location line");
  expect(gym.annotate("Location: X",{...STATE,in_battle:true})).toBe("Location: X");
 });
 it("reads recorded state and dialogue events and ignores the rest",()=>{
  const state={...(RUN.state as Record<string,unknown>),type:"state",v:1,run:"r",seq:1,t:"x",turn:1} as unknown as RunEvent;
  expect(gymEvent(state)).toMatchObject({type:"state",map_id:[11,3]});
  expect(gymEvent({type:"dialogue_auto_advance",pages:[{map_id:[11,3],text:"a",battle_message_id:2},{map_id:[11,3],text:"b"}]} as unknown as RunEvent)).toEqual({type:"dialogue_auto_advance",pages:[{map_id:[11,3],text:"a",battle_message_id:2},{map_id:[11,3],text:"b"}]});
  expect(gymEvent({type:"turn_start"} as unknown as RunEvent)).toBeNull();
 });
});

describe("gym-readiness-readout-v1 wiring",()=>{
 const tool=(name:string,state:unknown):AgentTool=>({name,label:name,description:"",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"Location: RUSTBORO CITY GYM\nPosition: 5,19"}],details:{state}} as AgentToolResult<unknown>)});
 const recorder=()=>{const subs:((e:RunEvent)=>void)[]=[];return {subscribe:(f:(e:RunEvent)=>void)=>{subs.push(f);},emit:(e:RunEvent)=>{for(const f of subs)f(e);}};};
 it("ON annotates observe, press and navigate_to results; OFF returns the tools unchanged",async()=>{
  const on={...ALL_ON,[ID]:true} as FeatureSet,off={...ALL_ON,[ID]:false} as FeatureSet;
  const r=recorder();
  const tools=withGymReadiness([tool("observe",BODY),tool("press",BODY),tool("navigate_to",BODY),tool("battle_action",BODY)],on,r);
  for(const e of RUN.events)r.emit((e.type==="state"?{...e,started:true,battle:{battlers:e.battlers}}:e) as unknown as RunEvent);
  const texts=await Promise.all(tools.map(async t=>((await t.execute("id",{})).content[0] as {text:string}).text));
  expect(texts.slice(0,3).every(t=>t.includes("Gym: RUSTBORO CITY GYM · GYM LEADER ROXANNE"))).toBe(true);
  expect(texts[3]).toBe("Location: RUSTBORO CITY GYM\nPosition: 5,19");
  const plain=[tool("observe",BODY)];
  expect(withGymReadiness(plain,off,recorder())).toEqual(plain);
  const [noState]=withGymReadiness([tool("observe",undefined)],on,recorder());
  if(noState===undefined)throw new Error("tool");
  expect(((await noState.execute("id",{})).content[0] as {text:string}).text).toBe("Location: RUSTBORO CITY GYM\nPosition: 5,19");
 });
 it("the production factory honors the switch",async()=>{
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const reader={read:()=>Promise.resolve(STATE)};
  const off=normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0]);
  const build=(features:FeatureSet)=>{const [observe]=playGameTools([tool("observe",BODY)],features,reader,recorder);if(observe===undefined)throw new Error("observe");return async()=>((await observe.execute("o",{})).content[0] as {text:string}).text;};
  const on=build({...off,[ID]:true}),plain=build(off);
  for(const e of RUN.events)for(const f of subs)f((e.type==="state"?{...e,started:true,battle:{battlers:e.battlers}}:e) as unknown as RunEvent);
  expect(await on()).toContain("ROXANNE's POKéMON seen in battle this run: GEODUDE Lv12 ×2");
  expect(await plain()).toBe("Location: RUSTBORO CITY GYM\nPosition: 5,19");
 });
 it("is registered as a bundle-only agent switch, off by default, needing nothing",()=>{
  expect(SWITCHABLE_FEATURES.at(-35)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({needs:null});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(FEATURES.some(f=>f.id===ID)).toBe(true);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
 });
});
