import type {GameStateSnapshot} from "./game-state.js";

type Receipt=NonNullable<GameStateSnapshot["blackout_receipt"]>;

const from=(state:GameStateSnapshot):readonly Receipt[]=>{
 const receipts=[...(state.blackout_receipts??[]),...(state.blackout_receipt===undefined?[]:[state.blackout_receipt])];
 return [...new Map(receipts.map(receipt=>[receipt.frame,receipt])).values()];
};

// Composite tools may make several ordinary observations but return only the
// last one. Preserve every one-shot whiteout receipt across that boundary.
export class BlackoutCarry {
 private readonly receipts=new Map<number,Receipt>();

 remember(state:GameStateSnapshot):GameStateSnapshot {
  for(const receipt of from(state))if(!this.receipts.has(receipt.frame))this.receipts.set(receipt.frame,receipt);
  return state;
 }

 preserve(state:GameStateSnapshot):GameStateSnapshot {
  this.remember(state);
  const receipts=[...this.receipts.values()];
  const first=receipts[0];
  if(first===undefined)return state;
  return {...state,blackout_receipt:state.blackout_receipt??first,...(receipts.length===1?{}:{blackout_receipts:receipts})};
 }

 missingNotices(texts:readonly string[]):string[] {
  return [...this.receipts.values()].map(receipt=>receipt.notice).filter(notice=>!texts.some(text=>text.includes(notice)));
 }
}
