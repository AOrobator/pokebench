import {readFileSync,statSync} from "node:fs";
import {join} from "node:path";
import {Type} from "typebox";
import {Value} from "typebox/value";
const positive=Type.Integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER});
const limits=Type.Object({maxTurns:positive},{additionalProperties:true});
const receipt=Type.Object({
 run:Type.String(),status:Type.Literal("applied_and_verified"),temporary_inspector_closed:Type.Literal(true),
 agent_pid:positive,old_turn_ceiling:positive,new_turn_ceiling:positive,
 independent_readback:Type.Object({identity:Type.Object({pid:positive},{additionalProperties:true}),before:Type.Object({limits,stopReason:Type.Null()},{additionalProperties:true})},{additionalProperties:true}),
 apply_receipt:Type.Object({after:Type.Object({limits},{additionalProperties:true})},{additionalProperties:true}),
},{additionalProperties:true});
// Audited one-time operator adjustment; never rewrite the immutable run_start.
export function readTurnBudgetReceipt(dir:string,run:string):number|null {
 try {
  const path=join(dir,"codex-turn-budget-adjustment.json");
  if(statSync(path).size>65536)return null;
  const value:unknown=JSON.parse(readFileSync(path,"utf8"));
  if(!Value.Check(receipt,value)||value.run!==run||value.independent_readback.identity.pid!==value.agent_pid)return null;
  const ceiling=value.new_turn_ceiling;
  if(ceiling<=value.old_turn_ceiling||value.independent_readback.before.limits.maxTurns!==ceiling||value.apply_receipt.after.limits.maxTurns!==ceiling)return null;
  return ceiling;
 }catch{return null;}
}
