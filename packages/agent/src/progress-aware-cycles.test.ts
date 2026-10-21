import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {ProgressAwareCycles,healRoutes,HEAL_TRIP_CALL_LIMIT,HEAL_TRIP_IDLE_LIMIT} from "./progress-aware-cycles.js";
import {IN_GAME} from "../test-support/events.js";
import type {Place} from "./story-destinations.js";

const A:[number,number]=[0,18],B:[number,number]=[0,10],C:[number,number]=[2,2];
function rig(){
 const tracker=new ProgressAwareCycles();let seq=0,turn=1;
 const emit=(body:Record<string,unknown>):RunEvent=>{const e=checkEvent({v:1,run:"trip",seq:++seq,turn,t:"2026-10-21T12:00:00.000Z",...body});tracker.observe(e);return e;};
 const state=(map=A,x=0,full=false)=>emit({type:"state",...IN_GAME,map_id:map,position:{x,y:0},party:[{...IN_GAME.party[0],species:"TORCHIC",hp:full?20:5,max_hp:20,is_egg:false}]});
 const result=(map=A,x=0,full=false)=>{turn++;const s=state(map,x,full);emit({type:"tool_result",id:String(seq),name:"press",is_error:false,duration_ms:0,text:"result",frames:[],state_seq:s.seq});};
 const gate=(outcome="refused")=>emit({type:"story_battle_heal_gate",tool_call_id:"gate",tool:"press",map_id:A,confirmed:outcome==="confirmed",outcome,reason:null,reached:[],sightings:[],hurt:[{species:"TORCHIC",hp:5,max_hp:20}],heal:[{kind:"pokemon_center",town:"OLDALE TOWN",map_id:C,hops:2,shown:false}],heal_routes:[{outward:[A,B,C],back:[C,B,A]}],text:"heal"});
 state();return {tracker,emit,state,result,gate};
}
describe("bounded gate-directed healing trip",()=>{
 it("protects outward travel, healing and the entire return, then ends",()=>{
  const r=rig();r.gate();r.result(B,1);expect(r.tracker.hold()?.reason).toBe("heal_trip");
  r.result(C,2);expect(r.tracker.hold()).not.toBeNull();
  r.result(C,2,true);expect(r.tracker.hold()).not.toBeNull();
  r.result(B,3,true);expect(r.tracker.hold()?.reason).toBe("heal_trip");
  r.result(A,4,true);expect(r.tracker.hold()).not.toBeNull();
  r.result(A,5,true);expect(r.tracker.hold()).toBeNull();
 });
 it("requires full HP at the offered destination before protecting the return",()=>{
  const r=rig();r.gate();r.result(B,1);r.result(C,2);r.result(B,3);expect(r.tracker.hold()).toBeNull();
 });
 it("ends immediately on a route deviation",()=>{
  const r=rig();r.gate();r.result([0,9],1);expect(r.tracker.hold()).toBeNull();
 });
 it("counts revisited tiles as no progress, and repeated refusals cannot renew bounds",()=>{
  const r=rig();r.gate();r.result(A,1);
  for(let i=0;i<HEAL_TRIP_IDLE_LIMIT;i++){r.gate();r.result(A,1);}
  expect(r.tracker.hold()).toBeNull();r.gate();r.result(B,2);expect(r.tracker.hold()).toBeNull();
 });
 it("has a hard call cap even while wandering over new tiles",()=>{
  const r=rig();r.gate();for(let x=0;x<HEAL_TRIP_CALL_LIMIT+1;x++)r.result(A,x);
  expect(r.tracker.hold()).toBeNull();
 });
 it("confirmation and battle cancel protection",()=>{
  const r=rig();r.gate();r.gate("confirmed");r.result(B,1);expect(r.tracker.hold()).toBeNull();
  const b=rig();b.gate();b.emit({type:"state",...IN_GAME,in_battle:true});b.result(B,1);expect(b.tracker.hold()).toBeNull();
 });
 it("does not infer a trip from low HP or from an old gate without routes",()=>{
  const r=rig();r.result(B,1);expect(r.tracker.hold()).toBeNull();
  const g=r.gate();if(g.type!=="story_battle_heal_gate")throw new Error("gate");
  const {heal_routes:_routes,...old}=g;expect(_routes).toBeDefined();
  const tracker=new ProgressAwareCycles();tracker.observe(checkEvent({...old,seq:1}));expect(tracker.hold()).toBeNull();
 });
 it("marks newly observed milestone turns but ignores checkpoint facts and startup",()=>{
  const r=rig();r.emit({type:"milestone",name:"ROUTE_103",kind:"map",origin:"observed",server_timestamp:null});
  expect(r.tracker.hold()?.reason).toBe("milestone");r.result();expect(r.tracker.hold()).toBeNull();
  r.emit({type:"milestone",name:"RIVAL_BATTLE_WON",kind:"story",origin:"present_at_start",server_timestamp:null});expect(r.tracker.hold()).toBeNull();
 });
});
it("builds directed outward and return paths from the game's map table only",()=>{
 const place=(map_id:[number,number],tos:[number,number][]):Place=>({map_id,name:"map",display:"map",connections:tos.map(to=>({direction:"NORTH",to})),warps:[]});
 expect(healRoutes([place(A,[B]),place(B,[C,A]),place(C,[B])],A,[C])).toEqual([{outward:[A,B,C],back:[C,B,A]}]);
 expect(healRoutes([place(A,[B]),place(B,[C]),place(C,[])],A,[C])).toEqual([]);
});
