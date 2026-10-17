// battle-move-tool-v1: battle_action chooses FIGHT (with a move), BAG, POKéMON or RUN by pressing the battle menu's
// buttons one at a time from the RAM cursor, the way navigate_to walks. Cursor rules: pret pokeemerald 731ad5bf,
// src/battle_controller_player.c HandleInputChooseAction / HandleInputChooseMove. Every press re-checks the battle
// input it was planned from (executeChecked) and every cursor move is verified, so nothing is pressed blindly.
// Waits between menus are the game server's battle wait, held until the first emulated frame the battle needs input.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type Static} from "typebox";
import type {BattleWaitSchema,Button} from "./events.js";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import {isCheckedPress,type BeforePressCheck} from "./game-tools.js";

export const BATTLE_ACTION_ID="battle-move-tool-v1";
const ACTIONS=["fight","bag","pokemon","run"] as const;
type Action=(typeof ACTIONS)[number];
// gText_BattleMenu (src/battle_message.c): "FIGHT BAG / POKéMON RUN".
const LABELS:Readonly<Record<Action,string>>={fight:"FIGHT",bag:"BAG",pokemon:"POKéMON",run:"RUN"};
const MENU="FIGHT, BAG, POKéMON, RUN";
// sText_NoPPLeft (src/battle_message.c), shown when a move with no PP is chosen.
export const NO_PP="There's no PP left for this move!";
const MAX_PRESSES=8;
const MAX_WAITS=3;

export const BattleActionArgs=Type.Object({
 action:Type.Enum(ACTIONS,{description:"fight, bag, pokemon or run: the battle menu option to choose."}),
 move:Type.Optional(Type.String({minLength:1,description:"With fight: the name of the move to use, as the battle shows it (for example EMBER)."})),
},{additionalProperties:false});
type Args=Static<typeof BattleActionArgs>;

export const BATTLE_ACTION_DESCRIPTION=`Choose a battle action in one call, only while a battle waits for your choice: action fight with move (a move name your active POKéMON knows), bag, pokemon or run. The harness reads the battle menu's cursor from the game's memory and presses the buttons one at a time (moving the highlight, then A), checking the cursor after each press; it stops and says why if anything is not as expected. It refuses without pressing when no battle is waiting for a choice, when the active POKéMON does not know the move, or when the move has no PP. bag and pokemon open the BAG or the POKéMON screen and stop there; choose the item or POKéMON with press. A target, YES/NO or Safari choice is not handled; use press.`;

type Battle=NonNullable<GameStateSnapshot["battle"]>;
type Input=NonNullable<Battle["player_inputs"]>[number];
type Mon=NonNullable<Battle["battlers"]>[number];

export interface BattleActionPorts {
 read(signal?:AbortSignal):Promise<GameStateSnapshot>;
 press(id:string,params:{buttons:Button[]},signal:AbortSignal|undefined,check:BeforePressCheck):Promise<AgentToolResult<unknown>>;
 observe(id:string,signal?:AbortSignal):Promise<AgentToolResult<unknown>>;
 wait?(signal?:AbortSignal):Promise<Static<typeof BattleWaitSchema>>;
 gate?(signal?:AbortSignal):Promise<void>;
}

// One step of the 2x2 grid toward `to`, columns first, through cells the game moves to (`count` cells exist).
function gridStep(from:number,to:number,count:number):Button|null {
 if(from===to)return null;
 const moves=(c:number):[Button,number][]=>[
  ...(c&1?[["LEFT",c^1] as [Button,number]]:(c^1)<count?[["RIGHT",c^1] as [Button,number]]:[]),
  ...(c&2?[["UP",c^2] as [Button,number]]:(c^2)<count?[["DOWN",c^2] as [Button,number]]:[]),
 ];
 const queue:[number,Button|null][]=[[from,null]];const seen=new Set([from]);
 for(let item=queue.shift();item!==undefined;item=queue.shift()){
  const [cell,first]=item;
  for(const [button,next] of moves(cell)){
   if(seen.has(next))continue;
   if(next===to)return first??button;
   seen.add(next);queue.push([next,first??button]);
  }
 }
 return null;
}
export const actionButton=(cursor:number,target:number):Button|null=>gridStep(cursor,target,4);
export const moveButton=(cursor:number,slot:number,count:number):Button|null=>gridStep(cursor,slot,count);

const norm=(name:string):string=>name.toUpperCase().replace(/[^A-Z0-9]/g,"");
const known=(mon:Mon)=>mon.moves.filter(m=>m.move_id!==0&&m.name!==null);
const moveList=(mon:Mon):string=>known(mon).map(m=>`${m.name??""} (PP ${String(m.pp)}/${String(m.max_pp)})`).join(", ");
const readyInputs=(s:GameStateSnapshot):Input[]=>s.in_battle?(s.battle?.player_inputs??[]).filter(i=>i.ready):[];
// One ready input, or none: a button reaches every ready input handler at once (input is global), so with two
// ready (a double battle) one press could move or choose for both. Codex review round 1.
const readyInput=(s:GameStateSnapshot):Input|undefined=>{const ready=readyInputs(s);return ready.length===1?ready[0]:undefined;};
const SEVERAL="more than one battle input is waiting at once";

