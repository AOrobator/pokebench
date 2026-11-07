import {EXTENDED_PROGRESS_NAMES,OPTIONAL_PROGRESS_NAMES} from "./story-progress.js";
import {battleOnScreen} from "./battle-context.js";
import {ProgressAwareCycles} from "./progress-aware-cycles.js";
import {roomKey,roomOf} from "./dialogue-log.js";
import {BattleOutcomes} from "./battle-outcomes.js";
import {LEADER_CLASS} from "./gym-readiness.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {LoopDetector} from "./loop-detection.js";
import {interfaceOf,type Stall} from "./loop-supervisor.js";
import type {StoryCharacterGate} from "./stall-gate.js";

// A pair of maps briefs on this many round trips between them, then again every as many more.
export const STALL_ROUND_TRIPS=2;
// Active play (operator pauses excluded) with no new milestone before each briefing.
export const STALL_DROUGHT_MS=5*60_000;
// Calls in one owned interface (a naming editor, a menu) before a dwell briefing, then again every as many more.
// Evidence (runs 2026-10-13..16, 133 runs, 23 naming episodes): every naming episode that ended normally took at
// most 25 calls (player names: median 7; nicknames 3 and 19); stuck ones took 48, 79, 97 and 153 calls.
export const INTERFACE_DWELL_CALLS=30;
// turn-drought-clock-v1: model actions (tool results) with no progress before each drought briefing, then again every as many more.
// Evidence (8 recent 2h runs, measured 2026-10-22): Qwen made 25-30 actions per 5 minutes of play, GLM 5-8, so the
// 5-minute wall clock briefed GLM every 5-8 actions; 30 actions is about Qwen's 5 minutes on any model.
export const STALL_DROUGHT_ACTIONS=30;
// open-milestone-stall-v1: actions between briefings while the last GYM LEADER battle this run is still a loss.
export const OPEN_MILESTONE_ACTIONS=30;

// first-visit-cycle-credit-v1: tool results after a first entry that map-cycle and drought briefings wait.
export const FIRST_VISIT_HOLD_CALLS=10;
const FIRST_VISIT_NOT_SENT="Not sent (first-visit-cycle-credit-v1):";

type Member=State["party"][number];
// Game words only: species, level and the EXP the readout printed for it.
function partyFacts(party:readonly Member[]):string {
 return party.flatMap(p=>p.is_egg===true||p.species==null?[]:[`${p.species} Lv${p.level==null?"?":String(p.level)}${p.experience==null?"":`, EXP. POINTS ${String(p.experience)}`}`]).join("; ")||"unknown";
}
// open-milestone-stall-v1 and drought-progress-credit-v2: the last GYM LEADER battle, and the party the readout showed
// when it started. Identities are the ones the readout carried, so a POKéMON caught after it is not part of it.
interface OpenMilestone {readonly id:number;readonly name:string|null;readonly place:string;readonly turn:number;readonly seq:number;readonly party:readonly Member[];readonly identities:ReadonlySet<string>}

// drought-battle-heal-hold-v1: a heal trip a heal warning asked for holds drought briefings for at most this many tool results.
export const HEAL_HOLD_CALLS=48;
const HEAL_WARNINGS=new Set(["heal_first_line","story_battle_warning","heal_before_trainers_warning","gym_heal_warning"]);

type State=Extract<RunEvent,{type:"state";started:boolean}>;
const fullParty=(s:State):boolean=>s.party.length>0&&s.party.every(p=>p.hp!=null&&p.max_hp!=null&&p.max_hp>0&&p.hp===p.max_hp);
interface Dwell {readonly key:string;readonly name:string;readonly firstSeq:number;calls:number;briefed:number}

// lastSeq: the state event of this pair's own latest move (its note's evidence); consecutive: no other pair's move came between.
interface Pair {readonly from:string;readonly to:string;moves:number;briefed:number;lastSeq:number;consecutive:boolean}
// entering: the call that made the first entry has not returned, and its own result is not one of the held calls.
interface FirstVisit {readonly name:string;calls:number;entering:boolean}
// owner: the pair or drought clock this note counted, so a later cycle or clock at the same level is a different note.
interface HeldNote {readonly kind:"map_cycle"|"milestone_drought";readonly owner:Pair|number;readonly level:number;readonly what:string;readonly due:()=>boolean}

