// move-learn-tool-v1: learn_move answers the game's move-learning prompts for the move being learned, one button at a
// time, the way battle_action drives the battle menu. Game flow, pret pokeemerald 731ad5bf: src/evolution_scene.c
// MVSTATE_* (evolution and trade scenes), data/battle_scripts_1.s BattleScript_AskToLearnMove (battle), and
// src/pokemon_summary_screen.c Task_HandleReplaceMoveInput / ChangeSelectedMove (the forget-a-move list: UP/DOWN step
// through the four moves and the new move, wrapping; A forgets the highlighted move; B cancels). Strings:
// src/battle_message.c sText_TryToLearnMove1/2/3, sText_StopLearningMove, sText_DidNotLearnMove.
// Every press re-checks the screen it was planned from (executeChecked); every cursor move is verified; waits are the
// game server's move-learning wait, held until the first emulated frame the flow needs input or leaves it.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import type {Button,LearnWaitSchema} from "./events.js";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import {isCheckedPress,type BeforePressCheck} from "./game-tools.js";

export const LEARN_MOVE_ID="move-learn-tool-v1";
type LearnWait=Static<typeof LearnWaitSchema>;

export const LearnMoveArgs=Type.Object({
 forget:Type.String({minLength:1,description:'The move to forget for the new move, by its name as the game lists it among the four moves the POKéMON knows (for example SCRATCH), or "none" to keep the four moves and not learn the new one.'}),
},{additionalProperties:false});
type Args=Static<typeof LearnMoveArgs>;

export const LEARN_MOVE_DESCRIPTION='Answer the game\'s move-learning prompts in one call, only while one is open for the move being learned: "Delete a move to make room for …?", "Stop learning …?", the "… is trying to learn …" and "… can\'t learn more than four moves" pages before them, or the summary screen\'s list of moves to forget. forget is one of the four moves the POKéMON knows, as the game names it: the harness answers YES to deleting a move, moves the summary screen\'s highlight one step at a time to that move (checking the highlighted move after each press) and presses A. forget "none": it answers NO to deleting a move and YES to "Stop learning …?", so the POKéMON keeps the moves it knows. It then checks the party\'s moves and reports what the game printed. It refuses without pressing when no move-learning prompt is open or the move is not one of the four, and stops and says why if the screen changes unexpectedly. Neither choice is recommended. press still works on these prompts.';
export const LEARN_MOVE_SECTION='- learn_move: when the game asks "Delete a move to make room for …?" or "Stop learning …?", or shows the pages before them or the summary screen\'s list of moves to forget, call learn_move with forget set to one of the four moves the POKéMON knows (as the game names them) or "none". With a move, the harness answers YES, moves the summary highlight to that move checking it after each press, and presses A; with none, it answers NO to deleting a move and YES to stopping, and the POKéMON keeps its moves. It reports what the game printed and the party\'s moves afterwards. No choice is recommended. It refuses, and presses nothing, when no move-learning prompt is open or the move is not one the POKéMON knows. press still works on these prompts.';

export interface LearnMovePorts {
 wait(signal?:AbortSignal):Promise<LearnWait>;
 press(id:string,params:{buttons:Button[]},signal:AbortSignal|undefined,check:BeforePressCheck):Promise<AgentToolResult<unknown>>;
 observe(id:string,signal?:AbortSignal):Promise<AgentToolResult<unknown>>;
 gate?(signal?:AbortSignal):Promise<void>;
}

interface Learner {readonly slot:number;readonly name:string;readonly newMove:string;readonly moves:readonly string[]}
type Question="delete"|"stop";
type View=
 |{readonly kind:"box";readonly question:Question;readonly selected:"YES"|"NO"|null}
 |{readonly kind:"page";readonly page:string|null;readonly identity:string|null;readonly mvstate:number|null}
 |{readonly kind:"forget";readonly index:number;readonly names:readonly string[]}
 |{readonly kind:"hm";readonly message:string}
 |{readonly kind:"other"};

// (yes, no) next states the evolution scene sets before each box (move_learn.py DELETE_PAIRS / STOP_PAIRS).
const DELETE_PAIRS=["5,10","5,9"],STOP_PAIRS=["11,0","10,0"];
// The summary list holds the four known moves and, last, the new move.
const LIST=5;
const MAX_PRESSES=16;

