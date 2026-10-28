import {expect,it,vi} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {StateWatcher} from "./game-state.js";
import {featureInfo,playHarnessFeatures,serverFeatureEnv,stateOnlyProblems} from "./features.js";
import {parseSceneJournal,withSceneJournal,type SceneJournalReply} from "./scene-journal.js";
import {RUN_START_META,IN_GAME} from "../test-support/events.js";
const OFF=flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false});
const ID="cutscene-journal-v1";
const rec={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healFirstLine:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
const base:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"final observation"}],details:{state:IN_GAME}})};
const reply=(entries:SceneJournalReply["entries"]=[],last=entries.at(-1)?.id??0):SceneJournalReply=>({first_id:1,last_id:last,entries,errors:0,last_error:null,omitted_images:0});
function png():string {const b=Buffer.alloc(33);Buffer.from("89504e470d0a1a0a","hex").copy(b);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");}
it("defaults OFF, metadata and server gate agree, without changing legacy tools",async()=>{
 expect(OFF[ID]).toBe(false);expect(stateOnlyProblems({...OFF,[ID]:true,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires cutscene-journal-v1 OFF");const {[ID]:omitted,...old}=OFF;expect(omitted).toBe(false);
 expect(normalizeFeatures(old)[ID]).toBe(false);
 expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null});
 expect(serverFeatureEnv(OFF).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 expect(playHarnessFeatures({...OFF,[ID]:true},null)).toContain(ID);
 const read=vi.fn();expect(withSceneJournal([base],false,{sceneEvents:read})[0]).toBe(base);
 await playGameTools([base],OFF,{read:()=>Promise.resolve(IN_GAME),sceneEvents:read},rec)[0]?.execute("off",{});
 expect(read).not.toHaveBeenCalled();expect(()=>withSceneJournal([base],true,{})).toThrow(/frame-owned/);
});
it("production factory reaches the HTTP client, delivering transient actors, text and intermediate image",async()=>{
 const calls:string[]=[];
 const entries=[{id:1,frame:20,text:"object 10 (sprite AQUA_MEMBER_M) appeared at (20,21)"},{id:2,frame:21,text:"object 10 (sprite AQUA_MEMBER_M) moved (20,21) -> (21,21)"},{id:3,frame:22,text:'field text (speaker not established): "Wait!"',image:png()},{id:4,frame:23,text:"object 10 left view"}];
 const fetcher:typeof fetch=url=>{calls.push(typeof url==="string"?url:url instanceof URL?url.href:url.url);return Promise.resolve(new Response(JSON.stringify(calls.length===1?reply(entries):reply([],4))));};
 const watcher=new StateWatcher("http://scene.test",fetcher);
 const tool=playGameTools([base],{...OFF,[ID]:true},watcher,rec)[0];if(tool===undefined)throw new Error("tool missing");
 const result=await tool.execute("on",{});
 expect(text(result)).toContain(entries.map(e=>`[scene event ${String(e.id)}, native step ${String(e.frame)}] ${e.text}`).join("\n"));
 expect(result.content.filter(p=>p.type==="image")).toEqual([{type:"image",data:png(),mimeType:"image/png"}]);
 expect(result.content[0]).toEqual({type:"text",text:"final observation"});expect(result.details).toEqual({state:IN_GAME});
 expect(text(await tool.execute("next",{}))).toBe("final observation");
 expect(calls).toEqual(["http://scene.test/pokebench/scene/events?after=0","http://scene.test/pokebench/scene/events?after=4"]);
});
it("keeps actions executed once when journal unavailable, preserves cursor for recovery",async()=>{
 const action=vi.fn(base.execute),read=vi.fn<(after:number)=>Promise<SceneJournalReply>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(reply([{id:1,frame:1,text:"recovered"}]));
 const tool=withSceneJournal([{...base,execute:action}],true,{sceneEvents:read})[0];if(!tool)throw new Error("missing");
 expect(text(await tool.execute("a",{}))).toContain("Scene history unavailable: offline");
 expect(text(await tool.execute("b",{}))).toContain("recovered");expect(action).toHaveBeenCalledTimes(2);expect(read.mock.calls.map(c=>c[0])).toEqual([0,0]);
});
it("reports ring loss, read failures and omitted visual evidence explicitly",async()=>{
 const s={...reply([{id:3,frame:4,text:"visible"}],3),first_id:3,errors:2,last_error:"bad owner",omitted_images:4};
 const tool=withSceneJournal([base],true,{sceneEvents:()=>Promise.resolve(s)})[0];if(!tool)throw new Error("missing");
 const t=text(await tool.execute("a",{}));expect(t).toContain("events 1–2");expect(t).toContain("2 frame reads failed; latest: bad owner");expect(t).toContain("4 additional visual samples omitted");
});
it("validates payload, event order, image size and HTTP failure",async()=>{
 expect(()=>parseSceneJournal({})).toThrow(/Malformed/);
 for(const s of [reply([{id:2,frame:1,text:"x"},{id:1,frame:2,text:"y"}],2),reply([{id:2,frame:1,text:"x"}],1)])expect(()=>parseSceneJournal(s)).toThrow(/order/);
 expect(()=>parseSceneJournal(reply([{id:1,frame:1,text:"x",image:"AA=="}]))).toThrow(/image/);
 const watcher=new StateWatcher("http://x",()=>Promise.resolve(new Response("",{status:503})));await expect(watcher.sceneEvents(0)).rejects.toThrow(/503/);
 const controller=new AbortController();controller.abort();const read=()=>Promise.reject(new Error("aborted"));
 const tool=withSceneJournal([base],true,{sceneEvents:read})[0];await expect(tool?.execute("a",{},controller.signal)).rejects.toThrow();
 const other={...base,name:"get_dialogue"};expect(withSceneJournal([other],true,{sceneEvents:read})[0]).toBe(other);
});

it("records delivered scene text and images durably with current frame first",async()=>{
 const {mkdtempSync,readFileSync}=await import("node:fs");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
 const {RunLog}=await import("./run-log.js");const {FrameStore}=await import("./frames.js");const {RunRecorder}=await import("./recorder.js");const {parseEvent}=await import("./events.js");
 const root=mkdtempSync(join(tmpdir(),"scene-record-"));const log=RunLog.create(root,"2026-10-25T00-00-00_scene_probe");
 const state={read:()=>Promise.resolve(IN_GAME),sceneEvents:(after:number)=>Promise.resolve(reply([{id:after+1,frame:7,text:"AQUA_MEMBER_M moved east",image:png()}]))};
 const recorder=new RunRecorder({log,frames:new FrameStore(root,1_000_000,()=>undefined),milestones:{poll:()=>Promise.resolve([])},gameState:state});
 const current={...base,execute:()=>Promise.resolve({content:[{type:"image" as const,data:png(),mimeType:"image/png"},{type:"text" as const,text:"current screen"}],details:{state:IN_GAME}})};
 await recorder.start(RUN_START_META,false);
 const tool=playGameTools([current],{...OFF,[ID]:true},state,recorder)[0];if(!tool)throw new Error("missing");
 await recorder.emit({type:"tool_execution_start",toolCallId:"scene",toolName:"observe",args:{}});
 const result=await tool.execute("scene",{});
 await recorder.emit({type:"tool_execution_end",toolCallId:"scene",toolName:"observe",result,isError:false});
 const rows=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
 const event=rows.find(e=>e.type==="tool_result");if(event?.type!=="tool_result")throw new Error("result missing");
 expect(event.text).toContain("[scene event 1, native step 7] AQUA_MEMBER_M moved east");
 expect(event.frames.map(f=>f.path)).toEqual([`frames/${String(event.seq).padStart(6,"0")}_0.png`,`frames/${String(event.seq).padStart(6,"0")}_1.png`]);
 expect(result.content[0]).toEqual({type:"image",data:png(),mimeType:"image/png"});
 expect(event.state_seq).toBeDefined();
 const {battleDecisionContext}=await import("./play-wiring.js");
 const battleState={...IN_GAME,in_battle:false,screen:"battle_transition"};
 const transform=battleDecisionContext({...OFF,[ID]:true,"battle-decision-ready-v1":true},{read:()=>Promise.resolve(battleState)},[tool],messages=>Promise.resolve(messages),recorder);
 const messages=await transform([]);const delivered=messages.at(-1);
 expect(delivered?.role).toBe("user");
 if(delivered?.role!=="user"||typeof delivered.content==="string")throw new Error("missing decision image parts");
 expect(delivered.content.filter(c=>c.type==="image")).toHaveLength(2);const tail=delivered.content.at(-1);if(tail?.type!=="text")throw new Error("missing scene history footer");expect(tail.text).toContain("End of historical scene samples");
 const last=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent).findLast(e=>e.type==="decision_input");
 expect(last?.type==="decision_input"?last.frames.map(f=>f.path):[]).toEqual(last?.type==="decision_input"?[`frames/${String(last.seq).padStart(6,"0")}_0.png`,`frames/${String(last.seq).padStart(6,"0")}_1.png`]:["missing decision"]);
});

it("production safe-capture switch distinguishes deferred scene samples from archive failure and keeps OFF bytes",async()=>{
 const id="scene-journal-safe-capture-v1";
 const coverage={frames:30,safe_frames:24,deferred_frames:6,recoveries:1,diagnostic_samples:8,diagnostic_omitted_samples:0,diagnostic_revision:8,persisted_revision:8,diagnostic_error:null};
 const payload={...reply(),coverage};
 const watcher=new StateWatcher("http://scene.test",()=>Promise.resolve(new Response(JSON.stringify(payload))));
 const on=playGameTools([base],{...OFF,[ID]:true,[id]:true},watcher,rec)[0];if(!on)throw Error("missing");
 const result=await on.execute("safe",{});expect(text(result)).toContain("6 deferred");expect(text(result)).toContain("not a transcript/archive failure");expect(text(result)).not.toContain("CAPTURE GAP");expect(result.content[0]).toEqual({type:"text",text:"final observation"});
 const off=playGameTools([base],{...OFF,[ID]:true},watcher,rec)[0];if(!off)throw Error("missing");expect(text(await off.execute("off",{}))).toBe("final observation");
 expect(OFF[id]).toBe(false);expect(featureInfo(id)).toMatchObject({needs:ID});expect(playHarnessFeatures({...OFF,[ID]:true,[id]:true},null)).toContain(id);
 expect(serverFeatureEnv({...OFF,[ID]:true,[id]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(id);
});

it("safe mode reports true scene failures/retention honestly, rejects inconsistent or backward coverage, and never loses the original result",async()=>{
 const coverage={frames:31,safe_frames:24,deferred_frames:6,recoveries:1,diagnostic_samples:8,diagnostic_omitted_samples:0,diagnostic_revision:8,persisted_revision:8,diagnostic_error:"disk"};
 const payload={...reply([{id:3,frame:31,text:"visible"}],3),first_id:3,errors:1,last_error:"bad pointer",coverage};
 const read=vi.fn().mockResolvedValueOnce(payload).mockResolvedValueOnce({...reply([],3),coverage:{...coverage,frames:30,diagnostic_error:null}}).mockResolvedValueOnce(reply());
 const tool=withSceneJournal([base],true,{sceneEvents:read},true)[0];if(!tool)throw Error("missing");
 const first=text(await tool.execute("first",{}));expect(first).toContain("SCENE HISTORY READ ERROR: 1 frame reads failed");expect(first).toContain("SCENE HISTORY RETENTION GAP");expect(first).toContain("diagnostic buffer could not be saved");expect(first).not.toContain("CAPTURE GAP");
 expect(text(await tool.execute("backward",{}))).toContain("Scene history unavailable");
 expect(text(await tool.execute("missing",{}))).toContain("safe scene coverage missing");
 for(const c of [{...coverage,safe_frames:30},{...coverage,persisted_revision:9}])expect(()=>parseSceneJournal({...payload,coverage:c})).toThrow(/coverage/);
 expect(read).toHaveBeenCalledTimes(3);
});


it("safe coverage reaches the next pinned-pi decision and exact durable replay record",async()=>{
 const {mkdtempSync,readFileSync,cpSync,rmSync}=await import("node:fs");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
 const {RunLog}=await import("./run-log.js");const {FrameStore}=await import("./frames.js");const {RunRecorder}=await import("./recorder.js");const {parseEvent}=await import("./events.js");
 const {Governor,piLoop,play}=await import("./harness.js");const {createAssistantMessageEventStream}=await import("@mariozechner/pi-ai");const {assistant,toolCall,userText}=await import("../test-support/pi.js");
 const root=mkdtempSync(join(tmpdir(),"scene-pi-"));
 try{
  const log=RunLog.create(root,"offline-safe-scene");
  const coverage={frames:30,safe_frames:24,deferred_frames:6,recoveries:1,diagnostic_samples:8,diagnostic_omitted_samples:1,diagnostic_revision:8,persisted_revision:8,diagnostic_error:null};
  const state={read:()=>Promise.resolve(IN_GAME),sceneEvents:()=>Promise.resolve({...reply([{id:1,frame:30,text:"Recovered coherent sample; intermediate actions unknown"}]),coverage})};
  const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:state});
  // Valid 240x160 PNG for browser replay; synthetic fixture pixels, no game execution.
  const {deflateSync}=await import("node:zlib");
  const {crc32}=await import("node:zlib");
  const chunk=(kind:string,bytes:Buffer)=>{const name=Buffer.from(kind),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([name,bytes])));return Buffer.concat([length,name,bytes,crc]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(240);header.writeUInt32BE(160,4);header[8]=8;header[9]=2;
  const image=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.alloc(160*(240*3+1),0))),chunk("IEND",Buffer.alloc(0))]).toString("base64");
  const action=vi.fn(()=>Promise.resolve({content:[{type:"text" as const,text:"Synthetic current observation"},{type:"image" as const,data:image,mimeType:"image/png"}],details:{state:IN_GAME}}));
  const tools=playGameTools([{...base,execute:action}],{...OFF,[ID]:true,"scene-journal-safe-capture-v1":true},state,recorder);
  await recorder.start({...RUN_START_META,harness_features:[ID,"scene-journal-safe-capture-v1"],tools:["observe"],system_prompt:"Offline recording fixture; no inference or game endpoint."},false);
  const governor=new Governor({limits:{maxTurns:2,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  const model:import("@mariozechner/pi-ai").Model<"openai-completions">={id:"offline-scene-fixture",name:"offline-scene-fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text","image"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:100};
  let decisions=0,delivered="";
  const streamFn:import("@mariozechner/pi-agent-core").StreamFn=(_model,context)=>{
   decisions++;if(decisions===2){delivered=context.messages.filter(m=>m.role==="toolResult").flatMap(m=>m.content.filter(p=>p.type==="text").map(p=>p.text)).join("\n");expect(delivered).toContain("24 coherent frames, 6 deferred samples");expect(delivered).toContain("not a transcript/archive failure");expect(delivered).toContain("Synthetic current observation");}
   const message=decisions===1?assistant({toolCalls:[toolCall("scene","observe",{})],stopReason:"toolUse"}):assistant({text:"fixture complete"});const stream=createAssistantMessageEventStream();stream.push({type:"done",reason:message.stopReason==="toolUse"?"toolUse":"stop",message});return stream;
  };
  const loop=piLoop({systemPrompt:"Offline scene fixture",tools,base:{model,convertToLlm:messages=>messages as import("@mariozechner/pi-ai").Message[]},governor,transformContext:recorder.transformContext,emit:recorder.emit,streamFn,signal:new AbortController().signal});
  expect(await play(userText("Fixture"),governor,loop)).toBe("budget");recorder.end("budget");
  const rows=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent),record=rows.find(e=>e.type==="tool_result");
  expect(record?.type==="tool_result"?record.text:null).toBe(delivered);expect(action).toHaveBeenCalledTimes(1);expect(decisions).toBe(2);
  expect(record?.type==="tool_result"?record.frames.length:0).toBe(1);
  const output=process.env.POKEBENCH_SCENE_TEST_EXPORT;if(output!==undefined)cpSync(log.runDir,join(output,log.runId),{recursive:true,errorOnExist:true,force:false});
 }finally{rmSync(root,{recursive:true,force:true});}
});
