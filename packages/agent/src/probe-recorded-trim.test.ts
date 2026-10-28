import {describe,expect,it} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {contextSize,trimToRecorded,type ContextSize} from "./decision-probe.js";
import {parseArgs,reportLines,type ProbeReport} from "./probe-decision-cli.js";

const image={type:"image" as const,data:"x",mimeType:"image/png"};
const user=(text:string):AgentMessage=>({role:"user",content:text,timestamp:0});
const assistant=(id:string):AgentMessage=>({role:"assistant",content:[{type:"toolCall",id,name:"press",arguments:{}}],api:"openai-completions",provider:"p",model:"m",usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"toolUse",timestamp:0} as AgentMessage);
const result=(id:string,images:number):AgentMessage=>({role:"toolResult",toolCallId:id,toolName:"press",content:[{type:"text",text:"r"},...Array.from({length:images},()=>image)],isError:false,timestamp:0});
// A task, then five turns whose results carry 0, 3, 7, 3 and 3 images (a702 T633's last turns).
const HISTORY:AgentMessage[]=[user("task"),...[0,3,7,3,3].flatMap((n,i)=>[assistant(`c${String(i)}`),result(`c${String(i)}`,n)])];
// What the live recorder saw: the request plus one note an inner context transform appends before it.
const atRecorder=(kept:AgentMessage[]):Promise<ContextSize>=>Promise.resolve(contextSize([...kept,user("ledger note")] as Parameters<typeof contextSize>[0]));

describe("--recorded-trim cuts whole turns until the request the recorder measured matches",()=>{
 it("drops the oldest turns the way the budget does, and keeps the task",async()=>{
  // Recorded: task + 3 turns + warning + note = 9 messages, 13 images.
  const kept=await trimToRecorded(HISTORY,"warning",{messages:9,images:13,est_tokens:0},atRecorder);
  expect(kept[0]).toBe(HISTORY[0]);
  expect(kept.slice(1)).toEqual(HISTORY.slice(5));
 });
 it("keeps everything when the recorded request was not trimmed",async()=>{
  expect(await trimToRecorded(HISTORY,null,{messages:12,images:16,est_tokens:0},atRecorder)).toEqual(HISTORY);
 });
 it("refuses a rebuild no cut matches, naming what each cut measured",async()=>{
  await expect(trimToRecorded(HISTORY,null,{messages:8,images:12,est_tokens:0},atRecorder)).rejects.toThrow("no whole-turn cut of the rebuilt request matches the recorded one (8 messages, 12 images); cuts measured messages/images 12/16, 10/16, 8/13, 6/6, 4/3");
  await expect(trimToRecorded([],null,{messages:1,images:0,est_tokens:0},atRecorder)).rejects.toThrow("empty");
 });
});

describe("--recorded-trim flag and report",()=>{
 it("parses only when given",()=>{
  expect(parseArgs(["a702","633"])).not.toHaveProperty("recordedTrim");
  expect(parseArgs(["a702","633","--recorded-trim"]).recordedTrim).toBe(true);
 });
 it("reports the recorder-position size next to the rebuilt one",()=>{
  const size={messages:8,images:13,est_tokens:27226};
  const report={run:"r",turn:633,recorded:{action:null,size},fidelity:true,rerendered:false,diff:null,arms:[{label:"recorded switches",features:{},decisions:[],context:{turn:633,systemPrompt:"",messages:[],tools:[],size:{messages:9,images:13,est_tokens:27814},recorderSize:size}}]} as unknown as ProbeReport;
  const lines=reportLines(report);
  expect(lines[1]).toContain("same size");
  expect(lines[2]).toBe("--recorded-trim: measured where the run's recorder measured it: 8 messages, 13 images, ~27226 tokens");
 });
});

describe("--recorded-trim in decisionContext",()=>{
 it("measures the rebuilt request where the live recorder sits and reports it",async()=>{
  const {decisionContext,parseRun,recordedFeatures}=await import("./decision-probe.js");
  const {SAMPLES}=await import("../test-support/events.js");
  const run=parseRun(SAMPLES.map((b,i)=>JSON.stringify({v:1,run:"r",seq:i,t:"2026-10-28T00:00:00.000-04:00",...b})).join("\n"));
  const ports={frame:()=>"",rerender:()=>Promise.resolve([]),thinkingSignature:"reasoning_content"};
  const plain=await decisionContext(run,1,recordedFeatures(run),ports);
  expect(plain.recorderSize).toBeUndefined();
  const trimmed=await decisionContext(run,1,recordedFeatures(run),ports,"replayed",false,null,false,true);
  expect(trimmed.recorderSize).toEqual({messages:1,images:0,est_tokens:trimmed.recorderSize?.est_tokens});
  expect(trimmed.messages).toEqual(plain.messages);
 });
});
