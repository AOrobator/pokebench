import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,type FeatureSet} from "./features.js";
import {TRUST_HEADER,withHarnessTrust} from "./harness-trust.js";
import {rederiveTrustHeaders,type ProbePorts,type RawRef} from "./decision-probe.js";
import {filePorts,gatewaySampler,parseArgs,probeLane,readRun,readRunLines} from "./probe-decision-cli.js";
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
const ports=(places=true):ProbePorts=>({frame:()=>"",rerender:()=>Promise.resolve([]),thinkingSignature:"reasoning_content",historicalAssistantIdentity:{api:"openai-completions" as const,provider:"local-gateway"},...(places?{places:(ref:RawRef)=>{requested.push(ref);return Promise.resolve(PLACES);}}:{})});
const STALE=`${TRUST_HEADER}\nStory goal: "something else" (MOM, turn 1) -> "LAB" = nowhere.`;

const envelope=new Set(["v","run","seq","t","type","turn"]);
// States by seq, built once per replayed stream.
const statesOf=(events:readonly RunEvent[])=>new Map(events.flatMap(e=>e.type==="state"?[[e.seq,Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key)))] as const]:[]));
const WALKS=new Set(["navigate_to"]);
// What the production wrapper prints on every annotated result, fed the same recorded events in order: each result is
// annotated before its tool_result event is recorded. navigate_to returns its Navigation text and the readout as separate
// parts; the recorder joins them with a newline.
async function production(until:number,features:FeatureSet=FEATURES):Promise<Map<number,string>> {
 const listeners:((e:RunEvent)=>void)[]=[];
 const out=new Map<number,string>();
 let current:{text:string;state:unknown;walk:boolean}={text:"",state:undefined,walk:false};
 const tools=["observe","press","navigate_to"].map((name):AgentTool=>({name,label:name,description:"d",parameters:Type.Object({}),execute:()=>{
  const screen=current.text.search(/^Screen: /m);
  const parts=current.walk&&screen>0?[current.text.slice(0,screen-1),current.text.slice(screen)]:[current.text];
  return Promise.resolve({content:parts.map(text=>({type:"text" as const,text})),details:{state:current.state}});
 }}));
 const wrapped=withHarnessTrust(tools,true,{subscribe:fn=>{listeners.push(fn);},storyGoalAway:()=>undefined},{places:()=>Promise.resolve({places:PLACES})},{...trustOptions(features),supervisor:true});
 const snapshots=statesOf(EVENTS);
 // The recorder writes a result's own after-state once the wrapped tool has returned: listeners see it after annotation.
 const afterStates=new Set(EVENTS.flatMap(e=>e.type==="tool_result"&&e.state_seq!==undefined?[e.state_seq]:[]));
 let deferred:RunEvent[]=[];
 for(const e of EVENTS){
  if(e.seq>until)break;
  if(afterStates.has(e.seq)||(deferred.length>0&&e.type!=="tool_result")){deferred.push(e);continue;}
  if(e.type==="tool_result"&&!e.is_error&&["observe","press","navigate_to"].includes(e.name)){
   const state=e.state_seq===undefined?undefined:snapshots.get(e.state_seq);
   if(state!==undefined&&state["started"]===true){
    current={text:e.text,state,walk:WALKS.has(e.name)};
    const r=await wrapped.find(t=>t.name===e.name)?.execute(e.id,{});
    out.set(e.seq,(r?.content??[]).flatMap(c=>c.type==="text"?[c.text]:[]).join("\n"));
   }
  }
  for(const d of [...deferred,e])for(const fn of listeners)fn(d);
  deferred=[];
 }
 return out;
}
// The recorded stream as a run with harness-trust-v1 on would have stored it: each annotated result carries a header.
async function recordedWithHeaders(until:number,features:FeatureSet=FEATURES):Promise<RunEvent[]> {
 const printed=await production(until,features);
 return EVENTS.filter(e=>e.seq<=until).map(e=>e.type==="tool_result"&&printed.has(e.seq)?{...e,text:printed.get(e.seq) ?? e.text}:e);
}

