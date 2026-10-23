import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,semanticNavigation,serverFeatureEnv,type FeatureSet} from "./features.js";
const PENDING_BASE_ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"static-npc-template-approach-v1":false,"npc-approach-feedback-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
const ALL_ON={...PENDING_BASE_ALL_ON,"progress-aware-cycles-v1":false,"caught-dex-input-v1":false,"menu-refusal-recovery-v1":false,"pending-field-dialogue-v1":false,"trainer-sight-check-v2":false};
import type {GameStateSnapshot} from "./game-state.js";
import {NAVIGATE_FIRST_DESCRIPTION,NAVIGATE_FIRST_TOOL_LINE,SEMANTIC_MOVING_AROUND_FULL,SEMANTIC_MOVING_AROUND_LOCAL,SEMANTIC_NAVIGATE_DESCRIPTION,SEMANTIC_NAVIGATE_TOOL_LINE,SEMANTIC_TOOL_LINE} from "./navigate-first.js";
import {NAVIGATE_RULES,SEMANTIC_NAVIGATE_RULES,navigationTool} from "./navigation.js";
import {DIALOGUE_AUTO_ADVANCE_SECTION,EXPLORER_TALK_IS_CHEAP,NAVIGATE_TO_USAGE,PRESS_OR_EITHER_NAVIGATE,PRESS_OR_NAVIGATE,SEMANTIC_TALK_IS_CHEAP,SEMANTIC_TARGET_SECTION,SEMANTIC_UNTAKEN_EXITS_SECTION,SEMANTIC_USAGE,UNTAKEN_EXITS_SECTION,playSystemPrompt,playTools} from "./play-config.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {connectionArgument,listedArgument,semanticWalk,targetArgument,targetSuffix,uniqueDirection,uniqueTile} from "./semantic-targets.js";
import {withUntakenExits} from "./untaken-exits.js";

const ID="semantic-navigation-v2";
const V1="semantic-navigation-v1";
// The bundle-style prompt: every switch on except the first version.
const ON:FeatureSet={...ALL_ON,[V1]:false,[ID]:true};
const OFF:FeatureSet={...ON,[ID]:false};
const LOCAL:FeatureSet={...ON,"full-map-navigation-v1":false,"visited-terrain-navigation-v1":false};

describe("registry, presets and dependencies",()=>{
 it("is appended last, default off, a guidance switch that needs bounded navigation, applied by the game server too",()=>{
  expect(SWITCHABLE_FEATURES.at(-99)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-99)?.id).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-62)).toBe(ID);
  expect(SERVER_FEATURES.at(-31)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"bounded-navigation-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  const {[ID]:omitted,...rest}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(rest)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(serverFeatureEnv(OFF).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 });
 it("either version provides the tool, and deterministic exploration accepts either",()=>{
  expect(semanticNavigation({...ON,[V1]:false,[ID]:false})).toBe(false);
  expect(semanticNavigation({...ON,[V1]:true,[ID]:false})).toBe(true);
  expect(semanticNavigation(ON)).toBe(true);
  const exploring={...ON,"deterministic-exploration-v1":true};
  expect(dependencyProblems(exploring)).toEqual([]);
  expect(dependencyProblems({...exploring,[ID]:false,[V1]:true})).toEqual([]);
  expect(dependencyProblems({...exploring,[ID]:false})).toContain("deterministic-exploration-v1 needs semantic-navigation-v1 or semantic-navigation-v2");
  expect(featureInfo("deterministic-exploration-v1").needs).toBeNull();
  expect(playTools(ON)).toContain("navigate_to_target");
  expect(playTools({...OFF,"deterministic-exploration-v1":false})).not.toContain("navigate_to_target");
 });
});

