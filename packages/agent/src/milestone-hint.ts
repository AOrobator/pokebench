import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {BodyOf,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

export interface MilestoneHint {readonly name:string;readonly goal:string;readonly done:string}

// The main story path to the first badge, in the order the recorded human run
// (2026-10-13T23-50-13_human_1848) earned these native milestones. A hint arm only.
export const MILESTONE_HINTS:readonly MilestoneHint[]=[
 {name:"NEW_GAME_CREATED",goal:"Start a new game from the title menu.",done:"You started a new game."},
 {name:"PLAYER_NAME_CONFIRMED",goal:"Choose a name and confirm it with Professor Birch.",done:"Your name is confirmed."},
 {name:"FIRST_TRUCK_EXIT",goal:"Get out of the moving truck.",done:"You got out of the truck."},
 {name:"PLAYER_HOUSE_ENTERED",goal:"Go into your new house.",done:"You entered your house."},
 {name:"MOM_CLOCK_INSTRUCTION",goal:"Listen to Mom inside the house.",done:"Mom asked you to set the clock."},
 {name:"PLAYER_BEDROOM",goal:"Go upstairs to your bedroom.",done:"You reached your bedroom."},
 {name:"CLOCK_SET",goal:"Set the clock on the wall of your bedroom.",done:"You set the clock."},
 {name:"MOM_RIVAL_INSTRUCTION",goal:"Go back downstairs and listen to Mom.",done:"Mom told you about the neighbors."},
 {name:"PLAYER_HOUSE_EXITED_AFTER_CLOCK",goal:"Leave your house.",done:"You left your house."},
 {name:"RIVAL_HOUSE_ENTERED",goal:"Enter the house next door, where Professor Birch's family lives.",done:"You entered the house next door."},
 {name:"RIVAL_BEDROOM_REACHED",goal:"Go upstairs in the house next door.",done:"You reached the upstairs bedroom next door."},
 {name:"RIVAL_MET",goal:"Meet Professor Birch's child in that upstairs bedroom.",done:"You met your rival."},
 {name:"STARTER_CHOSEN",goal:"Go north out of Littleroot to Route 101, help Professor Birch, and choose a Pokémon from his bag.",done:"You chose your first Pokémon."},
 {name:"BIRCH_RESCUE_COMPLETE",goal:"Win the battle to rescue Professor Birch.",done:"You rescued Professor Birch."},
 {name:"BIRCH_STARTER_HANDOFF_COMPLETE",goal:"Go with Professor Birch to his lab and accept the Pokémon.",done:"Professor Birch gave you the Pokémon."},
 {name:"OLDALE_TOWN",goal:"Go north through Route 101 to Oldale Town.",done:"You reached Oldale Town."},
 {name:"RIVAL_BATTLE_WON",goal:"Find your rival on Route 103, north of Oldale Town, and win the battle.",done:"You beat your rival."},
 {name:"RECEIVED_POKEDEX",goal:"Return to Professor Birch's lab in Littleroot and get the Pokédex.",done:"You received the Pokédex."},
 {name:"STARTER_TUTORIAL_COMPLETE",goal:"Finish the conversation in Professor Birch's lab after getting the Pokédex.",done:"Your adventure has officially started."},
 {name:"RUNNING_SHOES_RECEIVED",goal:"Talk to Mom outside Professor Birch's lab to get the Running Shoes.",done:"You got the Running Shoes."},
 {name:"PETALBURG_CITY",goal:"Travel west from Oldale Town along Route 102 to Petalburg City.",done:"You reached Petalburg City."},
 {name:"DAD_FIRST_MEETING",goal:"Visit the Petalburg Gym and meet your dad.",done:"You met your dad."},
 {name:"WALLY_TUTORIAL_COMPLETE",goal:"Help Wally catch a Pokémon.",done:"You helped Wally."},
 {name:"PETALBURG_WOODS",goal:"Go west and north along Route 104 into Petalburg Woods.",done:"You entered Petalburg Woods."},
 {name:"TEAM_AQUA_WOODS_EVENT_COMPLETE",goal:"Help the researcher against Team Aqua in Petalburg Woods.",done:"You stopped Team Aqua in the woods."},
 {name:"RUSTBORO_CITY",goal:"Continue north to Rustboro City.",done:"You reached Rustboro City."},
 {name:"RUSTBORO_CITY_GYM",goal:"Enter the Rustboro Gym.",done:"You entered the Rustboro Gym."},
 {name:"STONE_BADGE",goal:"Beat Roxanne, the Rustboro Gym Leader, to earn the Stone Badge.",done:"You earned the Stone Badge."},
];

const Args=Type.Object({});

export class NextMilestoneHint {
 private readonly achieved=new Set<string>();
 private pending:{milestone:string;text:string}|null=null;
 observe(event:RunEvent):void {
  if(event.type!=="milestone"||this.achieved.has(event.name))return;
  const hint=MILESTONE_HINTS.find(h=>h.name===event.name);
  if(hint===undefined)return;
  this.achieved.add(event.name);
  if(event.origin==="present_at_start")return;
  this.pending={milestone:event.name,text:`MILESTONE REACHED: ${hint.done} ${this.nextLine()}`};
 }
 // The furthest milestone earned counts its predecessors as done: a checkpoint start does not
 // report every earlier milestone (truck exit, for example) as present.
 private furthest():number {return MILESTONE_HINTS.reduce((max,h,i)=>this.achieved.has(h.name)?i:max,-1);}
 private next():MilestoneHint|undefined {return MILESTONE_HINTS[this.furthest()+1];}
 private nextLine():string {
  const next=this.next();
  return next===undefined?"Next milestone: every main story milestone in this list is done.":`Next milestone: ${next.goal}`;
 }
 take():string|null {const p=this.pending;this.pending=null;return p?.text??null;}
 takeWithName():{milestone:string;text:string}|null {const p=this.pending;this.pending=null;return p;}
 describe():string {
  const done=this.furthest()+1;
  return `${this.nextLine()} (${String(done)} of ${String(MILESTONE_HINTS.length)} main story milestones on the way to the first badge are done.)`;
 }
 tool():AgentTool<typeof Args> {
  return {name:"get_next_milestone",label:"Get next milestone",description:"Returns the next main story milestone the game has not recorded yet, in plain words, and how many are done. It presses nothing.",parameters:Args,execute:()=>Promise.resolve({content:[{type:"text",text:this.describe()}],details:undefined})};
 }
}

type HintRecorder=Pick<RunRecorder,"subscribe"|"recordMilestoneHint">;
export function nextMilestoneHint(features:FeatureSet,recorder:HintRecorder,transform:(messages:AgentMessage[])=>Promise<AgentMessage[]>):{tool:AgentTool;transformContext:(messages:AgentMessage[])=>Promise<AgentMessage[]>}|null {
 if(!features["next-milestone-hint-v1"])return null;
 const hint=new NextMilestoneHint();recorder.subscribe(event=>{hint.observe(event);});
 // The latest milestone message stays pinned until the next one, so context pruning cannot drop it.
 let pinned:string|null=null;
 return {tool:hint.tool(),transformContext:messages=>{
  const pending=hint.takeWithName();
  if(pending!==null){
   const body:Omit<BodyOf<"milestone_hint">,"type"|"turn">={text:pending.text,milestone:pending.milestone};recorder.recordMilestoneHint(body);
   pinned=pending.text;
  }
  return transform(pinned===null?messages:[...messages,{role:"user",content:pinned,timestamp:Date.now()}]);
 }};
}
