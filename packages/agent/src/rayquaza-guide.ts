import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {battleOnScreen} from "./battle-context.js";
import {moveLearningChoice} from "./learn-move.js";
import {rqMovedSections} from "./play-config.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {RAYQUAZA_GUIDE_STEPS,RAYQUAZA_OUTDOOR_MAPS} from "./rayquaza-guide-data.js";
import type {RunRecorder} from "./recorder.js";

// rq-battle-explainer-v1: from 1,679 recorded fights, where models lost on preparation rather than move choice.
export const BATTLE_EXPLAINER="BATTLE: Run from needless wild battles. After a loss, change something before retrying: teach a TM, catch a second type, buy Potions or gain levels. TMs do nothing until taught. Use X items on a safe turn. Heal if the next hit could knock you out, unless you can finish first. Whiting out halves your money.";

// rq-no-grind-note-v1: aeb8 left the rival to grind after this note's earlier advice (turns 674-677, 754-771).
export const NO_GRIND_EXPLAINER=BATTLE_EXPLAINER.replace("teach a TM, catch a second type, buy Potions or gain levels.","teach a TM, change your moves or buy Potions. Never grind or hunt.");

// Abra knows only Teleport (ROM learnset), and a Poké Ball resolves before it moves.
export const ABRA_NOTE="ABRA: Wild Abra usually Teleports away on its first turn. Do not attack. Throw a Ball now.";

export const OPTIONS_NOTE="OPTIONS: Your settings are not done. On the field, press START, choose OPTION, set TEXT SPEED to FAST, BATTLE SCENE to OFF and BATTLE STYLE to SET, then press B.";

// Run 0952 spent 11 turns activating Petalburg Mart shelves and left without buying.
export const SHOP_NOTE="SHOP: Talk to the clerk behind the counter to buy or sell. The shelves are only decoration.";

// Taillow and Wingull are the wild Fly carriers on the route; a run with none cannot use the guide's Fly steps.
export const FLYER_NOTE="FLY: Nothing in your party can learn Fly. This one can: throw a Ball, Great Ball first.";

// Run 7442 waited 30+ turns on Dad's boat call; run 5f0f cleared it in about four with batched A presses.
export const CALL_NOTE="CALL: This call will not finish by itself. Press A several times in one press to advance it.";

// A whiteout moves Briney back to his house (EventScript_ResetMrBriney); run 7442 kept trying the empty boat.
export const BRINEY_NOTE="BRINEY: Mr. Briney is inside his house on Route 104. Talk to him there to sail. The boat itself does nothing.";

// rq-old-rival-line-v1: run aeb8's tactics, kept so the Route 110 trials can compare them with the current ones.
export const OLD_RIVAL_LINE="Rock hits Wingull and Slugma x2. Grovyle's Absorb hits Marshtomp x4: no boosts on it; use a Flying, Fire or Bug move if you have one, else attack.";
const CURRENT_RIVAL_LINE="If known, Mud Shot Slugma and Rock Tomb Grovyle and Wingull. X Attack and X Speed on Slugma if safe. Grovyle's Absorb hits Marshtomp x4.";

type MapId=readonly [number,number];
export interface GuideStep {readonly gate?:boolean;readonly after:string;readonly map:string|null;readonly note:string;readonly enter?:MapId;readonly at?:{readonly id:MapId;readonly x:number;readonly y:number};readonly to?:{readonly map:string;readonly id:MapId};readonly got?:string;readonly heldOk?:boolean;readonly needs?:readonly string[]}
export interface SituationNote {readonly text:string;readonly milestone:string}

const TELEPORT_MOVE=100;
const BATTLE_TYPE_TRAINER=8;
const ABRA_LINE=new Set(["ABRA","KADABRA","ALAKAZAM"]);
const WILD_FLYERS=new Set(["TAILLOW","WINGULL"]);
// Every species the ROM's TM/HM table lets learn HM02.
const FLY_CARRIERS=new Set(["CHARIZARD","PIDGEY","PIDGEOTTO","PIDGEOT","SPEAROW","FEAROW","FARFETCH'D","DODUO","DODRIO","AERODACTYL","ARTICUNO","ZAPDOS","MOLTRES","DRAGONITE","MEW","HOOTHOOT","NOCTOWL","CROBAT","TOGETIC","XATU","MURKROW","DELIBIRD","SKARMORY","LUGIA","HO-OH","TAILLOW","SWELLOW","WINGULL","PELIPPER","VIBRAVA","FLYGON","SWABLU","ALTARIA","TROPIUS","SALAMENCE","RAYQUAZA","LATIAS","LATIOS"]);
const OUTDOORS=new Set(RAYQUAZA_OUTDOOR_MAPS);
const SECTION_TRIGGERS:ReadonlyMap<string,(state:GameStateSnapshot)=>boolean>=new Map([
 ["PokéNav calls",s=>s.screen==="pokenav"],
 ["- choose_evolution",s=>s.screen==="evolution"||s.screen==="trade_evolution"],
 ["- learn_move",moveLearningChoice],
 ["Surf:",s=>s.surf_gate?.can_surf===true&&s.screen==="overworld"&&!s.in_battle],
]);
const mapKey=(id:MapId):string=>`${String(id[0])}/${String(id[1])}`;

