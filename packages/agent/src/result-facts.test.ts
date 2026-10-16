import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import {runAgentLoop,type AgentTool,type AgentToolResult} from "@mariozechner/pi-agent-core";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {ALL_ON,type FeatureSet} from "./features.js";
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
 it("the appended line reaches the model: the pinned pi loop sends it in the tool message of the next chat request",async()=>{
  const requests:{messages:{role:string;content?:unknown}[]}[]=[];
  const chunk=(delta:Record<string,unknown>,finish:string|null=null)=>`data: ${JSON.stringify({id:"c",object:"chat.completion.chunk",created:0,model:"lane",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`;
  const turns=[[chunk({role:"assistant",tool_calls:[{index:0,id:"call_1",type:"function",function:{name:"observe",arguments:"{}"}}]}),chunk({},"tool_calls"),"data: [DONE]\n\n"],[chunk({role:"assistant",content:"ok"}),chunk({},"stop"),"data: [DONE]\n\n"]];
  const srv=createServer((req,res)=>{
   if(req.method==="GET"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({object:"list",data:[{id:"think-swarm",context_window:65536,max_tokens:16384}]}));return;}
   let raw="";req.setEncoding("utf8");req.on("data",(p:string)=>raw+=p);
   req.on("end",()=>{requests.push(JSON.parse(raw) as {messages:{role:string;content?:unknown}[]});res.writeHead(200,{"content-type":"text/event-stream"});for(const l of turns[requests.length-1]??[])res.write(l);res.end();});
  });
  await new Promise<void>(resolve=>srv.listen(0,"127.0.0.1",resolve));
  try{
   const {port}=srv.address() as AddressInfo;
   const models=await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["think-swarm"]});
   const r=recorder();
   const tools=withResultFacts([{...tool("observe",{content:[{type:"text",text:"readout"}],details:{state:home}}),parameters:Type.Object({})}],ON,r);
   for(const o of r.observers)o(lost(1,9,{}));
   await runAgentLoop([{role:"user",content:"play",timestamp:0}],{systemPrompt:"s",messages:[],tools:[...tools]},gatewayLoopConfig(selectModel(models,"think-swarm"),"medium"),()=>undefined);
   const sent=JSON.stringify(requests[1]?.messages.filter(m=>m.role==="tool"));
   expect(sent).toContain("readout");
   expect(sent).toContain("Battle recap: you lost to a wild POOCHYENA on ROUTE101 (map 0/16) at turn 9 and whited out");
  }finally{await new Promise<void>(resolve=>{srv.close(()=>{resolve();});});}
 });
 it("appends the recap after a whiteout as its own text part; the readout is kept as it was",async()=>{
  const r=recorder();
  const [wrapped]=withResultFacts([tool("observe",{content:[{type:"text",text:"readout"}],details:{state:home}})],ON,r);
  for(const o of r.observers)o(lost(1,9,{}));
  const result=await wrapped?.execute("c2",{});
  expect(result?.content).toEqual([{type:"text",text:"readout"},{type:"text",text:"Battle recap: you lost to a wild POOCHYENA on ROUTE101 (map 0/16) at turn 9 and whited out; the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2)."}]);
 });
});
