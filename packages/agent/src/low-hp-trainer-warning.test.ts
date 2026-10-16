// low-hp-trainer-warning-v1: a one-time SUPERVISOR paragraph on a game-tool result when the lead Pokémon is
// below half HP and the Route 103 rival, not yet beaten, is on the map. Round 2 bundle run
// 2026-10-16T04-51-03_qwen36-gpu0_54a7 saw MAY at (10,3) with TORCHIC at 3/21 HP (T363), talked to her (T369),
// fainted (T371) and blacked out to BRENDANS HOUSE 2F. test-support/trainer-heal-54a7.json holds those states.
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {eventProblem} from "./events.js";
import {LowHpTrainerWarning,lowHpTrainerWarning,warningText,withLowHpTrainerWarning,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {playGameTools} from "./play-wiring.js";
import {playSystemPrompt,playTools} from "./play-config.js";

const ID="low-hp-trainer-warning-v1";
const PREVIOUS="trainer-heal-guidance-v1";
const RUN54A7=JSON.parse(readFileSync(new URL("../test-support/trainer-heal-54a7.json",import.meta.url),"utf8")) as {harness_features:string[];states:{turn:number;state:unknown}[]};
const BUNDLE:FeatureSet=featuresOf(RUN54A7.harness_features);
const at=(turn:number):GameStateSnapshot=>parseGameState(RUN54A7.states.find(s=>s.turn===turn)?.state);
const T362=at(362),T363=at(363),T369=at(369),T371=at(371);
const healed=(s:GameStateSnapshot,hp:number):GameStateSnapshot=>({...s,party:s.party.map((m,i)=>i===0?{...m,hp}:m)});
const T363_TEXT="SUPERVISOR: Your TORCHIC has 3/21 HP (below half), and your rival MAY is on this map at (10,3). Talking to her starts a trainer battle you cannot run from. If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home. Heal before you talk to her: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.";

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
// A game tool whose results replay the given states in order.
function replay(name:string,states:GameStateSnapshot[]):AgentTool {
 let i=0;
 return {name,label:name,description:name,parameters:{type:"object",properties:{}} as AgentTool["parameters"],
  execute:()=>{const state=states[i++];return Promise.resolve({content:[{type:"text",text:`${name} ok`}],details:state===undefined?{}:{state}});}};
}
function recorder():WarningRecorder&{calls:Parameters<WarningRecorder["lowHpTrainerWarning"]>[]}{
 const calls:Parameters<WarningRecorder["lowHpTrainerWarning"]>[]=[];
 return {calls,lowHpTrainerWarning:(...args)=>{calls.push(args);}};
}
const run=async(tool:AgentTool,times:number):Promise<string[]>=>{const out:string[]=[];for(let i=0;i<times;i++)out.push(textOf(await tool.execute(`c${String(i)}`,{})));return out;};

describe("registry",()=>{
 it("is a default-off agent-side guard recorded right after trainer-heal-guidance-v1",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"LOW-HP TRAINER WARNING"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(T363_TEXT);
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf(PREVIOUS)+1);
  const recorded=playHarnessFeatures(ALL_ON,null);
  expect(recorded.indexOf(ID)).toBe(recorded.indexOf(PREVIOUS)+1);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true})).toEqual([]);
 });
 it("defaults OFF for presets that omit it and for legacy flag presets; the prompt and tool list never change",()=>{
  const without=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(normalizeFeatures({...without,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[ID]).toBe(false);
  expect(playSystemPrompt({...BUNDLE,[ID]:true},null)).toBe(playSystemPrompt(BUNDLE,null));
  expect(playTools({...BUNDLE,[ID]:true})).toEqual(playTools(BUNDLE));
 });
});

