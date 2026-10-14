import {expect,it} from "vitest";
import {NavigationMemory} from "./navigation-memory.js";
import {ALL_ON} from "./features.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
const event=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"memory-test",t:"2026-10-14T12:00:00.000-04:00",turn:1,seq,...body});
const state=(seq:number,extra:Record<string,unknown>={})=>event({type:"state",...IN_GAME,started:true,screen:"overworld",location:"Room",map_id:[1,1],position:{x:3,y:4},facing:"right",field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:"Someone outside is calling for help."},...extra},seq);
it("persists observed instructions after sliding context and links every fact to its original observation",()=>{
 const memory=new NavigationMemory(ALL_ON);memory.observe(state(1));
 memory.observe(state(2,{location:"Street",map_id:[0,9],world_context:null}));
 expect(memory.text()).toContain("Someone outside is calling for help.");
 expect(memory.text()).toContain("#1");expect(memory.text()).toContain("Street");
 expect(memory.text()).toContain("Unresolved destination: not declared");
});
it("records actual targeted interaction and measured result without inventing success",()=>{
 const memory=new NavigationMemory(ALL_ON);memory.observe(state(1,{interaction_targets:[{name:"Scientist",kind:"object",x:4,y:4,elevation:0,activation:"press_a",availability:"live",facing:null,local_id:1,destination:null}]}));
 memory.observe(event({type:"tool_call",id:"a",name:"press",args:{buttons:["A"]}},2));
 memory.observe(event({type:"button_press",tool_call_id:"a",buttons:["A"]},3));
 memory.observe(state(4));memory.observe(event({type:"tool_result",id:"a",name:"press",is_error:false,duration_ms:10,text:"ok",frames:[]},5));
 expect(memory.text()).toContain("Scientist");expect(memory.text()).toContain("no observed change");
 expect(memory.text()).not.toMatch(/completed|next milestone|go north/i);
});
it("requires known evidence for model hypotheses and keeps them distinct from fact",()=>{
 const memory=new NavigationMemory(ALL_ON);memory.observe(state(1));
 expect(()=>{memory.remember("Find the caller",[999]);}).toThrow(/unknown observation/);
 memory.remember("Find the caller",[1]);expect(memory.text()).toContain("MODEL HYPOTHESIS");
 expect(memory.text()).toContain("Find the caller");
});
it("does not resurrect fields disabled for original model observations",()=>{
 const memory=new NavigationMemory({...ALL_ON,"active-field-message-buffer-v1":false,"live-player-position-v1":false,"named-interactions-v1":false});memory.observe(state(1));
 expect(memory.text()).not.toContain("calling for help");expect(memory.text()).not.toContain("3,4");
});
it("bounds dialogue, room and attempt history and deduplicates retained dialogue",()=>{
 const memory=new NavigationMemory(ALL_ON);
 for(let i=1;i<=80;i++)memory.observe(state(i,{map_id:[1,i],location:`Room${String(i)}`,world_context:{objects:[],triggers:[],dialogue:"x".repeat(5000)}}));
 expect(memory.text().length).toBeLessThanOrEqual(6500);expect(memory.text()).not.toContain("Room1 ·");
 expect(memory.text()).toContain("truncated");
});
it("handles unknown field ownership, missing state, tool rejection, movements and screen transitions truthfully",()=>{
 for(const [extra,result] of [[{field_controls_locked:true},"A input owned"],[{position:null},"A interaction target unverified"],[{facing:null},"A interaction target unverified"]] as const){
  const m=new NavigationMemory(ALL_ON);m.observe(state(1,extra));m.observe(event({type:"tool_call",id:"a",name:"press",args:{buttons:["A"]}},2));m.observe(event({type:"button_press",tool_call_id:"a",buttons:["A"]},3));m.observe(event({type:"tool_result",id:"a",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]},4));expect(m.text()).toContain(result);expect(m.text()).toContain("result state unavailable");
 }
 for(const [after,expected] of [[{position:{x:4,y:4}},"position changed"],[{screen:"menu"},"screen changed"],[{world_context:null},"dialogue changed"],[{location:"Next",map_id:[1,2]},"room changed"]] as const){
  const m=new NavigationMemory(ALL_ON);m.observe(state(1));m.observe(event({type:"tool_call",id:"n",name:"navigate_to",args:{x:4,y:4,map_id:[1,1]}},2));m.observe(state(3,after));m.observe(event({type:"tool_result",id:"n",name:"navigate_to",is_error:false,duration_ms:1,text:"ok",frames:[]},4));expect(m.text()).toContain(expected);
 }
 const m=new NavigationMemory(ALL_ON);m.observe(state(1));m.observe(event({type:"tool_call",id:"p",name:"press",args:{}},2));m.observe(event({type:"tool_result",id:"p",name:"press",is_error:true,duration_ms:1,text:"Invalid buttons",frames:[]},3));expect(m.text()).toContain("tool rejected: Invalid buttons");
});
it("ignores unrelated events, unmatched inputs, old state and duplicate dialogue, and bounds pending calls",()=>{
 const m=new NavigationMemory(ALL_ON);expect(m.text()).toContain("Current: unobserved");
 m.observe(event({type:"tool_call",id:"a",name:"press",args:{}},0));m.observe(event({type:"button_press",tool_call_id:"unknown",buttons:["A"]},1));
 m.observe(state(2,{started:false}));m.observe(state(3,{map_id:null}));m.observe(state(4,{screen:"menu"}));
 m.observe(state(5));m.observe(state(6));expect(m.text().split("Someone outside is calling")).toHaveLength(2);
 for(let i=7;i<22;i++)m.observe(event({type:"tool_call",id:String(i),name:"press",args:{}},i));
 m.observe(event({type:"tool_result",id:"7",name:"press",is_error:false,duration_ms:0,text:"ok",frames:[]},22));expect(m.text()).toContain("none retained");
 for(const input of ["", "x".repeat(301)])expect(()=>{m.remember(input,[5]);}).toThrow(/destination must/);
 expect(()=>{m.remember("Maybe",[]);}).toThrow(/1–4/);
});
it("keeps model destination hypothesis separate from current room, landmarks and unacknowledged dialogue",async()=>{
 const m=new NavigationMemory(ALL_ON);m.observe(state(1,{interaction_targets:[{name:"Stairs",kind:"warp",x:3,y:2,elevation:0,activation:"step_on",availability:"observed",facing:null,local_id:null,destination:[1,2,0]}]}));
 await m.tool().execute("memory",{destination:"I think this is the lab",evidence:[1]});
 expect(m.text()).toContain("Current: Room · map 1/1");expect(m.text()).toContain("MODEL HYPOTHESIS");expect(m.text()).toContain("recorded warp destination 1/2/0");expect(m.text()).toContain("not yet displayed or acknowledged");
});