const num=(value:unknown):number|null=>typeof value==="number"&&Number.isInteger(value)?value:null;
const text=(value:unknown):string|null=>typeof value==="string"&&value!==""?value:null;
const norm=(name:string):string=>name.toUpperCase().replace(/[^A-Z0-9]/g,"");
const flat=(page:string):string=>page.replace(/\s+/g," ").trim();

function partyMoves(s:GameStateSnapshot,slot:number):string[]|null {
 const moves=s.party[slot]?.moves;
 if(moves==null)return null;
 const names=moves.filter(move=>move.move_id!==0).map(move=>move.name??null);
 return names.every((name):name is string=>name!==null)?names:null;
}

function learnerOf(s:GameStateSnapshot,battle:LearnWait["battle_learner"]):Learner|null {
 const ui=s.active_ui,details=ui?.details??{};
 let slot:number|null=null,newMove:string|null=null;
 if(ui!=null&&ui.diagnostic===null&&(ui.phase==="summary_move_forget"||ui.phase==="summary_hm_rejection")){slot=num(details["party_slot"]);newMove=text(details["new_move_name"]);}
 else if(ui!=null&&ui.diagnostic===null&&(ui.phase==="evolution_move_learning"||ui.phase==="evolution_move_confirmation")){slot=num(details["pokemon_party_index"]);newMove=text(details["new_move"]);}
 else if(battle!==null&&s.in_battle){slot=battle.party_slot;newMove=battle.new_move;}
 if(slot===null||newMove===null)return null;
 const mon=s.party[slot],moves=partyMoves(s,slot);
 if(mon===undefined||moves===null)return null;
 return {slot,name:mon.nickname??mon.species??`POKéMON in party slot ${String(slot+1)}`,newMove,moves};
}

function view(s:GameStateSnapshot):View {
 const ui=s.active_ui,details=ui?.details??{};
 const message=s.battle?.message;
 const waiting=message?.state==="waiting_for_input";
 const page=waiting?text(message.page??null)??(message.text==null?null:flat(message.text)):null;
 if(ui!=null&&ui.diagnostic===null){
  if(ui.phase==="summary_move_forget"&&ui.ready===true){
   const index=num(details["selected_index"]),names=details["move_names"];
   if(index===null||index<0||index>=LIST||!Array.isArray(names)||names.length!==LIST-1||!names.every((name):name is string=>typeof name==="string"))return {kind:"other"};
   return {kind:"forget",index,names};
  }
  if(ui.phase==="summary_hm_rejection")return {kind:"hm",message:text(details["message"])??"HM moves cannot be forgotten."};
  if(ui.phase==="evolution_move_confirmation"&&ui.ready===true){
   const pair=`${String(details["yes_next_state"])},${String(details["no_next_state"])}`;
   const question=DELETE_PAIRS.includes(pair)?"delete":STOP_PAIRS.includes(pair)?"stop":null;
   if(question===null)return {kind:"other"};
   return {kind:"box",question,selected:ui.selected==="YES"||ui.selected==="NO"?ui.selected:null};
  }
  if(ui.phase==="evolution_move_learning"&&ui.ready===true)return {kind:"page",page,identity:waiting?message.identity:null,mvstate:num(details["move_learning_state"])};
 }
 const prompt=s.in_battle&&s.battle?.diagnostic==null?s.battle?.prompt:null;
 if(prompt!=null&&prompt.ready&&(prompt.kind==="learn_move"||prompt.kind==="stop_learning_move"))return {kind:"box",question:prompt.kind==="learn_move"?"delete":"stop",selected:prompt.selected};
 if(waiting)return {kind:"page",page,identity:message.identity,mvstate:null};
 return {kind:"other"};
}

// The two pages before "Delete a move to make room for …?": MVSTATE 1/2 in the evolution scene, the game's words in battle.
function learnPage(v:View,l:Learner):boolean {
 if(v.kind!=="page")return false;
 if(v.mvstate!==null)return v.mvstate===1||v.mvstate===2;
 return v.page===`${l.name} is trying to learn ${l.newMove}.`||v.page===`But, ${l.name} can't learn more than four moves.`;
}

function describe(v:View,s:GameStateSnapshot):string {
 if(v.kind==="box")return `the game asks "${v.question==="delete"?"Delete a move to make room for …?":"Stop learning …?"}" with ${v.selected??"an unreadable choice"} highlighted`;
 if(v.kind==="page")return v.page===null?"a page is waiting for A or B":`a page is waiting for A or B: "${v.page}"`;
 if(v.kind==="forget")return `the summary screen's list of moves to forget is open with ${v.names[v.index]??"the new move"} highlighted`;
 if(v.kind==="hm")return `the game shows "${v.message}"`;
 const ui=s.active_ui;
 return `the game shows screen ${s.screen}${ui==null?"":` (${ui.phase})`}${s.in_battle?", in battle":""}`;
}

