import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type Static} from "typebox";
import type {Button} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot,StateSource} from "./game-state.js";
import type {PressTiming} from "./recorder.js";

export const MACH_DASH_ID="rq-mach-dash-v1";
// Measured 2026-11-07 on the real server: an ordinary press (11 held, 8 released) never builds speed. A MACH BIKE
// takes 16, 8, then 4 frames a tile from a stop, and each bend has a 4-frame window, so a route is a list of beats
// held back to back. The vendor queue holds an entry for hold_frames + 1 frames.
export const DASH_TIMING:PressTiming={hold_frames:3,release_frames:0};
// 2 frames turn a stopped bike that faces elsewhere without moving it; 30 released frames let the turn finish.
export const TURN_TIMING:PressTiming={hold_frames:1,release_frames:30};
// The queue has no button-free entry that ends (a WAIT never clears current_action), and B does nothing to a
// rider, a coast or a fall, so B is what holds the queue open for 30 emulated frames. A fall is 80 frames of
// script (EventScript_FallDownHole) plus the warp, inside the bound.
export const SETTLE_TIMING:PressTiming={hold_frames:1,release_frames:28};
export const SETTLE_STEPS=10;
const FRAMES_PER_BEAT=4;
export const MAX_DASH_BEATS=100;
const MACH_BIKE_FLAG=0x02;
const DIRECTIONS:Readonly<Record<string,{readonly button:Button;readonly facing:string}>>={U:{button:"UP",facing:"up"},D:{button:"DOWN",facing:"down"},L:{button:"LEFT",facing:"left"},R:{button:"RIGHT",facing:"right"}};

const MachDashArgs=Type.Object({route:Type.String({minLength:1,description:"Direction letters U, D, L, R, each with a count of 4-frame beats, such as D1 R4 D11. A count is beats, not tiles."})},{additionalProperties:false});
const DESCRIPTION="While you ride the MACH BIKE on the field, rides a whole route in one go at full speed. route lists direction letters with counts of 4-frame beats, such as D1 R4 D11; a count is beats, not tiles. Turns the bike to the first direction first if needed, then reports where you ended.";
export const MACH_DASH_SECTION=`- mach_dash: ${DESCRIPTION} It presses nothing unless you ride the MACH BIKE on the field. The beats run back to back, so a route given to you must be sent exactly as written. On cracked floor, a stop or a slow ride drops you to the floor below, off the bike.`;

export type ParsedDash={readonly ok:true;readonly buttons:readonly Button[]}|{readonly ok:false;readonly reason:string};
export function parseDash(route:string):ParsedDash {
 const form="Write a route like D1 R4 D11: U, D, L or R, each with a count of 4-frame beats, separated by spaces.";
 const tokens=route.trim().split(/\s+/);
 if(!tokens.every(token=>/^[UDLR]([1-9]\d*)?$/.test(token)))return {ok:false,reason:form};
 const buttons=tokens.flatMap(token=>{
  const direction=DIRECTIONS[token.charAt(0)];
  return direction===undefined?[]:Array.from({length:Number(token.slice(1)||"1")},()=>direction.button);
 });
 if(buttons.length>MAX_DASH_BEATS)return {ok:false,reason:`That route is ${String(buttons.length)} beats; ${String(MAX_DASH_BEATS)} is the most in one call.`};
 return {ok:true,buttons};
}

const riding=(s:GameStateSnapshot):boolean=>((s.running?.avatar_flags??0)&MACH_BIKE_FLAG)!==0;
const onField=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.active_ui==null&&s.field_controls_locked===false&&s.running?.controllable===true&&s.map_id!==null&&s.position!==null&&s.world_context?.dialogue==null&&s.world_context?.message==null;
const inBattle=(s:GameStateSnapshot):boolean=>s.in_battle||s.screen.startsWith("battle");
const stopped=(s:GameStateSnapshot):boolean=>inBattle(s)||s.screen!=="overworld"||s.active_ui!=null||s.world_context?.dialogue!=null||s.world_context?.message!=null;
const sameTile=(a:GameStateSnapshot,b:GameStateSnapshot):boolean=>JSON.stringify([a.map_id,a.position])===JSON.stringify([b.map_id,b.position]);
const place=(s:GameStateSnapshot):string=>s.location_display??s.location??"this map";
const tile=(s:GameStateSnapshot):string=>s.position===null?"an unknown tile":`(${String(s.position.x)},${String(s.position.y)})`;