const PHASES:Readonly<Record<string,string>>={target:"the target choice is open",move_reorder:"the move reorder choice is open",yes_no:"a battle YES/NO choice is open",safari_action:"the Safari action menu is open"};
// What the battle is doing now, from the game state the model also sees.
export function describeBattle(s:GameStateSnapshot):string {
 if(!s.in_battle)return "the battle has ended";
 const b=s.battle;
 if(b==null||b.phase==="unavailable")return `the battle state could not be read${b?.diagnostic==null?"":` (${b.diagnostic})`}`;
 if(readyInputs(s).length>1)return SEVERAL;
 const input=readyInput(s);
 if(input!==undefined){
  const lit=input.selected===null?"":`; highlighted ${input.selected}`;
  if(input.phase==="action")return `the battle menu (${MENU}) is open${lit}`;
  if(input.phase==="move")return `the move menu is open${lit}`;
  return `${PHASES[input.phase]??`battle input ${input.phase} is open`}${lit}`;
 }
 if(b.text_phase==="message_waiting"){const page=b.message?.page??b.message?.text??null;return page===null?"a battle message is waiting for A or B":`a battle message is waiting for A or B: "${page.replace(/\s*\n\s*/g," ").trim()}"`;}
 if(b.text_phase==="prompt")return "a battle YES/NO question is open";
 if(b.text_phase==="screen")return `the game is showing another screen (${s.screen})`;
 return "the battle is running its own text or animation";
}

interface Plan {readonly input:Input;readonly mon:Mon;readonly slot:number|null;readonly name:string|null}
// The refusal, or what the call will aim for; nothing is pressed here.
function validate(s:GameStateSnapshot,args:Args):string|Plan {
 if(!s.in_battle)return "no battle is in progress.";
 const b=s.battle;
 if(b==null||b.phase==="unavailable"||b.battlers==null)return `the battle state could not be read${b?.diagnostic==null?"":` (${b.diagnostic})`}.`;
 if(args.move!==undefined&&args.action!=="fight")return "move goes only with action fight.";
 const input=readyInput(s);
 if(input===undefined)return `the battle is not waiting for a choice; ${describeBattle(s)}`;
 if(input.phase!=="action"&&input.phase!=="move")return `the battle is not waiting for a choice from the ${MENU} menu; ${describeBattle(s)}.`;
 const mon=b.battlers.find(m=>m.battler===input.battler);
 if(mon===undefined)return "the active POKéMON could not be read.";
 if(args.action!=="fight")return {input,mon,slot:null,name:null};
 const moves=known(mon);
 const usable=moves.some(m=>m.pp>0);
 if(args.move===undefined)return usable?`name the move to use; ${mon.species}'s moves: ${moveList(mon)}.`:{input,mon,slot:null,name:null};
 const wanted=norm(args.move);
 const move=moves.find(m=>norm(m.name??"")===wanted);
 if(move===undefined)return `${mon.species} does not know ${args.move.trim().toUpperCase()}; its moves: ${moveList(mon)}.`;
 if(!usable)return {input,mon,slot:null,name:null};
 if(move.pp===0)return `${NO_PP} (${move.name??""} has 0/${String(move.max_pp)} PP)`;
 return {input,mon,slot:move.slot,name:move.name};
}

class Stop extends Error {}
const stateOf=(r:AgentToolResult<unknown>):GameStateSnapshot=>{
 const d=r.details;
 if(typeof d!=="object"||d===null||!("state" in d))throw new Error("battle_action press result lacks verified state");
 return parseGameState(d.state);
};

