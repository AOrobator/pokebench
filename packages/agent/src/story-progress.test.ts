import {expect,it} from "vitest";
import {PROGRESS_CATALOG, progressReached} from "./story-progress.js";
import {StateMilestones,MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import type {GameStateSnapshot} from "./game-state.js";
const snapshot=(flag:number):GameStateSnapshot=>{const bytes=Buffer.alloc(300);bytes[flag>>3]=1<<(flag&7);return {screen:"overworld",started:true,name:"X",location:"RUSTURF TUNNEL",map_id:[24,4],position:{x:1,y:1},facing:"DOWN",in_battle:false,party:[],money:0,badges:[],play_time_s:1,story_progress:{flags:bytes.toString("hex"),rustboro_stage:0,devon_stage:0,letter:false}};};
it("distinguishes the Rusturf victory and completed rescue; unknown is not false",()=>{
 expect(progressReached("RUSTURF_AQUA_GRUNT_DEFEATED",snapshot(0x510))).toBe(true);
 expect(progressReached("DEVON_GOODS_RECOVERED",snapshot(0x510))).toBe(false);
 expect(progressReached("DEVON_GOODS_RECOVERED",snapshot(0x8f))).toBe(true);
 expect(progressReached("DEVON_GOODS_RECOVERED",{...snapshot(0x8f),story_progress:null})).toBe(null);
 expect(progressReached("DEVON_GOODS_RECOVERED",{...snapshot(0x8f),screen:"field_transition"})).toBe(null);
});
it("records all seven later leaders, badge handoffs and TM receipts independently",()=>{
 for(const [i,leader] of ["BRAWLY","WATTSON","FLANNERY","NORMAN","WINONA","TATE_AND_LIZA","JUAN"].entries()) {
  expect(progressReached(`${leader}_DEFEATED`,snapshot(0x500+266+i))).toBe(true);
  expect(PROGRESS_CATALOG.some(m=>m.name===["KNUCKLE","DYNAMO","HEAT","BALANCE","FEATHER","MIND","RAIN"][i]+"_BADGE")).toBe(true);
 }
 for(const m of PROGRESS_CATALOG)expect(MEASUREMENT_ONLY_MILESTONES.has(m.name)).toBe(true);
});
it("emits once and distinguishes resumed completion from a witnessed transition",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(snapshot(0x8f))});tracker.initialize("save_state");
 expect(tracker.observe(snapshot(0x8f),1).find(m=>m.name==="DEVON_GOODS_RECOVERED")?.origin).toBe("present_at_start");
 expect(tracker.observe(snapshot(0x8f),2).filter(m=>m.name==="DEVON_GOODS_RECOVERED")).toEqual([]);
 const fresh=new StateMilestones({read:()=>Promise.resolve(snapshot(0x8f))});fresh.initialize("save_state");fresh.observe(snapshot(0),1);
 expect(fresh.observe(snapshot(0x8f),2).find(m=>m.name==="DEVON_GOODS_RECOVERED")).toMatchObject({origin:"observed",evidence:[2]});
});
