import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {featuresOf,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {SEMANTIC_REMINDER} from "./navigate-first.js";
import {IN_GAME} from "../test-support/events.js";
import {DESTINATION_POLICY,DESTINATION_RECOVERY,withDestinationFirst} from "./destination-first.js";

const ID="destination-first-navigation-v1";
const fixture=JSON.parse(readFileSync(new URL("../test-support/navigate-first-sh02.json",import.meta.url),"utf8")) as {harness_features:string[];system_prompt:string};
const OLD=featuresOf(fixture.harness_features);
const ON:FeatureSet={...OLD,[ID]:true,"navigate-first-prompt-v1":true,"semantic-navigation-v2":true};
const field={...IN_GAME,screen:"overworld" as const,active_ui:null,field_controls_locked:false};
const connection='- NORTH -> ROUTE 103 (map 0/18), offset 0; walk off the map from (8,0): stand on one of these edge tiles and press UP; navigate_to_target target {"kind":"connection","direction":"NORTH"}';
const result={content:[{type:"text" as const,text:`current observation\n${connection}`}],details:{state:field}};
const fake=(name:string)=>({name,label:name,description:"old description",parameters:Type.Object({}),execute:()=>Promise.resolve(result),...(name==="press"?{executeChecked:()=>Promise.resolve(result)}:{})});
function must<T>(value:T|undefined):T {if(value===undefined)throw new Error("missing test tool");return value;}
const recorder={lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:()=>undefined};

it("keeps the current Qwen run's actual system prompt exactly when OFF",()=>{
 const recorded=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/destination-first-qwen.json.gz",import.meta.url))).toString()) as {harness_features:string[];system_prompt:string};
 const features=featuresOf(recorded.harness_features);
 expect(playSystemPrompt(features,null)).toBe(recorded.system_prompt);
 const on=playSystemPrompt({...features,[ID]:true},null);
 expect(on).toContain(DESTINATION_POLICY);
 expect(on).not.toMatch(/two or more tiles|single-tile steps or turns|Near a transition, use short button sequences/);
});

it("OFF preserves a recorded prompt byte for byte and tool/result identity",async()=>{
 expect(playSystemPrompt({...OLD,[ID]:false},null)).toBe(fixture.system_prompt);
 const base=[fake("press"),fake("navigate_to")];
 expect(withDestinationFirst(base,{...ON,[ID]:false})).toBe(base);
 expect(await must(base[0]).execute()).toBe(result);
});
it("replaces the competing movement and warp guidance in the production prompt",()=>{
 const prompt=playSystemPrompt(ON,null);
 expect(prompt).toContain(DESTINATION_POLICY);
 expect(prompt.match(/Choose destinations rather than individual walking steps/g)).toHaveLength(1);
 expect(prompt).not.toContain("single-tile steps or turns");
 expect(prompt).not.toContain("two or more tiles");
 expect(prompt).not.toContain("Near a transition, use short button sequences");
 expect(prompt).toContain("handles approach, facing and activation");
});
it("production factory delivers immediate guidance, target-first readouts and descriptions without extra actions",async()=>{
 const tools=playGameTools([fake("press"),fake("observe")],ON,{read:()=>Promise.resolve(field)},recorder);
 const press=must(tools.find(t=>t.name==="press"));
 expect(press.description).toContain("intentional facing adjustment");
 expect(must(tools.find(t=>t.name==="navigate_to")).description).toContain("another location on the current map");
 const r=await press.execute("walk",{buttons:["UP","UP"]});
 const text=r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
 expect(text).toContain(DESTINATION_RECOVERY);
 expect(text).toContain('navigate_to_target target {"kind":"connection","direction":"NORTH"}; activation mechanics handled by the tool: walk off');
 expect(r.details).toBe(result.details);
});
it("registers default OFF, records ON and enables both current arms explicitly",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(301);
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"bounded-navigation-v1"});
 const omitted=Object.fromEntries(Object.entries(OLD).filter(([id])=>id!==ID)) as Parameters<typeof normalizeFeatures>[0];
 expect(normalizeFeatures(omitted)[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 expect(playHarnessFeatures(ON,null)).toContain(ID);
 const recipe=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {features:Record<string,boolean>;onInBoth:string[];switches:string[]};
 expect(recipe.features[ID]).toBe(true);expect(recipe.onInBoth).toContain(ID);expect(recipe.switches).not.toContain(ID);
});

