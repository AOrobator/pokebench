import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,type FeatureSet} from "./features.js";
import {TRUST_HEADER,withHarnessTrust} from "./harness-trust.js";
import {rederiveTrustHeaders,type ProbePorts,type RawRef} from "./decision-probe.js";
import {filePorts,parseArgs,probeModels,readRun} from "./probe-decision-cli.js";
import {trustOptions} from "./play-wiring.js";
import type {PlacesBody} from "./story-destinations.js";

interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa",Recording>;
const PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody).places;
const RAM={v:1 as const,sequence:1,frame:1,path:"raw-ram/00000001.json.gz",sha256:"a".repeat(64)};
// 4caa's recorded events, each state carrying a raw-RAM archive (the map table is read from one).
const EVENTS:RunEvent[]=RECORDED["4caa"].events.map(e=>{const v=checkEvent(e);return v.type==="state"?{...v,raw_ram:RAM}:v;});
const FEATURES:FeatureSet={...ALL_ON,"harness-trust-v1":true,"instruction-goal-ledger-v1":false,"objective-tracking-v1":false};
const result=EVENTS.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.turn===273);
if(result===undefined)throw Error("no 4caa result at turn 273");
const requested:RawRef[]=[];
const ports=(places=true):ProbePorts=>({frame:()=>"",rerender:()=>Promise.resolve([]),thinkingSignature:"reasoning_content",...(places?{places:(ref:RawRef)=>{requested.push(ref);return Promise.resolve(PLACES);}}:{})});
const STALE=`${TRUST_HEADER}\nStory goal: "something else" (MOM, turn 1) -> "LAB" = nowhere.`;

// The header the production wrapper puts on this result, given the same recorded events before it.
async function production():Promise<string> {
 const listeners:((e:RunEvent)=>void)[]=[];
 const event=EVENTS.find(e=>e.seq===result?.state_seq);
 if(event===undefined)throw Error("no state");
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 const state=Object.fromEntries(Object.entries(event).filter(([key])=>!envelope.has(key)));
 // navigate_to returns its Navigation text and the readout as separate parts; the recorder joins them with a newline.
 const text=result?.text ?? "",screen=text.search(/^Screen: /m);
 const tool:AgentTool={name:result?.name ?? "",label:"t",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:text.slice(0,screen-1)},{type:"text",text:text.slice(screen)}],details:{state}})};
 const [wrapped]=withHarnessTrust([tool],true,{subscribe:fn=>{listeners.push(fn);},storyGoalAway:()=>undefined},{places:()=>Promise.resolve({places:PLACES})},{...trustOptions(FEATURES),supervisor:true});
 for(const e of EVENTS){if(e.seq>=(result?.seq ?? 0))break;for(const fn of listeners)fn(e);}
 const out=await wrapped?.execute(result?.id ?? "",{});
 return (out?.content??[]).flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
}

describe("--trust-header re-derives harness-trust-v1's header from the recorded stream",()=>{
 it("replaces a recorded header with exactly what the production wrapper prints, body untouched",async()=>{
  const prior=EVENTS.filter(e=>e.seq<=result.seq).map(e=>e.seq===result.seq?{...result,text:`${STALE}\n\n${result.text}`}:e);
  const texts=new Map<number,string>();
  await rederiveTrustHeaders(prior,texts,FEATURES,FEATURES,ports(),new Set([result.seq]));
  const expected=await production();
  expect(result.name).toBe("navigate_to");
  expect(expected.startsWith(`${TRUST_HEADER}\n`)).toBe(true);
  expect(texts.get(result.seq)).toBe(expected);
  expect(requested).toEqual([{path:RAM.path,sha256:RAM.sha256}]);
 });
 it("leaves results outside the kept window, and results with no recorded header, as they are",async()=>{
  const prior=EVENTS.filter(e=>e.seq<=result.seq).map(e=>e.seq===result.seq?{...result,text:`${STALE}\n\n${result.text}`}:e);
  const texts=new Map<number,string>();
  await rederiveTrustHeaders(prior,texts,FEATURES,FEATURES,ports(),new Set());
  expect(texts.size).toBe(0);
  await rederiveTrustHeaders(EVENTS.filter(e=>e.seq<=result.seq),texts,FEATURES,FEATURES,ports(),new Set([result.seq]));
  expect(texts.size).toBe(0);
 });
 it("refuses without harness-trust-v1 in both the run and the arm, without the map table, and on a header with no body",async()=>{
  const off={...FEATURES,"harness-trust-v1":false};
  await expect(rederiveTrustHeaders([],new Map(),off,FEATURES,ports(),new Set())).rejects.toThrow("both the run and the arm");
  await expect(rederiveTrustHeaders([],new Map(),FEATURES,off,ports(),new Set())).rejects.toThrow("both the run and the arm");
  await expect(rederiveTrustHeaders([],new Map(),FEATURES,FEATURES,ports(false),new Set())).rejects.toThrow("places port");
  const prior=EVENTS.filter(e=>e.seq<=result.seq).map(e=>e.seq===result.seq?{...result,text:STALE}:e);
  await expect(rederiveTrustHeaders(prior,new Map(),FEATURES,FEATURES,ports(),new Set([result.seq]))).rejects.toThrow("no body");
 });
});

