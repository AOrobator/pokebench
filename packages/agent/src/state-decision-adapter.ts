import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import {setTimeout as delay} from "node:timers/promises";
import {observeTool,pressTool,type Clock,type PressHooks,type ToolSwitches} from "./game-tools.js";
import {parseGameState} from "./game-state.js";
import {StateActionSchema,type DecisionSnapshot,type StateAction} from "./state-decision.js";

export async function readDecisionSnapshot(url:string,fetchFn:typeof fetch=fetch,signal?:AbortSignal):Promise<DecisionSnapshot>{
 signal?.throwIfAborted();
 const result=await observeTool(url,fetchFn).execute("harness-snapshot",{},signal);
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))throw new Error("Observation has no structured state");
 const state=parseGameState(details.state);
 const [image,text]=result.content;
 if(result.content.length!==2||image?.type!=="image"||text?.type!=="text")throw new Error("Observation must pair exactly one frame and readout");
 return {state,content:[image,text]};
}
export interface DecisionActionHooks extends PressHooks {beforeWait(id:string,ms:number):void;}
export interface DecisionClock extends Clock {sleep(ms:number,signal?:AbortSignal):Promise<void>;}
const realClock:DecisionClock={now:()=>Date.now(),sleep:(ms,signal)=>delay(ms,undefined,signal===undefined?{}:{signal})};
export function decisionActions(url:string,hooks:DecisionActionHooks,fetchFn:typeof fetch=fetch,clock:DecisionClock=realClock,switches?:ToolSwitches):(id:string,action:StateAction,signal?:AbortSignal)=>ReturnType<AgentTool["execute"]>{
 const press=pressTool(url,hooks,fetchFn,clock,switches);
 return async(id,action,signal)=>{
  signal?.throwIfAborted();
  if(!Value.Check(StateActionSchema,action))throw new Error("Invalid state action: exact types and bounds required");
  if(action.kind==="press")return press.execute(id,{buttons:action.buttons},signal);
  hooks.beforeWait(id,action.duration_ms);
  await clock.sleep(action.duration_ms,signal);
  signal?.throwIfAborted();
  await hooks.afterPress();
  const snapshot=await readDecisionSnapshot(url,fetchFn,signal);
  return {content:[snapshot.content[0],{type:"text",text:`waited ${String(action.duration_ms)} ms (host time)\n\n${snapshot.content[1].text}`}],details:{state:snapshot.state}};
 };
}
