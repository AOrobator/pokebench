// untalked-in-gym-v1 (the operator 2026-10-27): on a gym map's field, ahead of the readout, each game-tool result lists the people
// on the map the player has not talked to this run, with their tiles. Talked to is the people ledger's record (an A
// press or faced-sprite conversation that reached the model, plus the harness's own auto-talks, as
// untalked-people-header-v1 counts them). It never says what anyone will say.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState} from "./game-state.js";
import {PeopleLedger} from "./people-ledger.js";
import {semanticWalk} from "./semantic-targets.js";
import {gymOf} from "./type-gap-team.js";

export const UNTALKED_IN_GYM="People on this gym map you have not talked to this run:";

export function untalkedInGymLine(ledger:PeopleLedger,details:unknown,readout:string,callId:string):string|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 const state=parseGameState(details.state);
 if(gymOf(state.location)===null)return null;
 const people=ledger.untalkedThisRun(state,readout,callId);
 const header=state.map_visibility==null?UNTALKED_IN_GYM:UNTALKED_IN_GYM.replace("People", "Visible people");
 return people===null?null:`${header} ${people.length===0?"none":people.join("; ")}.`;
}

export function withUntalkedInGym(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!features["untalked-in-gym-v1"])return [...tools];
 const ledger=new PeopleLedger(true);
 recorder.subscribe(event=>{ledger.observe(event);});
 const annotate=<T>(id:string,result:AgentToolResult<T>):AgentToolResult<T>=>{
  const readout=result.content.findLast(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const line=untalkedInGymLine(ledger,result.details,readout?.type==="text"?readout.text:"",id);
  return line===null?result:{...result,content:[{type:"text",text:line},...result.content]};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to"&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(id,await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
