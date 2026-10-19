// A declared reasoning instruction, not game dialogue or a Pokémon recommendation.
// Verified menu ownership is provided by menus.py (pret starter_choose.c Task_StarterChoose).
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
export const STARTER_DECISION_PROMPT="Starter decision: This choice determines your starting Pokémon and affects later play. Before confirming, consider the alternatives and briefly explain how your choice supports your goal. Distinguish what you know from what you are uncertain about.";
const SUFFIX=`\n\n${STARTER_DECISION_PROMPT}`;
export function starterDecisionText(text:string,state:GameStateSnapshot|null,enabled:boolean):string {
 const base=text.endsWith(SUFFIX)?text.slice(0,-SUFFIX.length):text;
 const ui=state?.active_ui;
 return enabled&&state?.started&&state.screen==="starter_choice"&&!state.in_battle&&state.party.length===0&&ui?.phase==="starter_selection"&&ui.ready===true&&ui.diagnostic===null&&["TREECKO","TORCHIC","MUDKIP"].includes(ui.selected??"")?base+SUFFIX:base;
}
export function withStarterDecision(tools:readonly AgentTool[],features:FeatureSet):AgentTool[] {
 if(!features["starter-decision-salience-v1"])return [...tools];
 const annotate=<T>(result:AgentToolResult<T>):AgentToolResult<T>=>{
  const details:unknown=result.details;
  if(typeof details!=="object"||details===null||!("state" in details)||details.state==null||!result.content.some(c=>c.type==="image"))return result;
  const state=parseGameState(details.state);
  const index=result.content.findLastIndex(c=>c.type==="text");
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const text=starterDecisionText(part.text,state,true);
  if(text===part.text)return result;
  const content=[...result.content];content[index]={...part,text};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(!["observe","press","navigate_to"].includes(tool.name))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update)),executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
