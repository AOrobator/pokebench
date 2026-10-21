import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv,type FeatureSet,type SwitchableFeature} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {UntakenExits} from "./untaken-exits.js";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {playGameTools} from "./play-wiring.js";
import type {RunEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";

// Readout bugs from the 2026-10-17 top-50 run analysis (runs/reviews/2026-10-17-run-analysis-top50/ram-audit.md), one
// server switch each, plus surf-gated-exits-v2 (operator decision, the operator 2026-10-17 1:59 PM). The server side and the
// recorded RAM are tested in env/tests/env/test_readout_truth_fixes.py and test_surf_gate.py.
const NEW=["tutorial-party-owner-v1","mid-frame-readout-v1","unset-dynamic-warp-v1","status-names-v1","surf-gated-exits-v2"] as const;
// The switch each one is a no-op without (review round 1): mid-frame needs the skipped save reads, the dynamic-warp text
// exists only with named warps, and the Party line's STATUS part only with the expanded information.
const NEEDS:Readonly<Record<(typeof NEW)[number],string|null>>={"tutorial-party-owner-v1":null,"mid-frame-readout-v1":"transition-coherence-v1","unset-dynamic-warp-v1":"named-warp-destinations-v1","status-names-v1":"expanded-menu-battle-information-v1","surf-gated-exits-v2":"surf-gated-exits-v1"};
const id=(name:string):SwitchableFeature=>{const found=SWITCHABLE_FEATURES.find(f=>f===name);if(found===undefined)throw new Error(`${name} is not registered`);return found;};

describe("registry and presets",()=>{
 it("appends the five switches, in order, at the end of every registry list",()=>{
  expect(SWITCHABLE_FEATURES.slice(-88,-83)).toEqual([...NEW]);
  expect(FEATURES.filter(f=>f.switchable).map(f=>f.id).slice(-88,-83)).toEqual([...NEW]);
  expect(playHarnessFeatures(ALL_ON,null).slice(-32,-27)).toEqual([...NEW]);
  expect(SERVER_FEATURES.slice(-26,-21)).toEqual([...NEW]);
 });
 it.each(NEW)("%s is a server observation switch, bundle arm only, whose description says what OFF does",(name)=>{
  const info=featureInfo(id(name));
  expect(info).toMatchObject({group:"observation",switchable:true,needs:NEEDS[name]});
  expect(info.description).toContain(" Off: ");
  expect(info.description).toContain("bundle arm only");
  expect(serverFeatureEnv({...ALL_ON,"battle-decision-ready-v1":false,[id(name)]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(name);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(name);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[id(name)]:false},null)).not.toContain(name);
 });
 it.each(NEW)("%s defaults off in presets that omit it and in legacy flag presets",(name)=>{
  const {[id(name)]:omitted,...rest}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(rest as Parameters<typeof normalizeFeatures>[0])[id(name)]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id(name)]).toBe(false);
 });
 it.each(NEW.filter(n=>NEEDS[n]!==null))("%s reports its unmet dependency, and none once the parent is on",(name)=>{
  const parent=NEEDS[name];if(parent===null)throw new Error(name);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,[id(parent)]:false})).toContain(`${name} needs ${parent}`);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,[id(parent)]:false,[id(name)]:false}).filter(p=>p.startsWith(`${name} `))).toEqual([]);
  expect(dependencyProblems(ALL_ON)).toEqual([]);
 });
 it("surf-gated-exits-v2 needs surf-gated-exits-v1",()=>{
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"surf-gated-exits-v1":false})).toContain("surf-gated-exits-v2 needs surf-gated-exits-v1");
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"surf-gated-exits-v1":false,[id("surf-gated-exits-v2")]:false})).toEqual([]);
 });
});

describe("tutorial-party-owner-v1: the agent keeps a state whose owner the server could not establish",()=>{
 const base={...IN_GAME,started:true,screen:"overworld",location:"PETALBURG CITY",map_id:[0,0],position:{x:15,y:9},facing:"up"} satisfies GameStateSnapshot;
 const ownership={owner:null,source:"party_decode_unavailable",original_identities:["b7441706:761f35ea"],rental_personalities:[],diagnostic:null,raw_hex:null};
 it("OFF: the server's \"unknown\" owner is rejected as today (dc5a T687-885 got malformed payloads)",()=>{
  expect(()=>parseGameState({...base,party_owner:"unknown",party_ownership:ownership})).toThrow("malformed /pokebench/state at /party_owner");
 });
 it("ON: the server leaves party_owner out; the state parses and keeps party_ownership's reason",()=>{
  const state=parseGameState({...base,party_ownership:ownership});
  expect(state.party_owner).toBeUndefined();
  expect(state.party_ownership?.source).toBe("party_decode_unavailable");
 });
});

