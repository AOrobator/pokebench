import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {checkEvent,type AuthoredSceneLabel,type RunEvent} from "./events.js";
import {featuresOf,type FeatureSet} from "./features.js";
import {contextDiff,decisionContext,recordedRun,type ProbePorts,type RawRef} from "./decision-probe.js";
import {pageLines} from "./dialogue-auto-advance.js";
import {filePorts} from "./probe-decision-cli.js";

const ID="authored-scene-labels-v1";
const event=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({...body,v:1,run:"scene-probe",t:"2026-10-30T00:00:00.000-04:00",seq,turn});
const FLAGS=featuresOf(["ram-state-v1","field-dialogue-phase-v1","dialogue-auto-advance-v1","script-line-presence-v1","observed-instructions-v1","observed-field-dialogue-v1"]);
const raw=(n:number)=>({v:1 as const,sequence:n,frame:n,path:`raw-ram/${String(n).padStart(8,"0")}.json.gz`,sha256:String(n).repeat(64)});
const native=(employee=false):AuthoredSceneLabel=>employee
 ?{source:"authored-script",scene:"rustboro-theft-chase",beat:"employee-chase",speaker:"DEVON EMPLOYEE",map_id:[0,3],actor_local_id:9,message_pointer:0x081e1817,return_pc:0x081e09ff,rom_sha1:"f3ae088181bf583e55daf962a92bb46f4f1d07b7"}
 :{source:"authored-script",scene:"rustboro-theft-chase",beat:"grunt-escape",speaker:"TEAM AQUA GRUNT",map_id:[0,3],actor_local_id:10,message_pointer:0x081e17fe,return_pc:0x081e09d5,rom_sha1:"f3ae088181bf583e55daf962a92bb46f4f1d07b7"};
