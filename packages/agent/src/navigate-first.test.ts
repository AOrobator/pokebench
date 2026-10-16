// navigate-first-prompt-v1: the prompt, the navigate_to description and a press reminder steer
// walking to navigate_to. Cook run #2 (2026-10-16T02-23-17_qwen36-gpu1_sh02) walked Route 103 by
// press for 76 overworld turns against 56 by navigate_to; at T888 it pressed into a ledge row while
// navigate_to could have routed to MAY. test-support/navigate-first-sh02.json is its run_start.
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {NAVIGATE_TO_USAGE,playSystemPrompt,toolSwitches} from "./play-config.js";
import {MOVING_AROUND_FULL,MOVING_AROUND_LOCAL,NAVIGATE_FIRST_DESCRIPTION,NAVIGATE_FIRST_TOOL_LINE,PRESS_NOT_WALKING,REMINDER,REMINDER_EVERY,navigateFirstToolList,withNavigateFirst} from "./navigate-first.js";
import {navigationTool,type NavigationPorts} from "./navigation.js";
import {gameTools} from "./game-tools.js";
import {playGameTools} from "./play-wiring.js";
import type {Button} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";

const ID="navigate-first-prompt-v1";
const PREVIOUS="offscreen-objects-v1";
const COOK2=JSON.parse(readFileSync(new URL("../test-support/navigate-first-sh02.json",import.meta.url),"utf8")) as {harness_features:string[];system_prompt:string};
const RUN:FeatureSet=featuresOf(COOK2.harness_features);
const ON:FeatureSet={...RUN,[ID]:true};
const off=(...ids:(typeof SWITCHABLE_FEATURES)[number][]):FeatureSet=>({...ALL_ON,...Object.fromEntries(ids.map(id=>[id,false]))});
const FIELD:GameStateSnapshot={...IN_GAME,field_controls_locked:false};
const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");

describe("registry",()=>{
 it("is a default-off agent-side guidance switch that needs bounded navigation, recorded after off-screen objects",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"bounded-navigation-v1",switchable:true,title:"NAVIGATE_TO FIRST"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(REMINDER);
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf(PREVIOUS)+1);
  const recorded=playHarnessFeatures(ALL_ON,null);
  expect(recorded.indexOf(ID)).toBe(recorded.indexOf(PREVIOUS)+1);
  expect(featuresOf(playHarnessFeatures(off(ID),null))[ID]).toBe(false);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(dependencyProblems(off("bounded-navigation-v1","full-map-navigation-v1","grass-cost-navigation-v1"))).toContain(`${ID} needs bounded-navigation-v1`);
 });
 it("defaults OFF for presets that omit it and for legacy flag presets",()=>{
  const without=(features:FeatureSet):Omit<FeatureSet,typeof ID>=>Object.fromEntries(Object.entries(features).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without(ALL_ON))[ID]).toBe(false);
  expect(normalizeFeatures({...without(ALL_ON),[ID]:true})[ID]).toBe(true);
  const legacy=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true});
  expect(legacy[ID]).toBe(false);
  const preset=parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without(legacy)});
  expect(presetFeatures(preset)[ID]).toBe(false);
 });
});

describe("system prompt",()=>{
 it("OFF reproduces cook run #2's recorded system prompt byte for byte",()=>{
  expect(playSystemPrompt({...RUN,[ID]:false},null)).toBe(COOK2.system_prompt);
 });
 it("ON names navigate_to in the tool list as the way to move, before press, and says press is not for walking",()=>{
  const prompt=playSystemPrompt(ON,null);
  const list=prompt.split("\n\n")[1]??"";
  expect(list.split("\n")).toEqual(["You act through game tools:",
   "- observe: shows the current screen and a text readout of the game state read from memory (location, coordinates, party, and an ASCII map of the surroundings).",
   NAVIGATE_FIRST_TOOL_LINE,
   `- press: presses up to 8 buttons in order (A, B, START, SELECT, UP, DOWN, LEFT, RIGHT), then shows the new screen and state.${PRESS_NOT_WALKING}`]);
 });
 it("ON replaces the one-line usage rule with the Moving around section, last before any objective text",()=>{
  const prompt=playSystemPrompt(ON,null);
  expect(prompt).not.toContain(NAVIGATE_TO_USAGE);
  expect(prompt.endsWith(`\n\n${MOVING_AROUND_LOCAL}`)).toBe(true);
  expect(MOVING_AROUND_LOCAL).toContain("command limit");
  // Everything else is cook run #2's prompt unchanged.
  const rest=prompt.replace(`\n\n${MOVING_AROUND_LOCAL}`,"").replace(`\n${NAVIGATE_FIRST_TOOL_LINE}`,"").replace(PRESS_NOT_WALKING,"");
  expect(rest).toBe(COOK2.system_prompt.replace(`\n\n${NAVIGATE_TO_USAGE}`,""));
 });
 it("ON without game evidence priority still adds the section; whole-map navigation gets its own wording",()=>{
  const plain=playSystemPrompt({...ON,"game-evidence-priority-v1":false},null);
  expect(plain.endsWith(`\n\n${MOVING_AROUND_LOCAL}`)).toBe(true);
  const full=playSystemPrompt({...ON,"full-map-navigation-v1":true},null);
  expect(full.endsWith(`\n\n${MOVING_AROUND_FULL}`)).toBe(true);
  expect(MOVING_AROUND_FULL).not.toContain("command limit");
  expect(full).not.toContain(MOVING_AROUND_LOCAL);
 });
 it("ON keeps the screen-only press line when the RAM readout is off, and the objective text last",()=>{
  const screenOnly=playSystemPrompt({...ON,"ram-state-v1":false},null);
  expect(screenOnly).toContain(`${NAVIGATE_FIRST_TOOL_LINE}\n- press: presses up to 8 buttons in order (A, B, START, SELECT, UP, DOWN, LEFT, RIGHT), then shows the new screen.${PRESS_NOT_WALKING}`);
  const objectives=playSystemPrompt({...ON,"objective-tracking-v1":true},null);
  expect(objectives.indexOf(MOVING_AROUND_LOCAL)).toBeGreaterThan(0);
  expect(objectives.endsWith(MOVING_AROUND_LOCAL)).toBe(false);
 });
 it("names no destination or story step",()=>{
  for(const text of [MOVING_AROUND_LOCAL,MOVING_AROUND_FULL,NAVIGATE_FIRST_TOOL_LINE,NAVIGATE_FIRST_DESCRIPTION,REMINDER]){
   for(const name of ["MAY","BRENDAN","BIRCH","ROUTE","Rustboro","Oldale","Littleroot"])expect(text).not.toContain(name);
  }
 });
});

