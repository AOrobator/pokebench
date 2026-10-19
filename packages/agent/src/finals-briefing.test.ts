import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {expect,it} from "vitest";
import {SupervisorBriefing} from "./loop-supervisor.js";

import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";

// Shapes from the 2026-10-15 finals: run 6684 (A×8 batches restarting the Littleroot PC conversation, T494–T788)
// and run dc0e (INSIDE OF TRUCK after naming, T206–T615).
const ev=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"finals-test",t:"2026-10-15T15:00:00.000-04:00",turn,seq,...body});
const PC="If you use a PC, you can store items and POKéMON. | The power of science is staggering!";
const FAT_MAN={name:"FAT_MAN",kind:"object",x:14,y:14,elevation:3,activation:"press_a",availability:"live",facing:null,local_id:4,destination:null};
const town=(seq:number,phase:"printing"|"page_wait",cursor:number)=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"LITTLEROOT TOWN",map_id:[0,9],position:{x:13,y:14},facing:"right",field_controls_locked:true,interaction_targets:[FAT_MAN],world_context:{objects:[],triggers:[],dialogue:PC,message:{phase,cursor,ready:phase==="page_wait"}}},seq);
const result=(seq:number,id:string,stateSeq:number)=>ev({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:stateSeq},seq);
// One recorded call: the model is shown `shown`, calls press, the harness snapshots `pre` before the first button, then `after`.
const call=(b:SupervisorBriefing,seq:number,id:string,buttons:string[],pre:(s:number)=>RunEvent,after:(s:number)=>RunEvent)=>{
 b.observe(ev({type:"tool_call",id,name:"press",args:{buttons}},seq));
 b.observe(pre(seq+1));
 b.observe(ev({type:"button_press",tool_call_id:id,before_state_seq:seq+1,buttons,hold_frames:10,release_frames:8},seq+2));
 b.observe(after(seq+3));b.observe(result(seq+4,id,seq+3));
};

it("grades an A batch that ends back at the start of the same conversation as a restart, not as advancing it (run 6684)",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 b.observe(town(1,"printing",47));b.observe(result(2,"first",1));
 const A8=Array<string>(8).fill("A");
 // Recorded: the pre-press snapshot waits at the page end (cursor 50); after eight A the same text is printing from the top again.
 const ends=[48,47,47,46,49,48,45];
 ends.forEach((end,i)=>{call(b,10+i*10,`a${String(i)}`,A8,s=>town(s,"page_wait",50),s=>town(s,"printing",end));});
 const text=b.text("cycle",100);
 expect(text).toContain("press A,A,A,A,A,A,A,A ×7 in LITTLEROOT TOWN (map 0/9) → restarted a conversation already shown");
 expect(text).not.toContain("dialogue advanced");
});

it("still says a conversation advanced when the cursor moves on through the same text",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 b.observe(town(1,"printing",9));b.observe(result(2,"first",1));
 call(b,10,"b",["B"],s=>town(s,"page_wait",50),s=>town(s,"printing",74));
 expect(b.text("cycle",3)).toContain("press B in LITTLEROOT TOWN (map 0/9) → dialogue advanced");
});

const BOX={name:"MOVING_BOX",kind:"object",x:2,y:3,elevation:3,activation:"press_a",availability:"live",facing:null,local_id:3,destination:null};
const trigger=(y:number)=>({name:null,kind:"coordinate_trigger",x:3,y,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null});
const EXIT={name:null,kind:"warp",x:4,y:3,elevation:0,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:null};
const truck=(seq:number,y:number,facing="down")=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"INSIDE OF TRUCK",map_id:[25,40],position:{x:3,y},facing,field_controls_locked:false,interaction_targets:[BOX,trigger(1),trigger(3),EXIT],world_context:{objects:[],triggers:[],dialogue:null}},seq);

it("counts a step trigger the player walked onto as tried, and keeps the exit listed first (run dc0e)",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 b.observe(truck(1,2));b.observe(result(2,"first",1));
 call(b,10,"down",["DOWN"],s=>truck(s,2),s=>truck(s,3));
 const untried=b.text("cycle",3).split("not tried yet: ")[1]?.split("\n")[0]??"";
 expect(untried).not.toContain("coordinate_trigger at 3,3");
 expect(untried).toContain("coordinate_trigger at 3,1 (step)");
 expect(untried.startsWith("warp at 4,3")).toBe(true);
});

it("keeps a step trigger untried when the player only stood on it without moving there",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 b.observe(truck(1,3));b.observe(result(2,"first",1));
 call(b,10,"look",["A"],s=>truck(s,3,"left"),s=>truck(s,3,"left"));
 expect(b.text("cycle",3)).toContain("coordinate_trigger at 3,3 (step)");
});
