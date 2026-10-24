import type {AgentMessage,AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type TSchema} from "typebox";
import type {RunRecorder} from "./recorder.js";
import type {FeatureSet} from "./features.js";
import {InstructionGoals,GoalReviewError,type InstructionNativeProof} from "./instruction-goals.js";
import {GoalReviewSchema,GoalArchiveArgs} from "./instruction-goal-schema.js";
export const INSTRUCTION_GOALS_ID="instruction-goal-ledger-v1";
export const INSTRUCTION_GOALS_SECTION='Instruction goals: you interpret the game dialogue and choose your own goals. A persistent ledger quotes whole delivered episodes, including unnamed speakers. On game-changing calls you may attach goal_review {reviewed:[{episode,interpretation}],updates:[{id,title,sources:[{episode,page}],parent,status,reason,completion,evidence?,superseded_by?}]}. Page numbers are zero-based. Account for new dialogue before changing the game; interpretation can say it is not a request. Repeated dialogue may need reviewing again. Update your ledger when your plan changes. Multiple goals and supporting steps can remain unfinished; use open, active, deferred, blocked, reported_complete, superseded or abandoned. Reported completion needs newer observation evidence and remains a model claim. The harness never assigns a goal or chooses an action.\n\n- review_goals: submit the same goal_review fields without changing the game. Cite delivered episode/page IDs; parents and replacements must be existing goals or goals in this update.\n- get_instruction_goals: retrieve the full dialogue episode by episode ID or a goal by goal ID; with no arguments list all goal and episode IDs. Observing and retrieving evidence remain available while dialogue is awaiting review.';
type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type Recorder=Pick<RunRecorder,"subscribe"|"recordLedgerContext">;
export interface GoalTools {ledger:InstructionGoals;tools:AgentTool[];transform:Transform;record:(id:string,review:unknown)=>void}
export function instructionGoalTools(features:FeatureSet,recorder:Recorder,base:Transform,native?:InstructionNativeProof):GoalTools|null {
 if(!features[INSTRUCTION_GOALS_ID])return null;
 const ledger=new InstructionGoals(native);recorder.subscribe(e=>{ledger.observe(e);},false,false,true);
 const record=(id:string,review:unknown):void=>{
  ledger.apply(review,id,()=>{
   recorder.recordLedgerContext({text:`Instruction goal review committed (model interpretation): ${JSON.stringify(review)}`,evidence:ledger.evidence(),instruction_goals:{call_id:id,review:GoalReviewSchemaParse(review)}});
  });
 };
 const review:AgentTool<typeof GoalReviewSchema>={name:"review_goals",label:"Review instruction goals",description:"Interpret delivered dialogue and update your own cited goals. Records bookkeeping only; does not press any button or select an objective for you.",parameters:GoalReviewSchema,execute:(id,args)=>Promise.resolve().then(()=>{record(id,args);return {content:[{type:"text",text:ledger.text()}],details:undefined};})};
 const archive:AgentTool<typeof GoalArchiveArgs>={name:"get_instruction_goals",label:"Retrieve instruction goals",description:"Retrieve full delivered dialogue or a goal record; without arguments list all episode and goal IDs.",parameters:GoalArchiveArgs,execute:(_id,args)=>Promise.resolve().then(()=>({content:[{type:"text",text:ledger.archive(args.episode,args.goal)}],details:undefined}))};
 return {ledger,tools:[review,archive],record,transform:async messages=>{
  const text=ledger.text();recorder.recordLedgerContext({text,evidence:ledger.evidence()});
  return base([...messages,{role:"user",content:text,timestamp:Date.now()}]);
 }};
}
// Validation and inference use one schema; no unchecked model JSON crosses the boundary.
import {Value} from "typebox/value";
import type {GoalReview} from "./instruction-goal-schema.js";
function GoalReviewSchemaParse(value:unknown):GoalReview {if(!Value.Check(GoalReviewSchema,value))throw new Error("Invalid goal review");return value;}
const ACTIONS=new Set(["press","navigate_to","navigate_to_target","explore_map","battle_action","learn_move","choose_evolution","select_menu_option"]);
const object=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
function neutral<T>(r:AgentToolResult<T>):AgentToolResult<T>{
 return {...r,content:r.content.map(p=>p.type!=="text"?p:{...p,text:p.text.replace(/^Story goal:/gm,"Historical place dialogue (not your active goal):").replace(/^Story goal away:/gm,"Historical destination context:")})};
}
export function withInstructionGoalReview(tools:readonly AgentTool[],goals:GoalTools|null):AgentTool[]{
 if(goals===null)return [...tools];
 return tools.map(tool=>{
  if(!ACTIONS.has(tool.name))return {...tool,execute:async(...args)=>neutral(await tool.execute(...args))};
  const properties:unknown="properties"in tool.parameters?tool.parameters.properties:undefined;
  if(!object(properties))throw new Error(`Goal review requires object parameters for ${tool.name}`);
  const parameters:TSchema={...tool.parameters,properties:{...properties,goal_review:Type.Optional(GoalReviewSchema)}};
  const execute:AgentTool["execute"]=async(id,args,signal,update)=>{
   if(!object(args))throw new Error("Invalid action arguments");
   const {goal_review:review,...ordinary}=args;
   try{if(review!==undefined)goals.record(id,review);}catch(error){if(!(error instanceof GoalReviewError))throw error;return {content:[{type:"text",text:`Goal review rejected: ${error instanceof Error?error.message:String(error)}. No game input sent.\n${goals.ledger.text()}`}],details:undefined};}
   if(goals.ledger.pending().length>0)return {content:[{type:"text",text:`No game input sent: new dialogue awaits your interpretation. Use goal_review or review_goals; you choose whether it is a request and what to do.\n${goals.ledger.text()}`}],details:undefined};
   return neutral(await tool.execute(id,ordinary,signal,update));
  };
  return {...tool,parameters,execute};
 });
}
