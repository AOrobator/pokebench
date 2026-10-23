// briefing-battle-outcomes-v1 and battle-loss-recap-v1: the run's finished battles, folded from recorded
// state events. Facts only: where, when, against whom, the outcome the game wrote, and a whiteout.
import {roomKey,roomOf} from "./dialogue-log.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {STORY_CHARACTERS} from "./script-line-presence.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Snapshot=Pick<GameStateSnapshot,"started"|"screen"|"in_battle"|"location"|"location_display"|"map_id"|"battle"|"trainer_opponent"|"blackout_active"|"party">;
// pokeemerald include/constants/battle.h BATTLE_TYPE_TRAINER.
const BATTLE_TYPE_TRAINER=1<<3;
const STORY=new Set(STORY_CHARACTERS.map(c=>c.name));

interface Running {
 trainerBattle:boolean;readonly key:string;readonly place:string;
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
 readonly whiteout:{readonly place:string;readonly turn:number;readonly party:readonly PartyHp[]}|null;
}
// whiteout-healed-v1: a party Pokémon's HP as the first overworld state after a whiteout's warp read it.
interface PartyHp {readonly species:string|null;readonly hp:number|null;readonly max_hp:number|null}

const inBattle=(s:Snapshot):boolean=>s.started&&(s.in_battle||s.screen==="battle");
const overworld=(s:Snapshot):boolean=>s.started&&!s.in_battle&&s.screen==="overworld"&&s.map_id!==null;
const counted=(e:Extract<RunEvent,{type:"milestone"}>):boolean=>e.kind==="story"&&e.origin!=="present_at_start"&&e.name!=="GAME_RUNNING"&&!MEASUREMENT_ONLY_MILESTONES.has(e.name);

interface ObservedFoe {readonly battler:number;readonly slot:number;readonly species:string;readonly level:number;readonly fainted:boolean;readonly seq:number}
interface TrainerObservation {readonly id:number;readonly name:string|null;readonly foes:readonly ObservedFoe[]}
// Bounded correlation only; retained knowledge has at most six slots per encountered trainer.
const OBSERVATION_MEMORY=512;
const oneLine=(text:string):string=>text.replace(/\s+/g," ").trim();

export class BattleOutcomes {
 private running:Running|null=null;
 private readonly done:Battle[]=[];
 private storySeq=-1;
 private readonly observations=new Map<number,TrainerObservation>();
 private readonly deliveredFoes=new Map<number,Map<number,ObservedFoe>>();
 private readonly pendingFaints=new Map<string,{readonly tool:string;readonly pages:readonly {readonly observation:TrainerObservation;readonly text:string}[]}>();
 constructor(private readonly features:FeatureSet){}

 observe(event:RunEvent):void {
  if(this.features["trainer-observed-party-v1"])this.rememberDelivered(event);
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
   const run=this.running??{trainerBattle:false,key:roomKey(s),place:roomOf(s,this.features),trainer:null,foe:null,turn,outcome:null,blackout:false,unbeaten:false};
   this.running=run;
   run.turn=turn;
   // An initializing state can lack the battle type; a later state, or the opponent reading, settles it (review round 4).
   if(((b?.battle_type??0)&BATTLE_TYPE_TRAINER)!==0||s.trainer_opponent?.battle_active===true)run.trainerBattle=true;
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
  const whiteout=(outcome==="lost"||outcome==="drew")&&roomKey(s)!==run.key?{place:roomOf(s,this.features),turn:run.turn,party:this.features["whiteout-healed-v1"]?s.party.flatMap(m=>m.is_egg===true?[]:[{species:m.species,hp:m.hp,max_hp:m.max_hp}]):[]}:null;
  return {trainerBattle:run.trainerBattle,trainer:run.trainer,foe:run.foe,place:run.place,turn:run.turn,seq,outcome,whiteout};
 }