describe("the system prompt",()=>{
 it("ON leads the tool list with navigate_to_target and sends listed targets to it everywhere navigation is mentioned",()=>{
  const prompt=playSystemPrompt(ON,null);
  expect(prompt).toContain(`${SEMANTIC_TOOL_LINE}\n${SEMANTIC_NAVIGATE_TOOL_LINE}\n- press:`);
  expect(prompt).not.toContain(NAVIGATE_FIRST_TOOL_LINE);
  expect(prompt.endsWith(SEMANTIC_MOVING_AROUND_FULL)||prompt.includes(`${SEMANTIC_MOVING_AROUND_FULL}\n\n`)).toBe(true);
  expect(prompt).toContain(SEMANTIC_TARGET_SECTION);
  expect(prompt).toContain(SEMANTIC_NAVIGATE_RULES);
  expect(prompt).not.toContain(NAVIGATE_RULES);
  expect(prompt).toContain(DIALOGUE_AUTO_ADVANCE_SECTION.replace(PRESS_OR_NAVIGATE,PRESS_OR_EITHER_NAVIGATE));
  expect(prompt).toContain(SEMANTIC_TALK_IS_CHEAP);
  expect(prompt).not.toContain(EXPLORER_TALK_IS_CHEAP);
  expect(prompt).toContain(SEMANTIC_UNTAKEN_EXITS_SECTION);
  expect(prompt).not.toContain("- navigate_to_target: choose one person");
  expect(playSystemPrompt(LOCAL,null)).toContain(SEMANTIC_MOVING_AROUND_LOCAL);
 });
 it("OFF shows none of it: the prompt is today's, with or without the first version",()=>{
  for(const base of [OFF,{...OFF,[V1]:true}]){
   const prompt=playSystemPrompt(base,null);
   for(const text of [SEMANTIC_TOOL_LINE,SEMANTIC_TARGET_SECTION,SEMANTIC_NAVIGATE_RULES,SEMANTIC_TALK_IS_CHEAP,SEMANTIC_UNTAKEN_EXITS_SECTION,PRESS_OR_EITHER_NAVIGATE,SEMANTIC_USAGE])expect(prompt).not.toContain(text);
   expect(prompt).toContain(NAVIGATE_FIRST_TOOL_LINE);
   expect(prompt).toContain(UNTAKEN_EXITS_SECTION);
  }
 });
 it("without the Moving around section, the usage rule gains one sentence",()=>{
  const plain={...ON,"navigate-first-prompt-v1":false};
  expect(playSystemPrompt(plain,null)).toContain(`${NAVIGATE_TO_USAGE} ${SEMANTIC_USAGE}`);
  expect(playSystemPrompt({...plain,[ID]:false},null)).not.toContain(SEMANTIC_USAGE);
 });
 it("names no character, place or story step",()=>{
  const added=[SEMANTIC_TOOL_LINE,SEMANTIC_NAVIGATE_TOOL_LINE,SEMANTIC_MOVING_AROUND_FULL,SEMANTIC_TARGET_SECTION,SEMANTIC_NAVIGATE_RULES,SEMANTIC_TALK_IS_CHEAP,SEMANTIC_UNTAKEN_EXITS_SECTION,SEMANTIC_USAGE,SEMANTIC_NAVIGATE_DESCRIPTION].join("\n");
  expect(added).not.toMatch(/\b(rival|birch|professor|may|brendan|mom|lab|littleroot|oldale|petalburg|rustboro|starter|gym|badge)\b|\broute ?\d/i);
 });
});

describe("tool descriptions",()=>{
 const read={read:()=>Promise.resolve({...IN_GAME,screen:"overworld",field_controls_locked:false} as GameStateSnapshot)};
 const fake=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:()=>Promise.resolve({content:[],details:{}})});
 it("navigate_to is for a plain tile only when the switch is on",()=>{
  const on=navigationTool({...read,press:()=>Promise.reject(new Error("no")),observe:()=>Promise.reject(new Error("no")),navigateFirst:true,semanticTargets:true});
  const off=navigationTool({...read,press:()=>Promise.reject(new Error("no")),observe:()=>Promise.reject(new Error("no")),navigateFirst:true});
  expect(on.description.startsWith(SEMANTIC_NAVIGATE_DESCRIPTION)).toBe(true);
  expect(on.description).toContain(SEMANTIC_NAVIGATE_RULES);expect(on.description).not.toContain(NAVIGATE_RULES);
  expect(off.description.startsWith(NAVIGATE_FIRST_DESCRIPTION)).toBe(true);
  expect(off.description).toContain(NAVIGATE_RULES);
 });
 it("navigate_to_target says how to copy a target from the readout only with v2",()=>{
  const nav=navigationTool({...read,press:()=>Promise.reject(new Error("no")),observe:()=>Promise.reject(new Error("no"))});
  const press={...fake("press"),executeChecked:()=>Promise.reject(new Error("no"))} as AgentTool;
  const v2=withSemanticNavigation([nav,press],ON,read).find(t=>t.name==="navigate_to_target");
  const v1=withSemanticNavigation([nav,press],{...OFF,[V1]:true},read).find(t=>t.name==="navigate_to_target");
  expect(v2?.description).toContain("exactly as the readout writes it after \"navigate_to_target target\"");
  expect(v1?.description.startsWith("Select a listed person")).toBe(true);
  expect(withSemanticNavigation([nav,press],OFF,read).map(t=>t.name)).toEqual(["navigate_to","press"]);
 });
});

