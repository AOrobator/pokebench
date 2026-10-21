// effectiveness-heard-v1: what the game printed right after each of the player's moves this run, by move and
// the foe it hit, from the battle pages the model was shown. Only the game's own words: pret/pokeemerald
// src/battle_message.c sText_AttackerUsedX ("{B_ATK_NAME_WITH_PREFIX} used\n{B_BUFF2}"), sText_SuperEffective,
// sText_NotVeryEffective and sText_ItDoesntAffect. Nothing is computed from a type chart and nothing advises.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {semanticWalk} from "./semantic-targets.js";

const SUPER="It's super effective!";
const NOT_VERY="It's not very effective…";
const NO_EFFECT=/^It doesn't affect .+…$/;
// The state events a page's state_seq may name; pages always name a recent one.
const STATE_MEMORY=512;

type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"active_ui"|"battle">;
interface Sides {readonly player:readonly string[];readonly foes:readonly string[]}
interface Used {readonly battleTurn:number;readonly move:string;readonly foe:string}
interface Heard {readonly move:string;readonly foe:string;readonly said:string;readonly turns:number[]}

const oneLine=(text:string)=>text.replace(/\s*\n\s*/g," ").trim();

// A screen where the model chooses a move: a ready battle decision, or a move-learning choice.
export function moveLearningChoice(state:Snapshot):boolean {
 const phase=state.active_ui?.phase;
 if(phase==="evolution_move_confirmation"||phase==="summary_move_forget")return true;
 const prompt=state.battle?.prompt;
 return prompt!=null&&prompt.ready&&(prompt.kind==="learn_move"||prompt.kind==="stop_learning_move");
}
export function battleDecision(state:Snapshot):boolean {
 return state.started&&state.in_battle&&state.battle?.ready===true;
}

export class EffectivenessHeard {
 private readonly sides=new Map<number,Sides>();
 private readonly heard=new Map<string,Heard>();

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){
   const battlers=event.battle?.battlers??[];
   // The player's POKéMON go by their nicknames in battle text; the party has them by slot.
   const player=battlers.filter(b=>b.position%2===0).flatMap(b=>[b.species,event.party[b.party_slot]?.nickname??b.species]);
   this.sides.set(event.seq,{player,foes:battlers.filter(b=>b.position%2===1).map(b=>b.species)});
   if(this.sides.size>STATE_MEMORY){const first=this.sides.keys().next().value;if(first!==undefined)this.sides.delete(first);}
   return;
  }
  if(event.type!=="dialogue_auto_advance")return;
  let used:Used|null=null;
  for(const page of event.pages){
   if(page.battle_turn===undefined||page.battle_message_id===undefined){used=null;continue;}
   const text=oneLine(page.text);
   const move=/^(.+?) used (.+)!$/.exec(text);
   if(move!==null){
    const sides=page.state_seq===null?undefined:this.sides.get(page.state_seq);
    const attacker=move[1]??"",name=move[2]??"";
    // One foe on the field (a single battle) and the user is the player's own POKéMON.
    used=sides!==undefined&&sides.foes.length===1&&sides.player.includes(attacker)?{battleTurn:page.battle_turn,move:name,foe:sides.foes[0]??""}:null;
    continue;
   }
   if(used===null||used.battleTurn!==page.battle_turn)continue;
   if(text!==SUPER&&text!==NOT_VERY&&!NO_EFFECT.test(text))continue;
   const key=JSON.stringify([used.move,used.foe,text]);
   const entry=this.heard.get(key)??{move:used.move,foe:used.foe,said:text,turns:[]};
   if(!entry.turns.includes(event.turn))entry.turns.push(event.turn);
   this.heard.set(key,entry);
   used=null;
  }
 }

 block(state:Snapshot):string|null {
  if(this.heard.size===0||!(battleDecision(state)||moveLearningChoice(state)))return null;
  const lines=[...this.heard.values()].map(h=>`- ${h.move} on ${h.foe}: "${h.said}" (turn${h.turns.length===1?"":"s"} ${h.turns.join(", ")})`);
  return ["What the game said right after your moves this run (its own words):",...lines].join("\n");
 }
}

function stateOf(result:AgentToolResult<unknown>):Snapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))return undefined;
 const state:unknown=details.state;
 return typeof state==="object"&&state!==null&&"started" in state?state as Snapshot:undefined;
}

const GAME=new Set(["observe","press","navigate_to","battle_action","choose_evolution"]);

// Appends a text part after the readout. Wraps every tool that returns game state.
export function withAppendedBlock(tools:readonly AgentTool[],features:FeatureSet,block:(state:Snapshot)=>string|null):AgentTool[] {
 const annotate=<T>(result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result);
  const text=state===undefined?null:block(state);
  return text===null?result:{...result,content:[...result.content,{type:"text",text}]};
 };
 return tools.map(tool=>{
  if(!GAME.has(tool.name)&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(...args)=>annotate(await tool.execute(...args));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}

export function withEffectivenessHeard(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!features["effectiveness-heard-v1"])return [...tools];
 const heard=new EffectivenessHeard();
 recorder.subscribe(event=>{heard.observe(event);});
 return withAppendedBlock(tools,features,state=>heard.block(state));
}
