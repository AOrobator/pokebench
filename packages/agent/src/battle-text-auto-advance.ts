import {nonBattleOwner} from "./battle-context.js";
// battle-text-auto-advance-v1: inside a battle the harness advances the battle message window with B,
// one waiting page at a time, until the battle needs a decision or ends. Waits are held by the game
// server until the first emulated frame the battle needs input (env/pokebench_env/battle_text.py).
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import type {TextContent} from "@mariozechner/pi-ai";
import type {Static} from "typebox";
import type {BattleTextEntrySchema,BattleTextJournalSchema,BattleWaitSchema,BodyOf} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {Clock} from "./game-tools.js";

type Result=AgentToolResult<unknown>;
type Advance=Omit<BodyOf<"dialogue_auto_advance">,"type"|"turn">;
export type BattlePage=Advance["pages"][number];
export type AdvanceStop=Advance["stop"];
type Battle=NonNullable<GameStateSnapshot["battle"]>;
type Ui=NonNullable<GameStateSnapshot["active_ui"]>;
export type BattleTextEntry=Static<typeof BattleTextEntrySchema>;

export interface BattleTextSource {
 battleWait(signal?:AbortSignal):Promise<Static<typeof BattleWaitSchema>>;
 battleMessages(after:number,signal?:AbortSignal):Promise<Static<typeof BattleTextJournalSchema>>;
}
// Consecutive 600-frame waits with the battle still running on its own before the harness hands back.
export const BATTLE_BUSY_BOUNDS=3;
const BATTLE_START_SCREENS:ReadonlySet<string>=new Set(["battle_transition","field_battle_transition"]);

// The battle is running its own text or animation (or about to start), with no decision open.
export function battleEngaged(s:GameStateSnapshot,owned=false):boolean {
 if(owned&&nonBattleOwner(s)!==null)return false;
 if(!s.in_battle)return BATTLE_START_SCREENS.has(s.screen)||s.active_ui?.phase==="battle_transition";
 const phase=s.battle?.text_phase;
 return phase==="busy"||phase==="message_waiting"||(phase==null&&s.battle?.phase==="initializing");
}

const PROMPTS:Readonly<Record<NonNullable<Battle["prompt"]>["kind"],string>>={
 yes_no:"use the next POKéMON or switch",
 learn_move:"forget a move to make room for the new one",
 stop_learning_move:"stop learning the new move",
 nickname_caught:"give the caught POKéMON a nickname",
};
const INPUTS:Readonly<Record<string,string>>={
 action:"the battle action menu is ready (FIGHT, BAG, POKEMON, RUN)",
 safari_action:"the Safari action menu is ready (SAFARI BALL, POKEBLOCK, GO NEAR, RUN)",
 move:"the move menu is ready",
 target:"the target choice is ready",
 move_reorder:"the move reorder choice is ready",
 yes_no:"a battle YES/NO choice is ready",
};
function inputDetail(b:Battle):string {
 const ready=(b.player_inputs??[]).filter(i=>i.ready);
 if(ready.length===0)return "the battle is waiting for input";
 return ready.map(i=>`${INPUTS[i.phase]??`battle input ${i.phase} is ready`}${i.selected===null?"":`; highlighted ${i.selected}`}`).join("; ");
}
function promptDetail(prompt:Battle["prompt"]):string {
 if(prompt==null)return "a battle YES/NO question is open";
 return `a battle YES/NO question is open (${PROMPTS[prompt.kind]}); highlighted ${prompt.selected??"unknown"}; B answers NO`;
}
function menuDetail(ui:Ui):string {
 const options=ui.details?.["options"];
 const listed=Array.isArray(options)?`: options ${options.map(String).join(", ")}; highlighted ${ui.selected??"unknown"}`:ui.selected===null?"":`; highlighted ${ui.selected}`;
 return `menu ${ui.phase} is open${listed}`;
}

// levelup-box-v1: the level-up stats box page waiting for a button, as a listed page.
const LEVELUP_PAGES={1:"stat increases",2:"new totals"} as const;
export function levelUpPage(b:Battle|null|undefined):string|null {
 const box=b?.levelup_box;
 if(b?.text_phase!=="busy"||box==null||!box.waiting||box.page===null)return null;
 return `Level-up stats box, page ${String(box.page)} of 2 (${LEVELUP_PAGES[box.page]}): ${box.text??`the stats it shows could not be read (${box.diagnostic??"unknown"})`}`;
}