describe("tool list edit",()=>{
 it("refuses a prompt without the observe and press lines rather than guessing",()=>{
  expect(()=>navigateFirstToolList("no tools here")).toThrow("navigate-first-prompt-v1 needs the observe and press tool lines");
  expect(navigateFirstToolList("- observe: x\n- press: presses up to 8 buttons in order")).toBe(`- observe: x\n${NAVIGATE_FIRST_TOOL_LINE}\n- press: presses up to 8 buttons in order${PRESS_NOT_WALKING}`);
 });
});

describe("navigate_to description",()=>{
 const ports=(navigateFirst:boolean|undefined,fullMap=false):NavigationPorts=>({read:()=>Promise.resolve(FIELD),press:()=>Promise.reject(new Error("unused")),observe:()=>Promise.reject(new Error("unused")),fullMap,...(navigateFirst===undefined?{}:{navigateFirst})});
 it("OFF is today's description; ON leads with when to use it and, locally, how to continue after the command limit",()=>{
  const before=navigationTool(ports(undefined)).description;
  expect(navigationTool(ports(false)).description).toBe(before);
  const on=navigationTool(ports(true)).description;
  expect(on).toBe(`${NAVIGATE_FIRST_DESCRIPTION} ${before} After "command limit", call it again with the same destination to continue.`);
  const full=navigationTool(ports(true,true)).description;
  expect(full).toBe(`${NAVIGATE_FIRST_DESCRIPTION} ${navigationTool(ports(false,true)).description}`);
 });
});

// Fake press/navigate_to/observe returning a fixed state, counting calls.
function fakes(state:()=>GameStateSnapshot){
 const result=(text:string):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text}],details:{state:state()}});
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:{},execute:(_id,params)=>Promise.resolve(result(`${name} ${JSON.stringify(params)}`))});
 return [tool("observe"),tool("press"),tool("navigate_to")];
}
const press=(tools:readonly AgentTool[],buttons:Button[])=>{const t=tools.find(x=>x.name==="press");if(t===undefined)throw new Error("press");return t.execute("id",{buttons});};
const call=(tools:readonly AgentTool[],name:string)=>{const t=tools.find(x=>x.name===name);if(t===undefined)throw new Error(name);return t.execute("id",{});};

