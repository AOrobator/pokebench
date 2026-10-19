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
  const present=new Map<string,number>();
  for(const {notice} of this.receipts.values())if(!present.has(notice))present.set(notice,texts.reduce((total,text)=>{
   let count=0,at=0;
   while((at=text.indexOf(notice,at))!==-1){count++;at+=notice.length;}
   return total+count;
  },0));
  const missing:string[]=[];
  for(const {notice} of this.receipts.values()){
   const count=present.get(notice)??0;
   if(count>0)present.set(notice,count-1);else missing.push(notice);
  }
  return missing;
 }
}