describe("probe CLI: --trust-header, local lanes and streamed event logs",()=>{
 it("parses --trust-header and leaves it off by default",()=>{
  expect(parseArgs(["a702","704"])).not.toHaveProperty("trustHeader");
  expect(parseArgs(["a702","704","--trust-header"]).trustHeader).toBe(true);
 });
 it("samples the endpoint file's lane when one is configured, else the gateway",async()=>{
  const {mkdtempSync,writeFileSync}=await import("node:fs");const {join}=await import("node:path");const {tmpdir}=await import("node:os");
  const file=join(mkdtempSync(join(tmpdir(),"probe-endpoint-")),"endpoint.json");
  writeFileSync(file,JSON.stringify({base_url:"http://127.0.0.1:8091/v1",api_key:"unused"}));
  const calls:string[]=[];
  const local=(e:{readonly baseUrl:string})=>{calls.push(`local ${e.baseUrl}`);return Promise.resolve([]);};
  const gateway=(c:{readonly gatewayUrl:string})=>{calls.push(`gateway ${c.gatewayUrl}`);return Promise.resolve([]);};
  await probeModels({endpointFile:file,gatewayUrl:"http://g",visionModels:[]},local,gateway);
  await probeModels({endpointFile:null,gatewayUrl:"http://g",visionModels:[]},local,gateway);
  expect(calls).toEqual(["local http://127.0.0.1:8091/v1","gateway http://g"]);
 });
 it("reads the map table through rerender.py with the arm's server switches, and refuses a body without one",async()=>{
  const calls:{args:readonly string[];env:NodeJS.ProcessEnv;input:string}[]=[];
  const reply={value:JSON.stringify({readouts:[],places:PLACES})};
  const ports=filePorts("/runs/r","/repo/env","reasoning_content",(file,args,options)=>{calls.push({args,env:options.env,input:options.input});return reply.value;},()=>Buffer.from(""),{});
  const ref={path:"raw-ram/00000001.json.gz",sha256:"a".repeat(64)};
  expect(await ports.places?.(ref,{...FEATURES,"displayed-place-names-v1":false})).toEqual(PLACES);
  expect(calls[0]?.args).toEqual(["run","--project","/repo/env","python","-m","pokebench_env.rerender"]);
  expect(JSON.parse(calls[0]?.input ?? "")).toEqual({run_dir:"/runs/r",raw_ram:[],places:ref});
  expect(calls[0]?.env.POKEBENCH_FEATURES_OFF).toContain("displayed-place-names-v1");
  reply.value=JSON.stringify({readouts:[]});
  await expect(ports.places?.(ref,FEATURES)).rejects.toThrow("no map table");
 });
 it("needs the replayed derivation",async()=>{
  const {decisionContext,parseRun}=await import("./decision-probe.js");
  const {SAMPLES}=await import("../test-support/events.js");
  const run=parseRun(SAMPLES.map((b,i)=>JSON.stringify({v:1,run:"r",seq:i,t:"2026-10-28T00:00:00.000-04:00",...b})).join("\n"));
  const {recordedFeatures}=await import("./decision-probe.js");
  await expect(decisionContext(run,1,recordedFeatures(run),ports(),"recorded",false,null,true)).rejects.toThrow("replayed derivation");
 });
 it("reads an event log line by line into the same run as parseRun",async()=>{
  const {mkdtempSync,writeFileSync}=await import("node:fs");const {join}=await import("node:path");const {tmpdir}=await import("node:os");
  const {parseRun}=await import("./decision-probe.js");
  const {SAMPLES}=await import("../test-support/events.js");
  const text=SAMPLES.map((b,i)=>JSON.stringify({v:1,run:"r",seq:i,t:"2026-10-28T00:00:00.000-04:00",...b})).join("\n")+"\n\n";
  const file=join(mkdtempSync(join(tmpdir(),"probe-run-")),"events.jsonl");
  writeFileSync(file,text);
  expect(await readRun(file)).toEqual(parseRun(text));
 });
});