export function battleActionTool(ports:BattleActionPorts):AgentTool<typeof BattleActionArgs> {
 return {name:"battle_action",label:"Choose a battle action",description:BATTLE_ACTION_DESCRIPTION,parameters:BattleActionArgs,
 execute:async(id,args,signal)=>{
  signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
  const action=args.action;
  const presses:Button[]=[];
  let s=await ports.read(signal);
  const plan=validate(s,args);
  const finish=async(status:string,refused:boolean)=>{
   const seen=await ports.observe(id,signal);
   const text=/[".!)]$/.test(status)?status:`${status}.`;
   return {content:[{type:"text" as const,text:`Battle action: ${text}`},...seen.content],details:{state:stateOf(seen),battle_action:{action,move:typeof plan==="string"?null:plan.name,presses:[...presses],refused,status:text}}};
  };
  if(typeof plan==="string")return finish(`nothing pressed: ${plan}`,true);
  const battler=plan.input.battler;
  const pressed=()=>presses.length===0?"stopped;":`stopped after pressing ${presses.join(", ")};`;
  // One button, only if the battle input is still the one this step was planned from.
  const press=async(button:Button,phase:string,cursor:number):Promise<GameStateSnapshot>=>{
   if(presses.length>=MAX_PRESSES)throw new Stop(`${pressed()} ${String(MAX_PRESSES)} presses is the most one battle_action makes; inspect the new state.`);
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   const result=await ports.press(id,{buttons:[button]},signal,before=>{
    // readyInput is undefined with two inputs ready, so such a state never passes.
    const now=before===undefined?undefined:readyInput(before);
    if(now?.battler!==battler||now.phase!==phase||(phase==="action"?now.action_cursor:now.move_cursor)!==cursor)throw new Stop(`${pressed()} the battle input changed before the press, so no button was sent; inspect the new state.`);
   });
   presses.push(button);
   return stateOf(result);
  };
  let committed:string,waits=0,backed=false;
  try{
   for(;;){
    const input=readyInput(s);
    if(input===undefined||input.battler!==battler){
     // Only between menus (after A on FIGHT or B out of the move menu) does the call wait for the next input frame;
     // never with two inputs ready.
     const between=presses.at(-1)==="B"||presses.at(-1)==="A";
     if(between&&readyInputs(s).length===0&&s.in_battle&&ports.wait!==undefined&&waits<MAX_WAITS&&s.battle?.text_phase==="busy"){waits++;s=(await ports.wait(signal)).state;continue;}
     throw new Stop(`${pressed()} ${describeBattle(s)}; inspect the new state.`);
    }
    if(input.phase==="action"){
     const target=ACTIONS.indexOf(action),cursor=input.action_cursor;
     if(cursor===null)throw new Stop(`${pressed()} the battle menu cursor could not be read; inspect the new state.`);
     const step=actionButton(cursor,target);
     if(step===null){
      s=await press("A","action",cursor);
      if(action!=="fight"||plan.slot===null){committed=LABELS[action];break;}
      continue;
     }
     s=await press(step,"action",cursor);
     const after=readyInput(s);
     if(after?.phase!=="action"||after.action_cursor!==(step==="LEFT"||step==="RIGHT"?cursor^1:cursor^2))throw new Stop(`${pressed()} ${after?.phase==="action"?`the highlight stayed on ${after.selected??"an unreadable option"}`:describeBattle(s)}; inspect the new state.`);
     continue;
    }
    if(input.phase==="move"){
     const cursor=input.move_cursor;
     if(cursor===null)throw new Stop(`${pressed()} the move menu cursor could not be read; inspect the new state.`);
     if(action!=="fight"||plan.slot===null){
      if(backed)throw new Stop(`${pressed()} ${describeBattle(s)}; inspect the new state.`);
      backed=true;s=await press("B","move",cursor);continue;
     }
     const shown=plan.mon.moves[cursor];
     if(shown===undefined||input.selected_move_id!==shown.move_id)throw new Stop(`${pressed()} the move menu does not show ${plan.mon.species}'s moves in order; inspect the new state.`);
     const count=known(plan.mon).length;
     const step=moveButton(cursor,plan.slot,count);
     if(step===null){
      if(cursor!==plan.slot)throw new Stop(`${pressed()} the game does not move the highlight to ${plan.name??""}; inspect the new state.`);
      s=await press("A","move",cursor);committed=`${LABELS.fight}, then ${plan.name??""}`;break;
     }
     s=await press(step,"move",cursor);
     const after=readyInput(s);
     if(after?.phase!=="move"||after.move_cursor!==(step==="LEFT"||step==="RIGHT"?cursor^1:cursor^2))throw new Stop(`${pressed()} ${after?.phase==="move"?`the highlight stayed on ${after.selected??"an unreadable move"}`:describeBattle(s)}; inspect the new state.`);
     continue;
    }
    throw new Stop(`${pressed()} ${describeBattle(s)}; inspect the new state.`);
   }
  }catch(error){
   if(error instanceof Stop)return finish(error.message,false);
   throw error;
  }
  const allEmpty=action==="fight"&&plan.slot===null;
  const choice=allEmpty?`${LABELS.fight} (every move has 0 PP; the game picks what ${plan.mon.species} does)`:committed;
  const screen=s.in_battle&&s.battle?.text_phase==="screen"?(action==="bag"?"; choosing an item there is up to you":action==="pokemon"?"; choosing a POKéMON there is up to you":""):"";
  return finish(`chose ${choice}; buttons pressed: ${presses.join(", ")}; ${describeBattle(s)}${screen}`,false);
 }};
}

// Built from the ordinary press and observe, like navigate_to, so each press keeps its recorder hooks and guards.
export function withBattleAction(tools:readonly AgentTool[],features:FeatureSet,state:StateSource,gate?:BattleActionPorts["gate"]):AgentTool[] {
 if(!features[BATTLE_ACTION_ID])return [...tools];
 const press=tools.find(t=>t.name==="press"),observe=tools.find(t=>t.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press))throw new Error("battle_action requires the ordinary game tools");
 return [...tools,battleActionTool({
  read:signal=>state.read(signal),
  press:(id,params,signal,check)=>press.executeChecked(id,params,check,signal),
  observe:(id,signal)=>observe.execute(id,{},signal),
  ...(state.battleWait===undefined?{}:{wait:(signal?:AbortSignal)=>state.battleWait?.(signal)??Promise.reject(new Error("battle wait unavailable"))}),
  ...(gate===undefined?{}:{gate}),
 })];
}
