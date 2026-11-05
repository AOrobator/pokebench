import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {CheckpointCapture,checkpointSelection,checkpointTarget,type CheckpointDeps,type CheckpointSelection} from "./checkpoint-capture.js";
import {REQUIRED_FRONTIER_MILESTONES} from "./milestones.js";
import {parsePlayPreset,presetStart} from "./play-preset.js";
import {} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {RunRecorder,type RecorderDeps,type RunStartMeta} from "./recorder.js";

const ev=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"cp-run",t:"2026-10-14T12:00:00.000-04:00",turn:4,seq,...body});
const milestone=(name:string,seq:number,origin="observed",kind="story")=>ev({type:"milestone",name,server_timestamp:1,kind,origin,evidence:[seq-1]},seq);
const milestoneFor=(run:string,name:string,seq:number):RunEvent=>checkEvent({v:1,run,t:"2026-10-14T12:00:00.000-04:00",turn:4,seq,type:"milestone",name,server_timestamp:1,kind:"navigation",origin:"observed",evidence:[seq-1]});
const STATE=Buffer.from("native-state");
const sha1=createHash("sha1").update(STATE).digest("hex"),sha256=createHash("sha256").update(STATE).digest("hex");
const START:RunStartMeta={
 rom_sha1:"a".repeat(40),model:{id:"model",context_window:65536,max_tokens:4096,vision:true},sampling:{thinking_level:"medium",max_tokens:4096},
 system_prompt:"prompt",tools:["observe","press"],harness:{commit:"b".repeat(40),dirty:false},vendor_pin:"c".repeat(40),pi_version:"1.2.3",
 start_state:{kind:"save_state",path:"/starts/PETALBURG_WOODS.state",sha1:"d".repeat(40)},harness_features:["ram-state-v1","story-milestones-v2"],
 evaluation:{preset_id:"frontier",target:null,failure_limit:3,flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true},features:{"fix-v1":true}},
 budgets:{max_turns:1500,max_wall_ms:1_200_000},isolation:{server_dir:"/runs/cp-run/server",run_data_id:"cp-run",load_checkpoint_mode:false,port:8001},
};

function fixture(
 selection:CheckpointSelection={kind:"single",target:"CLOCK_SET"},
 reply:Record<string,unknown>={state_base64:STATE.toString("base64"),sha1,sha256},
 status=200,failMeta=false,
){
 const calls:{url:string;body:unknown;active:number}[]=[];const files=new Map<string,Buffer|string>();let active=0,maxActive=0;
 const fetchFn=async(url:string,init?:{body?:string})=>{active++;maxActive=Math.max(maxActive,active);calls.push({url,body:init?.body===undefined?undefined:JSON.parse(init.body),active});await Promise.resolve();active--;
  return new Response(JSON.stringify(reply),{status});};
 const write=(path:string,data:Buffer|string)=>{if(path.endsWith(".json.partial")&&failMeta)throw new Error("disk full");files.set(path,data);};
 const deps:CheckpointDeps={run:"cp-run",serverUrl:"http://127.0.0.1:9",dir:"/runs/cp-run/checkpoints",libraryDir:"/runs/checkpoints",fetch:fetchFn,write,rename:(from,to)=>{const v=files.get(from);if(v===undefined)throw new Error("missing");files.delete(from);files.set(to,v);},linkExclusive:(from,to)=>{if(files.has(to)){const error=Object.assign(new Error("exists"),{code:"EEXIST"});throw error;}const data=files.get(from);if(data===undefined)throw new Error("missing staged index");files.set(to,data);},remove:path=>{files.delete(path);}};
 const capture=new CheckpointCapture(selection,deps,START);
 return {capture,calls,files,deps,maxActive:()=>maxActive};
}

it("defines the canonical required frontier without aliases, optional activities, or trainer milestones",()=>{
 expect(REQUIRED_FRONTIER_MILESTONES).toContain("PETALBURG_WOODS");expect(REQUIRED_FRONTIER_MILESTONES).toContain("TEAM_AQUA_WOODS_EVENT_COMPLETE");expect(REQUIRED_FRONTIER_MILESTONES).toContain("RUSTBORO_CITY");
 expect(REQUIRED_FRONTIER_MILESTONES).not.toContain("GAME_RUNNING");expect(REQUIRED_FRONTIER_MILESTONES).not.toContain("FIRST_POKEMON_CAUGHT");expect(REQUIRED_FRONTIER_MILESTONES.some(name=>name.includes("_TRAINER_"))).toBe(false);
});

