import { expect, it } from "vitest";
import { MILESTONES, MEASUREMENT_ONLY_MILESTONES, StateMilestones } from "./milestones.js";
import type { GameStateSnapshot } from "./game-state.js";
const base: GameStateSnapshot = {screen:"overworld",started:true,name:"A",location:"RUSTBORO CITY GYM",map_id:[11,3],position:{x:5,y:3},facing:"up",in_battle:false,party:[],money:0,badges:[],play_time_s:0};
const intro: GameStateSnapshot = {...base,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:"Hello, I am ROXANNE, the RUSTBORO\nPOKéMON GYM LEADER.",message:{phase:"page_wait",cursor:0,ready:true}}};
it("records first Roxanne conversation once, independently of victory",()=>{
 const detector=new StateMilestones({read:()=>Promise.resolve(base)});
 detector.initialize("boot");
 expect(detector.observe(base,1).some(e=>e.name==="ROXANNE_FIRST_INTERACTION")).toBe(false);
 expect(detector.observe(intro,2).find(e=>e.name==="ROXANNE_FIRST_INTERACTION")).toMatchObject({kind:"story",origin:"observed",evidence:[2]});
 expect(detector.observe(intro,3).some(e=>e.name==="ROXANNE_FIRST_INTERACTION")).toBe(false);
 expect(MEASUREMENT_ONLY_MILESTONES.has("ROXANNE_FIRST_INTERACTION")).toBe(true);
});
it("requires active game evidence; stale opponent and proximity give no credit",()=>{
 const definition=MILESTONES.find(e=>e.name==="ROXANNE_FIRST_INTERACTION");expect(definition).toBeDefined();
 const opponent={trainer_id:265,trainer_class:0,name:"ROXANNE",defeated:false,battle_active:false};
 for(const state of [base,{...intro,map_id:[0,3] as [number,number]},{...intro,field_controls_locked:false},{...intro,world_context:{objects:[],triggers:[],dialogue:intro.world_context?.dialogue??null,message:null}},{...base,trainer_opponent:opponent}])expect(definition?.reached(state)).not.toBe(true);
 expect(definition?.reached({...base,in_battle:true,screen:"battle",trainer_opponent:{...opponent,battle_active:true}})).toBe(true);
 const resumed=new StateMilestones({read:()=>Promise.resolve(base)});resumed.initialize("save_state");
 expect(resumed.observe({...base,badges:["STONE"]},1).some(e=>e.name==="ROXANNE_FIRST_INTERACTION")).toBe(false);
 resumed.observe(base,2);expect(resumed.observe(intro,3).find(e=>e.name==="ROXANNE_FIRST_INTERACTION")?.origin).toBe("observed");
});
it("logs native evidence through the real recorder without duplicate milestones",async()=>{
 const {mkdtempSync,readFileSync}=await import("node:fs");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
 const {RunLog}=await import("./run-log.js");const {FrameStore}=await import("./frames.js");const {RunRecorder}=await import("./recorder.js");const {RUN_START_META}=await import("../test-support/events.js");const {parseEvent}=await import("./events.js");const {qualifiedNativeMilestone}=await import("./milestones.js");
 const root=mkdtempSync(join(tmpdir(),"roxanne-recorder-"));const log=RunLog.create(root,"roxanne_recorder");const state={read:()=>Promise.resolve(base)};
 const recorder=new RunRecorder({log,frames:new FrameStore(root,1000000,()=>undefined),milestones:new StateMilestones(state),gameState:state,now:()=>1000});
 await recorder.start({...RUN_START_META,harness_features:["roxanne-first-interaction-v1"]},false);
 recorder.recordState(base);const evidence=recorder.recordState(intro);recorder.recordState(intro);
 const events=readFileSync(join(root,"roxanne_recorder/events.jsonl"),"utf8").trim().split("\n").map(parseEvent);
 const marks=events.filter(e=>e.type==="milestone"&&e.name==="ROXANNE_FIRST_INTERACTION");expect(marks).toHaveLength(1);
 const mark=marks[0];if(mark?.type!=="milestone")throw Error("mark");
 expect(mark.evidence).toEqual([evidence.seq]);expect(qualifiedNativeMilestone(mark,[evidence])).toBe(true);
 expect(qualifiedNativeMilestone(mark,[{...evidence,field_controls_locked:false}])).toBe(false);
});
it("recognizes all six retained real native introduction observations", async()=>{
 const {readFileSync}=await import("node:fs");const {Value}=await import("typebox/value");const {Type}=await import("typebox");const {parseEvent}=await import("./events.js");
 const rows:unknown=JSON.parse(readFileSync(new URL("../test-support/roxanne-first-interaction.json",import.meta.url),"utf8"));
 const schema=Type.Array(Type.Object({run:Type.String(),logSha256:Type.String(),logBytes:Type.Integer(),state:Type.Unknown()}));
 if(!Value.Check(schema,rows))throw Error("fixture");expect(rows).toHaveLength(6);
 for(const row of rows){const e=parseEvent(JSON.stringify(row.state));if(e.type!=="state"||!("started"in e))throw Error("state");
  expect(e.run).toBe(row.run);expect(MILESTONES.find(m=>m.name==="ROXANNE_FIRST_INTERACTION")?.reached(e)).toBe(true);
 }
});
