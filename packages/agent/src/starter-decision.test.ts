import {readFileSync} from "node:fs";
import {describe,expect,it,vi} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {featuresOf,playHarnessFeatures} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {playGameTools} from "./play-wiring.js";
import {STARTER_DECISION_PROMPT,starterDecisionText,withStarterDecision} from "./starter-decision.js";
const ID="starter-decision-salience-v1";
const events=JSON.parse(readFileSync(new URL("./fixtures/starter-decision.json",import.meta.url),"utf8")) as {seq:number;state_seq?:number;text?:string;type:string}[];
const entry=(seq:number)=>{const x=events.find(e=>e.seq===seq);if(!x)throw new Error("missing fixture");return x;};
const state=parseGameState(entry(2906));
const text=entry(2907).text??"";
const off=featuresOf([]),on={...off,[ID]:true};
const result=(s:unknown=state):AgentToolResult<unknown>=>({content:[{type:"image",data:"frame",mimeType:"image/png"},{type:"text",text}],details:{state:s}});
const tool=(name:string,r:AgentToolResult<unknown>=result()):AgentTool=>({name,label:name,description:"unchanged",parameters:Type.Object({}),execute:vi.fn(()=>Promise.resolve(r))});
const recorder=()=>({subscribe:vi.fn(),recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:vi.fn(),peopleIdCard:vi.fn(),destinationCitation:vi.fn()});
const value=(r:AgentToolResult<unknown>)=>r.content.filter(c=>c.type==="text").map(c=>c.text).join("\n");
describe(ID,()=>{
 it("starts OFF and only declares its receipt when enabled",()=>{
  expect(normalizeFeatures(off)[ID]).toBe(false);
  expect(playHarnessFeatures(off,null)).not.toContain(ID);
  expect(playHarnessFeatures(on,null)).toContain(ID);
 });
 it("keeps the recorded control observation byte-identical; ON adds only the exact neutral reminder",()=>{
  expect(starterDecisionText(text,state,false)).toBe(text);
  expect(starterDecisionText(text,state,true)).toBe(text+"\n\n"+STARTER_DECISION_PROMPT);
  expect(STARTER_DECISION_PROMPT).not.toMatch(/torchic|mudkip|treecko|gym|rock|water|evol|type|level|best|speedrun/i);
  expect(starterDecisionText(text+"\n\n"+STARTER_DECISION_PROMPT,state,true)).toBe(text+"\n\n"+STARTER_DECISION_PROMPT);
 });
 it.each([
  {screen:"starter_choice_transition",active_ui:{...state.active_ui,phase:"starter_choice_transition",ready:false}},
  {active_ui:{...state.active_ui,ready:null}},
  {active_ui:{...state.active_ui,phase:"starter_confirmation"}},
  {active_ui:null},
  {screen:"overworld"},
  {party:[{species:"TORCHIC"}]},
  {started:false},
  {in_battle:true},
 ])("leaves transitions, confirmation, missing ownership and already-owned parties alone: %j",extra=>{
  expect(starterDecisionText(text,{...state,...extra} as GameStateSnapshot,true)).toBe(text);
 });
 it("preserves OFF tool identity, ON action arguments, content images and snapshot details through the production factory",async()=>{
  const base=[tool("observe"),tool("press"),tool("navigate_to"),tool("remember_destination")];
  const read=vi.fn(()=>Promise.resolve(state));
  const old=playGameTools(base,off,{read},recorder());
  expect(old).toEqual(base);
  const tools=playGameTools(base,on,{read},recorder());
  expect(tools.map(t=>[t.name,t.description,t.parameters])).toEqual(base.map(t=>[t.name,t.description,t.parameters]));
  for(let i=0;i<tools.length;i++){
   const r=await tools[i]?.execute("call",{buttons:["A"]});
   expect(r).toBeDefined();
   if(!r)throw new Error("missing result");
   expect(value(r)).toBe(i<3?text+"\n\n"+STARTER_DECISION_PROMPT:text);
   expect(r.content[0]).toEqual(result().content[0]);expect(r.details).toEqual({state});
   expect(base[i]?.execute).toHaveBeenCalledWith("call",{buttons:["A"]},undefined,undefined);
  }
  expect(read).not.toHaveBeenCalled();
 });
 it("preserves checked-press validation and refusals, no hidden execution",async()=>{
  const executeChecked:CheckedPressTool["executeChecked"]=vi.fn(()=>Promise.resolve(result()));
  const base:CheckedPressTool={...tool("press"),executeChecked};
  const wrapped=withStarterDecision([base],on)[0];
  if(!wrapped||!isCheckedPress(wrapped))throw new Error("lost checked press");
  const check=()=>null;
  const r=await wrapped.executeChecked("id",{buttons:["A"]},check);
  expect(executeChecked).toHaveBeenCalledWith("id",{buttons:["A"]},check,undefined,undefined,undefined);
  expect(value(r)).toContain(STARTER_DECISION_PROMPT);
  expect(base.execute).not.toHaveBeenCalled();
 });
 it("ignores absent snapshot, text-only results, and non-game tools",async()=>{
  for(const r of [{content:[],details:{}},result(undefined),{content:[{type:"text" as const,text}],details:{state}}]){
   const base=tool("observe",r);expect(await withStarterDecision([base],on)[0]?.execute("x",{})).toBe(r);
  }
 });
});
