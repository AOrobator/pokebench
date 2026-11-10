import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {serverOff} from "../test-support/server-features.js";
import type {RunEvent} from "./events.js";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,featuresOf,playHarnessFeatures} from "./features.js";
import {FINAL_SAVE,GameClearStop,attachGameClearStop,saveFinalState,type FinalSaveDeps,type GameClearGovernor} from "./game-clear-stop.js";
import {Governor} from "./harness.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import type {TargetProof} from "./target-stop.js";

const ID="game-clear-completion-v1";
const T="2026-11-10T14:09:54.837-05:00";
type StateEvent=Extract<RunEvent,{type:"state"}>;
type MilestoneEvent=Extract<RunEvent,{type:"milestone"}>;
const state=(seq:number,screen:string,run="r"):StateEvent=>({...IN_GAME,screen,type:"state",run,seq,turn:54,v:1,t:T});
const milestone=(seq:number,name="GAME_CLEAR_CONFIRMED",origin:"observed"|"present_at_start"="observed",run="r"):MilestoneEvent=>({type:"milestone",run,seq,turn:54,v:1,t:T,name,kind:"story",origin,evidence:[seq-1],server_timestamp:1});

function proofs(events:readonly RunEvent[]):TargetProof[]{
 const seen:TargetProof[]=[];const stop=new GameClearStop("r",proof=>{seen.push(proof);});
 for(const event of events)stop.observe(event);
 return seen;
}

it("is registered as a default-on server correctness switch after the waterfall handoff",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("waterfall-handoff-verification-v1")+1);
 expect(SERVER_FEATURES).toContain(ID);
 expect(featureInfo(ID).description).toContain(" Off: ");
 const {[ID]:omitted,...old}=featuresOf([]);
 expect(omitted).toBe(false);
 expect(normalizeFeatures(old)[ID]).toBe(true);
 expect(normalizeFeatures({...old,[ID]:false})[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 const on=normalizeFeatures(old);
 expect(playHarnessFeatures(on,null)).toContain(ID);
 expect(playHarnessFeatures({...on,[ID]:false},null)).not.toContain(ID);
 expect(serverOff(on)).not.toContain(ID);
 expect(serverOff({...on,[ID]:false})).toContain(ID);
});

it("completes at the first credits state after this run observed the game clear",()=>{
 expect(proofs([state(1,"hall_of_fame"),milestone(2),state(3,"hall_of_fame"),state(4,"credits"),state(5,"credits")]))
  .toEqual([{name:"GAME_CLEAR_CONFIRMED",milestone_seq:2,state_evidence:[4]}]);
});

it("ignores credits without an observed clear, a clear present at start, another run and other milestones",()=>{
 expect(proofs([state(1,"credits")])).toEqual([]);
 expect(proofs([milestone(1,"GAME_CLEAR_CONFIRMED","present_at_start"),state(2,"credits")])).toEqual([]);
 expect(proofs([milestone(1,"GAME_CLEAR_CONFIRMED","observed","source"),state(2,"credits")])).toEqual([]);
 expect(proofs([milestone(1),state(2,"credits","source")])).toEqual([]);
 expect(proofs([milestone(1,"WALLACE_DEFEATED"),state(2,"credits")])).toEqual([]);
 expect(proofs([milestone(1),state(2,"unknown (callback2 0x081754DD)")])).toEqual([]);
 expect(proofs([milestone(1),milestone(2),state(3,"credits")])).toEqual([{name:"GAME_CLEAR_CONFIRMED",milestone_seq:1,state_evidence:[3]}]);
});

const bytes=Buffer.from("emerald-cleared");
const digest=(algorithm:"sha1"|"sha256",data:Buffer)=>createHash(algorithm).update(data).digest("hex");
function server(body:unknown,status=200){
 const writes=new Map<string,Buffer|string>();const order:string[]=[];const requests:{url:string;method:string|undefined;body:string|undefined}[]=[];
 const deps:FinalSaveDeps={run:"r",serverUrl:"http://127.0.0.1:9",dir:"/runs/r/checkpoints",
  fetch:(url,init)=>{requests.push({url,method:init?.method,body:init?.body});return Promise.resolve(new Response(JSON.stringify(body),{status}));},
  write:(path,data)=>{writes.set(path,data);order.push(`write ${path}`);},
  rename:(from,to)=>{const data=writes.get(from);if(data===undefined)throw new Error(`missing ${from}`);writes.delete(from);writes.set(to,data);order.push(`rename ${to}`);}};
 return {deps,writes,order,requests};
}
const good={state_base64:bytes.toString("base64"),sha1:digest("sha1",bytes),sha256:digest("sha256",bytes)};
const proof:TargetProof={name:"GAME_CLEAR_CONFIRMED",milestone_seq:2,state_evidence:[4]};