describe("condition, from the state alone",()=>{
 it("fires on run 54a7's T363 state: TORCHIC 3/21, MAY loaded at (10,3) on ROUTE 103, rival battle not won",()=>{
  expect(lowHpTrainerWarning(T363)).toEqual({species:"TORCHIC",hp:3,max_hp:21,rival:"MAY",x:10,y:3,map_id:[0,18],money:3000,items:[]});
  expect(warningText(lowHpTrainerWarning(T363)!)).toBe(T363_TEXT);
 });
 it("does not fire before the rival is loaded (T362), in battle (T369), or at home after the blackout (T371)",()=>{
  expect(T362.world_context?.objects).toEqual([]);
  expect(lowHpTrainerWarning(T362)).toBeNull();
  expect(T369.in_battle).toBe(true);
  expect(lowHpTrainerWarning(T369)).toBeNull();
  expect(lowHpTrainerWarning(T371)).toBeNull();
 });
 it("needs the lead below half HP: 10/21 fires, 11/21 (not below half) does not",()=>{
  expect(lowHpTrainerWarning(healed(T363,10))?.hp).toBe(10);
  expect(lowHpTrainerWarning(healed(T363,11))).toBeNull();
 });
 it("skips a fainted first slot and eggs: the lead is the first Pokémon able to battle",()=>{
  const lead=T363.party[0]!;
  const fainted={...T363,party:[{...lead,species:"WURMPLE",hp:0},{...lead,species:"EGG",is_egg:true,hp:1},lead]};
  expect(lowHpTrainerWarning(fainted)?.species).toBe("TORCHIC");
  expect(lowHpTrainerWarning({...T363,party:[{...lead,hp:0}]})).toBeNull();
 });
 it("is silent once the rival battle is won, when story state is unreadable, off ROUTE 103, or for a tutorial party",()=>{
  expect(lowHpTrainerWarning({...T363,story:{...T363.story!,rival_battle_won:true}})).toBeNull();
  expect(lowHpTrainerWarning({...T363,story:{...T363.story!,rival_battle_won:null}})).toBeNull();
  expect(lowHpTrainerWarning({...T363,story:null})).toBeNull();
  expect(lowHpTrainerWarning({...T363,map_id:[0,10],location:"OLDALE TOWN"})).toBeNull();
  expect(lowHpTrainerWarning({...T363,party_owner:"tutorial"})).toBeNull();
  expect(lowHpTrainerWarning({...T363,screen:"battle"})).toBeNull();
  expect(lowHpTrainerWarning({...T363,started:false})).toBeNull();
 });
 it("names BRENDAN for a female player, with him",()=>{
  const objects=[{...T363.world_context!.objects[0]!,sprite_kind:"RIVAL_BRENDAN_NORMAL"}];
  const warning=lowHpTrainerWarning({...T363,world_context:{...T363.world_context!,objects}})!;
  expect(warning.rival).toBe("BRENDAN");
  expect(warningText(warning)).toContain("your rival BRENDAN is on this map at (10,3). Talking to him starts");
  expect(warningText(warning)).toContain("Heal before you talk to him:");
 });
 it("names healing items the bag holds, with quantities, and leaves the money out when it is unreadable",()=>{
  const bag=[{slot:0,item_id:13,quantity:2,pocket:"items",name:"POTION"},{slot:1,item_id:4,quantity:5,pocket:"balls",name:"POKé BALL"},{slot:0,item_id:139,quantity:1,pocket:"berries",name:"ORAN BERRY"}];
  const warning=lowHpTrainerWarning({...T363,money:null,resources:{...T363.resources!,bag}})!;
  expect(warning.items).toEqual([{name:"POTION",quantity:2},{name:"ORAN BERRY",quantity:1}]);
  const text=warningText(warning);
  expect(text.endsWith(" Your BAG has POTION ×2 and ORAN BERRY ×1; using one on TORCHIC restores HP.")).toBe(true);
  expect(text).toContain("you lose half your money and wake up");
 });
});

describe("delivery on game-tool results",()=>{
 it("OFF returns the tools untouched",()=>{
  const tools=[replay("press",[T363])];
  expect(withLowHpTrainerWarning(tools,{...BUNDLE,[ID]:false},recorder())).toBe(tools);
 });
 it("ON appends the paragraph once, on the first result that meets the condition, and records it",async()=>{
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",[T362,T363,T363,T369,T363])],{...BUNDLE,[ID]:true},rec);
  const texts=await run(press!,5);
  expect(texts).toEqual(["press ok",`press ok\n${T363_TEXT}`,"press ok","press ok","press ok"]);
  expect(rec.calls).toEqual([["press",lowHpTrainerWarning(T363),T363_TEXT]]);
 });
 it("re-arms when the lead is back to half HP or more, or the player leaves the map",async()=>{
  const rec=recorder();
  const off103={...T363,map_id:[0,10] as [number,number],location:"OLDALE TOWN"};
  const [nav]=withLowHpTrainerWarning([replay("navigate_to",[T363,healed(T363,11),T363,off103,T363,T363])],{...BUNDLE,[ID]:true},rec);
  const texts=await run(nav!,6);
  expect(texts.map(t=>t.includes("SUPERVISOR:"))).toEqual([true,false,true,false,true,false]);
  expect(rec.calls).toHaveLength(3);
 });
 it("shares one arm across every game tool, and leaves results without a state alone",async()=>{
  const rec=recorder();
  const tools=withLowHpTrainerWarning([replay("observe",[T363]),replay("press",[T363]),replay("recall_dialogue",[])],{...BUNDLE,[ID]:true},rec);
  const [observe,press,recall]=tools;
  expect(textOf(await observe!.execute("a",{}))).toContain("SUPERVISOR:");
  expect(textOf(await press!.execute("b",{}))).toBe("press ok");
  expect(textOf(await recall!.execute("c",{}))).toBe("recall_dialogue ok");
  expect(rec.calls).toHaveLength(1);
 });
 it("ignores a result whose state does not parse, without disarming",async()=>{
  const watch=new LowHpTrainerWarning();
  expect(watch.observe(undefined)).toBeNull();
  expect(watch.observe(T363)?.rival).toBe("MAY");
  expect(watch.observe(T363)).toBeNull();
 });
 it("records an event the run log accepts",()=>{
  const warning=lowHpTrainerWarning(T363)!;
  const event={v:1,run:"r",seq:1,t:"2026-10-16T05:27:04.000-04:00",type:"low_hp_trainer_warning",turn:363,tool:"navigate_to",...warning,text:T363_TEXT};
  expect(eventProblem(event)).toBeNull();
  expect(eventProblem({...event,hp:-1})).not.toBeNull();
 });
 it("the production tool factory honors the switch (playGameTools)",async()=>{
  const rec:Parameters<typeof playGameTools>[3]={...recorder(),recordState:()=>({seq:0,turn:0}),recordDialogueAutoAdvance:()=>({seq:0,turn:0}),subscribe:()=>{}};
  const base=():AgentTool[]=>[replay("observe",[T363])];
  const state={read:()=>Promise.resolve(T363)};
  const on=playGameTools(base(),{...BUNDLE,[ID]:true},state,rec);
  const off=playGameTools(base(),{...BUNDLE,[ID]:false},state,rec);
  const find=(tools:AgentTool[])=>tools.find(t=>t.name==="observe")!;
  expect(textOf(await find(on).execute("a",{}))).toContain(T363_TEXT);
  expect(textOf(await find(off).execute("a",{}))).not.toContain("SUPERVISOR:");
 });
});