// stall-briefing-v1: watches for stalls the loop guard cannot see and hands the loop guard a supervisor note.
// Map changes and milestones since the last new milestone; checked after each tool result, so the facts are current.
export class StallBriefing {
 private readonly progressCycles:ProgressAwareCycles|null;
 private room:{key:string;name:string}|null=null;
 private readonly pairs=new Map<string,Pair>();
 private readonly campaignSeen=new Set<string>();
 private progressAt=0;
 private progressSeq:number|null=null;
 private droughts=0;
 // turn-drought-clock-v1: tool results since the clock last restarted, and the seq that restarted it.
 private actions=0;
 private clockSeq:number|null=null;
 // turn-drought-clock-v1: each party member's last level the game showed, trainers seen not defeated, and whether
 // the party was last seen below full HP.
 private readonly levels=new Map<string,number>();
 private readonly unbeaten=new Set<number>();
 private hurt:string|null=null;
 // turn-drought-clock-v1: a state was seen since the last tool result, so the next result is that state's action.
 private stateSinceResult=false;
 private skip=false;
 private last:State|null=null;
 // open-milestone-stall-v1 / drought-progress-credit-v2: the last GYM LEADER battle, whether it is still a loss, and the
 // action count since (banked, not restarted, while a hold keeps a due note back).
 private readonly outcomes:BattleOutcomes;
 private attempt:OpenMilestone|null=null;
 private openLoss:OpenMilestone|null=null;
 private openActions=0;
 private openBriefed=0;
 private dwell:Dwell|null=null;
 // map-cycle-recovery-v1: the guard's map-cycle window this briefing last counted map pairs in.
 private cycleWindow=0;
 // first-visit-cycle-credit-v1: every map this run has been on, the hold in force and the notes it kept back.
 private readonly visited=new Set<string>();
 private firstVisit:FirstVisit|null=null;
 private heldNotes:HeldNote[]=[];
 private droughtClock=0;
 constructor(
  private readonly features:FeatureSet,
  private readonly active:()=>number,
  private readonly detector:Pick<LoopDetector,"stall">&Partial<Pick<LoopDetector,"mapCycleWindow">>,
  private readonly text:(stall:Stall,calls:number)=>string,
  // story-character-stall-gate-v1: holds a due map_cycle or milestone_drought briefing.
  private readonly gate:Pick<StoryCharacterGate,"holds"|"held">|null=null,
  // positive-supervisor-v1: a retired briefing is still recorded, as a diagnostic, with the text it would have sent.
  private readonly retiredNote:((kind:"map_cycle"|"milestone_drought",text:string,evidence:readonly number[])=>void)|null=null,
  private readonly suppressed:((text:string,evidence:readonly number[])=>void)|null=null,
  // drought-battle-heal-hold-v1: a due drought briefing held during a battle or a heal trip, recorded with the text it would have sent.
  private readonly heldDrought:((text:string,evidence:readonly number[])=>void)|null=null,
 ){this.progressCycles=features["progress-aware-cycles-v1"]?new ProgressAwareCycles():null;this.outcomes=new BattleOutcomes(features);}

