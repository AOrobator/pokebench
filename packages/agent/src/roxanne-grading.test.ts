import {it,expect} from "vitest";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import type {Message} from "@mariozechner/pi-ai";
import {buildGradeWindows,blindGradeWindows,parseCapturedContext,aggregateJudgments,gradingJson,contextDelta,applyContextDelta} from "./roxanne-grading.js";
import {digest} from "./roxanne-campaign.js";
import {checkEvent} from "./events.js";
const user=(content:string):Message=>({role:"user",content,timestamp:0});
function fixture(){
 const messages=[user("old omitted history"),user("new1"),user("new2"),user("new3")];
 const bodies=["actual context at first request","actual context at second request","actual context at third request"].map(content=>gzipSync(JSON.stringify({model:"secret-model",seed:42,messages:[{role:"system",content}],tools:[]})));
 const receipts=bodies.map((b,i)=>({index:i+1,turn:i+2,offset:i+1,sha256:createHash("sha256").update(b).digest("hex")}));
 const events=[2,3,4].map((turn,i)=>checkEvent({v:1,run:"r",seq:i+1,t:"2026-10-23T00:00:00.000-04:00",type:"turn_start",turn,context:{messages:1,images:0,est_tokens:1}}));
 return {messages,receipts,events,historyMessages:1,reminder:null,read:(i:number)=>{const b=bodies[i-1];if(!b)throw Error("missing");return b;}};
}
it("covers every message and native turn once with exact contexts and no discarded historical prefix",()=>{
 const f=fixture(),all=buildGradeWindows(f);expect(all).toHaveLength(1);expect(all[0]).toMatchObject({fromMessage:1,toMessage:4,fromTurn:0,toTurn:5});expect(all[0]?.context.messages[0]?.["content"]).toBe("actual context at first request");
 const firstBytes=Buffer.byteLength(gradingJson({window:{...all[0],updates:[],toMessage:2,toTurn:3},messages:f.messages.slice(1,2),events:f.events.slice(0,1)}));
 const split=buildGradeWindows(f,firstBytes+10);expect(split).toHaveLength(3);expect(split.flatMap(w=>f.messages.slice(w.fromMessage,w.toMessage))).toEqual(f.messages.slice(1));expect(split.flatMap(w=>f.events.filter(e=>e.turn>=w.fromTurn&&e.turn<w.toTurn))).toEqual(f.events);expect(split[1]?.context.messages[0]?.["content"]).toBe("actual context at second request");
 const blinded=blindGradeWindows(split,1,null);expect(blinded.map(w=>[w.fromMessage,w.toMessage])).toEqual([[0,1],[1,2],[2,3]]);expect(gradingJson(blinded)).not.toContain("old omitted history");expect(gradingJson(blinded)).not.toContain("secret-model");expect(blinded[0]?.requestSha256).toBe("withheld");
});
it("rejects gaps, backwards receipts, missing receipts, tampered requests and oversized single decisions",()=>{
 const f=fixture();expect(()=>buildGradeWindows({...f,receipts:[]})).toThrow(/receipts/);expect(()=>buildGradeWindows({...f,receipts:[{...f.receipts[0],index:2}]})).toThrow(/coverage/);expect(()=>buildGradeWindows({...f,receipts:[{...f.receipts[0],offset:0}]})).toThrow(/coverage/);expect(()=>buildGradeWindows({...f,receipts:[f.receipts[0],{...f.receipts[1],turn:1}]})).toThrow(/coverage/);expect(()=>buildGradeWindows(f,1)).toThrow(/exceeds/);expect(()=>parseCapturedContext(f.read(1),"0".repeat(64))).toThrow(/hash/);
 const b=gzipSync(JSON.stringify({messages:[{role:"invented"}]}));expect(()=>parseCapturedContext(b,createHash("sha256").update(b).digest("hex"))).toThrow(/context/);
});
it("keeps retries on one decision and masks only the receipted user intervention",()=>{
 const f=fixture(),r=f.receipts[0];if(!r)throw Error("fixture");const windows=buildGradeWindows({...f,receipts:[r,{...r,index:2}],read:()=>f.read(1)});expect(windows).toHaveLength(1);
 const text="candidate reminder",base={fromMessage:2,toMessage:3,fromTurn:0,toTurn:4,requestSha256:"original",context:{messages:[{role:"user",content:[{type:"text",text}]},{role:"assistant",content:text}],tools:[]}};
 const receipt={index:1,sha256:digest(text)},masked=blindGradeWindows([base],1,receipt);expect(masked[0]?.context.messages).toEqual([{role:"assistant",content:text}]);expect(masked[0]?.fromMessage).toBe(0);expect(base.context.messages).toHaveLength(2);
 expect(()=>blindGradeWindows([{...base,context:{...base.context,messages:[]}}],1,receipt)).toThrow(/receipt/);expect(()=>blindGradeWindows([{...base,context:{...base.context,messages:[{role:"user",content:text},{role:"user",content:text}]}}],1,receipt)).toThrow(/receipt/);
});
it("requires all segments and preserves any factual or verification veto with fixed diagnosis priority",()=>{
 const row={id:"e",diagnosis:"none" as const,factualError:false,verified:true,tokens:0,evidence:["whole interval"]};
 expect(aggregateJudgments("e",[row,row])).toMatchObject({verified:true,factualError:false,diagnosis:"none"});
 expect(aggregateJudgments("e",[row,{...row,verified:false,diagnosis:"invalid_action"},{...row,factualError:true,diagnosis:"unsupported_fact"}])).toMatchObject({verified:false,factualError:true,diagnosis:"unsupported_fact"});expect(aggregateJudgments("e",[{...row,diagnosis:"abandonment"}]).diagnosis).toBe("abandonment");expect(()=>aggregateJudgments("e",[])).toThrow();expect(()=>aggregateJudgments("e",[{...row,id:"other"}])).toThrow();
});
it("hashes both wire and agent images while retaining adjacent text",()=>{const json=gradingJson({a:{type:"image",data:"secret"},b:"data:image/png;base64,secret",c:"observed behavior"});expect(json).not.toContain("secret");expect(json).toContain("observed behavior");expect(json).toContain("pixels unavailable");});

it("losslessly records every changed request context including tool and system changes",()=>{
 const a={messages:[{role:"system",content:"old"},{role:"user",content:"same"},{role:"assistant",content:"tail"}],tools:["old"]},b={messages:[{role:"system",content:"new"},{role:"user",content:"same"},{role:"assistant",content:"tail"}],tools:["new"]};
 const delta=contextDelta(a,b,2,3,"hash");expect(applyContextDelta(a,delta)).toEqual(b);expect(delta.insert).toHaveLength(1);expect(applyContextDelta(b,contextDelta(b,b,2,3,"hash"))).toEqual(b);expect(()=>applyContextDelta(a,{...delta,prefix:10})).toThrow();
 const f=fixture(),w=buildGradeWindows(f)[0];expect(w?.updates).toHaveLength(2);let context=w?.context;if(!context)throw Error("fixture");for(const u of w?.updates??[])context=applyContextDelta(context,u);expect(context.messages[0]?.["content"]).toBe("actual context at third request");
});
