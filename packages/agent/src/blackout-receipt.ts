import type {GameStateSnapshot} from "./game-state.js";

type Receipt=NonNullable<GameStateSnapshot["blackout_receipt"]>;

// Composite tools may make several ordinary observations but return only the
// last one. Preserve the first one-shot whiteout receipt across that boundary.
export class BlackoutCarry {
 private receipt:Receipt|undefined;

 remember(state:GameStateSnapshot):GameStateSnapshot {
  if(this.receipt===undefined&&state.blackout_receipt!==undefined)this.receipt=state.blackout_receipt;
  return state;
 }

 preserve(state:GameStateSnapshot):GameStateSnapshot {
  return state.blackout_receipt!==undefined||this.receipt===undefined?state:{...state,blackout_receipt:this.receipt};
 }

 missingNotice(texts:readonly string[]):string|null {
  const notice=this.receipt?.notice;
  return notice===undefined||texts.some(text=>text.includes(notice))?null:notice;
 }
}
