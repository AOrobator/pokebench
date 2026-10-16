// briefing-battle-outcomes-v1 and battle-loss-recap-v1: the run's finished battles, folded from recorded
// state events. Facts only: where, when, against whom, the outcome the game wrote, and a whiteout.
import {roomKey,roomOf} from "./dialogue-log.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {STORY_CHARACTERS} from "./script-line-presence.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Snapshot=Pick<GameStateSnapshot,"started"|"screen"|"in_battle"|"location"|"location_display"|"map_id"|"battle"|"trainer_opponent"|"blackout_active">;
// pokeemerald include/constants/battle.h BATTLE_TYPE_TRAINER.
const BATTLE_TYPE_TRAINER=1<<3;
const STORY=new Set(STORY_CHARACTERS.map(c=>c.name));

interface Running {
 readonly trainerBattle:boolean;readonly key:string;readonly place:string;
 trainer:{readonly id:number;readonly name:string|null}|null;foe:string|null;turn:number;
 // The trainer's defeated flag as the battle showed it: a win is the flag turning set afterwards.
 unbeaten:boolean;
 outcome:string|null;blackout:boolean;
}
export interface Battle {
 readonly trainerBattle:boolean;
 readonly trainer:{readonly id:number;readonly name:string|null}|null;
 readonly foe:string|null;
 readonly place:string;
 readonly turn:number;
 readonly seq:number;
 // The outcome the game wrote (battle.outcome), a win read from the trainer's flag afterwards, or the
 // raw outcome for the others (ran, caught, ...); null when no recorded state showed one.
 readonly outcome:string|null;
 readonly whiteout:{readonly place:string;readonly turn:number}|null;
}

const inBattle=(s:Snapshot):boolean=>s.started&&(s.in_battle||s.screen==="battle");
const overworld=(s:Snapshot):boolean=>s.started&&!s.in_battle&&s.screen==="overworld"&&s.map_id!==null;
const counted=(e:Extract<RunEvent,{type:"milestone"}>):boolean=>e.kind==="story"&&e.origin!=="present_at_start"&&e.name!=="GAME_RUNNING"&&!MEASUREMENT_ONLY_MILESTONES.has(e.name);

export class BattleOutcomes {
 private running:Running|null=null;
 private readonly done:Battle[]=[];
 private storySeq=-1;
 constructor(private readonly features:FeatureSet){}

 observe(event:RunEvent):void {
  if(event.type==="milestone"){if(counted(event))this.storySeq=event.seq;return;}
  if(event.type!=="state"||!("started" in event))return;
  const finished=this.step(event,event.turn,event.seq);
  if(finished!==null){this.done.push(finished);this.running=null;}
 }

 // The battle a state ends (null when it ends none); with commit false nothing is kept, so a result can be
 // described from its own state before the recorder has written that state.
 private step(s:State|Snapshot,turn:number,seq:number,commit=true):Battle|null {
  if(inBattle(s)){
   if(!commit)return null;
   const b=s.battle??null;
   const run=this.running??{trainerBattle:((b?.battle_type??0)&BATTLE_TYPE_TRAINER)!==0,key:roomKey(s),place:roomOf(s,this.features),trainer:null,foe:null,turn,outcome:null,blackout:false,unbeaten:false};
   this.running=run;
   run.turn=turn;
   const opponent=s.trainer_opponent;
   if(opponent?.battle_active===true){
    if(run.trainer?.id!==opponent.trainer_id)run.unbeaten=!opponent.defeated;
    run.trainer={id:opponent.trainer_id,name:opponent.name};
   }
   run.foe??=b?.battlers?.find(x=>x.battler===1)?.species??null;
   if(b?.outcome!=null&&b.outcome!=="ongoing")run.outcome=b.outcome;
   if(s.blackout_active===true)run.blackout=true;
   return null;
  }
  const run=this.running;
  if(run===null)return null;
  if(s.blackout_active===true&&commit)run.blackout=true;
  if(!overworld(s))return null;
  const opponent=run.trainer===null?null:s.trainer_opponent;
  // pokeemerald CB2_EndTrainerBattle sets the trainer flag only when the player was not defeated.
  const blackout=run.blackout||s.blackout_active===true;
  const won=!blackout&&run.unbeaten&&opponent!=null&&opponent.trainer_id===run.trainer?.id&&opponent.defeated;
  const outcome=run.outcome!==null?run.outcome:blackout?"lost":won?"won":null;
  const whiteout=(outcome==="lost"||outcome==="drew")&&roomKey(s)!==run.key?{place:roomOf(s,this.features),turn:run.turn}:null;
  return {trainerBattle:run.trainerBattle,trainer:run.trainer,foe:run.foe,place:run.place,turn:run.turn,seq,outcome,whiteout};
 }

 battles():readonly Battle[] {return this.done;}

 // briefing-battle-outcomes-v1: two lines for the supervisor briefings.
 briefingLines():string {
  const story=this.done.findLast(b=>b.trainer?.name!=null&&STORY.has(b.trainer.name));
  const white=this.done.findLast(b=>b.whiteout!==null);
  return `- Latest battle against a story character: ${story===undefined?"none recorded in this run":this.describe(story)}\n- Latest whiteout: ${white?.whiteout==null?"none recorded in this run":`at turn ${String(white.whiteout.turn)}, after ${this.lossVerb(white)} ${opponentOf(white)} on ${white.place}; the game returned you to ${white.whiteout.place}`}\n`;
 }

 // battle-loss-recap-v1: the latest whiteout or lost trainer battle since the last story milestone, with
 // the trainer's defeated flag as `now` reads it. now is the result's own state, which may end the battle.
 recap(now:Snapshot|null):string|null {
  const pending=now===null||this.running===null?null:this.step(now,this.running.turn,Infinity,false);
  const all=pending===null?this.done:[...this.done,pending];
  const lost=all.findLast(b=>b.whiteout!==null||(b.trainerBattle&&(b.outcome==="lost"||b.outcome==="drew")));
  if(lost===undefined||lost.seq<=this.storySeq)return null;
  const head=`Battle recap: you ${lost.outcome==="drew"?"drew with":"lost to"} ${opponentOf(lost)} on ${lost.place} at turn ${String(lost.turn)}${lost.whiteout===null?"":` and whited out; the game returned you to ${lost.whiteout.place}`}.`;
  const t=lost.trainer,o=now?.trainer_opponent;
  if(t===null||o==null||o.trainer_id!==t.id)return head;
  return `${head} ${o.defeated?`The game now shows ${opponentOf(lost)} defeated.`:`The game shows ${opponentOf(lost)} has not been defeated.`}`;
 }

 private describe(b:Battle):string {
  const who=opponentOf(b),where=`on ${b.place} at turn ${String(b.turn)}`;
  if(b.outcome==="won")return `you won against ${who} ${where}`;
  if(b.outcome==="lost")return `you lost to ${who} ${where}`;
  if(b.outcome==="drew")return `you drew with ${who} ${where}`;
  return `you battled ${who} ${where}; ${b.outcome===null?"the game's outcome was not read":`the game's outcome: ${b.outcome.replaceAll("_"," ")}`}`;
 }
 private lossVerb(b:Battle):string {return b.outcome==="drew"?"a draw with":"losing to";}
}

function opponentOf(b:Battle):string {
 if(b.trainer!==null)return b.trainer.name===null?`trainer ${String(b.trainer.id)}`:`${b.trainer.name} (trainer ${String(b.trainer.id)})`;
 if(b.trainerBattle)return "a trainer";
 return b.foe===null?"a wild Pokémon":`a wild ${b.foe}`;
}