it("saves the single target once with complete run and event provenance",async()=>{
 const {capture,calls,files}=fixture();capture.observe(milestone("PLAYER_BEDROOM",10));capture.observe(milestone("CLOCK_SET",20));capture.observe(milestone("CLOCK_SET",30));await capture.settled();
 expect(calls.map(c=>c.url.replace("http://127.0.0.1:9",""))).toEqual(["/pokebench/checkpoint"]);expect(files.get("/runs/cp-run/checkpoints/CLOCK_SET.state")).toEqual(STATE);
 const meta=JSON.parse(String(files.get("/runs/cp-run/checkpoints/CLOCK_SET.json"))) as Record<string,unknown>;
 expect(meta).toMatchObject({version:1,run:"cp-run",milestone:"CLOCK_SET",milestone_event:{seq:20,turn:4,origin:"observed",evidence:[19]},state:{sha1,sha256,bytes:STATE.length},source:{rom_sha1:"a".repeat(40),harness:{commit:"b".repeat(40),dirty:false},start_state:START.start_state,harness_features:START.harness_features,evaluation_features:{"fix-v1":true}},capture:{basis:"first_observed_native_milestone",stability:"saved_under_frame_loop_lock"}});
});

it("captures every observed required frontier milestone in order and excludes non-frontier evidence",async()=>{
 const {capture,calls,files,maxActive}=fixture({kind:"frontier"});capture.observe(milestone("PETALBURG_WOODS",10,"present_at_start","navigation"));capture.observe(milestone("PETALBURG_WOODS_TRAINER_LYLE_DEFEATED",11));capture.observe(milestone("FIRST_POKEMON_CAUGHT",12));capture.observe(milestone("PETALBURG_WOODS",20,"observed","navigation"));capture.observe(milestone("TEAM_AQUA_WOODS_EVENT_COMPLETE",30));capture.observe(milestone("PETALBURG_WOODS",40,"observed","navigation"));await capture.settled();
 expect(calls.filter(c=>c.url.endsWith("/pokebench/checkpoint"))).toHaveLength(2);expect(maxActive()).toBe(1);expect(files.has("/runs/cp-run/checkpoints/PETALBURG_WOODS.state")).toBe(true);expect(files.has("/runs/cp-run/checkpoints/TEAM_AQUA_WOODS_EVENT_COMPLETE.state")).toBe(true);expect(files.has("/runs/cp-run/checkpoints/PETALBURG_WOODS_TRAINER_LYLE_DEFEATED.state")).toBe(false);expect(files.has("/runs/cp-run/checkpoints/FIRST_POKEMON_CAUGHT.state")).toBe(false);
});

it("promotes the first complete candidate per milestone without overwriting a winner",async()=>{
 const first=fixture({kind:"frontier"});first.capture.observe(milestone("PETALBURG_WOODS",20,"observed","navigation"));await first.capture.settled();const candidate="/runs/checkpoints/PETALBURG_WOODS/candidates/cp-run";
 expect(first.files.get(`${candidate}/PETALBURG_WOODS.state`)).toEqual(STATE);expect(first.files.has(`${candidate}/PETALBURG_WOODS.json`)).toBe(true);
 expect(JSON.parse(String(first.files.get("/runs/checkpoints/PETALBURG_WOODS/first-arrival.json")))).toMatchObject({version:1,milestone:"PETALBURG_WOODS",run:"cp-run",candidate:"candidates/cp-run"});
 const second=fixture({kind:"frontier"});second.files.set("/runs/checkpoints/PETALBURG_WOODS/first-arrival.json",JSON.stringify({run:"earlier"}));second.capture.observe(milestone("PETALBURG_WOODS",21,"observed","navigation"));await second.capture.settled();
 expect(JSON.parse(String(second.files.get("/runs/checkpoints/PETALBURG_WOODS/first-arrival.json")))).toEqual({run:"earlier"});expect(second.files.has("/runs/cp-run/checkpoints/PETALBURG_WOODS.state")).toBe(true);
});

