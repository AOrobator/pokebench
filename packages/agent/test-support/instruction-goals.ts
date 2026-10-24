import type {RunEvent} from "../src/events.js";
import {parseGameState,type GameStateSnapshot} from "../src/game-state.js";
export function must<T>(value:T|null|undefined):T {if(value==null)throw new Error("Required fixture value missing");return value;}
export function snapshot(event:RunEvent):GameStateSnapshot {
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(event).filter(([key])=>!envelope.has(key))));
}
