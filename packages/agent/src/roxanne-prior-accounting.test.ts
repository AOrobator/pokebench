import {it,expect} from "vitest";
import {createHash} from "node:crypto";
import {verifyPriorAccounting} from "./roxanne-measured-host.js";
function fixture(){
 const files=new Map<string,Buffer>(),hash=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
 const accounting={physicalGpuMs:2460992,unresolvedLeases:[],receipts:[{lane:"gpu0",acquiredAt:0,releasedAt:1230000,run:"old_gpu0"},{lane:"gpu1",acquiredAt:0,releasedAt:1230992,run:"old_gpu1"}]},result={status:"stopped",gpuMs:2460992,accountingComplete:true};
 const bind=(a:unknown=accounting,r:unknown=result)=>{const ab=Buffer.from(JSON.stringify(a)),rb=Buffer.from(JSON.stringify(r));files.set("/old/accounting.json",ab);files.set("/old/result.json",rb);return [{file:"/old/accounting.json",sha256:hash(ab),resultFile:"/old/result.json",resultSha256:hash(rb)}];};
 const read=(p:string)=>{const b=files.get(p);if(!b)throw Error("missing receipt");return b;};return {files,accounting,result,bind,read};
}
it("derives occupied GPU time and launched episodes from immutable original receipts",()=>{
 const f=fixture(),refs=f.bind(),value=verifyPriorAccounting(refs,f.read);expect(value).toMatchObject({gpuMs:2460992,episodes:2,receipts:f.accounting.receipts});expect(verifyPriorAccounting([],f.read)).toMatchObject({gpuMs:0,episodes:0,receipts:[]});
 f.files.set("/old/result.json",Buffer.from("changed"));expect(()=>verifyPriorAccounting(refs,f.read)).toThrow(/hash/);
});
it("rejects changed totals, live ownership, duplicate draws and incomplete outcomes",()=>{
 const f=fixture();expect(()=>verifyPriorAccounting(f.bind({...f.accounting,physicalGpuMs:0}),f.read)).toThrow();expect(()=>verifyPriorAccounting(f.bind({...f.accounting,unresolvedLeases:["gpu0"]}),f.read)).toThrow();expect(()=>verifyPriorAccounting(f.bind(f.accounting,{...f.result,accountingComplete:false}),f.read)).toThrow();const refs=f.bind();expect(()=>verifyPriorAccounting([...refs,...refs],f.read)).toThrow(/duplicate/);
});
it("enforces the amended 38 total episode ceiling on immutable prior receipts",()=>{
 const f=fixture(),receipts=Array.from({length:38},(_,i)=>({lane:"gpu0",acquiredAt:i,releasedAt:i,run:`prior_${String(i)}`}));
 const refs=f.bind({...f.accounting,physicalGpuMs:0,receipts},{...f.result,gpuMs:0});expect(verifyPriorAccounting(refs,f.read).episodes).toBe(38);
 const extra=[...receipts,{lane:"gpu0",acquiredAt:38,releasedAt:38,run:"prior_38"}];expect(()=>verifyPriorAccounting(f.bind({...f.accounting,physicalGpuMs:0,receipts:extra},{...f.result,gpuMs:0}),f.read)).toThrow(/budget/);
});