type Decision={kind:"press";levelUp?:string}|{kind:"wait"}|{kind:"over"}|{kind:"stop";stop:AdvanceStop;detail:string};
export function classifyBattle(s:GameStateSnapshot,levelupBox=false,owned=false):Decision {
 const owner=owned?nonBattleOwner(s):null;
 if(owner!==null)return {kind:"stop",stop:"menu",detail:`${owner} owns the current screen; battle text is not advanced`};
 // The game server holds a wait until CB2_Overworld with no fade, so any other screen here is the way back.
 if(!s.in_battle)return s.screen==="overworld"?{kind:"over"}:{kind:"wait"};
 const b=s.battle;
 const phase=b?.text_phase;
 if(phase==null){
  if(b?.phase==="initializing")return {kind:"wait"};
  return {kind:"stop",stop:"battle_unreadable",detail:`the battle state could not be read${b?.diagnostic==null?"":` (${b.diagnostic})`}; inspect before acting`};
 }
 if(phase==="prompt")return {kind:"stop",stop:"battle_prompt",detail:promptDetail(b?.prompt)};
 if(phase==="input")return {kind:"stop",stop:"battle_input",detail:b===undefined||b===null?"the battle is waiting for input":inputDetail(b)};
 if(phase==="message_waiting")return {kind:"press"};
 const levelUp=levelupBox?levelUpPage(b):null;
 if(levelUp!==null)return {kind:"press",levelUp};
 if(phase==="busy")return {kind:"wait"};
 if(s.naming!=null)return {kind:"stop",stop:"naming",detail:"the naming screen is open"};
 const ui=s.active_ui;
 if(ui!=null&&ui.ready===true)return {kind:"stop",stop:"menu",detail:menuDetail(ui)};
 return {kind:"stop",stop:"screen_change",detail:`the screen changed to ${s.screen}`};
}

// The pages one call shows, read from the server's per-frame journal after the cursor taken at the call's start.
export class BattleJournal {
 private problem:string|null=null;
 constructor(private readonly source:BattleTextSource,private cursor:number|null,private readonly errors:number){}
 static async open(source:BattleTextSource,known:{last:number},signal?:AbortSignal,includeExisting=false):Promise<BattleJournal> {
  const take=(j:Static<typeof BattleTextJournalSchema>,after=known.last)=>{known.last=j.last_id;return new BattleJournal(source,includeExisting?after:j.last_id,j.errors);};
  try{return take(await source.battleMessages(known.last,signal));}
  catch(error){
   signal?.throwIfAborted();
   // A restarted server numbers its journal from 1 again.
   if(known.last>0)try{return take(await source.battleMessages(0,signal),0);}catch(again){signal?.throwIfAborted();return new BattleJournal(source,null,0).fail(again);}
   return new BattleJournal(source,null,0).fail(error);
  }
 }
 private fail(error:unknown):this {this.problem??=error instanceof Error?error.message:String(error);return this;}
 async collect(known:{last:number},signal?:AbortSignal):Promise<BattleTextEntry[]> {
  if(this.cursor===null)return [];
  try{
   const j=await this.source.battleMessages(this.cursor,signal);
   if(j.first_id>this.cursor+1)this.fail(new Error(`${String(j.first_id-this.cursor-1)} battle pages left the server's journal before they were read`));
   if(j.errors>this.errors)this.fail(new Error(j.last_error??"the battle text journal recorded an error"));
   this.cursor=j.last_id;known.last=j.last_id;
   return j.entries;
  }catch(error){signal?.throwIfAborted();this.fail(error);return [];}
 }
 note():string|null {return this.problem===null?null:`Some battle pages may be missing from this list: ${this.problem}.`;}
}

