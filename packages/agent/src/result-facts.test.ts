import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import {runAgentLoop,type AgentTool,type AgentToolResult} from "@mariozechner/pi-agent-core";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {type FeatureSet} from "./features.js";
import {withResultFacts} from "./result-facts.js";
import type {RunEvent} from "./events.js";

const ON:FeatureSet={...ALL_ON,"blocked-exit-fact-v1":true,"battle-loss-recap-v1":true};
const tool=(name:string,result:AgentToolResult<unknown>):AgentTool=>({name,label:name,description:"d",parameters:{},execute:()=>Promise.resolve(result)});
const recorder=()=>{const observers:((e:RunEvent)=>void)[]=[];return {observers,subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);}};};
const lost=(seq:number,turn:number,fields:Record<string,unknown>):RunEvent=>({v:1,run:"r",seq,t:"t",type:"state",turn,started:true,screen:"battle",in_battle:true,location:"ROUTE101",map_id:[0,16],position:{x:5,y:5},facing:"up",battle:{active:true,outcome:"lost",outcome_code:2,battle_type:4,battlers:[{battler:1,species:"POOCHYENA"}]},...fields} as unknown as RunEvent);
const home={started:true,screen:"overworld",in_battle:false,location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2],position:{x:7,y:4},facing:"up",field_controls_locked:false,world_context:null,interaction_targets:[],topology:null,battle:null};

describe("withResultFacts",()=>{
 it("with both switches off it returns the very same tools and subscribes to nothing",()=>{
  const r=recorder(),tools=[tool("press",{content:[],details:{}})];
  expect(withResultFacts(tools,{...ALL_ON,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false},r)).toBe(tools);
  expect(r.observers).toHaveLength(0);
 });
 it("leaves tools other than observe, press and navigate_to untouched",()=>{
  const other=tool("recall_dialogue",{content:[],details:{}});
  expect(withResultFacts([other],ON,recorder())[0]).toBe(other);
 });
 it("a result with no state gets no line and is returned as it came",async()=>{
  for(const details of [undefined,null,{},{state:null},{state:"x"},{state:{}}]){
   const result:AgentToolResult<unknown>={content:[{type:"text",text:"readout"}],details};
   const [wrapped]=withResultFacts([tool("observe",result)],ON,recorder());
   expect(await wrapped?.execute("c1",{})).toBe(result);
  }
 });
 it("appends the recap after a whiteout as its own text part; the readout is kept as it was",async()=>{
  const r=recorder();
  const [wrapped]=withResultFacts([tool("observe",{content:[{type:"text",text:"readout"}],details:{state:home}})],ON,r);
  for(const o of r.observers)o(lost(1,9,{}));
  const result=await wrapped?.execute("c2",{});
  expect(result?.content).toEqual([{type:"text",text:"readout"},{type:"text",text:"Battle recap: you lost to a wild POOCHYENA on ROUTE101 (map 0/16) at turn 9 and whited out; the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2)."}]);
 });
});
