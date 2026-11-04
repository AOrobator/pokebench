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
 resumed.observe({...base,field_controls_locked:false},2);expect(resumed.observe(intro,3).find(e=>e.name==="ROXANNE_FIRST_INTERACTION")?.origin).toBe("observed");
});

it("fails closed on active-battle decoys and unavailable message ownership",()=>{
 const reached=MILESTONES.find(m=>m.name==="ROXANNE_FIRST_INTERACTION")?.reached;if(reached===undefined)throw Error("definition");
 const battle:GameStateSnapshot={...base,in_battle:true,screen:"battle",trainer_opponent:{trainer_id:265,trainer_class:32,name:"ROXANNE",defeated:false,battle_active:true}};
 expect(reached({...battle,trainer_opponent:{trainer_id:320,trainer_class:0,name:"JOSH",defeated:false,battle_active:true}})).toBe(false);
 expect(reached({...battle,trainer_opponent:{trainer_id:265,trainer_class:32,name:"ROXANNE",defeated:false,battle_active:false}})).toBeNull();
 for(const unknown of [{...intro,map_id:null},{...intro,field_controls_locked:null},{...intro,world_context:null},{...intro,world_context:{objects:[],triggers:[],dialogue:intro.world_context?.dialogue??null,message:null}},{...intro,world_context:{objects:[],triggers:[],dialogue:intro.world_context?.dialogue??null,message:{phase:"page_wait" as const,cursor:0,ready:true},message_diagnostic:"unavailable"}}])expect(reached(unknown)).toBeNull();
 expect(reached({...intro,world_context:{objects:[],triggers:[],dialogue:"Guide: ROXANNE is the leader",message:{phase:"page_wait",cursor:0,ready:true}}})).toBe(false);
});
