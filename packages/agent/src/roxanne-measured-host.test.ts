import {it,expect} from "vitest";
import {checkEvent} from "./events.js";
import {boundedGradeViews,blindedGradingPrompt} from "./roxanne-measured-host.js";

it("gives the blind judge every textual behavior with hashes instead of encoded image pixels",()=>{
 const prompt=blindedGradingPrompt({id:"anonymous",messages:[{role:"user",content:[{type:"text",text:"observed fact"},{type:"image",data:"secret-pixels",mimeType:"image/png"}],timestamp:0}],nativeScore:{verified:true,departed:false,strictRecovery:false,eventualRecovery:false,unchangedRematches:0,recoverySeq:null,victory:false,changes:[],evidence:[]},traceHash:"hash",trace:{kind:"fixture",frames:[]}});
 expect(prompt).toContain("observed fact");expect(prompt).toContain("image pixels unavailable");expect(prompt).not.toContain("secret-pixels");
});
it("charges physical occupancy even when an invalid draw cannot get a verified score",async()=>{
 const {physicalGpuOccupancy}=await import("./roxanne-measured-host.js");expect(physicalGpuOccupancy([{lane:"gpu0",acquiredAt:0,releasedAt:100},{lane:"gpu1",acquiredAt:0,releasedAt:200},{lane:"gpu0",acquiredAt:100,releasedAt:300}])).toBe(500);expect(()=>physicalGpuOccupancy([{lane:"gpu0",acquiredAt:5,releasedAt:4}])).toThrow();expect(()=>physicalGpuOccupancy([{lane:"gpu0",acquiredAt:0,releasedAt:10},{lane:"gpu0",acquiredAt:9,releasedAt:11}])).toThrow();expect(()=>physicalGpuOccupancy(null)).toThrow();
});
it("binds executing campaign launch owners as well as the agent build to the reviewed pin",async()=>{
 const {verifyCampaignLaunchSource}=await import("./roxanne-measured-host.js");
 const calls:(readonly string[])[]=[];const git=(args:readonly string[])=>{calls.push(args);return args[0]==="ls-tree"?"same-source-tree":"";};
 expect(()=>{verifyCampaignLaunchSource(git,"a".repeat(40));}).not.toThrow();
 expect(calls).toEqual([["merge-base","--is-ancestor","a".repeat(40),"HEAD"],["ls-tree","--full-tree","a".repeat(40),"--","packages/agent","packages/viewer","env","scripts","justfile","package.json","pnpm-lock.yaml","pnpm-workspace.yaml"],["ls-tree","--full-tree","HEAD","--","packages/agent","packages/viewer","env","scripts","justfile","package.json","pnpm-lock.yaml","pnpm-workspace.yaml"]]);
 expect(()=>{verifyCampaignLaunchSource(args=>args[0]==="ls-tree"&&args[2]==="HEAD"?"changed-launch-owner":"reviewed-source", "a".repeat(40));}).toThrow(/reviewed campaign launch sources/);
});
it("requires actual review lanes or the specifically authorized missing-Grok exception",async()=>{
 const {verifyCampaignReviews}=await import("./roxanne-measured-host.js"),head="a".repeat(40),campaign="roxanne-autonomous";
 const lanes=[{family:"claude",model:"claude",cloud:true,verdict:"LGTM"},{family:"gpt",model:"gpt",cloud:true,verdict:"LGTM"}],fallback=[{family:"fallback",model:"sol",cloud:true,verdict:"LGTM"},{family:"fallback",model:"astra",cloud:true,verdict:"LGTM"}];
 const approval={missingFamily:"grok",campaign,quote:"Tell autoresearch I approve proceeding without Grok. Finish landing and preflight, then coordinate taking over both GPUs. Keep the Double Kick investigation moving too.",sourceThread:"00000000-0000-4000-8000-f5efe0494f81",sourceMessage:"00000000-0000-4000-8000-fc6902fdcccf"};
 const receipt={status:"LGTM",head,campaign,lanes};
 expect(()=>{verifyCampaignReviews({...receipt,lanes:[...lanes,{family:"grok",model:"grok",cloud:true,verdict:"LGTM"}]},head,campaign);}).not.toThrow();
 expect(()=>{verifyCampaignReviews({...receipt,lanes:[...lanes,...fallback],operatorException:approval},head,campaign);}).not.toThrow();
 for(const value of [receipt,{...receipt,lanes:[...lanes,...fallback.map(l=>({...l,cloud:false}))],operatorException:approval},{...receipt,lanes:[...lanes,...fallback]},{...receipt,lanes:[lanes[0],...fallback],operatorException:approval},{...receipt,lanes:[...lanes,fallback[0],fallback[0]],operatorException:approval},{...receipt,lanes:[...lanes,...fallback],operatorException:{...approval,quote:"go ahead"}},{...receipt,lanes:[...lanes,...fallback],operatorException:{...approval,campaign:"other"}}])expect(()=>{verifyCampaignReviews(value,head,campaign);}).toThrow(/review/);
 expect(()=>{verifyCampaignReviews({...receipt,head:"b".repeat(40)},head,campaign);}).toThrow(/review/);
});

it("bounds the final envelope rather than trusting a window-size reserve",()=>{
 const events=Array.from({length:8},(_,i)=>checkEvent({v:1,run:"r",seq:i+1,t:"2026-10-23T00:00:00.000-04:00",type:"loop_guard",turn:2,kind:"planning",calls:1,evidence:[1],phase:"warning",message:Array.from({length:9000},(_,j)=>String((i*10000+j)*997)).join("-")}));
 const context={messages:[{role:"user",content:"whole decision"}],tools:[]};const window={fromMessage:0,toMessage:1,fromTurn:0,toTurn:3,requestSha256:"withheld",context};
 const row={id:"e",messages:[{role:"user" as const,content:"whole decision",timestamp:0}],nativeScore:{verified:true,departed:true,strictRecovery:false,eventualRecovery:false,unchangedRematches:0,recoverySeq:null,victory:false,changes:[],evidence:[]},traceHash:"hash",trace:{kind:"native" as const,events,startSeq:0,startedAtMs:0,gradeWindows:[window]}};
 const views=boundedGradeViews(row);expect(views.length).toBeGreaterThan(1);expect(views.flatMap(v=>v.trace.kind==="native"?v.trace.events:[])).toEqual(events);for(const view of views)expect(Buffer.byteLength(blindedGradingPrompt(view))).toBeLessThanOrEqual(600000);
});
