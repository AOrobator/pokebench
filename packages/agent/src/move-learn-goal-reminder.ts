import {moveLearningChoice} from "./learn-move.js";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
export const MOVE_LEARN_GOAL_REMINDER="Task reminder: your instruction is to play the game and make as much story progress as you can. There is no instruction to skip learning new moves or to keep the current moveset. Your earlier reasoning about skipping new moves was your own plan, not a rule. Evaluate this offered move using the displayed comparison and the current party, then choose whether to learn it or decline it. The choice is yours.";
const SKIP=/\bI (?:don't|do not) need (?:any )?new moves\b|\bI will (?:skip learning new moves|keep the current moveset)\b/i;
export function moveLearnGoalReminder(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform):Transform {
 if(!features["move-learn-goal-reminder-v1"])return base;
 let state:State|null=null,claim:number|null=null,delivered:number[]|null=null;
 recorder.subscribe(e=>{
  if(e.type==="assistant"&&SKIP.test(`${e.thinking}\n${e.text}`))claim=e.seq;
  if(e.type==="state"){state="started" in e?e:null;delivered=null;}
  if(e.type==="tool_result")delivered=!e.is_error&&claim!==null&&state!==null&&e.state_seq===state.seq&&moveLearningChoice(state)?[claim,state.seq,e.seq]:null;
 },true);
 return async messages=>{
  const out=await base(messages);
  if(delivered===null||out.some(m=>m.role==="user"&&m.content===MOVE_LEARN_GOAL_REMINDER))return out;
  recorder.recordLedgerContext({text:MOVE_LEARN_GOAL_REMINDER,evidence:delivered});
  return [...out,{role:"user",content:MOVE_LEARN_GOAL_REMINDER,timestamp:Date.now()}];
 };
}