describe("surf-gated-exits-v2: the untaken-exits line names no badge and no move",()=>{
 const warp={kind:"warp",x:45,y:6,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[24,106,0] as [number,number,number],name:"Warp to map 24/106"};
 const EAST={direction:"EAST" as const,offset:-60,destination:[0,25] as [number,number],destination_name:"ROUTE110",edges:[{x:79,y:7}]};
 const island={...IN_GAME,started:true,screen:"overworld",location:"ROUTE103",map_id:[0,18],position:{x:10,y:21},facing:"up",
  interaction_targets:[warp],topology:{width:80,height:22,connections:[EAST]},
  surf_gate:{can_surf:false,balance_badge:false,party_surf:false,surfing:false,warps:[{x:45,y:6}],connections:["EAST"]}} satisfies GameStateSnapshot;
 const v1=():FeatureSet=>({...ALL_ON,"battle-decision-ready-v1":false,"surf-gated-exits-v1":true,[id("surf-gated-exits-v2")]:false});
 it("OFF keeps the v1 line byte for byte",()=>{
  expect(new UntakenExits(v1()).line(island,"")).toBe("Exits here you have not taken: none you can walk to (every exit listed on this map is across water, and you cannot use Surf yet)");
 });
 it("ON says the water cannot be crossed yet",()=>{
  const line=new UntakenExits({...v1(),[id("surf-gated-exits-v2")]:true}).line(island,"");
  expect(line).toBe("Exits here you have not taken: none you can walk to (every exit listed on this map is across water you cannot cross yet)");
  expect(line).not.toMatch(/surf|badge/i);
 });
 it("ON without v1 changes nothing",()=>{
  const plain={...ALL_ON,"battle-decision-ready-v1":false,"surf-gated-exits-v1":false,[id("surf-gated-exits-v2")]:true};
  expect(new UntakenExits(plain).line(island,"")).toBe(new UntakenExits({...plain,[id("surf-gated-exits-v2")]:false}).line(island,""));
 });
});

describe("surf-gated-exits-v2 production wiring: playGameTools adds the untaken-exits line",()=>{
 const BASE:FeatureSet={...ALL_ON,"battle-decision-ready-v1":false,"instruction-ledger-v2":false,"people-ledger-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"dialogue-auto-advance-v1":false,"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false,"next-milestone-hint-v1":false,"cited-destination-v1":false,"harness-trust-v1":false,"harness-trust-v2":false,"battle-move-tool-v1":false,"surf-gated-exits-v1":true};
 const warp={kind:"warp",x:45,y:6,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[24,106,0] as [number,number,number],name:"Warp to map 24/106"};
 const EAST={direction:"EAST" as const,offset:-60,destination:[0,25] as [number,number],destination_name:"ROUTE110",edges:[{x:79,y:7}]};
 // Every exit listed on this map is across water and Surf cannot be used.
 const snapshot={...IN_GAME,started:true,screen:"overworld",location:"ROUTE103",map_id:[0,18],position:{x:10,y:21},facing:"up",
  interaction_targets:[warp],topology:{width:80,height:22,connections:[EAST]},
  surf_gate:{can_surf:false,balance_badge:false,party_surf:false,surfing:false,warps:[{x:45,y:6}],connections:["EAST"]}} satisfies GameStateSnapshot;
 const readout="Screen: overworld\nLocation: ROUTE103\nPosition: X=10, Y=21, facing up\nMoney: 1";
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state:snapshot}})});
 const recorder=()=>{const observers:((e:RunEvent)=>void)[]=[];return {observers,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),textOnlySupervisor:()=>undefined,subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);}};};
 const observe=async(features:FeatureSet)=>{const r=await playGameTools([tool("observe")],features,{read:()=>Promise.resolve(snapshot)},recorder()).find(t=>t.name==="observe")?.execute("id",{});const part=r?.content[0];return part?.type==="text"?part.text:"";};
 it("OFF and ON give these exact bytes, toggling only v2",async()=>{
  const head="Screen: overworld\nLocation: ROUTE103\nPosition: X=10, Y=21, facing up\n";
  expect(await observe({...BASE,[id("surf-gated-exits-v2")]:false})).toBe(`${head}Exits here you have not taken: none you can walk to (every exit listed on this map is across water, and you cannot use Surf yet)\nMoney: 1`);
  expect(await observe({...BASE,[id("surf-gated-exits-v2")]:true})).toBe(`${head}Exits here you have not taken: none you can walk to (every exit listed on this map is across water you cannot cross yet)\nMoney: 1`);
 });
});
