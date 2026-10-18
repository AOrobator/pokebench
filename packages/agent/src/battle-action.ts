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
import {BlackoutCarry} from "./blackout-receipt.js";

export const BATTLE_ACTION_ID="battle-move-tool-v1";
const ACTIONS=["fight","bag","pokemon","run"] as const;
type Action=(typeof ACTIONS)[number];
// gText_BattleMenu (src/battle_message.c): "FIGHT BAG / POKéMON RUN".
const LABELS:Readonly<Record<Action,string>>={fight:"FIGHT",bag:"BAG",pokemon:"POKéMON",run:"RUN"};
const MENU="FIGHT, BAG, POKéMON, RUN";
// sText_NoPPLeft (src/battle_message.c), shown when a move with no PP is chosen.
export const NO_PP="There's no PP left for this move!";
// Longest path: B, two cursor moves and A, two cursor moves and A, three target moves and A.
const MAX_PRESSES=12;
const MAX_WAITS=3;

export const BattleActionArgs=Type.Object({
 action:Type.Enum(ACTIONS,{description:"fight, bag, pokemon or run: the battle menu option to choose."}),
 move:Type.Optional(Type.String({minLength:1,description:"With fight: the name of the move to use, as the battle shows it (for example EMBER)."})),
 target:Type.Optional(Type.String({minLength:1,description:"With fight in a double battle: the POKéMON the move hits, by its name as the battle shows it, or foe left / foe right / ally / self (left and right as on the screen). Needed for a move that hits one chosen POKéMON; ignored otherwise."})),
},{additionalProperties:false});
type Args=Static<typeof BattleActionArgs>;

export const BATTLE_ACTION_DESCRIPTION=`Choose a battle action in one call, only while a battle waits for your choice: action fight with move (a move name your active POKéMON knows), bag, pokemon or run. The harness reads the battle menu's cursor from the game's memory and presses the buttons one at a time (moving the highlight, then A), checking the cursor after each press; it stops and says why if anything is not as expected. It refuses without pressing when no battle is waiting for a choice, when the active POKéMON does not know the move, or when the move has no PP. bag and pokemon open the BAG or the POKéMON screen and stop there; choose the item or POKéMON with press. In a double battle the game asks for each of your POKéMON in turn: call battle_action once for each; the result names the POKéMON it chose for and the one asked next. A move that hits one chosen POKéMON needs target there, and the harness moves the target highlight the same checked way. YES/NO and Safari choices are not handled; use press.`;

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

// pret include/battle.h MOVE_TARGET_* and battle_controller_player.c HandleInputChooseMove: in a double battle the
// player picks a target only for MOVE_TARGET_SELECTED (0) or USER_OR_SELECTED (2) moves, and only while more than one
// other battler is present (CountAliveMonsInBattle(BATTLE_ALIVE_EXCEPT_ACTIVE) counts battlers without the absent flag).
const T_DEPENDS=1,T_USER_OR_SELECTED=2,T_RANDOM=4,T_BOTH=8,T_USER=16,T_FOES_AND_ALLY=32,T_OPPONENTS_FIELD=64;
const NO_CHOICE:readonly [number,string][]=[[T_USER,"acts on the user"],[T_BOTH,"hits both foes"],[T_FOES_AND_ALLY,"hits every other POKéMON"],[T_RANDOM,"hits a foe the game picks at random"],[T_DEPENDS,"has its target picked by the game"],[T_OPPONENTS_FIELD,"acts on the foes' side"]];
const CURSE=174,GHOST=7;
const isDouble=(b:Battle):boolean=>((b.battle_type??0)&1)!==0&&(b.battlers?.length??0)>2;
// pret sTargetIdentities: the target highlight moves forward (RIGHT/DOWN) through these positions.
const TARGET_ORDER=[0,2,3,1];
// pret battle_anim_mons.c sBattlerCoords, double battle: x 32, 200, 90, 152 for positions 0-3.
const SCREEN=["left","right","right","left"];
const label=(m:Mon,active:number):string=>`${m.species} (${m.position&1?"foe":m.battler===active?"self":"ally"}, screen ${SCREEN[m.position]??"?"})`;
const speciesOf=(b:Battle,battler:number):string|null=>b.battlers?.find(m=>m.battler===battler)?.species??null;

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
  // In a double battle, whose input it is.
  const who=isDouble(b)?speciesOf(b,input.battler):null,whose=who===null?"":` for ${who}`;
  if(input.phase==="action")return `the battle menu (${MENU}) is open${whose}${lit}`;
  if(input.phase==="move")return `the move menu is open${whose}${lit}`;
  return `${PHASES[input.phase]??`battle input ${input.phase} is open`}${whose}${lit}`;
 }
 if(b.text_phase==="message_waiting"){const page=b.message?.page??b.message?.text??null;return page===null?"a battle message is waiting for A or B":`a battle message is waiting for A or B: "${page.replace(/\s*\n\s*/g," ").trim()}"`;}
 if(b.text_phase==="prompt")return "a battle YES/NO question is open";
 if(b.text_phase==="screen")return `the game is showing another screen (${s.screen})`;
 return "the battle is running its own text or animation";
}