describe("press reminder",()=>{
 it("appears on every third direction-only press in a row on the free field",async()=>{
  const tools=withNavigateFirst(fakes(()=>FIELD),ON);
  const shown:boolean[]=[];
  for(let i=0;i<2*REMINDER_EVERY;i++)shown.push(textOf(await press(tools,["UP"])).includes(REMINDER));
  expect(REMINDER_EVERY).toBe(3);
  expect(shown).toEqual([false,false,true,false,false,true]);
  expect(textOf(await press(tools,["LEFT","UP"]))).not.toContain(REMINDER);
 });
 it("is reset by any other tool call (navigate_to, observe) and by any non-direction press",async()=>{
  const tools=withNavigateFirst(fakes(()=>FIELD),ON);
  await press(tools,["UP"]);await press(tools,["UP"]);await call(tools,"navigate_to");
  expect(textOf(await press(tools,["UP"]))).not.toContain(REMINDER);
  await press(tools,["UP"]);await press(tools,["A"]);
  expect(textOf(await press(tools,["UP"]))).not.toContain(REMINDER);
  await press(tools,["UP"]);await call(tools,"observe");
  expect(textOf(await press(tools,["UP"]))).not.toContain(REMINDER);
  await press(tools,["UP"]);
  expect(textOf(await press(tools,["UP"]))).toContain(REMINDER);
 });
 it("never counts a press that ends off the free field (battle, locked controls, message)",async()=>{
  let state:GameStateSnapshot=FIELD;
  const tools=withNavigateFirst(fakes(()=>state),ON);
  for(const blocked of [{...FIELD,in_battle:true},{...FIELD,screen:"battle"},{...FIELD,field_controls_locked:true},{...FIELD,field_controls_locked:null},{...FIELD,active_ui:{phase:"start_menu",selected:"BAG",ready:true,diagnostic:null,controls:"menu"}}] satisfies GameStateSnapshot[]){
   state=FIELD;await press(tools,["UP"]);await press(tools,["UP"]);
   state=blocked;expect(textOf(await press(tools,["UP"]))).not.toContain(REMINDER);
   state=FIELD;expect(textOf(await press(tools,["UP"]))).not.toContain(REMINDER);
  }
 });
 it("OFF returns the tools untouched",()=>{
  const base=fakes(()=>FIELD);
  expect(withNavigateFirst(base,{...ON,[ID]:false})).toBe(base);
 });
 it("treats a result without a readable state, or a press without buttons, as breaking the streak",async()=>{
  let details:unknown={state:FIELD};
  const press:AgentTool={name:"press",label:"press",description:"press",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"pressed"}],details})};
  const tools=withNavigateFirst([press],ON);
  const run=(params:unknown)=>{const t=tools[0];if(t===undefined)throw new Error("press");return t.execute("id",params);};
  for(const broken of [undefined,null,{},{state:null},{state:{screen:7}}]){
   details={state:FIELD};await run({buttons:["UP"]});await run({buttons:["UP"]});
   details=broken;expect(textOf(await run({buttons:["UP"]}))).not.toContain(REMINDER);
  }
  details={state:FIELD};await run({buttons:["UP"]});await run({buttons:["UP"]});
  expect(textOf(await run({}))).not.toContain(REMINDER);
  expect(textOf(await run(null))).not.toContain(REMINDER);
  expect(textOf(await run({buttons:"UP"}))).not.toContain(REMINDER);
 });
});

describe("production wiring",()=>{
 const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
 const fetchFn:typeof fetch=(input)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
  const body=url.endsWith("/action")?{status:"success"}:url.endsWith("/queue_status")?{queue_empty:true}:url.endsWith("/pokebench/observation")?{state_text:"field",screenshot_base64:png,state:FIELD}:FIELD;
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const build=(features:FeatureSet)=>{
  const base=gameTools("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,toolSwitches(features),{now:()=>0,sleep:()=>Promise.resolve()});
  return playGameTools(base,features,{read:()=>Promise.resolve(FIELD)},{recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:()=>undefined});
 };
 it("playGameTools hands the model the reminder and the new navigate_to description only when the switch is on",async()=>{
  const on=build(ON),offTools=build({...ON,[ID]:false});
  const results:string[]=[];
  for(let i=0;i<REMINDER_EVERY;i++)results.push(textOf(await press(on,["UP"])));
  expect(results.at(-1)).toContain(REMINDER);
  for(let i=0;i<REMINDER_EVERY;i++)expect(textOf(await press(offTools,["UP"]))).not.toContain(REMINDER);
  expect(on.find(t=>t.name==="navigate_to")?.description.startsWith(NAVIGATE_FIRST_DESCRIPTION)).toBe(true);
  // The run's context tools (recall/get_dialogue) come last, unchanged in order when off, and reset the count when on.
  const recall:AgentTool={name:"get_dialogue",label:"get_dialogue",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"pages"}],details:undefined})};
  const withExtra=(features:FeatureSet)=>{const base=gameTools("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,toolSwitches(features),{now:()=>0,sleep:()=>Promise.resolve()});return playGameTools(base,features,{read:()=>Promise.resolve(FIELD)},{recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:()=>undefined},undefined,[recall]);};
  const offExtra=withExtra({...ON,[ID]:false});
  expect(offExtra.map(t=>t.name)).toEqual([...offTools.map(t=>t.name),"get_dialogue"]);
  expect(offExtra.at(-1)).toBe(recall);
  const onExtra=withExtra(ON);
  await press(onExtra,["UP"]);await press(onExtra,["UP"]);await call(onExtra,"get_dialogue");
  expect(textOf(await press(onExtra,["UP"]))).not.toContain(REMINDER);
  expect(offTools.find(t=>t.name==="navigate_to")?.description.startsWith(NAVIGATE_FIRST_DESCRIPTION)).toBe(false);
 });
});
