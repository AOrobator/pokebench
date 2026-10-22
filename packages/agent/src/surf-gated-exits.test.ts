import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {FEATURES,SERVER_FEATURES,featureInfo,featuresOf,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {SupervisorBriefing,type Stall} from "./loop-supervisor.js";
import {loopSupervisor,playGameTools} from "./play-wiring.js";
import {UNTAKEN_HEADER,UntakenExits} from "./untaken-exits.js";
import {surfBlock} from "./surf-gate.js";
import {edgeBearings} from "./connection-edges.js";
import type {GameStateSnapshot} from "./game-state.js";
import {checkEvent,type RunEvent} from "./events.js";
import type {LoopKind} from "./loop-detection.js";
import {IN_GAME} from "../test-support/events.js";

const ID="surf-gated-exits-v1";
// Run 2026-10-16T12-42-29_qwen36-gpu0_4caa (bundle arm), seq 0-6219: native_action, assistant, button_press, battle_choice
// and auto-advance events dropped; state events trimmed by the test author (no raw RAM, local map, navigation grid,
// resources, running or game stats). Each overworld state gained the surf_gate the server's surf_gate.py reads from that
// state's own raw-RAM archive (env/tests/env/test_surf_gate.py pins two of them). Tool results keep their whole text.
function recorded():RunEvent[]{
 const path=fileURLToPath(new URL("./fixtures/surf-gate-4caa.jsonl.gz",import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
}
const EVENTS=recorded();
const start=EVENTS.find(e=>e.type==="run_start");
if(start?.type!=="run_start")throw new Error("fixture has no run_start");
const RECORDED:FeatureSet={...featuresOf(start.harness_features),[ID]:false};
type State=Extract<RunEvent,{type:"state";started:boolean}>;
const exitLine=(text:string)=>text.split("\n").find(l=>l.startsWith(`${UNTAKEN_HEADER}:`));
const RECORDED_LINE="Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106); EAST edge -> ROUTE110 (map 0/25)";
const WALKED_ALL="Exits here you have not taken: none (you have taken every exit you can walk to on this map this run)";

// The untaken-exits line each recorded result showed, recomputed from the result as the tool returned it (the recorded
// text minus the line the wrapper added).
function annotated(features:FeatureSet):Map<number,{recorded:string;text:string}> {
 const exits=new UntakenExits(features);const states=new Map<number,State>();const out=new Map<number,{recorded:string;text:string}>();
 for(const e of EVENTS){
  exits.observe(e);
  if(e.type==="state"&&"started"in e)states.set(e.seq,e);
  if(e.type==="tool_result"&&e.state_seq!==undefined&&!e.is_error){
   const state=states.get(e.state_seq);
   const bare=e.text.split("\n").filter(l=>!l.startsWith(`${UNTAKEN_HEADER}:`)).join("\n");
   if(state!==undefined)out.set(e.seq,{recorded:e.text,text:exits.annotate(bare,state)});
  }
 }
 return out;
}

describe("surf-gated-exits-v1 on run 4caa: ROUTE103 at T198-T248",()=>{
 const off=annotated(RECORDED),on=annotated({...RECORDED,[ID]:true});
 it("OFF reproduces every recorded readout byte for byte, the 42 ROUTE103 lures included",()=>{
  let lures=0;
  for(const [seq,{recorded,text}] of off){expect(text,String(seq)).toBe(recorded);if(exitLine(text)===RECORDED_LINE)lures++;}
  expect(lures).toBe(42);
  expect(exitLine(off.get(4770)?.text??"")).toBe(RECORDED_LINE);
 });
 it("ON (no Balance Badge, TORCHIC knows no SURF) drops ALTERING CAVE and the EAST edge: every exit left was walked",()=>{
  expect(exitLine(on.get(4770)?.text??"")).toBe(WALKED_ALL);
  for(const [seq,{recorded,text}] of on){
   if(exitLine(recorded)!==RECORDED_LINE)continue;
   expect(exitLine(text),String(seq)).toBe(WALKED_ALL);
  }
 });
 it("ON changes no line but the exits line, and no readout off ROUTE103",()=>{
  for(const [seq,{recorded,text}] of on){
   const keep=(t:string)=>t.split("\n").filter(l=>!l.startsWith(`${UNTAKEN_HEADER}:`)).join("\n");
   expect(keep(text),String(seq)).toBe(keep(recorded));
   if(!recorded.includes("Location: ROUTE103"))expect(text,String(seq)).toBe(recorded);
  }
 });
});

// The stall each recorded loop_guard supervisor event briefed, as the run's StallBriefing computed it.
const STALLS:Readonly<Record<number,Stall>>={6219:{kind:"milestone_drought",minutes:5}};
function replay(features:FeatureSet):Map<number,{recorded:string;text:string}>{
 const briefing=new SupervisorBriefing(features);const out=new Map<number,{recorded:string;text:string}>();
 for(const e of EVENTS){
  if(e.type==="loop_guard"){
   if(e.phase!=="supervisor")continue;
   const stall=STALLS[e.seq];
   out.set(e.seq,{recorded:e.message,text:stall===undefined?briefing.text(e.kind as LoopKind,e.calls):briefing.stallText(stall,e.calls)});
   continue;
  }
  briefing.observe(e);
 }
 return out;
}
const line=(text:string,head:string):string=>text.split("\n").find(l=>l.startsWith(head))??"";
const EXITS="- Exits to maps you have not entered since your last story progress";
const WAYS="- Ways off this map across its edge (the game's map connections)";

describe("surf-gated-exits-v1 on run 4caa: the recorded supervisor briefings at seq 5271 (T219) and 6219 (T248)",()=>{
 it("OFF reproduces both recorded messages byte for byte",()=>{
  const off=replay(RECORDED);
  expect([...off.keys()]).toEqual([5271,6219]);
  for(const {recorded,text} of off.values())expect(text).toBe(recorded);
  expect(line(off.get(6219)?.text??"",EXITS)).toBe(`${EXITS}: ROUTE103 (map 0/18): Warp to ALTERING CAVE (map 24/106) at 45,6; SOUTH edge -> OLDALE TOWN (map 0/10); EAST edge -> ROUTE110 (map 0/25)`);
 });
 it("ON drops the cave and the EAST edge from the exits and edge lines and changes nothing else",()=>{
  const on=replay({...RECORDED,[ID]:true});
  const ways=`${WAYS}: SOUTH -> OLDALE TOWN (map 0/10): stand on any tile from (8,21) to (11,21) and press DOWN`;
  for(const [seq,{recorded,text}] of on){
   expect(line(text,WAYS),String(seq)).toBe(ways);
   const changed=recorded.split("\n").map((l,i)=>[l,text.split("\n")[i]]).filter(([a,b])=>a!==b);
   const expected:[string,string][]=[[line(recorded,WAYS),ways]];
   if(seq===6219)expected.unshift([line(recorded,EXITS),`${EXITS}: ROUTE103 (map 0/18): SOUTH edge -> OLDALE TOWN (map 0/10)`]);
   expect(changed,String(seq)).toEqual(expected);
  }
 });
});

const warp=(x:number,y:number,destination:[number,number,number])=>({kind:"warp",x,y,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination,name:`Warp to map ${String(destination[0])}/${String(destination[1])}`});
type Gate=NonNullable<GameStateSnapshot["surf_gate"]>;
const GATED:Gate={can_surf:false,balance_badge:false,party_surf:false,surfing:false,warps:[{x:45,y:6}],connections:["EAST"]};
const SOUTH={direction:"SOUTH" as const,offset:0,destination:[0,10] as [number,number],destination_name:"OLDALE TOWN",edges:[{x:8,y:21}]};
const EAST={direction:"EAST" as const,offset:-60,destination:[0,25] as [number,number],destination_name:"ROUTE110",edges:[{x:79,y:7}]};
const ROUTE={...IN_GAME,started:true,screen:"overworld",location:"ROUTE103",map_id:[0,18],position:{x:10,y:21},facing:"up",
 interaction_targets:[warp(45,6,[24,106,0]),warp(3,3,[2,2,0])],
 topology:{width:80,height:22,connections:[SOUTH,EAST]}} satisfies GameStateSnapshot;

// One recorded state and the observe result that showed it.
const shown=(s:GameStateSnapshot):RunEvent[]=>[
 checkEvent({v:1,run:"s",t:"2026-10-16T13:00:00.000-04:00",turn:1,seq:1,type:"state",...s}),
 checkEvent({v:1,run:"s",t:"2026-10-16T13:00:00.000-04:00",turn:1,seq:2,type:"tool_result",id:"c1",name:"observe",is_error:false,duration_ms:1,text:"Location: ROUTE103",frames:[],state_seq:1}),
];

describe("surf-gated-exits-v1 rules",()=>{
 it("blocks a listed water-only exit only while Surf cannot be used, and only with the switch on",()=>{
  const block=surfBlock({...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:true},{...ROUTE,surf_gate:GATED});
  expect([block.warp(45,6),block.warp(3,3),block.connection("EAST"),block.connection("SOUTH")]).toEqual([true,false,true,false]);
  for(const gate of [{...GATED,can_surf:true},{...GATED,can_surf:null},{...GATED,surfing:true,can_surf:true}]){
   const open=surfBlock({...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:true},{...ROUTE,surf_gate:gate});
   expect([open.warp(45,6),open.connection("EAST")]).toEqual([false,false]);
  }
  const off=surfBlock({...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:false},{...ROUTE,surf_gate:GATED});
  expect([off.warp(45,6),off.connection("EAST")]).toEqual([false,false]);
  const absent=surfBlock({...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:true},ROUTE);
  expect([absent.warp(45,6),absent.connection("EAST")]).toEqual([false,false]);
 });
 it("once Surf can be used (Balance Badge and a party SURF), the untaken-exits line lists them again",()=>{
  const features={...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:true};
  const usable={...ROUTE,surf_gate:{...GATED,can_surf:true,balance_badge:true,party_surf:true}};
  const text="- SOUTH -> OLDALE TOWN (map 0/10)\n- EAST -> ROUTE110 (map 0/25)\nWarp to ALTERING CAVE (map 24/106)";
  expect(new UntakenExits(features).line(usable,text)).toBe("Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106); (3,3) -> map 2/2; SOUTH edge -> OLDALE TOWN (map 0/10); EAST edge -> ROUTE110 (map 0/25)");
  expect(new UntakenExits(features).line({...ROUTE,surf_gate:GATED},text)).toBe("Exits here you have not taken: (3,3) -> map 2/2; SOUTH edge -> OLDALE TOWN (map 0/10)");
 });
 it("says how many it left out only when no other exit is left: none to walk to at all, or every walkable one taken",()=>{
  const features={...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:true,"surf-gated-exits-v2":false};
  const island={...ROUTE,interaction_targets:[warp(45,6,[24,106,0])],topology:{...ROUTE.topology,connections:[EAST]},surf_gate:GATED} satisfies GameStateSnapshot;
  expect(new UntakenExits(features).line(island,"")).toBe("Exits here you have not taken: none you can walk to (every exit listed on this map is across water, and you cannot use Surf yet)");
  expect(new UntakenExits({...features,[ID]:false}).line(island,"")).toBe("Exits here you have not taken: (45,6) -> map 24/106; EAST edge -> map 0/25");
  const nothing={...island,interaction_targets:[],topology:{...ROUTE.topology,connections:[]}} satisfies GameStateSnapshot;
  expect(new UntakenExits(features).line(nothing,"")).toBe("Exits here you have not taken: none (no exits are listed on this map)");
 });
 it("the supervisor's untried list drops a water-only warp nobody tried; edge bearings drop the water-only edge",()=>{
  const features={...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:true,"briefing-exits-v1":true};
  const gated={...ROUTE,surf_gate:GATED};
  const listed=(f:FeatureSet)=>{const b=new SupervisorBriefing(f);for(const e of shown(gated))b.observe(e);return line(b.text("cycle",9),"- Listed here that you have not tried yet");};
  expect(listed(features)).toBe("- Listed here that you have not tried yet: Warp to map 2/2 at 3,3 (movement)");
  expect(listed({...features,[ID]:false})).toBe("- Listed here that you have not tried yet: Warp to map 24/106 at 45,6 (movement); Warp to map 2/2 at 3,3 (movement)");
  expect(listed({...features,"briefing-exits-v1":false})).toBe("- Listed here that you have not tried yet: Warp to map 2/2 at 3,3 (movement)");
  expect(edgeBearings(gated.topology)).toContain("EAST -> ROUTE110");
 });
});

describe("surf-gated-exits-v1 production wiring",()=>{
 const BASE:FeatureSet={...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,"battle-move-tool-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,"people-ledger-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"dialogue-auto-advance-v1":false,"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false,"next-milestone-hint-v1":false};
 const snapshot={...ROUTE,surf_gate:GATED} satisfies GameStateSnapshot;
 const readout="Screen: overworld\nLocation: ROUTE103\nPosition: X=10, Y=21, facing up\nMoney: 1";
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state:snapshot}})});
 const recorder=()=>{const observers:((e:RunEvent)=>void)[]=[];return {observers,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),textOnlySupervisor:()=>undefined,subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);}};};
 const text=async(tools:readonly AgentTool[])=>{const r=await tools.find(t=>t.name==="observe")?.execute("id",{});const part=r?.content[0];return part?.type==="text"?part.text:"";};
 it("playGameTools passes the switch to the untaken-exits line",async()=>{
  expect(await text(playGameTools([tool("observe")],{...BASE,[ID]:true},{read:()=>Promise.resolve(snapshot)},recorder()))).toContain("Exits here you have not taken: (3,3) -> map 2/2; SOUTH edge -> map 0/10\n");
  expect(await text(playGameTools([tool("observe")],{...BASE,[ID]:false},{read:()=>Promise.resolve(snapshot)},recorder()))).toContain("Exits here you have not taken: (45,6) -> map 24/106; (3,3) -> map 2/2; SOUTH edge -> map 0/10; EAST edge -> map 0/25\n");
 });
 it("loopSupervisor passes the switch to the briefing's edge line",()=>{
  const ways=(features:FeatureSet)=>{
   const r=recorder();const loop=loopSupervisor(features,r);
   for(const e of shown(snapshot))for(const o of r.observers)o(e);
   return line(loop?.("cycle",9)??"",WAYS);
  };
  expect(ways({...BASE,[ID]:true})).toBe(`${WAYS}: SOUTH -> OLDALE TOWN (map 0/10): stand on (8,21) and press DOWN`);
  expect(ways({...BASE,[ID]:false})).toBe(`${WAYS}: SOUTH -> OLDALE TOWN (map 0/10): stand on (8,21) and press DOWN; EAST -> ROUTE110 (map 0/25): stand on (79,7) and press RIGHT`);
 });
 it("a state event carrying surf_gate is schema-valid; a malformed one is not",()=>{
  expect(()=>checkEvent({v:1,run:"s",t:"2026-10-16T13:00:00.000-04:00",turn:1,seq:1,type:"state",...snapshot})).not.toThrow();
  expect(()=>checkEvent({v:1,run:"s",t:"2026-10-16T13:00:00.000-04:00",turn:1,seq:1,type:"state",...snapshot,surf_gate:{...GATED,connections:["DIVE"]}})).toThrow();
  expect(()=>checkEvent({v:1,run:"s",t:"2026-10-16T13:00:00.000-04:00",turn:1,seq:1,type:"state",...snapshot,surf_gate:{...GATED,extra:1}})).toThrow();
 });
});

describe("surf-gated-exits-v1 registry and presets",()=>{
 it("is a default-off server observation switch recorded last, described as bundle arm only",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true,title:"SURF-GATED EXITS"});
  const description=featureInfo(ID).description;
  expect(description).toContain(" Off: ");
  expect(description).toContain("bundle arm only");
  expect(description).not.toContain("both arms");
  const ids=FEATURES.filter(f=>f.switchable).map(f=>f.id);
  expect(ids.at(-121)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-48)).toBe(ID);
  expect(SERVER_FEATURES).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,"semantic-navigation-v2":false,"battle-decision-ready-v1":false,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 });
 it("defaults off in presets that omit it and in legacy flag presets",()=>{
  const {[ID]:omitted,...rest}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(rest as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 });
});