describe("--trust-header re-derives harness-trust-v1's header from the recorded stream",()=>{
 it("replaces a recorded goal line with exactly what the production wrapper prints, the other lines and the body untouched",async()=>{
  const expected=(await production(result.seq)).get(result.seq) ?? "";
  expect(result.name).toBe("navigate_to");
  expect(expected.startsWith(`${TRUST_HEADER}\nStory goal: `)).toBe(true);
  // The same result as recorded under other story switches: a different goal line, everything else as printed.
  const stale=expected.replace(/^Story goal: .*$/m,'Story goal: "something else" (MOM, turn 1) -> "LAB" = nowhere.');
  expect(stale).not.toBe(expected);
  const prior=EVENTS.filter(e=>e.seq<=result.seq).map(e=>e.seq===result.seq?{...result,text:stale}:e);
  const texts=new Map<number,string>();
  await rederiveTrustHeaders(prior,texts,FEATURES,FEATURES,ports(),new Set([result.seq]));
  expect(texts.get(result.seq)).toBe(expected);
  expect(requested).toContainEqual({path:RAM.path,sha256:RAM.sha256});
 });
 it("keeps the recorded characters, exits and people lines, which come from parts the recording joined",async()=>{
  const expected=(await production(result.seq)).get(result.seq) ?? "";
  const cut=expected.indexOf("\n\n");
  const recorded=`${expected.slice(0,cut)}\nA line only the recorded header had.${expected.slice(cut)}`;
  const prior=EVENTS.filter(e=>e.seq<=result.seq).map(e=>e.seq===result.seq?{...result,text:recorded}:e);
  const texts=new Map<number,string>();
  await rederiveTrustHeaders(prior,texts,FEATURES,FEATURES,ports(),new Set([result.seq]));
  expect(texts.get(result.seq)).toBe(recorded);
 });
 it("replays every annotated result, so a result kept alone gets the header it got after the ones collapsed out of the window",async()=>{
  const last=[...EVENTS].reverse().find(e=>e.type==="tool_result"&&["press","navigate_to","observe"].includes(e.name));
  if(last===undefined)throw Error("no result");
  const printed=await production(last.seq);
  const recorded=await recordedWithHeaders(last.seq);
  const all=new Map<number,string>();
  await rederiveTrustHeaders(recorded,all,FEATURES,FEATURES,ports(),new Set(printed.keys()));
  expect(all).toEqual(printed);
  const alone=new Map<number,string>();
  await rederiveTrustHeaders(recorded,alone,FEATURES,FEATURES,ports(),new Set([last.seq]));
  expect([...alone.entries()]).toEqual([[last.seq,printed.get(last.seq)]]);
  expect(printed.size).toBe(3);
 });
 it("leaves results outside the kept window, and results with no recorded header, as they are",async()=>{
  const prior=EVENTS.filter(e=>e.seq<=result.seq).map(e=>e.seq===result.seq?{...result,text:`${STALE}\n\n${result.text}`}:e);
  const texts=new Map<number,string>();
  await rederiveTrustHeaders(prior,texts,FEATURES,FEATURES,ports(),new Set());
  expect(texts.size).toBe(0);
  await rederiveTrustHeaders(EVENTS.filter(e=>e.seq<=result.seq),texts,FEATURES,FEATURES,ports(),new Set([result.seq]));
  expect(texts.size).toBe(0);
 });
 it("a walk-away note on a kept result counts the moves collapsed out of the window, as the run did",async()=>{
  // After MAY's turn-272 "head back to the LAB", three presses in LITTLEROOT TOWN each end farther from the lab door at (7,16).
  const said=EVENTS.find(e=>e.type==="tool_result"&&e.turn===272);
  const template=EVENTS.find(e=>e.type==="state"&&e.seq===(said?.type==="tool_result"?said.state_seq:-1));
  if(said?.type!=="tool_result"||template?.type!=="state"||!("started" in template))throw Error("4caa turn 272");
  const moves:RunEvent[]=[13,10,7,4].flatMap((y,i)=>{
   const seq=900000+i*2,turn=500+i;
   const state:RunEvent={...template,seq,turn,map_id:[0,9],location:"LITTLEROOT TOWN",position:{x:7,y},screen:"overworld",in_battle:false,field_controls_locked:false};
   const res:RunEvent={...said,seq:seq+1,turn,id:`walk${String(i)}`,name:"press",state_seq:seq,text:"pressed UP"};
   return [state,res];
  });
  const stream=[...EVENTS.filter(e=>e.seq<=said.seq),...moves];
  const original=[...EVENTS];
  EVENTS.splice(0,EVENTS.length,...stream);
  try{
   const last=moves.at(-1);if(last===undefined)throw Error("moves");
   // reachable-story-guidance-v1 counts only ways the readout's foot flood reaches; these synthetic states carry none.
   const features={...FEATURES,"reachable-story-guidance-v1":false};
   const printed=await production(last.seq,features);
   expect([...printed.values()].join("\n")).toContain("SUPERVISOR: Your last two moves took you farther from");
   const recorded=await recordedWithHeaders(last.seq,features);
   // The result that carries the note, kept alone: the note counts the presses collapsed out of the window.
   const noted=[...printed.entries()].find(([,text])=>text.includes("SUPERVISOR: Your last two moves took you farther from"))?.[0];
   if(noted===undefined)throw Error("no note");
   const alone=new Map<number,string>();
   await rederiveTrustHeaders(recorded,alone,features,features,ports(),new Set([noted]));
   expect(alone.get(noted)).toBe(printed.get(noted));
  }finally{EVENTS.splice(0,EVENTS.length,...original);}
 });
 it("a result whose own after-state is the first on the goal map was annotated before that state was recorded",async()=>{
  // After MAY's turn-272 "head back to the LAB": a walk through LITTLEROOT TOWN whose own after-state is inside the LAB.
  const said=EVENTS.find(e=>e.type==="tool_result"&&e.turn===272);
  const template=EVENTS.find(e=>e.type==="state"&&e.seq===(said?.type==="tool_result"?said.state_seq:-1));
  if(said?.type!=="tool_result"||template?.type!=="state"||!("started" in template))throw Error("4caa turn 272");
  const during:RunEvent={...template,seq:910000,turn:600,map_id:[0,9],location:"LITTLEROOT TOWN",position:{x:7,y:17},screen:"overworld",in_battle:false};
  const inside:RunEvent={...template,seq:910001,turn:600,map_id:[1,4],location:"LITTLEROOT TOWN PROFESSOR BIRCHS LAB",position:{x:6,y:12},screen:"overworld",in_battle:false};
  const walk:RunEvent={...said,seq:910002,turn:600,id:"arrive",name:"navigate_to",state_seq:inside.seq,text:"Navigation: map changed; inspect destination; 1 bounded movement actions.\nScreen: overworld"};
  const original=[...EVENTS];
  // The LAB is never entered before this walk (4caa's earlier LAB states are left out).
  const lab=(e:RunEvent)=>e.type==="state"&&"started" in e&&e.map_id?.[0]===1&&e.map_id[1]===4;
  EVENTS.splice(0,EVENTS.length,...EVENTS.filter(e=>e.seq<=said.seq&&!lab(e)),during,inside,walk);
  try{
   const printed=await production(walk.seq);
   expect(printed.get(walk.seq)).toContain('Story goal: "Well, it\'s time to head back to the LAB."');
   const recorded=await recordedWithHeaders(walk.seq);
   const texts=new Map<number,string>();
   await rederiveTrustHeaders(recorded,texts,FEATURES,FEATURES,ports(),new Set([walk.seq]));
   expect(texts.get(walk.seq)).toBe(printed.get(walk.seq));
  }finally{EVENTS.splice(0,EVENTS.length,...original);}
 });
 it("refuses an arm that changes a switch behind the header lines it keeps as recorded",async()=>{
  for(const id of ["harness-trust-v2","semantic-navigation-v2","character-presence-v1","exit-reachability-v1","exit-labels-v3","untalked-people-header-v1","displayed-place-names-v1"] as const)
   await expect(rederiveTrustHeaders([],new Map(),{...FEATURES,[id]:!FEATURES[id]},FEATURES,ports(),new Set())).rejects.toThrow(`leave ${id} as recorded`);
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
 it("samples the endpoint file's lane with its key when one is configured, else the gateway",async()=>{
  const {mkdtempSync,writeFileSync}=await import("node:fs");const {join}=await import("node:path");const {tmpdir}=await import("node:os");
  const file=join(mkdtempSync(join(tmpdir(),"probe-endpoint-")),"endpoint.json");
  writeFileSync(file,JSON.stringify({base_url:"http://127.0.0.1:8091/v1",api_key:"lane-key"}));
  const calls:string[]=[];
  const local=(e:{readonly baseUrl:string})=>{calls.push(`local ${e.baseUrl}`);return Promise.resolve([]);};
  const gateway=(c:{readonly gatewayUrl:string})=>{calls.push(`gateway ${c.gatewayUrl}`);return Promise.resolve([]);};
  expect((await probeLane({endpointFile:file,gatewayUrl:"http://g",visionModels:[]},local,gateway)).apiKey).toBe("lane-key");
  expect((await probeLane({endpointFile:null,gatewayUrl:"http://g",visionModels:[]},local,gateway)).apiKey).toBeUndefined();
  expect(calls).toEqual(["local http://127.0.0.1:8091/v1","gateway http://g"]);
  const keys:string[]=[];
  const complete=((_m:unknown,_c:unknown,o:{apiKey?:string})=>{keys.push(o.apiKey ?? "");return Promise.resolve({} as never);}) as unknown as Parameters<typeof gatewaySampler>[0];
  const model={id:"m",provider:"pokebench-gateway",contextWindow:1000,maxTokens:100,input:["text"]} as unknown as Parameters<typeof gatewaySampler>[1];
  const context={turn:1,systemPrompt:"s",messages:[],tools:[],size:{messages:0,images:0,est_tokens:0}};
  await gatewaySampler(complete,model,"off",100,"lane-key")(context);
  await gatewaySampler(complete,model,"off",100)(context);
  // Without an endpoint key the sampler keeps the gateway key it always sent.
  expect(keys).toEqual(["lane-key","local-stack"]);
 });
 it("parses each line as it is read: a malformed first line fails before the next is pulled",async()=>{
  let pulled=0;
  async function* lines():AsyncGenerator<string>{pulled++;yield "{not json";pulled++;yield await Promise.reject(new Error("pulled a second line"));}
  await expect(readRunLines(lines())).rejects.toThrow(SyntaxError);
  expect(pulled).toBe(1);
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