// EventScript_FallDownHole (data/scripts/cave_hole.inc) shows no text, only the sound and the next floor, so the
// report says the observable fact. A door keeps the rider on the bike, except onto a map that forbids cycling.
export function dashReport(before:GameStateSnapshot,after:GameStateSnapshot,beats:number):string {
 const sent=`mach_dash sent ${String(beats)} beats (${String(beats*FRAMES_PER_BEAT)} frames) from ${tile(before)}.`;
 if(inBattle(after))return `${sent} A battle started, and the rest of the route went nowhere.`;
 const left=after.map_id!==null&&JSON.stringify(after.map_id)!==JSON.stringify(before.map_id);
 if(left&&!riding(after)&&after.bike?.allow_cycling!==false)return `${sent} You fell through the floor from ${place(before)} to ${place(after)}, and are at ${tile(after)}, off the bike.`;
 if(!onField(after))return `${sent} The game has not returned control yet. Last seen at ${tile(after)} on ${place(after)}.`;
 return `${sent} You ended on ${place(after)} at ${tile(after)}, ${riding(after)?"still on the MACH BIKE":"off the bike"}.`;
}

export interface MachDashPorts {
 readonly read:(signal?:AbortSignal)=>Promise<GameStateSnapshot>;
 readonly send:NonNullable<CheckedPressTool["executeTimed"]>;
 readonly observe:(id:string,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>;
}
type DashResult=AgentToolResult<unknown>;

export function machDashTool(ports:MachDashPorts):AgentTool<typeof MachDashArgs> {
 const finish=async(id:string,text:string,signal?:AbortSignal):Promise<DashResult>=>{
  const seen=await ports.observe(id,signal);
  return {...seen,content:[{type:"text",text},...seen.content]};
 };
 const settle=async(id:string,last:GameStateSnapshot,signal?:AbortSignal):Promise<GameStateSnapshot>=>{
  let previous=last;
  for(let step=0;step<SETTLE_STEPS;step++){
   if(stopped(previous))return previous;
   await ports.send(id,["B"],SETTLE_TIMING,previous,signal);
   const current=await ports.read(signal);
   if(onField(current)&&sameTile(current,previous))return current;
   previous=current;
  }
  return previous;
 };
 return {name:"mach_dash",label:"Mach dash",description:DESCRIPTION,parameters:MachDashArgs,execute:async(id,params:Static<typeof MachDashArgs>,signal)=>{
  signal?.throwIfAborted();
  const parsed=parseDash(params.route);
  if(!parsed.ok)return finish(id,`${parsed.reason} Nothing was pressed.`,signal);
  const start=await ports.read(signal);
  if(!onField(start))return finish(id,"You are not on the field with control of the player. Nothing was pressed.",signal);
  if(!riding(start))return finish(id,"You are not riding the MACH BIKE. Nothing was pressed.",signal);
  const first=parsed.buttons[0],direction=Object.values(DIRECTIONS).find(entry=>entry.button===first);
  if(first===undefined||direction===undefined)throw new Error("A parsed route has at least one beat");
  let ready=start,turned="";
  // A turn inside the list would use up the first beats, and the route falls where its timing slips.
  if(start.facing!==direction.facing){
   await ports.send(id,[first],TURN_TIMING,start,signal);
   ready=await ports.read(signal);
   if(ready.facing!==direction.facing||!sameTile(ready,start)||!onField(ready)||!riding(ready))return finish(id,`The bike did not turn ${first} in place: it faces ${ready.facing??"an unknown way"} at ${tile(ready)}. The route was not sent.`,signal);
   turned=`Turned the bike ${first}. `;
  }
  await ports.send(id,parsed.buttons,DASH_TIMING,ready,signal);
  const after=await settle(id,await ports.read(signal),signal);
  return finish(id,turned+dashReport(ready,after,parsed.buttons.length),signal);
 }};
}

// Beside press, not through it: the guards on press cut a direction batch, and this tool owns its own checks.
export function withMachDash(tools:readonly AgentTool[],features:FeatureSet,state:Pick<StateSource,"read">):AgentTool[] {
 if(!features[MACH_DASH_ID])return [...tools];
 const press=tools.find(t=>t.name==="press"),observe=tools.find(t=>t.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press)||press.executeTimed===undefined)throw new Error("mach_dash requires the ordinary game tools");
 return [...tools,machDashTool({read:signal=>state.read(signal),send:press.executeTimed,observe:(id,signal)=>observe.execute(id,{},signal)})];
}
