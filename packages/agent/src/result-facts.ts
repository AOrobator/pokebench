// blocked-exit-fact-v1 and battle-loss-recap-v1: lines appended to a game tool result, each its own text
// part after the readout. Both read recorded events and the result's own state, which the recorder writes
// only after the tool returns.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {BattleOutcomes} from "./battle-outcomes.js";
import {BlockedExits} from "./blocked-exit-fact.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {semanticWalk} from "./semantic-targets.js";

const GAME=new Set(["observe","press","navigate_to","battle_action"]);

// The observe, press and navigate_to results carry the state the game server returned, already checked
// against StateBodySchema where it was read (game-tools observation(), the state source).
function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))return undefined;
 const state:unknown=details.state;
 return typeof state==="object"&&state!==null&&"started" in state?state as GameStateSnapshot:undefined;
}
const textOf=(result:AgentToolResult<unknown>):string=>result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");

export function withResultFacts(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):readonly AgentTool[] {
 const exits=features["blocked-exit-fact-v1"]?new BlockedExits(features):null;
 const losses=features["battle-loss-recap-v1"]?new BattleOutcomes(features):null;
 if(exits===null&&losses===null)return tools;
 recorder.subscribe(event=>{exits?.observe(event);losses?.observe(event);});
 return tools.map(tool=>!GAME.has(tool.name)&&!semanticWalk(tool.name,features)?tool:{...tool,execute:async(...args:Parameters<AgentTool["execute"]>)=>{
  const [id,params]=args;
  exits?.begin(id,tool.name,params);
  const result=await tool.execute(...args);
  const after=stateOf(result);
  const lines=[exits?.settle(id,after,textOf(result))??null,losses===null||after===undefined?null:losses.recap(after)].filter((l):l is string=>l!==null);
  return lines.length===0?result:{...result,content:[...result.content,{type:"text",text:lines.join("\n")}]};
 }});
}
