import {expect,it} from "vitest";
import type {RunEndReason} from "./events.js";
import {finishRecording} from "./run.js";

const recorder=(ended:RunEndReason[],press:()=>Promise<void>=()=>Promise.resolve())=>({afterPress:press,end:(reason:RunEndReason)=>{ended.push(reason);}});

it("hands each run-end task the terminal reason after the final snapshot",async()=>{
 const order:string[]=[],ended:RunEndReason[]=[];
 await finishRecording(recorder(ended,()=>{order.push("snapshot");return Promise.resolve();}),"budget",true,[reason=>{order.push(`task:${reason}`);return Promise.resolve();}],undefined);
 expect(order).toEqual(["snapshot","task:budget"]);expect(ended).toEqual(["budget"]);
});

it("tells tasks the run crashed when the final snapshot failed",async()=>{
 const seen:RunEndReason[]=[],ended:RunEndReason[]=[];
 await expect(finishRecording(recorder(ended,()=>Promise.reject(new Error("snapshot lost"))),"operator_abort",true,[reason=>{seen.push(reason);return Promise.resolve();}],undefined)).rejects.toThrow("snapshot lost");
 expect(seen).toEqual(["crash"]);expect(ended).toEqual(["crash"]);
});

it("runs last tasks after every other end task with the final reason",async()=>{
 const order:string[]=[],ended:RunEndReason[]=[];
 await expect(finishRecording(recorder(ended),"budget",false,[reason=>{order.push(`task:${reason}`);return Promise.reject(new Error("flush failed"));}],undefined,[reason=>{order.push(`last:${reason}`);return Promise.resolve();}])).rejects.toThrow("flush failed");
 expect(order).toEqual(["task:budget","last:crash"]);expect(ended).toEqual(["crash"]);
});