 // drought-battle-heal-hold-v1: the open heal trip (from the warning's seq), the hold in force, the drought level already recorded as held.
 private healTrip:{readonly seq:number;calls:number}|null=null;
 private holding:"battle"|"trainer"|"heal"|null=null;
 private heldLevel=0;
 private hold():"battle"|"trainer"|"heal"|null {
  const s=this.last;
  const battle=s!==null&&battleOnScreen(s,this.features["drought-progress-facts-v1"]||this.features["owned-battle-context-v1"]);
  if(this.features["drought-progress-facts-v1"]&&battle)return "battle";
  if(!this.features["drought-battle-heal-hold-v1"])return null;
  if(battle)return "battle";
  // An unbeaten trainer's sight script holds the field before the battle starts (trainer_opponent is set, not defeated).
  if(s?.field_controls_locked===true&&s.trainer_opponent?.defeated===false&&!s.trainer_opponent.battle_active)return "trainer";
  return this.healTrip!==null?"heal":null;
 }
 // When a battle or heal trip ends, the drought clock starts again from here.
 private settleHold(seq:number):void {
  const now=this.hold();
  // Only a hold that kept a due drought briefing back restarts the clock; a short battle before one was due changes nothing.
  if(this.holding!==null&&now===null&&this.heldLevel>0)this.restart(seq);
  this.holding=now;
 }
 // turn-drought-clock-v1: the result of the action that made the progress is not counted (stateSinceResult).
 private restart(seq:number):void {this.droughtClock++;this.progressAt=this.active();this.actions=0;this.skip=this.stateSinceResult;this.clockSeq=seq;this.droughts=0;this.heldLevel=0;}
 // turn-drought-clock-v1 counts actions; positive-supervisor-v1 keeps its retired wall-clock schedule.
 private turnClock():boolean {return this.features["turn-drought-clock-v1"]&&!this.features["positive-supervisor-v1"];}
 // turn-drought-clock-v1: progress the game shows besides a story milestone: a party member's level going up (same
 // POKéMON, a higher level), a trainer battle won (a trainer shown not defeated, then defeated: pokeemerald sets the
 // trainer flag only on a win) and the same party reaching full HP after being below full. Only identified POKéMON
 // count; a party with any member the readout cannot identify or whose HP it cannot read changes nothing.
 private progressed(s:State):boolean {
  let up=false;
  for(const p of s.party){
   if(p.is_egg===true||p.identity==null||p.level==null||p.level<1)continue;
   const before=this.levels.get(p.identity);
   // drought-progress-credit-v2: while the last GYM LEADER battle is still a loss, only a member that battle saw counts
   // as progress; a POKéMON obtained after the loss can level without restarting the clock.
   if(before!==undefined&&p.level>before&&this.credited(p.identity))up=true;
   this.levels.set(p.identity,p.level);
  }
  const o=s.trainer_opponent;
  const won=o!=null&&(o.defeated?this.unbeaten.delete(o.trainer_id):(this.unbeaten.add(o.trainer_id),false));
  const members=s.party.filter(p=>p.is_egg!==true);
  const known=members.flatMap(p=>p.identity==null||p.hp==null||p.max_hp==null||p.max_hp<=0?[]:[{identity:p.identity,full:p.hp===p.max_hp}]);
  if(known.length===0||known.length<members.length)return up||won;
  const party=known.map(p=>p.identity).sort().join("\n"),full=known.every(p=>p.full);
  // A heal is the same members, below full before and all full now (a whiteout heals them too; a member put in the PC does not).
  const healed=full&&this.hurt===party;
  this.hurt=full?null:party;
  return up||won||healed;
 }

 // drought-progress-credit-v2: no open loss, or the switch off, credits every identified level-up as before.
 private credited(identity:string):boolean {
  return !this.features["drought-progress-credit-v2"]||this.openLoss===null||this.openLoss.identities.has(identity);
 }

 // open-milestone-stall-v1 / drought-progress-credit-v2: watch GYM LEADER battles from recorded state. An attempt starts
 // when the game says the opponent is a battle-active GYM LEADER; it opens when that battle ends lost or drew, and it is
 // retired by a later win against the same trainer id or by the game's own defeated flag for it.
 private trackOpenMilestone(event:RunEvent):void {
  if(!this.features["open-milestone-stall-v1"]&&!this.features["drought-progress-credit-v2"])return;
  this.outcomes.observe(event);
  if(event.type==="state"&&"started"in event){
   const o=event.trainer_opponent;
   if(o!=null&&o.battle_active){
    if(o.trainer_class===LEADER_CLASS)this.attempt={id:o.trainer_id,name:o.name??null,place:roomOf(event,this.features),turn:event.turn,seq:event.seq,party:[...event.party],identities:new Set(event.party.flatMap(m=>m.identity==null?[]:[m.identity]))};
    return;
   }
   if(this.openLoss!==null&&o!=null&&o.trainer_id===this.openLoss.id&&o.defeated)this.retireOpen();
   return;
  }
  const attempt=this.attempt;
  if(attempt===null)return;
  for(const battle of this.outcomes.battles()){
   if(battle.trainer?.id!==attempt.id||battle.seq<attempt.seq)continue;
   if(battle.outcome==="won"){if(this.openLoss!==null&&this.openLoss.id===attempt.id)this.retireOpen();continue;}
   if(battle.outcome!=="lost"&&battle.outcome!=="drew")continue;
   if(this.openLoss?.seq===battle.seq)continue;
   this.openLoss={...attempt,seq:battle.seq};
   this.openActions=0;this.openBriefed=0;
  }
 }
 private retireOpen():void {this.openLoss=null;this.openActions=0;this.openBriefed=0;}

