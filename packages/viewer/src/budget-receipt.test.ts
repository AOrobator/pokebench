import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,expect,it} from "vitest";
import {readTurnBudgetReceipt} from "./budget-receipt.js";
import {startViewer} from "./server.js";
import {Log,START} from "../test-support/events.js";
const roots:string[]=[];
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
function fixture(){const root=mkdtempSync(join(tmpdir(),"turn-budget-"));roots.push(root);const id="budget-run";const dir=join(root,id);mkdirSync(dir);const value={run:id,status:"applied_and_verified",temporary_inspector_closed:true,agent_pid:42,old_turn_ceiling:2000,new_turn_ceiling:20000,independent_readback:{identity:{pid:42},before:{limits:{maxTurns:20000},stopReason:null}},apply_receipt:{after:{limits:{maxTurns:20000}}}};return {root,id,dir,value,path:join(dir,"codex-turn-budget-adjustment.json")};}
it("serves only verified matching budget overrides through the production endpoint",async()=>{
 const f=fixture();writeFileSync(f.path,JSON.stringify(f.value));const log=new Log();log.add(0,START);writeFileSync(join(f.dir,"events.jsonl"),log.events.map(e=>JSON.stringify({...e,run:f.id})).join("\n")+"\n");
 const v=await startViewer({runsRoot:f.root,staticDir:f.root,appDir:f.root,port:0});
 try{const r=await fetch(`http://127.0.0.1:${v.port}/api/runs/${f.id}/budget`);expect(r.status).toBe(200);expect(await r.json()).toEqual({max_turns:20000});}finally{await v.close();}
});
it("rejects missing, malformed, oversized and inconsistent operator receipts",()=>{
 const f=fixture();expect(readTurnBudgetReceipt(f.dir,f.id)).toBeNull();
 for(const value of ["bad-json","x".repeat(65537),JSON.stringify({...f.value,status:"prepared"}),JSON.stringify({...f.value,run:"another"}),JSON.stringify({...f.value,agent_pid:99}),JSON.stringify({...f.value,new_turn_ceiling:21000}),JSON.stringify({...f.value,old_turn_ceiling:30000}),JSON.stringify({...f.value,apply_receipt:{after:{limits:{maxTurns:123}}}})]){
 writeFileSync(f.path,value);expect(readTurnBudgetReceipt(f.dir,f.id),value.slice(0,150)).toBeNull();
 }
});
