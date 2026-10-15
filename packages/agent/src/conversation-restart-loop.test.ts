import {expect,it} from "vitest";
import type {GameStateSnapshot} from "./game-state.js";
import {LOOP_POLICY,LoopDetector,type CompletedCall,type LoopNotice} from "./loop-detection.js";

const PC="If you use a PC, you can store items and POKéMON. | The power of science is staggering!";
const talking=(cursor:number|null,dialogue:string|null=PC,x=13):GameStateSnapshot=>({screen:"overworld",started:true,name:"AAA",location:"LITTLEROOT TOWN",map_id:[0,9],position:{x,y:14},facing:"right",field_controls_locked:dialogue!==null,in_battle:false,party:[],money:0,badges:[],play_time_s:600,world_context:{objects:[],triggers:[],dialogue,message:cursor===null?null:{phase:"printing",cursor,ready:false}}});
const press=(before:GameStateSnapshot,after:GameStateSnapshot,buttons:string[]):CompletedCall=>({name:"press",args:{buttons},isError:false,text:"ok",state:after,beforeState:before});
const detector=(interactions=true)=>{const notices:LoopNotice[]=[];return {d:new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",interactions,()=>"SUPERVISOR"),notices};};

it("catches a conversation that A-batches keep restarting, however the print cursor jitters (finals run 6684 from turn 494)",()=>{
 const {d,notices}=detector();
 const cursors=[46,48,45,47,49,46,48,47,45,49,48,46];
 let before=talking(47);
 for(const c of cursors){const after=talking(c);d.complete(press(before,after,["A","A","A","A","A","A","A","A"]));d.context();before=after;}
 expect(notices.some(n=>n.kind==="cycle"&&n.phase==="warning")).toBe(true);
 expect(notices.some(n=>n.phase==="supervisor")).toBe(true);
});

it("catches talk, read to the end, talk again at the same person (run 0c40, turns 520–540)",()=>{
 const {d,notices}=detector();
 let before=talking(null,null);
 for(let round=0;round<4;round++){
  for(const c of [9,50,74,104,141]){const after=talking(c);d.complete(press(before,after,[c===9?"A":"B"]));d.context();before=after;}
  const closed=talking(null,null);d.complete(press(before,closed,["B"]));d.context();before=closed;
 }
 expect(notices.some(n=>n.kind==="cycle")).toBe(true);
});

it("does not flag reading one long conversation to the end, or the same words heard in another place",()=>{
 const {d,notices}=detector();
 let before=talking(null,null);
 for(const c of [9,40,80,120,160,200,240,280]){const after=talking(c);d.complete(press(before,after,["B"]));before=after;}
 const closed=talking(null,null);d.complete(press(before,closed,["B"]));before=closed;
 for(const x of [3,6,9]){const away=talking(null,null,x);d.complete(press(before,away,["LEFT"]));const heard=talking(9,PC,x);d.complete(press(away,heard,["A"]));const shut=talking(null,null,x);d.complete(press(heard,shut,["B"]));before=shut;}
 expect(notices).toEqual([]);
});

it("leaves conversation restarts unflagged when interaction loop detection is off",()=>{
 const {d,notices}=detector(false);
 let before=talking(47);
 for(const c of [46,48,45,47,49,46,48,47,45,49,48,46]){const after=talking(c);d.complete(press(before,after,["A","A","A","A","A","A","A","A"]));before=after;}
 expect(notices.filter(n=>n.kind==="cycle")).toEqual([]);
});