export interface BattleOutcome {readonly state:GameStateSnapshot;readonly over:boolean;readonly stop:AdvanceStop;readonly detail:string;readonly presses:number;readonly extras:readonly TextContent[]}
export interface BattleRun {
 readonly source:BattleTextSource;
 readonly journal:BattleJournal;
 readonly known:{last:number};
 readonly clock:Clock;
 readonly limits:{readonly presses:number;readonly callMs:number};
 readonly began:number;
 readonly used:number;
 readonly press:(signal?:AbortSignal)=>Promise<Result>;
 readonly stateOf:(result:Result)=>GameStateSnapshot;
 readonly extraText:(result:Result)=>TextContent[];
 readonly addPages:(entries:readonly BattleTextEntry[],s:GameStateSnapshot)=>void;
 // levelup-box-v1: press through the level-up stats box and list its pages.
 readonly levelupBox?:boolean;
 readonly ownedBattleContext?:boolean;
 readonly addLevelUp?:(text:string,s:GameStateSnapshot)=>void;
}

export async function advanceBattle(start:GameStateSnapshot,run:BattleRun,signal?:AbortSignal):Promise<BattleOutcome> {
 let s=start,presses=0,bounds=0,listed:string|null=null;
 const extras:TextContent[]=[];
 const done=async(stop:AdvanceStop,detail:string,over=false):Promise<BattleOutcome>=>{run.addPages(await run.journal.collect(run.known,signal),s);return {state:s,over,stop,detail,presses,extras};};
 const failed=(error:unknown):Promise<BattleOutcome>=>{if(signal?.aborted===true)throw error;return done("error",`battle text auto-advance stopped: ${error instanceof Error?error.message:String(error)}`);};
 for(;;){
  const decision=classifyBattle(s,run.levelupBox===true,run.ownedBattleContext===true);
  if(decision.kind==="over")return done("field_free","the battle ended",true);
  if(decision.kind==="stop")return done(decision.stop,decision.detail);
  if(run.clock.now()-run.began>=run.limits.callMs)return done("time_cap",`AUTO-ADVANCE CAP: stopped after ${String(run.limits.callMs/1000)} s of automatic advancing; the battle is still running`);
  if(decision.kind==="press"){
   if(run.used+presses>=run.limits.presses)return done("press_cap",`AUTO-ADVANCE CAP: stopped after ${String(run.limits.presses)} automatic presses; a battle message is still waiting`);
   signal?.throwIfAborted();
   run.addPages(await run.journal.collect(run.known,signal),s);
   // A page the last press did not move on is listed once.
   if(decision.levelUp!==undefined&&decision.levelUp!==listed)run.addLevelUp?.(decision.levelUp,s);
   listed=decision.levelUp??null;
   try{const result=await run.press(signal);presses++;s=run.stateOf(result);extras.push(...run.extraText(result));}
   catch(error){return failed(error);}
   bounds=0;continue;
  }
  signal?.throwIfAborted();
  let waited:Static<typeof BattleWaitSchema>;
  try{waited=await run.source.battleWait(signal);}catch(error){return failed(error);}
  s=waited.state;
  if(waited.reason==="paused")return done("paused","the game is paused, so the battle did not advance; observe after the pause ends");
  // A box wait this agent does not press through (its switch off, or no readable box in the captured state) counts as busy.
  const busy=waited.reason==="bound"||(waited.reason==="levelup_box"&&(run.levelupBox!==true||levelUpPage(s.battle)===null));
  if(!busy){bounds=0;continue;}
  if(++bounds>=BATTLE_BUSY_BOUNDS)return done("battle_busy",`the battle kept running on its own for ${String(BATTLE_BUSY_BOUNDS)} waits of 600 emulated frames with no message waiting and no input open; inspect before acting`);
 }
}

// A level-up stats box page as a listed page, like a journal entry but with no message id.
export function levelUpListedPage(text:string,s:GameStateSnapshot,stateSeq:number):BattlePage {
 const turn=s.battle?.turn;
 return {state_seq:stateSeq,map:s.location,...(s.location_display===undefined?{}:{map_display:s.location_display}),map_id:s.map_id,position:null,speaker:null,speaker_source:null,text,...(turn!=null&&turn>=1&&turn<=256?{battle_turn:turn}:{})};
}

// A journal entry as a listed page: the map from the state it was read with; no speaker or position.
export function battlePage(entry:BattleTextEntry,s:GameStateSnapshot,stateSeq:number):BattlePage {
 return {state_seq:stateSeq,map:s.location,...(s.location_display===undefined?{}:{map_display:s.location_display}),map_id:s.map_id,position:null,speaker:null,speaker_source:null,text:entry.text,battle_turn:entry.battle_turn,battle_message_id:entry.id};
}
