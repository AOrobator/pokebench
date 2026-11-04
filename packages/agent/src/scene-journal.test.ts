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
 const read=vi.fn().mockResolvedValueOnce(payload).mockResolvedValueOnce({...reply([],3),coverage:{...coverage,frames:30,diagnostic_error:null}}).mockResolvedValueOnce({...payload,coverage:{...coverage,frames:32,safe_frames:26,deferred_frames:5}}).mockResolvedValueOnce({...payload,coverage:{...coverage,frames:32,safe_frames:23,deferred_frames:8}}).mockResolvedValueOnce(reply());
 const tool=withSceneJournal([base],true,{sceneEvents:read},true)[0];if(!tool)throw Error("missing");
 const first=text(await tool.execute("first",{}));expect(first).toContain("SCENE HISTORY READ ERROR: 1 frame reads failed");expect(first).toContain("SCENE HISTORY RETENTION GAP");expect(first).toContain("diagnostic buffer could not be saved");expect(first).not.toContain("CAPTURE GAP");
 expect(text(await tool.execute("backward",{}))).toContain("scene coverage cursor moved backward");
 expect(text(await tool.execute("deferred-backward",{}))).toContain("scene coverage cursor moved backward");
 expect(text(await tool.execute("safe-backward",{}))).toContain("scene coverage cursor moved backward");
 expect(text(await tool.execute("missing",{}))).toContain("safe scene coverage missing");
 for(const c of [{...coverage,safe_frames:30},{...coverage,persisted_revision:9}])expect(()=>parseSceneJournal({...payload,coverage:c})).toThrow(/coverage/);
 expect(read).toHaveBeenCalledTimes(5);
});