describe("target arguments",()=>{
 it("match the tool schema and the game server's readout",()=>{
  expect(targetArgument({kind:"object",x:10,y:3,local_id:2})).toBe('{"kind":"object","local_id":2}');
  expect(targetArgument({kind:"object",x:10,y:3,local_id:null})).toBeNull();
  expect(targetArgument({kind:"warp",x:5,y:8,local_id:null})).toBe('{"kind":"warp","x":5,"y":8}');
  expect(targetArgument({kind:"background",x:7,y:4,local_id:null})).toBe('{"kind":"interaction","interaction_kind":"background","x":7,"y":4}');
  expect(connectionArgument("NORTH")).toBe('{"kind":"connection","direction":"NORTH"}');
  expect(connectionArgument("DIVE")).toBeNull();
  expect(targetSuffix(null)).toBe("");
  expect(targetSuffix('{"kind":"warp","x":1,"y":2}')).toBe(' [navigate_to_target target {"kind":"warp","x":1,"y":2}]');
  expect(semanticWalk("navigate_to_target",ON)).toBe(true);expect(semanticWalk("explore_map",ON)).toBe(true);
  expect(semanticWalk("navigate_to",ON)).toBe(false);expect(semanticWalk("navigate_to_target",OFF)).toBe(false);
 });
});

describe("results",()=>{
 const readout="Screen: overworld\nLocation: HALL\nPosition: X=1, Y=1, facing up\nMoney: 1";
 const snapshot:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",location:"HALL",map_id:[3,3],position:{x:1,y:1},facing:"up",interaction_targets:[{kind:"warp",x:1,y:0,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[4,4,0],name:"w"}],topology:{width:9,height:9,connections:[{direction:"NORTH",offset:0,destination:[5,5],destination_name:"NORTH MAP",edges:[{x:3,y:0}]}]}};
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"Semantic navigation: arrived. Selected warp at (1,0)."},{type:"text",text:readout}],details:{state:snapshot}})});
 const recorder={subscribe:():void=>undefined};
 const text=async(tools:readonly AgentTool[],name:string)=>{const r=await tools.find(t=>t.name===name)?.execute("id",{});return r?.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n")??"";};
 it("navigate_to_target and explore_map results get the untaken-exits line, with targets, only with v2",async()=>{
  const features={...ON,"untaken-exits-v1":true};
  for(const name of ["navigate_to_target","explore_map"]){
   const on=await text(withUntakenExits([tool(name)],features,recorder),name);
   expect(on).toContain('Exits here you have not taken: (1,0) [navigate_to_target target {"kind":"warp","x":1,"y":0}] -> map 4/4; NORTH edge -> map 5/5 [navigate_to_target target {"kind":"connection","direction":"NORTH"}]');
   const off=await text(withUntakenExits([tool(name)],{...features,"coherent-battle-observation-v1":false,[ID]:false},recorder),name);
   expect(off).not.toContain("Exits here you have not taken");
  }
  const plain=await text(withUntakenExits([tool("navigate_to")],{...features,"coherent-battle-observation-v1":false,[ID]:false},recorder),"navigate_to");
  expect(plain).toContain("Exits here you have not taken: (1,0) -> map 4/4; NORTH edge -> map 5/5\n");
 });
 it("the production factory wraps the semantic tools only with v2",()=>{
  const base:AgentTool[]=[tool("observe"),{...tool("press"),executeChecked:()=>Promise.reject(new Error("no"))} as AgentTool,tool("navigate_to_target")];
  const r={subscribe:()=>undefined,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})};
  const features:FeatureSet={...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"untaken-exits-v1":true,[ID]:true};
  const on=playGameTools(base,features,{read:()=>Promise.resolve(snapshot)},r).find(t=>t.name==="navigate_to_target");
  const off=playGameTools(base,{...features,"coherent-battle-observation-v1":false,[ID]:false},{read:()=>Promise.resolve(snapshot)},r).find(t=>t.name==="navigate_to_target");
  expect(on).not.toBe(base[2]);
  expect(off?.execute).toBe(base[2]?.execute);
 });
});