it("lets a later complete candidate win after an index write fails after exclusive creation",async()=>{
 const shared=fixture({kind:"frontier"});let poison=true;
 const deps:CheckpointDeps={...shared.deps,write:(path,data)=>{if(path.includes(".first-arrival.")&&poison){poison=false;shared.files.set(path,"");throw Object.assign(new Error("disk full after create"),{code:"ENOSPC"});}shared.deps.write(path,data);}};
 const first=new CheckpointCapture({kind:"frontier"},{...deps,run:"run-a"},START);first.observe(milestoneFor("run-a","PETALBURG_WOODS",20));await expect(first.settled()).rejects.toThrow(/disk full after create/);
 const second=new CheckpointCapture({kind:"frontier"},{...deps,run:"run-b"},START);second.observe(milestoneFor("run-b","PETALBURG_WOODS",21));await second.settled();
 expect(JSON.parse(String(shared.files.get("/runs/checkpoints/PETALBURG_WOODS/first-arrival.json")))).toMatchObject({run:"run-b",candidate:"candidates/run-b"});
});

it("ignores milestones already present at start",async()=>{const {capture,calls}=fixture();capture.observe(milestone("CLOCK_SET",5,"present_at_start"));await capture.settled();expect(calls).toHaveLength(0);});

it("refuses a bad state, records the capture failure, continues later milestones, and never pauses the game",async()=>{
 const bad=fixture({kind:"frontier"},{state_base64:STATE.toString("base64"),sha1:"0".repeat(40),sha256});bad.capture.observe(milestone("PETALBURG_WOODS",20,"observed","navigation"));bad.capture.observe(milestone("TEAM_AQUA_WOODS_EVENT_COMPLETE",30));await expect(bad.capture.settled()).rejects.toThrow(/2 checkpoint captures failed/);
 expect([...bad.files.keys()].filter(path=>path.endsWith(".error.json"))).toHaveLength(2);expect(bad.calls.filter(c=>c.url.endsWith("/pokebench/checkpoint"))).toHaveLength(2);expect(bad.calls.some(c=>c.url.endsWith("/pokebench/pause"))).toBe(false);
 const down=fixture(undefined,{detail:"native checkpoint unavailable"},503);down.capture.observe(milestone("CLOCK_SET",20));await expect(down.capture.settled()).rejects.toThrow(/^checkpoint request failed with HTTP 503$/);expect(JSON.parse(String(down.files.get("/runs/cp-run/checkpoints/CLOCK_SET.error.json")))).toMatchObject({error:"checkpoint request failed with HTTP 503"});expect(down.calls.some(c=>c.url.endsWith("/pokebench/pause"))).toBe(false);
});

it("saves every frontier milestone by default on any start unless the switch is off",()=>{
 expect(checkpointSelection({})).toEqual({kind:"frontier"});expect(checkpointSelection({POKEBENCH_CHECKPOINT_FRONTIER:""})).toEqual({kind:"frontier"});
 expect(checkpointSelection({POKEBENCH_CHECKPOINT_FRONTIER:"1"})).toEqual({kind:"frontier"});
 expect(checkpointSelection({POKEBENCH_CHECKPOINT_FRONTIER:"0"})).toBeNull();
});
it("reads explicit capture modes from the environment and preserves the single-target contract",()=>{
 expect(checkpointTarget({})).toBeNull();expect(checkpointTarget({POKEBENCH_CHECKPOINT_AT:"CLOCK_SET"})).toBe("CLOCK_SET");expect(checkpointTarget({POKEBENCH_CHECKPOINT_FRONTIER:"1"})).toBeNull();
 expect(checkpointSelection({POKEBENCH_CHECKPOINT_AT:"CLOCK_SET"})).toEqual({kind:"single",target:"CLOCK_SET"});expect(checkpointSelection({POKEBENCH_CHECKPOINT_AT:"CLOCK_SET",POKEBENCH_CHECKPOINT_FRONTIER:"0"})).toEqual({kind:"single",target:"CLOCK_SET"});
 expect(()=>checkpointSelection({POKEBENCH_CHECKPOINT_FRONTIER:"yes"})).toThrow(/must be 0 or 1/);expect(()=>checkpointSelection({POKEBENCH_CHECKPOINT_FRONTIER:"1",POKEBENCH_CHECKPOINT_AT:"CLOCK_SET"})).toThrow(/choose one/);expect(()=>checkpointTarget({POKEBENCH_CHECKPOINT_AT:"invented"})).toThrow(/native milestone/);expect(()=>checkpointTarget({POKEBENCH_CHECKPOINT_AT:"PLAYER_NAME_SET"})).toThrow(/native milestone/);
});
it("keeps a checkpoint start's saves under its own run and names the state it started from",async()=>{
 const {capture,files}=fixture({kind:"frontier"});capture.observe(milestone("PETALBURG_WOODS",10,"present_at_start","navigation"));capture.observe(milestone("TEAM_AQUA_WOODS_EVENT_COMPLETE",20));await capture.settled();
 expect([...files.keys()].filter(path=>path.endsWith(".state")).sort()).toEqual(["/runs/checkpoints/TEAM_AQUA_WOODS_EVENT_COMPLETE/candidates/cp-run/TEAM_AQUA_WOODS_EVENT_COMPLETE.state","/runs/cp-run/checkpoints/TEAM_AQUA_WOODS_EVENT_COMPLETE.state"]);
 expect(JSON.parse(String(files.get("/runs/cp-run/checkpoints/TEAM_AQUA_WOODS_EVENT_COMPLETE.json")))).toMatchObject({source:{start_state:START.start_state}});
});

