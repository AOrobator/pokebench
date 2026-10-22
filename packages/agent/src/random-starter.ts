// random-starter-v1: a data-collection switch, not a harness improvement (the operator 2026-10-22). At the starter bag the
// harness picks TREECKO or MUDKIP 50/50, presses to it, confirms it and hands control back.
// Cursor and confirmation semantics: pret starter_choose.c Task_StarterChoose/Task_HandleStarterChooseInput
// (LEFT decrements, RIGHT increments the selection; A opens the YES/NO box, YES accepts, B declines).
import {randomInt} from "node:crypto";
import type {Button} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";

export const RANDOM_STARTERS=["TREECKO","MUDKIP"] as const;
export type RandomStarter=(typeof RANDOM_STARTERS)[number];
const ORDER=["TREECKO","TORCHIC","MUDKIP"] as const;
export const RANDOM_STARTER_LIMITS={presses:12,waitMs:10_000,pollMs:100} as const;

export function pickRandomStarter(draw:(n:number)=>number=randomInt):RandomStarter {return RANDOM_STARTERS[draw(RANDOM_STARTERS.length)]??"TREECKO";}
// A press result that is the harness pick: wrappers return it as is, with none of the rest of the model's batch.
export function isStarterPick(result:{readonly details:unknown}):boolean {const d=result.details;return typeof d==="object"&&d!==null&&"starterPick" in d&&d.starterPick===true;}

// The bag is open and no starter has been received yet.
export function atStarterBag(s:GameStateSnapshot|undefined):boolean {
 const phase=s?.active_ui?.phase;
 return s!==undefined&&s.started&&!s.in_battle&&s.party.length===0&&phase!==undefined&&phase.startsWith("starter_")&&phase!=="starter_unsupported";
}

export type StarterStep={kind:"press";button:Button}|{kind:"wait"}|{kind:"done"}|{kind:"stop";detail:string};
export function starterStep(s:GameStateSnapshot,target:RandomStarter):StarterStep {
 if(!atStarterBag(s))return s.party.length>0||s.in_battle?{kind:"done"}:{kind:"stop",detail:`the starter bag closed without a starter (screen ${s.screen})`};
 const ui=s.active_ui;
 if(ui==null||ui.diagnostic!==null)return {kind:"stop",detail:ui?.diagnostic??"the starter bag is unreadable"};
 if(ui.phase==="starter_selection"&&ui.ready===true){
  const at=ORDER.indexOf(ui.selected as (typeof ORDER)[number]),want=ORDER.indexOf(target);
  if(at<0)return {kind:"stop",detail:`unknown highlighted starter ${ui.selected??"none"}`};
  return {kind:"press",button:at===want?"A":at<want?"RIGHT":"LEFT"};
 }
 if(ui.phase==="starter_confirmation"&&ui.ready===true){
  if(ui.value!==target)return {kind:"press",button:"B"};
  return {kind:"press",button:ui.selected==="YES"?"A":"UP"};
 }
 return {kind:"wait"};
}

export function starterPickNote(target:RandomStarter,outcome:"picked"|"stopped",detail:string|null):string {
 return outcome==="picked"
  ?`Starter pick: the harness chose ${target} at random (TREECKO or MUDKIP, 50/50) and confirmed it. Your buttons were not sent. You have control again.\n`
  :`Starter pick: the harness tried to choose ${target} at random but stopped: ${detail??"unknown"}. Your buttons were not sent.\n`;
}
