import {it,expect} from "vitest";
import {flagFeatures} from "./play-preset.js";
import {prepareContinuation} from "./roxanne-continuation.js";
import {buildRestoreBundle} from "./roxanne-restore.js";
import {playFromHistory,Governor,type Loop} from "./harness.js";
const history=[{role:"user" as const,content:"original instruction and last loss",timestamp:0}];
const bytes=Buffer.from("checkpoint");
const bundle=()=>buildRestoreBundle({sourceRun:"source",sourceCommit:"a".repeat(40),turn:4,stateSeq:2,stateBytes:bytes,nativeReceipt:{passed:true,frame:100,ewram:"b".repeat(64),iwram:"c".repeat(64),registers:true,restored:true,inputReady:true,insideGym:true},history,eventsPrefix:"prefix",systemPrompt:"source prompt",toolsHash:"d".repeat(64),rtcUnixMs:1792600000000});
it("registered reminder defaults OFF and only the campaign factory inserts it once",()=>{const flags=flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false});expect(flags["roxanne-campaign-reminder-v1"]).toBe(false);const off=prepareContinuation(flags,bundle(),bytes,history,"prefix","candidate");expect(off.messages).toBe(history);const on=prepareContinuation({...flags,"roxanne-campaign-reminder-v1":true},bundle(),bytes,history,"prefix","candidate");expect(on.messages).toHaveLength(2);expect(on.receipt?.index).toBe(1);});
it("resumes the ordinary agent loop with restored messages, never a new boot task",async()=>{const governor=new Governor({retry:()=>undefined,limits:{maxTurns:1,maxWallMs:1000,failureLimit:1},abort:()=>undefined,now:()=>0});let sent:unknown;const loop:Loop={start:()=>{throw new Error("must not boot");},resume:messages=>{sent=messages;governor.stop("budget");return Promise.resolve([]);}};expect(await playFromHistory(history,governor,loop)).toBe("budget");expect(sent).toEqual(history);});
it("counts model errors through the same bounded retry owner as ordinary play",async()=>{
 const {assistant}=await import("../test-support/pi.js");let calls=0;
 const governor=new Governor({limits:{maxTurns:10,maxWallMs:1000,failureLimit:2},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const loop:Loop={start:()=>{throw new Error("must not boot");},resume:()=>{calls++;return Promise.resolve([assistant({stopReason:"error",errorMessage:"recorded outage fixture"})]);}};
 expect(await playFromHistory(history,governor,loop)).toBe("model_error");expect(calls).toBe(2);
});
it("rejects first-context drift from the frozen request reference",async()=>{
 const {qualifyRestoredContext}=await import("./roxanne-continuation.js");
 const delivered=[...history,{role:"user" as const,content:"temporary loss memory",timestamp:0}];
 const persistent=history;
 expect(await qualifyRestoredContext(delivered,persistent,rows=>Promise.resolve([...rows,delivered[1] as typeof history[number]]))).toHaveProperty("passed",true);
 await expect(qualifyRestoredContext(delivered,persistent,rows=>Promise.resolve(rows))).rejects.toThrow(/differs/);
});
it("restores a hash-bound budget anchor and rejects a missing persistent conversation or runtime drift",async()=>{
 const {digest}=await import("./roxanne-campaign.js"),{ContextBudget}=await import("./context-budget.js");const c=new ContextBudget(1000),state={limit:1000,sent:100,anchor:{weight:100,tokens:500,basis:"usage" as const}};
 const b={...bundle(),conversationHash:digest(history),budgetHash:digest(state)};const flags=flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false});
 const runtime={systemPrompt:b.systemPrompt,toolsHash:b.toolsHash,budget:c,budgetState:state};
 expect(()=>prepareContinuation(flags,b,bytes,history,"prefix","",history)).toThrow(/runtime/);
 expect(()=>prepareContinuation(flags,b,bytes,history,"prefix","",history,{...runtime,budgetState:{...state,sent:101}})).toThrow(/budget/);
 expect(()=>prepareContinuation(flags,b,bytes,history,"prefix","",undefined,runtime)).toThrow(/conversation/);
 expect(prepareContinuation(flags,b,bytes,history,"prefix","",history,runtime).messages).toEqual(history);expect(c.snapshot()).toEqual(state);
});