const stateOf=(r:AgentToolResult<unknown>):GameStateSnapshot=>{
 const d=r.details;
 if(typeof d!=="object"||d===null||!("state" in d))throw new Error("learn_move observation lacks verified state");
 return parseGameState(d.state);
};

class Stop extends Error {}

export function learnMoveTool(ports:LearnMovePorts):AgentTool<typeof LearnMoveArgs> {
 return {name:"learn_move",label:"Learn a move",description:LEARN_MOVE_DESCRIPTION,parameters:LearnMoveArgs,
 execute:async(id:string,args:Args,signal?:AbortSignal)=>{
  signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
  if(!Value.Check(LearnMoveArgs,args))throw new Error("Invalid learn_move arguments");
  const presses:Button[]=[],printed:string[]=[];
  let lastPage:string|null=null;
  const note=(s:GameStateSnapshot):void=>{
   const v=view(s);
   if(v.kind!=="page"||v.page===null)return;
   const key=`${v.identity??""}|${v.page}`;
   if(key!==lastPage){printed.push(v.page);lastPage=key;}
  };
  const finish=async(status:string,refused:boolean,verified:boolean|null)=>{
   const seen=await ports.observe(id,signal);
   const said=printed.length===0?"":`\nThe game printed: ${printed.map(page=>`"${page}"`).join(" / ")}`;
   return {content:[{type:"text" as const,text:`Learn move: ${status}${said}\n`},...seen.content],details:{state:stateOf(seen),learn_move:{forget:args.forget,presses:[...presses],refused,verified,status}}};
  };
  let wait=await ports.wait(signal);
  let s=wait.state;
  const learner=learnerOf(s,wait.battle_learner);
  const first=view(s);
  if(wait.reason==="bound"||wait.reason==="paused"||learner===null||!(first.kind==="box"||first.kind==="forget"||learnPage(first,learner)))
   return finish(`nothing pressed: no move-learning prompt is open; ${wait.reason==="bound"?"the game did not wait for input within the frame bound":wait.reason==="paused"?"the run is paused":describe(first,s)}.`,true,null);
  const wanted=args.forget.trim();
  const none=norm(wanted)==="NONE";
  const goal=none?null:learner.moves.find(move=>norm(move)===norm(wanted))??null;
  if(!none&&goal===null)return finish(`nothing pressed: ${wanted.toUpperCase()} is not one of ${learner.name}'s moves. The game shows ${learner.name}'s moves: ${learner.moves.join(", ")}. Use one of these names, or "none".`,true,null);
  note(s);
  const pressed=():string=>presses.length===0?"stopped;":`stopped after pressing ${presses.join(", ")};`;
  const step=async(button:Button,planned:View):Promise<View>=>{
   if(presses.length>=MAX_PRESSES)throw new Stop(`${pressed()} ${String(MAX_PRESSES)} presses is the most one learn_move makes`);
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   await ports.press(id,{buttons:[button]},signal,before=>{
    if(before===undefined||JSON.stringify(view(before))!==JSON.stringify(planned))throw new Stop(`${pressed()} the screen changed before the press, so no button was sent`);
   });
   presses.push(button);
   wait=await ports.wait(signal);s=wait.state;
   if(wait.reason==="bound")throw new Stop(`${pressed()} the game did not wait for input within the frame bound`);
   if(wait.reason==="paused")throw new Stop(`${pressed()} the run was paused`);
   note(s);
   return view(s);
  };
  const expect=(next:View,ok:boolean,what:string):void=>{if(!ok)throw new Stop(`${pressed()} expected ${what}, but ${describe(next,s)}`);};
  let chose=false;
  try{
   for(let v=first;!chose;){
    if(v.kind==="box"&&v.selected===null)throw new Stop(`${pressed()} the YES/NO highlight could not be read`);
    if(v.kind==="box"&&v.question==="delete"){
     if(goal===null){const next=await step("B",v);expect(next,next.kind==="box"&&next.question==="stop",'"Stop learning …?"');v=next;continue;}
     if(v.selected==="NO"){const next=await step("UP",v);expect(next,next.kind==="box"&&next.question==="delete"&&next.selected==="YES","YES highlighted");v=next;continue;}
     const next=await step("A",v);expect(next,next.kind==="forget","the summary screen's list of moves to forget");v=next;continue;
    }
    if(v.kind==="box"){
     if(goal!==null){const next=await step("B",v);expect(next,learnPage(next,learner),`"${learner.name} is trying to learn ${learner.newMove}."`);v=next;continue;}
     if(v.selected==="NO"){const next=await step("UP",v);expect(next,next.kind==="box"&&next.question==="stop"&&next.selected==="YES","YES highlighted");v=next;continue;}
     await step("A",v);chose=true;continue;
    }
    if(v.kind==="forget"){
     if(v.names.join("|")!==learner.moves.join("|"))throw new Stop(`${pressed()} the summary screen lists ${v.names.join(", ")}, not ${learner.name}'s party moves ${learner.moves.join(", ")}`);
     if(goal===null){const next=await step("B",v);expect(next,next.kind==="box"&&next.question==="stop",'"Stop learning …?"');v=next;continue;}
     const target=v.names.indexOf(goal);
     if(v.index===target){await step("A",v);chose=true;continue;}
     const down=(target-v.index+LIST)%LIST,up=(v.index-target+LIST)%LIST;
     const button:Button=down<=up?"DOWN":"UP";
     const index=(v.index+(button==="DOWN"?1:LIST-1))%LIST;
     const next=await step(button,v);
     expect(next,next.kind==="forget"&&next.index===index,`the highlight on ${v.names[index]??learner.newMove} after ${button}`);
     v=next;continue;
    }
    if(learnPage(v,learner)){
     const next=await step("A",v);
     expect(next,(learnPage(next,learner)&&JSON.stringify(next)!==JSON.stringify(v))||(next.kind==="box"&&next.question==="delete"),'the next page or "Delete a move to make room for …?"');
     v=next;continue;
    }
    throw new Stop(`${pressed()} ${describe(v,s)}`);
   }
  }catch(error){
   if(error instanceof Stop)return finish(`${error.message}; inspect the new state.`,false,false);
   throw error;
  }
  const after=partyMoves(s,learner.slot);
  const shown=after===null?`${learner.name}'s moves could not be read`:`${learner.name}'s moves: ${after.join(", ")}`;
  const buttons=`buttons pressed: ${presses.join(", ")}`;
  const v=view(s);
  if(goal!==null){
   if(v.kind==="hm")return finish(`${buttons}; the game shows "${v.message}"; ${shown}.`,false,false);
   const slot=learner.moves.indexOf(goal);
   const verified=after!==null&&after.length===learner.moves.length&&after.every((move,i)=>i===slot?move===learner.newMove:move===learner.moves[i]);
   return finish(verified?`${learner.name} forgot ${goal} and learned ${learner.newMove} (checked in the party's moves); ${buttons}; ${shown}.`:`${buttons}; the party's moves do not show ${learner.newMove} in place of ${goal}; ${shown}.`,false,verified);
  }
  const unchanged=after!==null&&after.join("|")===learner.moves.join("|");
  const said=printed.includes(`${learner.name} did not learn ${learner.newMove}.`)||(v.kind==="other"&&s.active_ui?.details?.["move_learning_state"]===11);
  return finish(unchanged&&said?`${learner.name} did not learn ${learner.newMove} and kept its moves (checked in the party's moves); ${buttons}; ${shown}.`:`${buttons}; ${unchanged?`the game has not said "${learner.name} did not learn ${learner.newMove}." yet`:"the party's moves changed"}; ${shown}.`,false,unchanged&&said);
 }};
}

// Built from the ordinary press and observe, like battle_action, so each press keeps its recorder hooks and guards.
export function withLearnMove(tools:readonly AgentTool[],features:FeatureSet,state:StateSource,gate?:LearnMovePorts["gate"]):AgentTool[] {
 if(!features[LEARN_MOVE_ID])return [...tools];
 const press=tools.find(t=>t.name==="press"),observe=tools.find(t=>t.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press))throw new Error("learn_move requires the ordinary game tools");
 return [...tools,learnMoveTool({
  wait:signal=>state.moveLearnWait===undefined?Promise.reject(new Error("learn_move needs a game server that serves /pokebench/move-learn/wait")):state.moveLearnWait(signal),
  press:(id,params,signal,check)=>press.executeChecked(id,params,check,signal),
  observe:(id,signal)=>observe.execute(id,{},signal),
  ...(gate===undefined?{}:{gate}),
 })];
}
