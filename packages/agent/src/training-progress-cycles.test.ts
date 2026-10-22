import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";
import {TrainingProgressCycles} from "./training-progress-cycles.js";
function rig(){
 const tracker=new TrainingProgressCycles();let seq=0;
 const emit=(body:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"training",seq:++seq,turn:seq,t:"2026-10-22T12:00:00.000-04:00",...body});tracker.observe(e);return e;};
 const state=(experience:number,patch:Record<string,unknown>={})=>emit({type:"state",...IN_GAME,party_owner:"player",party:[{...IN_GAME.party[0],species:"TORCHIC",identity:"player-one",level:15,experience,diagnostic:null}],...patch});
 const result=(s:RunEvent,error=false)=>emit({type:"tool_result",id:String(seq),name:"observe",is_error:error,duration_ms:0,text:"state",frames:[],state_seq:s.seq});
 return {tracker,emit,state,result};
}
describe("bounded verified training progress",()=>{
 it("holds only the completed call with a verified positive EXP change",()=>{
  const r=rig();r.result(r.state(100));expect(r.tracker.hold()).toBeNull();
  const s=r.state(101);r.result(s);expect(r.tracker.hold()).toMatchObject({reason:"training_progress"});
  r.result(r.state(101));expect(r.tracker.hold()).toBeNull();
 });
 it("does not recycle decreasing/reappearing EXP, unknown identity or diagnosed party",()=>{
  const r=rig();r.result(r.state(100));r.result(r.state(101));
  r.result(r.state(99));expect(r.tracker.hold()).toBeNull();r.result(r.state(101));expect(r.tracker.hold()).toBeNull();
  r.result(r.state(200,{party:[{...IN_GAME.party[0],species:"TORCHIC",experience:200,identity:null}]}));expect(r.tracker.hold()).toBeNull();
  r.result(r.state(300,{party_owner:"tutorial"}));expect(r.tracker.hold()).toBeNull();
 });
 it("requires successful tool result naming the latest coherent state",()=>{
  const r=rig();r.result(r.state(100));r.result(r.state(101),true);expect(r.tracker.hold()).toBeNull();
  const s=r.state(102);r.state(103);r.result(s);expect(r.tracker.hold()).toBeNull();
 });
});
