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
const ports=(provider?:string):ProbePorts=>({frame:()=>"",rerender:()=>Promise.resolve([]),thinkingSignature:"reasoning_content",...(provider===undefined?{}:{historicalAssistantIdentity:{api:"openai-completions" as const,provider}})});
const source=()=>parseRun(SAMPLES.slice(0,6).map((e,seq)=>JSON.stringify({...e,v:1,run:"r",seq,t:"2026-10-29T00:00:00.000-04:00"})).join("\n"));
afterEach(()=>vi.unstubAllGlobals());
it("fails closed for legacy source identity rather than guessing gateway or destination",()=>{
 expect(()=>recordedConversation(source(),ports())).toThrow(/source assistant identity.*not recorded/i);
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

it.each(["--history-provider","--history-api","--history-thinking-field"])("refuses a missing %s value without consuming --context-only",flag=>{
 const pairs=[["--history-provider","local-llamacpp"],["--history-api","openai-completions"],["--history-thinking-field","reasoning_content"]];
 const args=["source","2",...pairs.filter(p=>p[0]!==flag).flat(),flag,"--context-only"];
 expect(()=>parseArgs(args)).toThrow(/needs a value/);
});