 // A state poll is only a candidate. Knowledge commits after matching delivery evidence.
 private rememberDelivered(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){
   const opponent=event.trainer_opponent,b=event.battle;
   const trainer=opponent?.battle_active===true?{id:opponent.trainer_id,name:opponent.name}:this.running?.trainer;
   // pret battle.h: MULTI and TWO_OPPONENTS need per-trainer ownership not exposed here.
   if(!inBattle(event)||trainer==null||b?.active!==true||((b.battle_type??0)&BATTLE_TYPE_TRAINER)===0||((b.battle_type??0)&((1<<6)|(1<<15)))!==0)return;
   const foes=(b.battlers??[]).filter(f=>f.position%2===1&&!f.absent&&f.party_slot>=0&&f.party_slot<6&&f.level>0&&f.species!=="").map(f=>({battler:f.battler,slot:f.party_slot,species:f.species,level:f.level,fainted:f.hp===0,seq:event.seq}));
   this.observations.set(event.seq,{id:trainer.id,name:trainer.name,foes});
   this.trim(this.observations);
   return;
  }
  if(event.type==="dialogue_auto_advance"){
   const previous=this.pendingFaints.get(event.tool_call_id);
   const pages=previous?.tool===event.tool?[...previous.pages]:[];
   for(const page of event.pages){
    const observation=page.state_seq===null?undefined:this.observations.get(page.state_seq);
    if(page.battle_message_id!==undefined&&observation!==undefined)pages.push({observation,text:oneLine(page.text)});
   }
   this.pendingFaints.set(event.tool_call_id,{tool:event.tool,pages:pages.slice(-OBSERVATION_MEMORY)});
   this.trim(this.pendingFaints);
   return;
  }
  if(event.type!=="tool_result"&&event.type!=="decision_input")return;
  if(event.type==="tool_result"){
   const pending=this.pendingFaints.get(event.id);
   this.pendingFaints.delete(event.id);
   if(event.is_error)return;
   if(pending?.tool===event.name){
    const delivered=oneLine(event.text);
    for(const page of pending.pages){
     if(!delivered.includes(page.text))continue;
     for(const foe of page.observation.foes){
      const known=this.deliveredFoes.get(page.observation.id)?.get(foe.slot);
      // sText_PkmnFainted: only update a species/level already delivered; never learn a
      // hidden level from the page's internal RAM state. The page itself establishes fainting.
      if(known?.species===foe.species&&known.seq<=foe.seq&&page.text===`Foe ${foe.species} fainted!`)this.keep(page.observation.id,{...known,fainted:true,seq:foe.seq});
     }
    }
   }
  }
  const observation=event.state_seq===undefined?undefined:this.observations.get(event.state_seq);
  if(observation===undefined)return;
  for(const foe of observation.foes){
   // Both the compact Foe line and expanded Battler line print this exact phrase.
   const label=`${foe.species} Lv${String(foe.level)} `;
   if(event.text.split("\n").some(line=>line.startsWith(`Foe ${label}`)||line.startsWith(`Battler ${String(foe.battler)} ${label}`)))this.keep(observation.id,foe);
  }
 }
 private trim<T>(map:Map<number|string,T>):void {
  if(map.size>OBSERVATION_MEMORY){const first=map.keys().next().value;if(first!==undefined)map.delete(first);}
 }
 private keep(id:number,foe:ObservedFoe):void {
  const known=this.deliveredFoes.get(id)??new Map<number,ObservedFoe>();
  if((known.get(foe.slot)?.seq??-1)<=foe.seq)known.set(foe.slot,foe);
  this.deliveredFoes.set(id,known);
 }
 private remembered(trainer:Battle["trainer"]):string|null {
  if(!this.features["trainer-observed-party-v1"]||trainer===null)return null;
  const foes=this.deliveredFoes.get(trainer.id);
  if(foes===undefined)return null;
  const who=trainer.name===null?`trainer ${String(trainer.id)}`:`${trainer.name} (trainer ${String(trainer.id)})`;
  const list=[...foes.values()].sort((a,b)=>a.slot-b.slot).map(f=>`${f.species} Lv${String(f.level)}${f.fainted?" (last observed fainted)":""}`).join(", ");
  return `Previously observed against ${who}: ${list}. Full party not established by these observations.`;
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
  const active=now!==null&&inBattle(now)?(now.trainer_opponent?.battle_active===true?{id:now.trainer_opponent.trainer_id,name:now.trainer_opponent.name}:this.running?.trainer??null):null;
  const memory=this.remembered(active??lost?.trainer??null);
  if(lost===undefined||lost.seq<=this.storySeq)return active===null?null:memory;
  const head=`Battle recap: you ${lost.outcome==="drew"?"drew with":"lost to"} ${opponentOf(lost)} on ${lost.place} at turn ${String(lost.turn)}${lost.whiteout===null?"":` and whited out; the game returned you to ${lost.whiteout.place}`}.`;
  const t=lost.trainer,o=now?.trainer_opponent;
  const line=t===null||o==null||o.trainer_id!==t.id?head:`${head} ${o.defeated?`The game now shows ${opponentOf(lost)} defeated.`:`The game shows ${opponentOf(lost)} has not been defeated.`}`;
  const recap=this.features["whiteout-healed-v1"]&&lost.whiteout!==null&&lost.whiteout.party.length>0?`${line} ${healedParty(lost.whiteout.party)}`:line;
  return memory===null?recap:`${recap} ${memory}`;
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

// whiteout-healed-v1: DoWhiteOut (src/overworld.c) runs HealPlayerParty() before the warp, so the state after it
// shows every Pokémon at max HP; anything else is said as the state showed it.
function healedParty(party:readonly PartyHp[]):string {
 const full=party.every(m=>m.hp!==null&&m.max_hp!==null&&m.hp===m.max_hp);
 const list=party.map(m=>`${m.species??"a Pokémon whose species was not read"} ${m.hp===null||m.max_hp===null?"HP not read":`${String(m.hp)}/${String(m.max_hp)} HP`}`).join(", ");
 return full?`Whiting out restored your whole party: ${list}.`:`After whiting out, the game state showed your party: ${list}.`;
}
