import {mkdtempSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,expect,it,vi} from "vitest";
import {completeSimple,type Context,type Model} from "@mariozechner/pi-ai";
import {RUN_START_META,SAMPLES} from "../test-support/events.js";
import {assistant} from "../test-support/pi.js";
import {recordedConversation,parseRun,type ProbePorts} from "./decision-probe.js";
import {checkEvent} from "./events.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {GATEWAY_COMPAT} from "./gateway.js";
import {filePorts,parseArgs} from "./probe-decision-cli.js";

const sourceId=RUN_START_META.model.id;
const model=(provider:string,id=sourceId):Model<"openai-completions">=>({id,name:id,api:"openai-completions",provider,baseUrl:"http://no-network.invalid/v1",reasoning:true,input:["text"],contextWindow:65536,maxTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},compat:GATEWAY_COMPAT});
const ports=(provider?:string):ProbePorts=>({frame:()=>"",rerender:()=>Promise.resolve([]),thinkingSignature:"reasoning_content",...(provider===undefined?{}:{historicalAssistantIdentity:{api:"openai-completions" as const,provider}})});
const source=()=>parseRun(SAMPLES.slice(0,6).map((e,seq)=>JSON.stringify({...e,v:1,run:"r",seq,t:"2026-10-29T00:00:00.000-04:00"})).join("\n"));
afterEach(()=>vi.unstubAllGlobals());
async function wire(target:Model<"openai-completions">,messages:Context["messages"]):Promise<Record<string,unknown>>{
 let payload:Record<string,unknown>|undefined;
 vi.stubGlobal("fetch",vi.fn(()=>{throw Error("network forbidden");}));
 await completeSimple(target,{messages},{apiKey:"fake",maxRetries:0,maxTokens:1,onPayload:(body)=>{payload=body as Record<string,unknown>;throw Error("capture before network");}});
 expect(fetch).not.toHaveBeenCalled();expect(payload).toBeDefined();return payload??{};
}
function previous(payload:Record<string,unknown>):Record<string,unknown>{
 const messages=payload.messages as Record<string,unknown>[];return messages.find(m=>m.role==="assistant")??{};
}
it.each(["local-llamacpp","local-vllm","local-gateway"])("preserves same-source native reasoning through actual pi serialization: %s",async provider=>{
 const history=recordedConversation(source(),ports(provider));const p=previous(await wire(model(provider),history));expect(p.reasoning_content).toBe("Look first.");expect(p.content??"").not.toContain("Look first.");
});
it("does not relabel source as the destination in intentional cross-model/provider probes",async()=>{
 const history=recordedConversation(source(),ports("local-llamacpp"));
 for(const target of [model("local-llamacpp","different-model"),model("local-gateway")]){const p=previous(await wire(target,history));expect(p.reasoning_content).toBeUndefined();expect(p.content).toContain("Look first.");}
});
it("fails closed for legacy source identity rather than guessing gateway or destination",()=>{
 expect(()=>recordedConversation(source(),ports())).toThrow(/source assistant identity.*not recorded/i);
});
it("uses recorded per-message identity and signature ahead of any historical assertion",async()=>{
 const original=source();const run={...original,events:original.events.map((e,i)=>i===2?checkEvent({...e,replay_identity:{api:"openai-completions",provider:"local-llamacpp",model:sourceId,thinking_signature:"reasoning"}}):e)};
 const history=recordedConversation(run,ports("local-gateway"));const p=previous(await wire(model("local-llamacpp"),history));expect(p.reasoning).toBe("Look first.");expect(p.reasoning_content).toBeUndefined();
});
it("records native source identity and reasoning field from the actual assistant message",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pb-replay-identity-")),log=RunLog.create(root,"2026-10-29T00-00-00_probe_rrrr");
 const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve({screen:"title",started:false,name:null,location:null,map_id:null,position:null,facing:null,in_battle:false,party:[],money:null,badges:[],play_time_s:null})}});
 await recorder.start(RUN_START_META);const reply={...assistant({thinking:"native",text:"visible"}),provider:"local-llamacpp",model:sourceId,content:[{type:"thinking" as const,thinking:"native",thinkingSignature:"reasoning"},{type:"text" as const,text:"visible"}]};
 await recorder.emit({type:"message_end",message:reply});const row=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>JSON.parse(line)as Record<string,unknown>).find(e=>e.type==="assistant");
 expect(row?.replay_identity).toEqual({api:reply.api,provider:reply.provider,model:reply.model,thinking_signature:"reasoning"});
});

it("threads explicit legacy source identity through file-backed CLI ports",()=>{
 const args=parseArgs(["source","2","--history-provider","local-llamacpp","--history-api","openai-completions","--history-thinking-field","reasoning_content","--context-only"]);
 expect(args).toMatchObject({historyProvider:"local-llamacpp",historyApi:"openai-completions",historyThinkingField:"reasoning_content"});
 const p=filePorts("/unused","/unused",args.historyThinkingField??"",()=>"",()=>Buffer.from(""),{}, {api:args.historyApi??"",provider:args.historyProvider??""});
 expect(recordedConversation(source(),p).find(m=>m.role==="assistant")).toMatchObject({api:"openai-completions",provider:"local-llamacpp",model:sourceId});
 expect(()=>parseArgs(["source","2","--history-provider",""])).toThrow(/source provider/);
 expect(()=>parseArgs(["source","2","--history-provider","local-llamacpp"])).toThrow(/explicit/);
 expect(()=>parseArgs(["source","2","--history-provider"])).toThrow(/needs a value/);
});
it("preserves per-message API/model differences and does not invent a missing recorded reasoning field",async()=>{
 for(const identity of [{api:"openai-responses",provider:"local-llamacpp",model:sourceId,thinking_signature:"reasoning_content"},{api:"openai-completions",provider:"local-llamacpp",model:"other-source",thinking_signature:"reasoning_content"},{api:"openai-completions",provider:"local-llamacpp",model:sourceId}]){
  const original=source(),run={...original,events:original.events.map((e,i)=>i===2?checkEvent({...e,replay_identity:identity}):e)};
  const history=recordedConversation(run,ports("local-llamacpp"));const p=previous(await wire(model("local-llamacpp"),history));
  expect(p.reasoning_content).toBeUndefined();
  if(identity.api!=="openai-completions"||identity.model!==sourceId)expect(p.content).toContain("Look first.");
 }
});

it.each(["--history-provider","--history-api","--history-thinking-field"])("refuses a missing %s value without consuming --context-only",flag=>{
 const pairs=[["--history-provider","local-llamacpp"],["--history-api","openai-completions"],["--history-thinking-field","reasoning_content"]];
 const args=["source","2",...pairs.filter(p=>p[0]!==flag).flat(),flag,"--context-only"];
 expect(()=>parseArgs(args)).toThrow(/needs a value/);
});
