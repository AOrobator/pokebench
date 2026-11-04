import {Type,type Static} from "typebox";
import type {GameStateSnapshot} from "./game-state.js";
// bike-register-v1 / bike-auto-mount-v1: wire shapes of the game server's bike state and its
// frame-owned registration and SELECT toggle (env/pokebench_env/bike.py).
export const BIKES:Readonly<Record<number,string>>={259:"MACH BIKE",272:"ACRO BIKE"};
export const BikeStateSchema=Type.Object({owned:Type.Array(Type.Integer({minimum:1,maximum:0xFFFF}),{maxItems:30}),registered:Type.Integer({minimum:0,maximum:0xFFFF}),riding:Type.Union([Type.Literal("MACH BIKE"),Type.Literal("ACRO BIKE"),Type.Null()]),allow_cycling:Type.Boolean()},{additionalProperties:false});
export type BikeState=Static<typeof BikeStateSchema>;
const Id=Type.String({minLength:1,maxLength:64,pattern:"^[a-zA-Z0-9-]+$"});
const Common={frames:Type.Integer({minimum:0,maximum:1200}),presses:Type.Array(Type.Union([Type.Literal("A"),Type.Literal("B"),Type.Literal("START"),Type.Literal("SELECT"),Type.Literal("UP"),Type.Literal("DOWN"),Type.Literal("LEFT"),Type.Literal("RIGHT")]),{maxItems:1200}),reason:Type.String({maxLength:200}),stopped:Type.Boolean()};
export const BikeRegisterReceiptSchema=Type.Object({id:Id,item:Type.Integer(),...Common},{additionalProperties:false});
export const BikeToggleReceiptSchema=Type.Object({id:Id,ride:Type.Boolean(),...Common},{additionalProperties:false});
export type BikeRegisterReceipt=Static<typeof BikeRegisterReceiptSchema>;
export type BikeToggleReceipt=Static<typeof BikeToggleReceiptSchema>;
const freeField=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.active_ui==null&&s.field_controls_locked===false&&s.running?.controllable===true&&s.world_context?.dialogue==null&&s.world_context?.message==null;
/** bike-register-v1: the owned bike to register, when none is on SELECT and the field is free. The first owned bike: the harness never chooses between them. */
export function bikeToRegister(state:GameStateSnapshot):number|null {
 const bike=state.bike;
 if(bike==null||!freeField(state))return null;
 const owned=bike.owned.filter(item=>item in BIKES);
 return owned.length===0||owned.includes(bike.registered)?null:owned[0]??null;
}
export function registrationNote(receipt:BikeRegisterReceipt):string {
 const name=BIKES[receipt.item]??"bike";
 return receipt.reason==="registered"?`Bike: the ${name} is registered to SELECT.`:`Bike: registering the ${name} to SELECT stopped: ${receipt.reason}.`;
}
// bike-auto-mount-v1. bike.c GetBikeCollisionAt: a bike cannot enter a tile where IsRunningDisallowedByMetatile
// (MetatileBehavior_IsRunningDisallowed, or the Fortree bridge seen from an even elevation).
export const NO_BIKE_TILES:ReadonlySet<number>=new Set([0x03,0x0a,0x28,0x74,0x75,0x76,0x77]);
const FORTREE_BRIDGE=0x78;
// Measured on ROUTE 113 (2026-11-03): SELECT to riding takes about 21 frames; a tile takes 8 running and 6 on the
// ACRO BIKE; the MACH BIKE takes 16, 8, then 4 frames a tile as it speeds up and, released, coasts bikeSpeed more
// tiles while slowing down, so a ridden stride that stops is only faster than running on a long straight run.
export const MOUNT_FRAMES=21;
const RUN_FRAMES=8,ACRO_FRAMES=6,MACH_FRAMES=[16,8,4] as const,RIDE_TILES=16;
/** Frames for a MACH BIKE to ride n tiles from standing and stop on the last (the server's bike_hold rule). */
export function machFrames(n:number):number {
 let position=0,speed=0,counter=0,frames=0;
 while(position<n){
  if(n-position>=1+counter+(counter>>1)){frames+=MACH_FRAMES[counter]??4;position++;speed=counter+(counter>>1);counter=Math.min(counter+1,2);}
  else if(speed>0){speed--;counter=speed;frames+=MACH_FRAMES[counter]??4;position++;}
  else counter=0;
 }
 return frames;
}
/** Whether getting on and riding these route steps (straight runs, each a stride that stops) takes fewer frames than running them. */
export function ridingSaves(path:readonly string[],mach:boolean):boolean {
 const runs:number[]=[];let last:string|null=null;
 for(const step of path){if(step===last&&(runs.at(-1)??0)<RIDE_TILES)runs[runs.length-1]=(runs.at(-1)??0)+1;else runs.push(1);last=step;}
 const running=RUN_FRAMES*path.length,riding=MOUNT_FRAMES+runs.reduce((sum,n)=>sum+(mach?machFrames(n):ACRO_FRAMES*n),0);
 return riding<running;
}
const bikeBlocked=(behavior:number,elevation:number):boolean=>NO_BIKE_TILES.has(behavior)||(behavior===FORTREE_BRIDGE&&(elevation&1)===0);
/**
 * Whether to press SELECT before this navigation step: true gets on, false gets off, null leaves it.
 * next is the tile the step enters; water is the set of tiles that need Surf.
 */
export function bikeTurn(state:GameStateSnapshot,path:readonly string[],next:{readonly behavior:number}|undefined,elevation:number,water:ReadonlySet<number>):boolean|null {
 const bike=state.bike,flags=state.running?.avatar_flags;
 if(bike==null||flags==null||!freeField(state)||next===undefined)return null;
 const ridingNow=(flags&0x06)!==0,onWater=(flags&0x18)!==0;
 if(onWater)return null;
 const blocked=bikeBlocked(next.behavior,elevation)||water.has(next.behavior);
 if(ridingNow)return blocked?false:null;
 const metatile=state.running?.metatile;
 const registered=bike.owned.includes(bike.registered)&&bike.registered in BIKES;
 return (flags&0x01)!==0&&registered&&bike.allow_cycling&&ridingSaves(path,bike.registered===259)&&!blocked&&(metatile==null||!bikeBlocked(metatile,elevation))?true:null;
}
export function toggleNote(receipt:BikeToggleReceipt):string|null {
 if(receipt.reason==="riding")return "Bike: got on the bike with SELECT.";
 if(receipt.reason==="on foot")return "Bike: got off the bike with SELECT.";
 return `Bike: SELECT ${receipt.ride?"to get on":"to get off"} stopped: ${receipt.reason}.`;
}
export const BIKE_MOUNT_SENTENCE="With a bike registered to SELECT, it gets on where the map allows cycling when riding the planned route would take fewer frames than running it, and off before water or a tile a bike cannot enter.";
