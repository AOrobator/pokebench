// game-said-goals-v1: at a move-learning choice or the evolution decision, the battles the game has left
// open (lost and not yet won), with what the game showed and said about each: the POKéMON the trainer sent
// out and, on a gym map, the type lines said there. Only recorded game state and game text; no goal the
// game has not set, no route, no advice (the operator 2026-10-21).
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {BattleOutcomes,type Battle} from "./battle-outcomes.js";
import {moveLearningChoice,withAppendedBlock} from "./effectiveness-heard.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {GymReadiness,gymEvent,key,type MapKey} from "./gym-readiness.js";

type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"active_ui"|"battle">;
interface Trainer {readonly name:string|null;readonly map:MapKey|null}

export const GOALS_HEADER="Battles the game has left open (what it recorded and said; not an order or a route):";

export class GameSaidGoals {
 private readonly outcomes:BattleOutcomes;
 private readonly gym=new GymReadiness();
 private readonly trainers=new Map<number,Trainer>();
 constructor(features:FeatureSet){this.outcomes=new BattleOutcomes(features);}

 observe(event:RunEvent):void {
  this.outcomes.observe(event);
  const g=gymEvent(event);
  if(g!==null)this.gym.observe(g);
  if(event.type!=="state"||!("started" in event))return;
  const opponent=event.trainer_opponent;
  if(opponent?.battle_active!==true)return;
  const was=this.trainers.get(opponent.trainer_id);
  this.trainers.set(opponent.trainer_id,{name:opponent.name??was?.name??null,map:event.map_id===null?was?.map??null:key(event.map_id)});
 }

 // Each trainer whose latest battle this run was lost or drawn, in the order those battles ended.
 private open():Battle[] {
  const latest=new Map<number,Battle>();
  for(const b of this.outcomes.battles())if(b.trainerBattle&&b.trainer!==null)latest.set(b.trainer.id,b);
  return [...latest.values()].filter(b=>b.outcome==="lost"||b.outcome==="drew").sort((a,b)=>a.seq-b.seq);
 }

 block(state:Snapshot):string|null {
  if(!state.started||!(moveLearningChoice(state)||state.active_ui?.phase==="evolution_decision"))return null;
  const open=this.open();
  if(open.length===0)return null;
  const lines=open.map(b=>{
   const id=b.trainer?.id??-1;
   const t=this.trainers.get(id);
   const name=b.trainer?.name??t?.name??`trainer ${String(id)}`;
   const head=`- ${name} (trainer ${String(id)}): you ${b.outcome==="drew"?"drew with":"lost to"} ${name} on ${b.place} at turn ${String(b.turn)}, and the game has not recorded a win since.`;
   const map=t?.map??null;
   if(map===null||!this.gym.isLeaderMap(map))return b.foe===null?head:`${head} ${name} sent out ${b.foe}.`;
   const said=this.gym.saidOn(map);
   return `${head} ${this.gym.seenLine(map)}.${said.length===0?"":` Said on that map: ${said.map(text=>`"${text}"`).join(" ")}`}`;
  });
  return [GOALS_HEADER,...lines].join("\n");
 }
}

export function withGameSaidGoals(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!features["game-said-goals-v1"])return [...tools];
 const goals=new GameSaidGoals(features);
 recorder.subscribe(event=>{goals.observe(event);});
 return withAppendedBlock(tools,features,state=>goals.block(state));
}
