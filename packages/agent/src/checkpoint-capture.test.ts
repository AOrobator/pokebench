import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {CheckpointCapture,checkpointTarget} from "./checkpoint-capture.js";
import {parsePlayPreset,presetStart} from "./play-preset.js";
import {ALL_ON} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";

const ev=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"cp-run",t:"2026-10-14T12:00:00.000-04:00",turn:4,seq,...body});
const milestone=(name:string,seq:number,origin="observed")=>ev({type:"milestone",name,server_timestamp:1,kind:"story",origin,evidence:[seq-1]},seq);
const STATE=Buffer.from("native-state");
const sha1=createHash("sha1").update(STATE).digest("hex"),sha256=createHash("sha256").update(STATE).digest("hex");

function harness(reply:Record<string,unknown>={state_base64:STATE.toString("base64"),sha1,sha256},status=200){
 const calls:{url:string;body:unknown}[]=[];const files=new Map<string,Buffer|string>();
 const fetchFn=(url:string,init?:{body?:string})=>{calls.push({url,body:init?.body===undefined?undefined:JSON.parse(init.body)});
  const ok=url.endsWith("/pokebench/checkpoint")?status:200;
  return Promise.resolve(new Response(JSON.stringify(url.endsWith("/pokebench/pause")?{paused:true}:reply),{status:ok}));};
 const capture=new CheckpointCapture("CLOCK_SET",{serverUrl:"http://127.0.0.1:9",dir:"/runs/cp-run/checkpoints",fetch:fetchFn,write:(path,data)=>{files.set(path,data);}});
 return {capture,calls,files};
}

it("saves the state once, when the target milestone is first observed, with provenance",async()=>{
 const {capture,calls,files}=harness();
 capture.observe(milestone("PLAYER_BEDROOM",10));
 capture.observe(milestone("CLOCK_SET",20));
 capture.observe(milestone("CLOCK_SET",30));
 await capture.settled();
 expect(calls.map(c=>c.url.replace("http://127.0.0.1:9",""))).toEqual(["/pokebench/pause","/pokebench/checkpoint","/pokebench/pause"]);
 expect(calls[0]?.body).toEqual({paused:true});expect(calls[2]?.body).toEqual({paused:false});
 expect(files.get("/runs/cp-run/checkpoints/CLOCK_SET.state")).toEqual(STATE);
 const meta=JSON.parse(String(files.get("/runs/cp-run/checkpoints/CLOCK_SET.json"))) as Record<string,unknown>;
 expect(meta).toEqual({run:"cp-run",milestone:"CLOCK_SET",milestone_seq:20,turn:4,sha1,sha256,bytes:STATE.length});
});

it("ignores milestones already present at start",async()=>{
 const {capture,calls}=harness();
 capture.observe(milestone("CLOCK_SET",5,"present_at_start"));
 await capture.settled();
 expect(calls).toHaveLength(0);
});

it("refuses a state whose digest does not match and always unpauses",async()=>{
 const bad=harness({state_base64:STATE.toString("base64"),sha1:"0".repeat(40),sha256});
 bad.capture.observe(milestone("CLOCK_SET",20));
 await expect(bad.capture.settled()).rejects.toThrow(/digest/);
 expect(bad.files.size).toBe(0);expect(bad.calls.at(-1)?.body).toEqual({paused:false});
 const down=harness({detail:"native checkpoint unavailable"},503);
 down.capture.observe(milestone("CLOCK_SET",20));
 await expect(down.capture.settled()).rejects.toThrow(/503/);
 expect(down.calls.at(-1)?.body).toEqual({paused:false});
});

it("reads the capture target from the environment and accepts only native story milestones",()=>{
 expect(checkpointTarget({})).toBeNull();
 expect(checkpointTarget({POKEBENCH_CHECKPOINT_AT:"CLOCK_SET"})).toBe("CLOCK_SET");
 expect(()=>checkpointTarget({POKEBENCH_CHECKPOINT_AT:"invented"})).toThrow(/native milestone/);
 expect(()=>checkpointTarget({POKEBENCH_CHECKPOINT_AT:"PLAYER_NAME_SET"})).toThrow(/native milestone/);
});

const v2={version:2,id:"cp",target:"RIVAL_MET",limits:{maxTurns:1500,maxWallMs:900000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...ALL_ON,"state-only-decisions-v1":false}};
it("lets a v2 preset start from a checkpoint whose SHA-1 is verified before launch",()=>{
 const start={kind:"save_state",path:"/runs/cp-run/checkpoints/CLOCK_SET.state",sha1};
 const preset=parsePlayPreset({...v2,start});
 expect(presetStart(preset,()=>STATE)).toEqual(start);
 expect(()=>presetStart(preset,()=>Buffer.from("other"))).toThrow(/SHA-1 mismatch/);
 expect(presetStart(parsePlayPreset(v2),()=>STATE)).toEqual({kind:"boot"});
 expect(()=>parsePlayPreset({...v2,start:{kind:"save_state",path:"x",sha1:"nothex"}})).toThrow(/Invalid play preset/);
});
