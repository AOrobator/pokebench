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
  expect(PROGRESS_CATALOG.some(m=>m.name===`${["KNUCKLE","DYNAMO","HEAT","BALANCE","FEATHER","MIND","RAIN"][i]??""}_BADGE`)).toBe(true);
 }
 for(const m of PROGRESS_CATALOG.filter(m=>!["ROUTE_116","RUSTURF_TUNNEL"].includes(m.name)))expect(MEASUREMENT_ONLY_MILESTONES.has(m.name)).toBe(true);
});
it("emits once and distinguishes resumed completion from a witnessed transition",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(snapshot(0x8f))});tracker.initialize("save_state");
 expect(tracker.observe(snapshot(0x8f),1).find(m=>m.name==="DEVON_GOODS_RECOVERED")?.origin).toBe("present_at_start");
 expect(tracker.observe(snapshot(0x8f),2).filter(m=>m.name==="DEVON_GOODS_RECOVERED")).toEqual([]);
 const fresh=new StateMilestones({read:()=>Promise.resolve(snapshot(0x8f))});fresh.initialize("save_state");fresh.observe(snapshot(0),1);
 expect(fresh.observe(snapshot(0x8f),2).find(m=>m.name==="DEVON_GOODS_RECOVERED")).toMatchObject({origin:"observed",evidence:[2]});
});

it("every completion tests its own bit, while every map split validates map identity",()=>{
 for(const m of PROGRESS_CATALOG) {
  if(m.flag!==undefined){expect(progressReached(m.name,snapshot(m.flag))).toBe(true);expect(progressReached(m.name,snapshot(m.flag^1))).toBe(false);}
  if(m.anyFlags!==undefined)for(const bit of m.anyFlags)expect(progressReached(m.name,snapshot(bit))).toBe(true);
  if(m.map!==undefined) {
   const variables=Buffer.alloc(512);if(m.requireVariable!==undefined)variables.writeUInt16LE(m.requireValues?.[0]??0,2*(m.requireVariable-0x4000));
   const reached={...snapshot(0),field_controls_locked:false,position:{x:m.bounds?.[0]??1,y:m.bounds?.[1]??1},story_progress:{flags:"00".repeat(300),rustboro_stage:0,devon_stage:0,letter:false,variables:variables.toString("hex"),avatar_flags:1},map_id:[m.map[0]??0,m.map[1]??0] as [number,number],badges:["HEAT"]};
   expect(progressReached(m.name,reached)).toBe(true);expect(progressReached(m.name,{...reached,map_id:[99,99]})).toBe(false);
  }
 }
});


it("requires both Aqua Hideout entrance guards to be removed",()=>{
 const withFlags=(flags:readonly number[]):GameStateSnapshot=>{
  const s=snapshot(0);const bytes=Buffer.alloc(300);
  for(const bit of flags)bytes[bit>>3]=(bytes[bit>>3]??0)|(1<<(bit&7));
  return {...s,story_progress:{flags:bytes.toString("hex"),rustboro_stage:0,devon_stage:0,letter:false}};
 };
 for(const flags of [[],[821],[822]])expect(progressReached("AQUA_HIDEOUT_ACCESS_OPENED",withFlags(flags)),`removed guard flags: ${JSON.stringify(flags)}`).toBe(false);
 expect(progressReached("AQUA_HIDEOUT_ACCESS_OPENED",withFlags([821,822]))).toBe(true);
});