 observe(event:RunEvent):void {
   this.trackOpenMilestone(event);
   if(event.type==="milestone"&&this.features["campaign-progress-clock-v1"]&&OPTIONAL_PROGRESS_NAMES.has(event.name))return;
   if(event.type==="milestone"&&EXTENDED_PROGRESS_NAMES.has(event.name)){
    const seen=this.campaignSeen.has(event.name);this.campaignSeen.add(event.name);
    if(this.features["campaign-progress-clock-v1"]&&event.origin==="observed"&&!seen){this.restart(event.seq);this.progressSeq=event.seq;}
    // badge-resets-cycles-v1: trips made before a new badge or gym win are not a stall after it.
    if(this.features["badge-resets-cycles-v1"]&&event.origin==="observed"&&!seen&&/_BADGE$|_GYM_COMPLETE$/.test(event.name))this.pairs.clear();
    return;
   }
  this.progressCycles?.observe(event);
  if(this.features["drought-battle-heal-hold-v1"]&&(HEAL_WARNINGS.has(event.type)||event.type==="story_battle_heal_gate"&&event.outcome==="refused")){this.healTrip??={seq:event.seq,calls:0};this.settleHold(event.seq);return;}
  if(event.type==="milestone"){
   if(event.name==="ROXANNE_FIRST_INTERACTION")return;
   if(event.origin==="present_at_start"||event.name==="GAME_RUNNING")return;
   // story-progress-clock-v1: a measurement-only story step (the rival battle starting, the send-off) is new progress here too.
   if(MEASUREMENT_ONLY_MILESTONES.has(event.name)&&!this.features["story-progress-clock-v1"]&&!this.features["progress-aware-cycles-v1"])return;
   this.restart(event.seq);this.progressSeq=event.seq;this.pairs.clear();this.dwell=null;
   return;
  }
  if(event.type==="state"&&"started"in event){
   this.stateSinceResult=true;
   this.last=event;
   if(event.started&&this.turnClock()&&this.progressed(event))this.restart(event.seq);
   if(this.healTrip!==null&&(event.in_battle||fullParty(event))){
    // A heal the warning asked for, done (full HP), is a step forward: the drought clock starts again from it.
    // positive-supervisor-v1 retires drought briefings, so nothing is held and its retired schedule stays as it was.
    // turn-drought-clock-v1: only progressed() credits a heal (the same identified, readable party at full HP), and it has
    // already restarted the clock above; a trip that ends any other way (another POKéMON, an unknown one) releases a held nudge.
    if(!event.in_battle&&!this.features["positive-supervisor-v1"]){if(this.turnClock())this.heldLevel=0;else this.restart(event.seq);}
    this.healTrip=null;
   }
   this.settleHold(event.seq);
   if(!event.started||event.location===null||event.map_id===null)return;
   const key=roomKey(event),name=roomOf(event,this.features);
   const first=this.features["first-visit-cycle-credit-v1"]&&this.room!==null&&!this.visited.has(key);
   if(this.features["first-visit-cycle-credit-v1"])this.visited.add(key);
   if(first)this.firstVisit={name,calls:0,entering:true};
   if(this.room!==null&&this.room.key!==key){
    const id=[this.room.key,key].sort().join("\n");
    const pair=this.pairs.get(id)??{from:this.room.name,to:name,moves:0,briefed:0,lastSeq:event.seq,consecutive:true};
    for(const [other,p] of this.pairs)if(other!==id)p.consecutive=false;
    pair.moves++;pair.lastSeq=event.seq;this.pairs.set(id,pair);
   }
   this.room={key,name};
   return;
  }
  if(event.type==="tool_result"){
   if(this.skip)this.skip=false;else this.actions++;
   this.stateSinceResult=false;
   if(this.openLoss!==null&&this.features["open-milestone-stall-v1"])this.openActions++;
   if(this.healTrip!==null&&++this.healTrip.calls>=HEAL_HOLD_CALLS){this.healTrip=null;this.settleHold(event.seq);}
   // Calls made inside an owned interface (it was open before and after them) count as dwelling there,
   // however its text churns; the call that opened it does not.
   if(event.state_seq!==undefined&&this.last?.seq===event.state_seq){
    const ui=interfaceOf(this.last,this.features["field-ownership-feedback-v1"]);
    if(ui===null)this.dwell=null;
    else if(this.dwell?.key===ui.key)this.dwell.calls++;
    else this.dwell={key:ui.key,name:ui.name,firstSeq:this.last.seq,calls:0,briefed:0};
   }
   this.countFirstVisit(event.seq);
   this.check(event.seq);
  }
 }