const ref=(n:number):RawRef=>({path:raw(n).path,sha256:raw(n).sha256});
function fixture(options:{missingRaw?:boolean;badSourceLine?:boolean}={}){
 const recorded=JSON.parse(readFileSync(new URL("../test-support/scene-followup-events.json",import.meta.url),"utf8")) as Record<string,{event:Extract<RunEvent,{type:"dialogue_auto_advance"}>}>;
 const source=Object.values(recorded).find(v=>v.event.pages.length===3)?.event;if(source===undefined)throw Error("missing three-page theft fixture");
 const pages=source.pages.map((p,i)=>({...p,state_seq:i+4}));
 const advance=event({...source,tool_call_id:"c1",tool:"press",pages},9);
 const text=`Dialogue shown during this call:\n${pageLines(pages,1).join("\n")}\n\nScreen: overworld\nLocation: RUSTBORO CITY\nPosition: X=20, Y=21`;
 const start=event({type:"run_start",...RUN_START_META,harness_features:Object.keys(FLAGS).filter(id=>FLAGS[id as keyof FeatureSet])},0,0);
 const states=pages.map((p,i)=>event({...IN_GAME,type:"state",location:"RUSTBORO CITY",map_id:[0,3],position:{x:20,y:21},...(options.missingRaw&&i===0?{}:{raw_ram:raw(i+1)}),world_context:{objects:[],triggers:[],dialogue:p.text,message:{phase:"page_wait",ready:true,cursor:10}}},i+4));
 const events=[start,event({type:"turn_start",context:{messages:1,images:0,est_tokens:1}},1),event({type:"assistant",thinking:"Look",text:"",tool_calls:[{id:"c1",name:"press",args:{buttons:["A"]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"},2),event({type:"tool_call",id:"c1",name:"press",args:{buttons:["A"]}},3),...states,event({...IN_GAME,type:"state",location:"RUSTBORO CITY",map_id:[0,3],position:{x:20,y:21},raw_ram:raw(4),world_context:{objects:[],triggers:[],dialogue:null}},8),advance,event({type:"tool_result",id:"c1",name:"press",is_error:false,duration_ms:1,text:options.badSourceLine?text.replace("Dialogue shown during this call:","Unqualified legacy dialogue:").replace(pages[0]?.text??"","different source text"):text,state_seq:8,frames:[]},10),event({type:"turn_start",context:{messages:4,images:0,est_tokens:100}},11,2)];
 return {run:recordedRun(events),text,advance};
}
function ports(labels:readonly (ReturnType<typeof native>|null)[]=[native(),native(true),native(true)]){
 const requested:RawRef[][]=[];
 const p:ProbePorts={frame:()=>"",rerender:()=>{throw Error("base readout must remain recorded for metadata-only labels");},thinkingSignature:"reasoning_content",historicalAssistantIdentity:{api:"openai-completions",provider:"local-llamacpp"},sceneLabels:refs=>{requested.push([...refs]);return Promise.resolve(labels);}};
 return {p,requested};
}
const textOf=(context:Awaited<ReturnType<typeof decisionContext>>)=>JSON.stringify(context.messages);
it("qualifies native page archives and relabels only the production page lines in a composite result",async()=>{
 const f=fixture(),s=ports();
 const off=await decisionContext(f.run,2,FLAGS,s.p);
 const on=await decisionContext(f.run,2,{...FLAGS,[ID]:true},s.p,"replayed",true);
 expect(s.requested).toEqual([[ref(1),ref(2),ref(3)]]);expect(contextDiff(off,on)).toMatchObject({systemPrompt:false,tools:false});
 expect(textOf(on)).toContain("TEAM AQUA GRUNT (authored script role)");expect(textOf(on)).toContain("DEVON EMPLOYEE (authored script role)");
 expect(on.messages.some(m=>m.role==="user"&&typeof m.content==="string"&&m.content.includes('speaker_source: "authored-script"'))).toBe(true);expect(textOf(on)).toContain("Get out!");expect(textOf(on)).toContain("Don't take my GOODS!");expect(textOf(on)).toContain("Position: X=20, Y=21");expect(textOf(off)).not.toContain("authored script role");
 expect(JSON.stringify(f.run)).not.toContain('"scene_label"');
});
it("OFF is exact existing reconstruction and does not acquire native attribution",async()=>{const f=fixture(),s=ports();const a=await decisionContext(f.run,2,FLAGS,s.p),b=await decisionContext(f.run,2,{...FLAGS,[ID]:false},s.p);expect({...a,messages:a.messages.map(m=>({...m,timestamp:0}))}).toEqual({...b,messages:b.messages.map(m=>({...m,timestamp:0}))});expect(s.requested).toEqual([]);});
it("requires native metadata qualification instead of silently treating ON as control",async()=>{const f=fixture(),{sceneLabels:omitted,...p}=ports().p;expect(omitted).toBeDefined();await expect(decisionContext(f.run,2,{...FLAGS,[ID]:true},p)).rejects.toThrow(/scene.*label.*port|native.*label.*port/i);});
it("rejects a candidate page without its raw source archive",async()=>{const f=fixture({missingRaw:true});await expect(decisionContext(f.run,2,{...FLAGS,[ID]:true},ports().p)).rejects.toThrow(/raw.*archive|raw.*RAM/i);});
it("rejects missing or malformed qualification results",async()=>{const f=fixture();await expect(decisionContext(f.run,2,{...FLAGS,[ID]:true},ports([native()]).p)).rejects.toThrow(/count|length|qualification/i);});
it("does not hide an unsupported historical dialogue format behind new labels",async()=>{const f=fixture({badSourceLine:true});await expect(decisionContext(f.run,2,{...FLAGS,[ID]:true},ports().p)).rejects.toThrow(/page.*line|source.*line|dialogue.*format/i);});
it("still refuses unrelated composite server changes",async()=>{const f=fixture();await expect(decisionContext(f.run,2,{...FLAGS,[ID]:true,"live-player-position-v1":true},ports().p,"replayed",true)).rejects.toThrow(/auto-advanced/i);});
it("file ports invoke the same native reader with argv, source refs and strict typed results",async()=>{
 const calls:{file:string;args:readonly string[];input:string}[]=[];
 const p=filePorts("/runs/source","/repo/env","reasoning_content",(file,args,options)=>{calls.push({file,args,input:options.input});return JSON.stringify({labels:[native()]});});
 expect(await p.sceneLabels?.([ref(1)])).toEqual([native()]);expect(calls).toEqual([{file:"uv",args:["run","--project","/repo/env","python","-m","pokebench_env.authored_scene_labels"],input:JSON.stringify({run_dir:"/runs/source",raw_ram:[ref(1)]})}]);
});
it.each(["{}",'{"labels":[]}','{"labels":[{"speaker":"made up"}]}'])("file ports reject an invalid native body %s",body=>{const p=filePorts("/runs/source","/repo/env","reasoning_content",()=>body);expect(p.sceneLabels).toBeTypeOf("function");expect(()=>p.sceneLabels?.([ref(1)])).toThrow(/scene.*label|native.*label/i);});

it("rejects a page whose cited archive state contains different dialogue",async()=>{const f=fixture();const source=f.run.events.find(e=>e.type==="state"&&e.seq===4);if(source?.type!=="state"||!("started"in source)||!source.started)throw Error("missing state");const changed=checkEvent({...source,world_context:{...source.world_context,dialogue:"another line"}});const run=recordedRun(f.run.events.map(e=>e.seq===4?changed:e));await expect(decisionContext(run,2,{...FLAGS,[ID]:true},ports().p)).rejects.toThrow(/source.*state|dialogue.*source/i);});

it("qualifies displayed pages cut from a longer native message buffer",async()=>{const f=fixture();const run=recordedRun(f.run.events.map(e=>e.type==="state"&&e.seq===5&&"started"in e&&e.started?checkEvent({...e,world_context:{...e.world_context,dialogue:"Wait! Pleeeaaase!\nDon't take my GOODS!"}}):e));const on=await decisionContext(run,2,{...FLAGS,[ID]:true},ports().p);expect(textOf(on)).toContain("DEVON EMPLOYEE (authored script role)");});
it("does not claim metadata-only OFF replay for sources recorded with labels ON",async()=>{const f=fixture();const run=recordedRun(f.run.events.map(e=>e.type==="run_start"?checkEvent({...e,harness_features:[...e.harness_features,ID]}):e));await expect(decisionContext(run,2,{...FLAGS,[ID]:false},ports().p,"replayed",true)).rejects.toThrow(/auto-advanced/i);});