it("never saves a continuation's replayed source milestones, and saves its live ones under its own run",async()=>{
 const {capture,calls,files}=fixture({kind:"frontier"});
 const source="/runs/checkpoints/PETALBURG_WOODS/candidates/source-run/PETALBURG_WOODS.state",sentinel=Buffer.from("source-state");files.set(source,sentinel);
 const deps={log:{runId:"cp-run",continuationStartSeq:1000},history:[milestoneFor("source-run","PETALBURG_WOODS",20)],milestones:{observe:()=>[]}} as unknown as RecorderDeps;
 const recorder=new RunRecorder(deps);recorder.subscribe(event=>{capture.observe(event);});await recorder.restoreHistory(()=>Promise.resolve());await capture.settled();
 expect(calls).toHaveLength(0);expect(files.get(source)).toBe(sentinel);expect(files.has("/runs/cp-run/checkpoints/PETALBURG_WOODS.state")).toBe(false);
 capture.observe(milestone("PETALBURG_WOODS",1001,"observed","navigation"));await capture.settled();
 expect(calls).toHaveLength(1);expect(files.get(source)).toBe(sentinel);expect(files.get("/runs/checkpoints/PETALBURG_WOODS/candidates/cp-run/PETALBURG_WOODS.state")).toEqual(STATE);
});

const v2={version:2,id:"cp",target:"RIVAL_MET",limits:{maxTurns:1500,maxWallMs:900000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...ALL_ON,"state-only-decisions-v1":false}};
it("lets a v2 preset start from a checkpoint whose SHA-1 is verified before launch",()=>{const start={kind:"save_state",path:"/runs/cp-run/checkpoints/CLOCK_SET.state",sha1};const preset=parsePlayPreset({...v2,start});expect(presetStart(preset,()=>STATE)).toEqual(start);expect(()=>presetStart(preset,()=>Buffer.from("other"))).toThrow(/SHA-1 mismatch/);expect(presetStart(parsePlayPreset(v2),()=>STATE)).toEqual({kind:"boot"});expect(()=>parsePlayPreset({...v2,start:{kind:"save_state",path:"x",sha1:"nothex"}})).toThrow(/Invalid play preset/);});

it("stops after close and never leaves a published state without provenance",async()=>{
 const late=fixture();await late.capture.close();late.capture.observe(milestone("CLOCK_SET",20));await late.capture.settled();expect(late.calls).toHaveLength(0);
 const disk=fixture(undefined,undefined,200,true);disk.capture.observe(milestone("CLOCK_SET",20));await expect(disk.capture.settled()).rejects.toThrow(/disk full/);expect([...disk.files.keys()].some(path=>path.endsWith("CLOCK_SET.state"))).toBe(false);
});

it("checks and loads a relative checkpoint path through one absolute path",()=>{const start={kind:"save_state",path:"relative/CLOCK_SET.state",sha1};const seen:string[]=[];const resolved=presetStart(parsePlayPreset({...v2,start}),path=>{seen.push(path);return STATE;});expect(resolved.kind==="save_state"&&resolved.path.startsWith("/")).toBe(true);expect(seen).toEqual([resolved.kind==="save_state"?resolved.path:""]);});