interface Aim {readonly battler:number;readonly label:string;readonly flags:number}
interface Plan {readonly input:Input;readonly mon:Mon;readonly slot:number|null;readonly name:string|null;readonly aim:Aim|null;readonly note:string|null;readonly double:boolean}

// The target a double-battle move needs, a note that a passed target is ignored, or a refusal.
function aimFor(b:Battle,mon:Mon,move:{readonly name:string|null;readonly move_id:number;readonly target?:number|null|undefined},wanted:string|undefined):string|{aim:Aim|null;note:string|null} {
 const name=move.name??"";
 if(!isDouble(b))return {aim:null,note:wanted===undefined?null:"target ignored: this is not a double battle"};
 if(move.target==null)return `which POKéMON ${name} can hit could not be read (no move target type in the state).`;
 // HandleInputChooseMove: CURSE targets the user unless the user is GHOST type.
 const flags=move.move_id===CURSE&&!mon.types.includes(GHOST)?T_USER:move.target;
 const fixed=NO_CHOICE.find(([bit])=>(flags&bit)!==0);
 if(fixed!==undefined)return {aim:null,note:wanted===undefined?null:`target ignored: ${name} ${fixed[1]}`};
 const battlers=b.battlers??[];
 const others=battlers.filter(m=>m.battler!==mon.battler&&!m.absent);
 if(!(flags&T_USER_OR_SELECTED)&&others.length<=1)return {aim:null,note:wanted===undefined?null:"target ignored: only one other POKéMON is in the battle, so the game picks it"};
 const choices=[...battlers].sort((x,y)=>x.battler-y.battler).filter(m=>!m.absent&&(m.battler!==mon.battler||(flags&T_USER_OR_SELECTED)!==0));
 const list=choices.map(m=>label(m,mon.battler)).join(", ");
 if(wanted===undefined)return `${name} needs a target in this double battle; name one of: ${list}.`;
 const said=wanted.trim().toUpperCase(),words=new Set(said.split(/[^A-Z0-9]+/).filter(w=>w!==""));
 const species=choices.filter(m=>norm(said).includes(norm(m.species)));
 const role=words.has("SELF")||words.has("USER")||words.has("MYSELF")?"self":words.has("ALLY")||words.has("PARTNER")?"ally":words.has("FOE")||words.has("ENEMY")||words.has("OPPONENT")?"foe":null;
 const side=words.has("LEFT")?"left":words.has("RIGHT")?"right":null;
 const matches=role===null&&side===null&&species.length===0?[]:(species.length>0?species:choices).filter(m=>(role===null||label(m,mon.battler).includes(`(${role},`))&&(side===null||SCREEN[m.position]===side));
 const shown=wanted.trim().toUpperCase();
 if(matches.length===0)return `no target matches ${shown}; name one of: ${list}.`;
 const [hit]=matches;
 if(matches.length>1||hit===undefined)return `more than one target matches ${shown}; name one of: ${list}.`;
 return {aim:{battler:hit.battler,label:label(hit,mon.battler),flags},note:null};
}
// The battler the target highlight moves to on RIGHT (pret HandleInputChooseTarget, forward through sTargetIdentities,
// skipping absent battlers and the user unless the move is USER_OR_SELECTED).
function nextTarget(b:Battle,from:number,active:number,flags:number):number|null {
 const battlers=b.battlers??[];
 const at=battlers.find(m=>m.battler===from);
 if(at===undefined)return null;
 let i=TARGET_ORDER.indexOf(at.position);
 for(let step=0;step<4;step++){
  i=(i+1)%4;
  const m=battlers.find(x=>x.position===TARGET_ORDER[i]);
  if(m===undefined||m.absent)continue;
  if(m.battler===active&&!(flags&T_USER_OR_SELECTED))continue;
  return m.battler;
 }
 return null;
}
// The refusal, or what the call will aim for; nothing is pressed here.
function validate(s:GameStateSnapshot,args:Args):string|Plan {
 if(!s.in_battle)return "no battle is in progress.";
 const b=s.battle;
 if(b==null||b.phase==="unavailable"||b.battlers==null)return `the battle state could not be read${b?.diagnostic==null?"":` (${b.diagnostic})`}.`;
 if(args.move!==undefined&&args.action!=="fight")return "move goes only with action fight.";
 if(args.target!==undefined&&args.action!=="fight")return "target goes only with action fight.";
 // Codex round 2: with two inputs ready the battle is waiting, for two choices at once; say only that.
 if(readyInputs(s).length>1)return `${SEVERAL}; battle_action chooses for one at a time, so use press.`;
 const input=readyInput(s);
 if(input===undefined)return `the battle is not waiting for a choice; ${describeBattle(s)}`;
 if(input.phase!=="action"&&input.phase!=="move")return `the battle is not waiting for a choice from the ${MENU} menu; ${describeBattle(s)}.`;
 const mon=b.battlers.find(m=>m.battler===input.battler);
 if(mon===undefined)return "the active POKéMON could not be read.";
 const double=isDouble(b);
 const bare={input,mon,slot:null,name:null,aim:null,double};
 if(args.action!=="fight")return {...bare,note:null};
 const moves=known(mon);
 const usable=moves.some(m=>m.pp>0);
 // Every move at 0 PP: the game skips the move menu and its target choice and picks what the POKéMON does.
 const struggle={...bare,note:args.target===undefined?null:`target ignored: the game picks what ${mon.species} does`};
 if(args.move===undefined)return usable?`name the move to use; ${mon.species}'s moves: ${moveList(mon)}.`:struggle;
 const wanted=norm(args.move);
 const move=moves.find(m=>norm(m.name??"")===wanted);
 if(move===undefined)return `${mon.species} does not know ${args.move.trim().toUpperCase()}; its moves: ${moveList(mon)}.`;
 if(!usable)return struggle;
 if(move.pp===0)return `${NO_PP} (${move.name??""} has 0/${String(move.max_pp)} PP)`;
 const aimed=aimFor(b,mon,move,args.target);
 if(typeof aimed==="string")return aimed;
 return {...bare,slot:move.slot,name:move.name,aim:aimed.aim,note:aimed.note};
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
  const blackout=new BlackoutCarry();
  let s=await ports.read(signal);
  const plan=validate(s,args);
  const finish=async(status:string,refused:boolean)=>{
   const seen=await ports.observe(id,signal);
   const state=blackout.preserve(blackout.remember(stateOf(seen)));
   const text=/[".!)]$/.test(status)?status:`${status}.`;
   const notices=blackout.missingNotices([text,...seen.content.flatMap(part=>part.type==="text"?[part.text]:[])]);
   return {content:[{type:"text" as const,text:`Battle action: ${text}`},...notices.map(notice=>({type:"text" as const,text:notice})),...seen.content],details:{state,battle_action:{action,move:typeof plan==="string"?null:plan.name,presses:[...presses],refused,status:text}}};
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
    if(now?.battler!==battler||now.phase!==phase||(phase==="action"?now.action_cursor:phase==="move"?now.move_cursor:now.target_cursor)!==cursor)throw new Stop(`${pressed()} the battle input changed before the press, so no button was sent; inspect the new state.`);
   });
   presses.push(button);
   return blackout.remember(stateOf(result));
  };
  let committed:string,waits=0,backed=false;
  const forWhom=plan.double?` for ${plan.mon.species}`:"";
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
      if(action!=="fight"||plan.slot===null){committed=`${LABELS[action]}${forWhom}`;break;}
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
      s=await press("A","move",cursor);
      if(plan.aim===null){committed=`${LABELS.fight}, then ${plan.name??""}${forWhom}`;break;}
      continue;
     }
     s=await press(step,"move",cursor);
     const after=readyInput(s);
     if(after?.phase!=="move"||after.move_cursor!==(step==="LEFT"||step==="RIGHT"?cursor^1:cursor^2))throw new Stop(`${pressed()} ${after?.phase==="move"?`the highlight stayed on ${after.selected??"an unreadable move"}`:describeBattle(s)}; inspect the new state.`);
     continue;
    }
    if(input.phase==="target"&&plan.aim!==null&&presses.at(-1)!==undefined){
     const cursor=input.target_cursor;
     const b=s.battle;
     if(cursor===null||b==null)throw new Stop(`${pressed()} the target cursor could not be read; inspect the new state.`);
     if(cursor===plan.aim.battler){s=await press("A","target",cursor);committed=`${LABELS.fight}, then ${plan.name??""}${forWhom}, at ${plan.aim.label}`;break;}
     const next=nextTarget(b,cursor,battler,plan.aim.flags);
     if(next===null)throw new Stop(`${pressed()} the game has no other target to move the highlight to; inspect the new state.`);
     s=await press("RIGHT","target",cursor);
     const after=readyInput(s);
     if(after?.phase!=="target"||after.target_cursor!==next)throw new Stop(`${pressed()} ${after?.phase==="target"?`the highlight stayed on ${after.selected??"an unreadable target"}`:describeBattle(s)}; inspect the new state.`);
     continue;
    }
    throw new Stop(`${pressed()} ${describeBattle(s)}; inspect the new state.`);
   }
  }catch(error){
   if(error instanceof Stop)return finish(error.message,false);
   throw error;
  }
  const allEmpty=action==="fight"&&plan.slot===null;
  const choice=allEmpty?`${LABELS.fight}${forWhom} (every move has 0 PP; the game picks what ${plan.mon.species} does)`:committed;
  const screen=s.in_battle&&s.battle?.text_phase==="screen"?(action==="bag"?"; choosing an item there is up to you":action==="pokemon"?"; choosing a POKéMON there is up to you":""):"";
  return finish(`chose ${choice}; buttons pressed: ${presses.join(", ")}; ${plan.note===null?"":`${plan.note}; `}${describeBattle(s)}${screen}`,false);
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