it("saves the finished game with its provenance published first",async()=>{
 const fake=server(good);
 await saveFinalState(fake.deps,proof);
 expect(fake.requests).toEqual([{url:"http://127.0.0.1:9/pokebench/checkpoint",method:"POST",body:"{}"}]);
 expect(fake.writes.get(`/runs/r/checkpoints/${FINAL_SAVE}.state`)).toEqual(bytes);
 const sidecar=fake.writes.get(`/runs/r/checkpoints/${FINAL_SAVE}.json`);
 expect(JSON.parse(String(sidecar))).toEqual({version:1,run:"r",save:"GAME_CLEAR_FINAL",proof,state:{sha1:good.sha1,sha256:good.sha256,bytes:bytes.length},capture:{basis:"credits_after_observed_game_clear",stability:"saved_under_frame_loop_lock"}});
 expect(fake.order.filter(step=>step.startsWith("rename"))).toEqual([`rename /runs/r/checkpoints/${FINAL_SAVE}.json`,`rename /runs/r/checkpoints/${FINAL_SAVE}.state`]);
});

it.each([
 ["HTTP failure",good,500,/HTTP 500/],
 ["missing digests",{state_base64:good.state_base64},200,/missing its state/],
 ["empty state",{state_base64:"",sha1:good.sha1,sha256:good.sha256},200,/size is invalid/],
 ["digest mismatch",{...good,sha1:"0".repeat(40)},200,/digest does not match/],
])("refuses a %s without publishing a state",async(_name,body,status,error)=>{
 const fake=server(body,status);
 await expect(saveFinalState(fake.deps,proof)).rejects.toThrow(error);
 expect([...fake.writes.keys()].some(path=>path.endsWith(".state"))).toBe(false);
});

function wiring(body:unknown,overBudget=false,stopReason:string|null=null){
 const fake=server(body);let observer:((event:RunEvent)=>void)|null=null;const hooks:(()=>Promise<void>)[]=[];
 const calls:string[]=[];const failures:unknown[]=[];let target:TargetProof|null=null;
 const governor:GameClearGovernor={stopReason,stop:(reason)=>{calls.push(`stop ${reason}`);},abort:(reason)=>{calls.push(`abort ${reason}`);}};
 attachGameClearStop({subscribe:(fn)=>{observer=fn;},setTargetProof:(p)=>{target=p;},checkpointFailure:(e)=>{failures.push(e);}},governor,{beforeRunEnd:(hook)=>{hooks.push(hook);}},fake.deps,()=>overBudget);
 const emit=(event:RunEvent)=>{if(observer===null)throw new Error("not subscribed");observer(event);};
 return {fake,emit,hooks,calls,failures,target:()=>target};
}

it("production wiring saves, records the proof and ends the run as completed before run_end",async()=>{
 const w=wiring(good);
 w.emit(milestone(2));w.emit(state(4,"credits"));
 expect(w.calls).toEqual(["stop completed"]);
 expect(w.target()).toEqual(proof);
 expect(w.hooks).toHaveLength(1);
 await w.hooks[0]?.();
 expect(w.fake.writes.has(`/runs/r/checkpoints/${FINAL_SAVE}.state`)).toBe(true);
 expect(w.failures).toEqual([]);
});

it("records a failed final save and still completes; a run already stopping or over budget is not completed",async()=>{
 const failed=wiring({},false);
 failed.emit(milestone(2));failed.emit(state(4,"credits"));
 await failed.hooks[0]?.();
 expect(failed.calls).toEqual(["stop completed"]);
 expect(failed.failures).toHaveLength(1);
 const stopping=wiring(good,false,"milestone");
 stopping.emit(milestone(2));stopping.emit(state(4,"credits"));
 expect(stopping.calls).toEqual([]);expect(stopping.target()).toBeNull();
 const late=wiring(good,true);
 late.emit(milestone(2));late.emit(state(4,"credits"));
 expect(late.calls).toEqual(["abort budget"]);expect(late.target()).toBeNull();
 await late.hooks[0]?.();
 expect(late.fake.requests).toEqual([]);
});

it("a completed run keeps its reason when a budget abort arrives afterwards",()=>{
 const aborted:string[]=[];
 const governor=new Governor({limits:{maxTurns:10,maxWallMs:1000,failureLimit:3},now:()=>0,abort:()=>{aborted.push("abort");},retry:()=>undefined});
 governor.stop("completed");
 governor.abort("budget");
 expect(governor.stopReason).toBe("completed");
 expect(aborted).toEqual([]);
});

it("run_end carries the proof for a completed run as it does for a target",async()=>{
 const {RunRecorder}=await import("./recorder.js");
 type Deps=ConstructorParameters<typeof RunRecorder>[0];
 const ends:unknown[]=[];let seq=0;
 const log={runId:"r",continuationStartSeq:1000,get nextSeq(){return seq;},append:(body:{type:string})=>{const event={...body,v:1,run:"r",seq:seq++,t:T};if(body.type==="run_end")ends.push(event);return event;}};
 for(const reason of ["completed","budget"] as const){
  const recorder=new RunRecorder({log,milestones:{observe:()=>[]}} as unknown as Deps);
  recorder.setTargetProof(proof);recorder.end(reason);
 }
 expect(ends[0]).toMatchObject({reason:"completed",target_proof:proof});
 expect(ends[1]).not.toHaveProperty("target_proof");
});