 private countFirstVisit(seq:number):void {
  const hold=this.firstVisit;
  if(hold===null)return;
  if(hold.entering){hold.entering=false;return;}
  if(++hold.calls<=FIRST_VISIT_HOLD_CALLS)return;
  this.firstVisit=null;
  for(const note of this.heldNotes)if(!note.due())this.recordHeld(note.kind,`${FIRST_VISIT_NOT_SENT} the held note is no longer due: ${note.what}.`,[seq]);
  this.heldNotes=[];
 }
 private recordHeld(kind:"map_cycle"|"milestone_drought",text:string,evidence:readonly number[]):void {
  (kind==="map_cycle"?this.suppressed:this.heldDrought)?.(text,evidence);
 }
 private holdForFirstVisit(hold:FirstVisit,note:HeldNote,evidence:readonly number[]):void {
  if(this.heldNotes.some(n=>n.kind===note.kind&&n.owner===note.owner&&n.level===note.level))return;
  this.heldNotes.push(note);
  this.recordHeld(note.kind,`${FIRST_VISIT_NOT_SENT} ${note.what}, but ${hold.name} was entered for the first time this run.`,evidence);
 }
 private droughtLevel():number {
  return this.turnClock()?Math.floor(this.actions/STALL_DROUGHT_ACTIONS):Math.floor((this.active()-this.progressAt)/STALL_DROUGHT_MS);
 }