// How far one milestone may move the guide. Wide enough for steps that never fired, narrow enough that an
// early visit, such as walking into Dewford Gym before Steven, cannot skip the story in between.
const REACH=8;

// A milestone seen live moves the guide up to REACH steps. One that arrives too early is remembered and
// counts only when the guide reaches the step right before it, so it can never skip unfinished story.
// A checkpoint start has real gaps, so while it loads, its milestones chain within reach. Afterwards one
// left beyond reach is just remembered.
export class GuidePosition {
 private furthest=0;
 private readonly earned=new Set<number>();
 private readonly atStart=new Set<number>();
 inBattle=false;
 private wildAbra=false;
 private wildFlyer=false;
 private hasBalls=false;
 private teleportReady=false;
 private map:MapId|null=null;
 private lastHeal:MapId|null=null;
 private arrivedOn=-1;
 private misses:{readonly after:string;readonly items:readonly string[]}[]=[];
 private gotCount:{readonly step:number;readonly count:number}|null=null;
 private bootStart=false;
 private optionsDone=false;
 private optionsReady=false;
 private inOptions=false;
 latest:(GameStateSnapshot&RunEvent)|null=null;
 constructor(private readonly steps:readonly GuideStep[],private readonly options:{readonly checkpointRecovery?:boolean}={}) {}
 observe(event:RunEvent):void {
  if(event.type==="state"&&"screen" in event){
   this.inBattle=battleOnScreen(event,true);
   const {party,battle}=event;
   this.wildAbra=this.inBattle&&battle!=null&&((battle.battle_type??0)&BATTLE_TYPE_TRAINER)===0&&(battle.battlers??[]).some(b=>b.position%2===1&&b.species==="ABRA")&&!party.some(p=>p.species!==null&&ABRA_LINE.has(p.species));
   if(event.resources?.bag!=null)this.hasBalls=event.resources.bag.some(entry=>entry.pocket==="poke_balls"&&entry.quantity>0);
   this.wildFlyer=this.hasBalls&&this.inBattle&&battle!=null&&((battle.battle_type??0)&BATTLE_TYPE_TRAINER)===0&&(battle.battlers??[]).some(b=>b.position%2===1&&WILD_FLYERS.has(b.species))&&!party.some(p=>p.species!==null&&FLY_CARRIERS.has(p.species));
   this.teleportReady=party.some(p=>(p.hp??0)>0&&(p.moves??[]).some(m=>m.move_id===TELEPORT_MOVE));
   this.map=event.map_id;
   if(event.heal_before_trainers!==undefined)this.lastHeal=event.heal_before_trainers.last_heal;
  }
  const reached=event.type==="milestone"?this.steps.findIndex(step=>step.after===event.name):event.type==="state"&&"map_id" in event&&event.map_id!=null?this.onMap(event.map_id,"position" in event?event.position:null):-1;
  // A place or tile counts only from the step before it, so an early visit moves nothing.
  if(reached>=0&&(event.type==="milestone"||reached===this.furthest+1||this.recovers(reached)))this.advance(event,reached);
  if(event.type==="state"&&"screen" in event)this.followOptions(event);
  // On a save load the bag snapshot can precede the milestone that exposes the held-item row.
  if(event.type==="milestone"&&this.steps[this.furthest+1]?.heldOk&&this.latest!==null)this.followItem(this.latest);
  // A press that changes a value and leaves in one batch ends with values no state showed.
  if(event.type==="button_press"&&this.inOptions&&event.buttons.some(button=>button==="LEFT"||button==="RIGHT"))this.optionsReady=false;
  const to=this.current().to;
  if(to!==undefined&&this.map!==null&&mapKey(to.id)===mapKey(this.map))this.arrivedOn=this.furthest;
 }
 // Leaving the menu saves it in every path (option_menu.c), so the last values seen are the saved ones.
 private followOptions(event:GameStateSnapshot&RunEvent):void {
  this.latest=event;
  this.followItem(event);
  if(!event.started)this.bootStart=true;
  // Past the menus without the options: the new game note still has to reach the Birch screens.
  if(!event.started&&(event.screen==="birch_speech"||event.screen==="naming"))this.reach("OPTIONS_SET",event);
  const opened=event.screen==="options_menu";
  if(opened){
   const details=event.active_ui?.details;
   if(!this.inOptions)this.reach("OPTIONS_OPENED",event);
   if(details?.["text_speed"]!==undefined)this.optionsReady=details["text_speed"]===2&&details["battle_scene_off"]===1&&details["battle_style"]===1;
  }else if(this.inOptions&&this.optionsReady){this.optionsDone=true;this.reach("OPTIONS_SET",event);}
  this.inOptions=opened;
 }
 private followItem(event:GameStateSnapshot&RunEvent):void {
  const step=this.furthest+1,next=this.steps[step],item=next?.got,bag=event.resources?.bag;
  if(item===undefined||bag==null)return;
  const count=bag.filter(entry=>entry.name===item).reduce((sum,entry)=>sum+entry.quantity,0);
  const gained=this.gotCount?.step===step&&count>this.gotCount.count;
  this.gotCount={step,count};
  if(gained||(next?.heldOk&&count>0))this.advance(event,step);
 }
 private reach(name:string,event:RunEvent):void {
  const index=this.steps.findIndex(step=>step.after===name);
  if(index>=0)this.advance(event,index);
 }
 private advance(event:RunEvent,reached:number):void {
  const from=this.furthest;
  this.earned.add(reached);
  const atStart=event.type==="milestone"&&event.origin==="present_at_start";
  if(atStart)this.atStart.add(reached);
  else if(reached>this.furthest&&reached<=this.reachEnd())this.furthest=reached;
  for(let next=this.next(atStart);next!==null;next=this.next(atStart))this.furthest=next;
  for(let step=from;step<this.furthest;step++)this.noteMisses(step);
 }
 private noteMisses(from:number):void {
  const step=this.steps[from],bag=this.latest?.resources?.bag;
  if(step?.needs===undefined||bag==null||(step.got!==undefined&&!this.earned.has(from)))return;
  const items=step.needs.filter(item=>!bag.some(entry=>entry.name?.replace(/\.$/,"")===item&&entry.quantity>0));
  if(items.length>0)this.misses.push({after:step.after,items});
 }
 // let it fail: a miss is logged for analysis and never told to the model.
 takeMisses():readonly {readonly after:string;readonly items:readonly string[]}[] {return this.misses.splice(0);}
 private next(atStart:boolean):number|null {
  if(this.earned.has(this.furthest+1))return this.furthest+1;
  if(atStart)for(let i=this.reachEnd();i>this.furthest;i--)if(this.atStart.has(i))return i;
  return null;
 }
 // rq-checkpoint-recovery-v1: reach counts story rows only, so adding place rows can never put a milestone out of it.
 private reachEnd():number {
  if(this.options.checkpointRecovery!==true)return this.furthest+REACH;
  let end=this.furthest,story=0;
  for(const step of this.steps.slice(this.furthest+1)){
   if(step.at===undefined&&step.enter===undefined&&step.got===undefined&&++story>REACH)break;
   end++;
  }
  return end;
 }
 // rq-checkpoint-recovery-v1: only checkpoints on one map, or map rows in a row, may be skipped, so a story step can never be.
 private recovers(reached:number):boolean {
  const target=this.steps[reached],id=target?.at?.id;
  if(this.options.checkpointRecovery!==true||target===undefined||(id===undefined&&target.enter===undefined)||reached-this.furthest>REACH)return false;
  // A gate row holds a required action, such as Mossdeep's Green switch, that a later landing does not prove.
  const skipped=this.steps.slice(this.furthest+1,reached);
  return reached>this.furthest&&skipped.every(step=>step.gate!==true&&(id===undefined?step.enter!==undefined:step.at!==undefined&&mapKey(step.at.id)===mapKey(id)));
 }
 private onMap(id:MapId,position:{readonly x:number;readonly y:number}|null):number {
  return this.steps.findIndex(step=>(step.enter?.[0]===id[0]&&step.enter[1]===id[1])||(step.at!==undefined&&position!==null&&step.at.id[0]===id[0]&&step.at.id[1]===id[1]&&step.at.x===position.x&&step.at.y===position.y));
 }
 // What only the live state can say: never a step, so nothing here sends the model looking for an Abra.
 situationNotes():readonly SituationNote[] {
  if(this.wildAbra)return [{text:ABRA_NOTE,milestone:"RQ_WILD_ABRA"}];
  if(this.wildFlyer)return [{text:FLYER_NOTE,milestone:"RQ_WILD_FLYER"}];
  if(this.latest?.active_ui?.phase.startsWith("field_match_call")===true)return [{text:CALL_NOTE,milestone:"RQ_CALL"}];
  if(this.bootStart&&!this.optionsDone&&this.latest?.screen==="overworld"&&this.steps.some(step=>step.after==="OPTIONS_SET"))return [{text:OPTIONS_NOTE,milestone:"RQ_OPTIONS"}];
  if(!this.inBattle&&/\b(MART|HERB SHOP)$/.test(this.latest?.location??""))return [{text:SHOP_NOTE,milestone:"RQ_SHOP"}];
  const after=(name:string):number=>this.steps.findIndex(step=>step.after===name);
  if(!this.inBattle&&after("DEWFORD_TOWN")>=0&&this.furthest>=after("DEWFORD_TOWN")&&this.furthest<after("MAUVILLE_CITY")&&/^(ROUTE104|PETALBURG|RUSTBORO)/.test(this.latest?.location??""))return [{text:BRINEY_NOTE,milestone:"RQ_BRINEY"}];
  const to=this.current().to;
  if(to===undefined||this.arrivedOn===this.furthest||this.inBattle||!this.teleportReady||this.map===null||this.lastHeal===null)return [];
  const home=mapKey(to.id),here=mapKey(this.map);
  if(mapKey(this.lastHeal)!==home||here===home||!OUTDOORS.has(here))return [];
  return [{text:`TELEPORT: Use Teleport from the party menu to return to your respawn point in ${to.map.replace(/([a-z])([A-Z])/g,"$1 $2")} instead of walking.`,milestone:"RQ_TELEPORT"}];
 }
 current():GuideStep {
  const step=this.steps[this.furthest];
  if(step===undefined)throw new Error("guide has no steps");
  return step;
 }
}

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type GuideRecorder=Pick<RunRecorder,"subscribe"|"recordMilestoneHint">&Partial<Pick<RunRecorder,"recordPurchaseMissed">>;