describe("review round 1 fixes",()=>{
 const read={read:()=>Promise.resolve({...IN_GAME,screen:"overworld",field_controls_locked:false,map_id:[3,3],interaction_targets:[]} as GameStateSnapshot)};
 const fake=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:()=>Promise.resolve({content:[],details:{}})});
 const tools=(features:FeatureSet)=>{
  const nav=navigationTool({...read,press:()=>Promise.reject(new Error("no")),observe:()=>Promise.reject(new Error("no"))});
  const press={...fake("press"),executeChecked:()=>Promise.reject(new Error("no"))} as AgentTool;
  return withSemanticNavigation([nav,press],features,read);
 };
 it("stacked warps and same-kind interactions on one tile get no target; objects always do",()=>{
  const listed=[{kind:"warp",x:2,y:2},{kind:"warp",x:2,y:2},{kind:"warp",x:4,y:4},{kind:"object",x:4,y:4}];
  expect(uniqueTile(listed,"warp",2,2)).toBe(false);expect(uniqueTile(listed,"warp",4,4)).toBe(true);
  expect(listedArgument({kind:"warp",x:2,y:2,local_id:null},listed)).toBeNull();
  expect(listedArgument({kind:"warp",x:4,y:4,local_id:null},listed)).toBe('{"kind":"warp","x":4,"y":4}');
  expect(listedArgument({kind:"object",x:4,y:4,local_id:3},listed)).toBe('{"kind":"object","local_id":3}');
  const shelf=[{kind:"background",x:3,y:1},{kind:"metatile_bookshelf",x:3,y:1},{kind:"warp",x:3,y:1},{kind:"background",x:6,y:6},{kind:"object",x:6,y:6}];
  expect(listedArgument({kind:"background",x:3,y:1,local_id:null},shelf)).toBeNull();
  expect(listedArgument({kind:"metatile_bookshelf",x:3,y:1,local_id:null},shelf)).toBeNull();
  expect(listedArgument({kind:"warp",x:3,y:1,local_id:null},shelf)).toBe('{"kind":"warp","x":3,"y":1}');
  expect(listedArgument({kind:"background",x:6,y:6,local_id:null},shelf)).toBeNull();
  expect(listedArgument({kind:"hidden_item",x:8,y:8,local_id:null},[{kind:"hidden_item",x:8,y:8}])).toBe('{"kind":"interaction","interaction_kind":"hidden_item","x":8,"y":8}');
  expect(listedArgument({kind:"coordinate_trigger",x:8,y:8,local_id:null},[{kind:"coordinate_trigger",x:8,y:8},{kind:"warp",x:8,y:8}])).toBeNull();
 });
 it("promises dialogue advance only with dialogue auto-advance on",()=>{
  const on=tools(ON).find(t=>t.name==="navigate_to_target")?.description??"";
  const off=tools({...ON,"dialogue-auto-advance-v1":false}).find(t=>t.name==="navigate_to_target")?.description??"";
  expect(on).toContain("Dialogue the activation opens is advanced for you");
  expect(off).not.toContain("Dialogue");
  expect(off.endsWith("For anything without a navigate_to_target target, use navigate_to.")).toBe(true);
 });
 it("a side with two connections gets no connection target",()=>{
  expect(uniqueDirection([{direction:"WEST"},{direction:"WEST"},{direction:"SOUTH"}],"WEST")).toBe(false);
  expect(uniqueDirection([{direction:"WEST"},{direction:"SOUTH"}],"WEST")).toBe(true);
  expect(uniqueDirection(undefined,"WEST")).toBe(false);
 });
});