 private check(seq:number):void {
  // positive-supervisor-v1: map back-and-forth and milestone-drought briefings are retired; interface dwell stays.
  const retired=this.features["positive-supervisor-v1"];
  // map-cycle-recovery-v1: a recovery briefing replaced a stop, so map-pair counting starts again from here.
  if(this.features["map-cycle-recovery-v1"]){const window=this.detector.mapCycleWindow?.()??0;if(window!==this.cycleWindow){this.cycleWindow=window;this.pairs.clear();}}
  const cycleHold=this.progressCycles?.hold()??null;
  if(cycleHold!==null){
   if(this.pairs.size>0)this.suppressed?.(`Map-cycle history retired (progress-aware-cycles-v1): ${cycleHold.reason}.`,[cycleHold.evidence[0]??seq,seq]);
   this.pairs.clear();
  }
  for(const [pairId,pair] of this.pairs){
   const level=Math.floor(pair.moves/(2*STALL_ROUND_TRIPS));
   if(level<=pair.briefed)continue;
   if(retired){
    this.retiredNote?.("map_cycle",`You have walked between ${pair.from} and ${pair.to} ${String(Math.floor(pair.moves/2))} times with no new story milestone.`,[pair.lastSeq,seq]);
    pair.briefed=level;continue;
   }
   if(this.firstVisit!==null){
    this.holdForFirstVisit(this.firstVisit,{kind:"map_cycle",owner:pair,level,what:`walked between ${pair.from} and ${pair.to} ${String(Math.floor(pair.moves/2))} times`,due:()=>this.pairs.get(pairId)===pair&&level>pair.briefed},[pair.lastSeq,seq]);
    continue;
   }
   const hold=this.gate?.holds()??null;
   if(hold!==null){this.gate?.held("map_cycle",level,[pair.from,pair.to].join("\n"),hold);return;}
   const stall:Stall={kind:"map_cycle",from:pair.from,to:pair.to,roundTrips:Math.floor(pair.moves/2),consecutive:pair.consecutive};
   if(this.detector.stall("map_cycle",calls=>this.text(stall,calls),[pair.lastSeq,seq]))pair.briefed=level;
   return;
  }
  const dwell=this.dwell;
  if(dwell!==null&&Math.floor(dwell.calls/INTERFACE_DWELL_CALLS)>dwell.briefed){
   const stall:Stall={kind:"interface_dwell",name:dwell.name,calls:dwell.calls};
   if(this.detector.stall("interface_dwell",calls=>this.text(stall,calls),[dwell.firstSeq,seq]))dwell.briefed=Math.floor(dwell.calls/INTERFACE_DWELL_CALLS);
   return;
  }
  // open-milestone-stall-v1: with a leader loss open, that loss is the stall, and this note replaces the drought briefing.
  // A due note is banked: while a battle, a trainer's sight script or a heal trip holds the field it waits, and it is sent
  // at the next free result without the count starting over.
  if(this.openLoss!==null&&this.features["open-milestone-stall-v1"]){
   const level=Math.floor(this.openActions/OPEN_MILESTONE_ACTIONS);
   if(level>this.openBriefed&&this.hold()===null&&(this.gate?.holds()??null)===null){
    const stall:Stall={kind:"open_milestone",trainer:this.openLoss.name??"the GYM LEADER",place:this.openLoss.place,turn:this.openLoss.turn,actions:this.openActions,before:partyFacts(this.openLoss.party),now:partyFacts(this.last?.party??[])};
    if(this.detector.stall("open_milestone",calls=>this.text(stall,calls),[this.openLoss.seq,seq]))this.openBriefed=level;
   }
   return;
  }
  // turn-drought-clock-v1: the level counts actions, and the briefing is sent even with milestone-drought-suppression-v1.
  const turns=this.turnClock();
  const level=this.droughtLevel();
  if(level<=this.droughts)return;
  const from=turns?this.clockSeq:this.progressSeq;
  if(retired||!turns&&this.features["milestone-drought-suppression-v1"]){
   this.retiredNote?.("milestone_drought",`No new story milestone for ${String(level*STALL_DROUGHT_MS/60_000)} minutes of play.`,[this.progressSeq??seq,seq]);
   this.droughts=level;return;
  }
  const holding=this.hold();
  if(holding!==null){
   if(level>this.heldLevel){
    this.heldLevel=level;
    const why=holding==="battle"?"a battle is on screen":holding==="trainer"?"a trainer battle is starting":`the party is on its way to heal after a heal warning${this.healTrip===null?"":` (#${String(this.healTrip.seq)})`}`;
    const what=this.features["drought-progress-facts-v1"]&&holding==="battle"?`the active drought clock reached ${turns?`${String(level*STALL_DROUGHT_ACTIONS)} actions`:`${String(level*STALL_DROUGHT_MS/60_000)} minutes of play`}`:turns?`no new story milestone, level-up, trainer win or full heal in the last ${String(level*STALL_DROUGHT_ACTIONS)} actions`:`no new story milestone for ${String(level*STALL_DROUGHT_MS/60_000)} minutes of play`;
    this.heldDrought?.(`Not sent (${this.features["drought-progress-facts-v1"]&&holding==="battle"?"drought-progress-facts-v1":"drought-battle-heal-hold-v1"}): ${what}, but ${why}.`,[from??seq,seq]);
   }
   return;
  }
  if(this.firstVisit!==null){
   const what=turns?`no new story milestone, level-up, trainer win or full heal in the last ${String(level*STALL_DROUGHT_ACTIONS)} actions`:`no new story milestone for ${String(level*STALL_DROUGHT_MS/60_000)} minutes of play`;
   const clock=this.droughtClock;
   this.holdForFirstVisit(this.firstVisit,{kind:"milestone_drought",owner:clock,level,what,due:()=>clock===this.droughtClock&&this.droughtLevel()>this.droughts},[from??seq,seq]);
   return;
  }
  const hold=this.gate?.holds()??null;
  if(hold!==null){this.gate?.held("milestone_drought",level,String(from??-1),hold);return;}
  const stall:Stall=turns?{kind:"action_drought",actions:level*STALL_DROUGHT_ACTIONS}:{kind:"milestone_drought",minutes:level*STALL_DROUGHT_MS/60_000};
  if(this.detector.stall("milestone_drought",calls=>this.text(stall,calls),[from??seq,seq]))this.droughts=level;
 }
}