it("keeps menu, battle, locked and unknown results intact and never adds another action",async()=>{
 for(const state of [undefined,{...field,active_ui:{phase:"clock_adjustment",selected:null,ready:true,controls:"LEFT/RIGHT",diagnostic:null,value:null,details:{}}},{...field,in_battle:true},{...field,field_controls_locked:true}]){
  let calls=0;
  const original={...result,details:{state}};
  const tool={...fake("press"),execute:()=>{calls++;return Promise.resolve(original);}};
  const tools=withDestinationFirst([tool,fake("navigate_to_target")],ON);
  expect(await must(tools[0]).execute("x",{buttons:["UP"]})).toBe(original);
  expect(calls).toBe(1);
 }
});
it("keeps buttons, state and unrelated dialogue unchanged, including semantic navigation OFF",async()=>{
 for(const semantic of [false,true]){
  const base=[fake("press"),fake("observe"),fake("get_dialogue"),...(semantic?[fake("navigate_to_target")]:[])];
  const tools=withDestinationFirst(base,ON);
  expect(tools.find(t=>t.name==="get_dialogue")).toBe(base[2]);
  const press=must(tools[0]);
  const unchanged=await press.execute("menu",{buttons:["A"]});
  expect(unchanged.details).toBe(result.details);
  expect(unchanged.content).toHaveLength(1);
  const walk=await press.execute("walk",{buttons:["UP"]});
  const text=walk.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
  expect(text).toContain("Field travel: choose the destination");
  expect(text.includes("activation mechanics handled by the tool")).toBe(semantic);
  if(!semantic)expect(text.split("Field travel:")[1]).not.toContain("navigate_to_target");
 }
 const base=[fake("press")];
 expect(withDestinationFirst(base,{...ON,"bounded-navigation-v1":false})).toBe(base);
});
it("respects contextual tool availability and keeps local/visited map limits",()=>{
 const jit={...ON,"just-in-time-prompt-v1":true};
 expect(playSystemPrompt(jit,null,"battle")).not.toContain(DESTINATION_POLICY);
 const plain=playSystemPrompt({...ON,"semantic-navigation-v2":false},null);
 expect(plain).toContain("Choose destinations rather than individual walking steps");
 expect(plain).not.toContain("single-tile steps or turns");
 const local=playSystemPrompt({...ON,"full-map-navigation-v1":false,"visited-terrain-navigation-v1":false},null);
 expect(local).toContain('If navigate_to stops with "command limit"');
 const visited=playSystemPrompt({...ON,"full-map-navigation-v1":false,"visited-terrain-navigation-v1":true},null);
 expect(visited).toContain("unknown cells are not routes");
});

const context={objects:[],triggers:[],dialogue:null};
const nonFieldStates:readonly (readonly [string,GameStateSnapshot])[]=[
 ["not started",{...field,started:false}],
 ["other screen",{...field,screen:"battle"}],
 ["battle flag",{...field,in_battle:true}],
 ["active interface",{...field,active_ui:{phase:"clock_adjustment",selected:null,ready:true,controls:"LEFT/RIGHT",diagnostic:null,value:null,details:{}}}],
 ["field lock",{...field,field_controls_locked:true}],
 ["dialogue",{...field,world_context:{...context,dialogue:"Wait!"}}],
 ["printing message",{...field,world_context:{...context,message:{phase:"printing",cursor:1,ready:false}}}],
 ["field script",{...field,world_context:{...context,field_activity:{phase:"script_running",owner:1}}}],
];
it.each(nonFieldStates)("preserves schema-valid %s results with every other field guard satisfied",async(_name,state)=>{
 expect(parseGameState(state)).toBe(state);
 const original={...result,details:{state}};
 let calls=0;
 const tool={...fake("press"),execute:()=>{calls++;return Promise.resolve(original);}};
 const wrapped=withDestinationFirst([tool,fake("navigate_to_target")],ON);
 expect(await must(wrapped[0]).execute("guard",{buttons:["UP"]})).toBe(original);
 expect(calls).toBe(1);
});
it("suppresses the old third-press reminder through the production factory only when ON",async()=>{
 for(const enabled of [false,true]){
  const tools=playGameTools([fake("press"),fake("observe")],{...ON,[ID]:enabled},{read:()=>Promise.resolve(field)},recorder);
  const press=must(tools.find(t=>t.name==="press"));
  for(let turn=1;turn<=3;turn++){
   const r=await press.execute(String(turn),{buttons:["UP"]});
   const text=r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
   expect(text.includes(SEMANTIC_REMINDER)).toBe(!enabled&&turn===3);
   expect(text.includes(DESTINATION_RECOVERY)).toBe(enabled);
  }
 }
});