const laneSteps=(features:FeatureSet):readonly GuideStep[]=>features["rq-old-rival-line-v1"]?RAYQUAZA_GUIDE_STEPS.map(step=>step.after==="ROUTE_110"?{...step,note:step.note.replace(CURRENT_RIVAL_LINE,OLD_RIVAL_LINE)}:step):RAYQUAZA_GUIDE_STEPS;

// route-summary-v1: the guide row in force, for the tiles it names. Null without the guide or the summary.
export function guideRow(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):()=>{readonly map:string;readonly note:string}|null {
 if(!features["route-summary-v1"]||!features["rq-milestone-guide-v1"])return ()=>null;
 const guide=new GuidePosition(laneSteps(features),{checkpointRecovery:features["rq-checkpoint-recovery-v1"]});
 recorder.subscribe(event=>{guide.observe(event);},true,true);
 return ()=>{const step=guide.current();return step.map===null?null:{map:step.map,note:step.note};};
}

// rq-milestone-guide-v1: the current step stays the request's final message until the next step, so it
// is present on map entry and during a stall without separate triggers.
export function rayquazaGuideContext(features:FeatureSet,recorder:GuideRecorder,transform:Transform,steps:readonly GuideStep[]=laneSteps(features)):Transform {
 if(!features["rq-milestone-guide-v1"])return transform;
 const guide=new GuidePosition(steps,{checkpointRecovery:features["rq-checkpoint-recovery-v1"]});recorder.subscribe(event=>{guide.observe(event);},true,true);
 let recorded:string|null=null,told:readonly string[]=[],sectionsShown:readonly string[]=[];
 const sections=features["rq-slim-prompt-v1"]?rqMovedSections(features,null):new Map<string,string>();
 return async messages=>{
  const step=guide.current(),text=`GUIDE: ${step.note}`;
  if(step.after!==recorded){recorder.recordMilestoneHint({text,milestone:step.after});recorded=step.after;}
  for(const miss of guide.takeMisses())recorder.recordPurchaseMissed?.({step:miss.after,items:[...miss.items],money:guide.latest?.money??null});
  const situation=guide.situationNotes();
  for(const note of situation)if(!told.includes(note.text))recorder.recordMilestoneHint(note);
  told=situation.map(note=>note.text);
  const state=guide.latest,due=state===null?[]:[...sections.keys()].filter(prefix=>SECTION_TRIGGERS.get(prefix)?.(state)===true);
  for(const prefix of due)if(!sectionsShown.includes(prefix))recorder.recordMilestoneHint({text:`JIT section: ${prefix}`,milestone:"RQ_SECTION"});
  sectionsShown=due;
  const notes=[...due.flatMap(prefix=>sections.get(prefix)??[]),...(features["rq-battle-explainer-v1"]&&guide.inBattle?[features["rq-no-grind-note-v1"]?NO_GRIND_EXPLAINER:BATTLE_EXPLAINER]:[]),...told,text];
  return [...await transform(messages),...notes.map(content=>({role:"user" as const,content,timestamp:Date.now()}))];
 };
}
