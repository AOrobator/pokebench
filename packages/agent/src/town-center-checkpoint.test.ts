import {RUN_START_META} from "../test-support/events.js";
import {recordedRun,recordedFeatures,decisionContext} from "./decision-probe.js";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {Type} from "typebox";
import {Governor,piLoop,play} from "./harness.js";
import {ExactContext} from "./exact-context.js";
import {ContextBudget} from "./context-budget.js";
import {discoverModels,selectModel} from "./gateway.js";
import {playLoopBase} from "./provider.js";
import {readFileSync} from "node:fs";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {StateWatcher,parseGameState,type GameStateSnapshot} from "./game-state.js";
import {featuresOf,dependencyProblems,featureInfo,playHarnessFeatures,SERVER_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import type {PlacesBody,PlaceSource} from "./story-destinations.js";
import {townCenterFacts,townCenterText} from "./town-center-checkpoint.js";

const ID="town-center-checkpoint-v1";
const fixtures=JSON.parse(readFileSync(new URL("../test-support/town-center-states.json",import.meta.url),"utf8")) as Record<string,{sourceRun:string;sourceStateSeq:number;rawRam:NonNullable<GameStateSnapshot["raw_ram"]>;state:GameStateSnapshot;resultText:string}>;
const places=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const fixture=(id="healthy-a")=>{const f=fixtures[id];if(f===undefined)throw Error(id);return {...f,state:parseGameState(f.state)};};
const f=fixture(),NOTE="Enter OLDALE TOWN’s Pokémon Center now, using the listed entrance warp at (6,16) on map [0, 10]. Entry sets your blackout return point here even when your party is healthy. Heal with the nurse if needed, then resume your current objective.";
const heal=f.state.heal_before_trainers;if(heal===undefined)throw Error("native heal fixture");
const flags=(on:boolean)=>({...featuresOf(["ram-state-v1","heal-before-trainers-v1","exit-reachability-v1"]),[ID]:on});
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:f.sourceRun,seq:100,turn:10,t:"2026-10-28T00:00:00.000-04:00",...body});
function setup(on=true,source:PlaceSource={places:()=>Promise.resolve(places)}){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const wiring=contextTools(flags(on),{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:n=>{notes.push(n);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>{}},m=>Promise.resolve(m),undefined,source);
 const feed=(...events:RunEvent[])=>{for(const e of events)for(const listener of listeners)listener(e);};
 const input=(id="result",text=f.resultText):AgentMessage[]=>[{role:"toolResult",toolCallId:id,toolName:"observe",content:[{type:"text",text}],isError:false,timestamp:0}];
 const arrive=(s=f.state,text=f.resultText,id="result",seq=100)=>{feed(event({...s,type:"state",seq}),event({type:"tool_result",seq:seq+1,id,name:"observe",text,state_seq:seq,is_error:false,frames:[],duration_ms:0}));return input(id,text);};
 const reply=(stop="toolUse",calls=true)=>{feed(event({type:"assistant",seq:102,thinking:"",text:"",tool_calls:calls?[{id:"next",name:"observe",args:{}}]:[],usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null,stop_reason:stop}));};
 return {wiring,notes,feed,input,arrive,reply};
}
it("registers a default-OFF agent-side switch with explicit OFF copy",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"heal-before-trainers-v1",switchable:true});expect(featureInfo(ID).description).toContain(" Off: ");expect(SERVER_FEATURES).not.toContain(ID);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);const {[ID]:omittedSwitch,...omitted}=flags(false);expect(omittedSwitch).toBe(false);expect(normalizeFeatures(omitted)[ID]).toBe(false);expect(playHarnessFeatures(flags(true),null)).toContain(ID);expect(dependencyProblems({...flags(true),"exit-reachability-v1":false})).toContain("town-center-checkpoint-v1 needs exit-reachability-v1");
});
it("reproduces exact probed wording from each real native checkpoint context",()=>{
 for(const name of ["healthy-a","healthy-b","rustboro-missing"]){const r=fixture(name);const facts=townCenterFacts(r.state,places.places,r.resultText);expect(facts).not.toBeNull();if(facts===null)throw Error("facts");expect(townCenterText(facts)).toBe(name==="rustboro-missing"?NOTE.replaceAll("OLDALE TOWN","RUSTBORO CITY").replace("(6,16)","(16,38)").replace("[0, 10]","[0, 3]"):NOTE);}
 const r=fixture("rustboro-established");expect(townCenterFacts(r.state,places.places,r.resultText)).toBeNull();
});
it("OFF returns the exact context object with no note, event or tool changes",async()=>{const s=setup(false),input=s.arrive();expect(await s.wiring.transformContext(input)).toBe(input);expect(s.notes).toEqual([]);expect(s.wiring.tools).toEqual([]);});
it("production context factory appends one plain-string final user message with native/result evidence",async()=>{const s=setup(),input=s.arrive(),out=await s.wiring.transformContext(input);expect(out.slice(0,-1)).toEqual(input);expect(out.at(-1)).toMatchObject({role:"user",content:NOTE});expect(typeof out.at(-1)?.content).toBe("string");expect(s.notes).toEqual([{text:NOTE,evidence:[100,101]}]);expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);expect(s.notes).toHaveLength(1);});
it("defers through locked arrival; a successful action consumes the visit, but leaving and returning rearms",async()=>{
 const s=setup();let input=s.arrive({...f.state,field_controls_locked:true});expect(await s.wiring.transformContext(input)).toBe(input);
 input=s.arrive();expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);s.reply();input=s.arrive(f.state,f.resultText,"after",110);expect(await s.wiring.transformContext(input)).toBe(input);
 s.arrive({...f.state,map_id:[0,16],location:"ROUTE 101"},"Screen: overworld","route",120);input=s.arrive(f.state,f.resultText,"return",130);expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);expect(s.notes).toHaveLength(2);
});
it("failed or text-only replies keep the transient note; native checkpoint update suppresses it",async()=>{const s=setup(),input=s.arrive();await s.wiring.transformContext(input);s.reply("error");expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);s.reply("stop",false);expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);const current=s.arrive({...f.state,heal_before_trainers:{...heal,last_heal:[0,10]}});expect(await s.wiring.transformContext(current)).toBe(current);expect(s.notes).toHaveLength(1);});
it("requires coherent native facts, free field, player party and a visible reachable local Center",()=>{
 const withoutHeal={...f.state};delete withoutHeal.heal_before_trainers;const withoutReach={...f.state};delete withoutReach.exit_reach;
 const variants:GameStateSnapshot[]=[withoutReach,{...f.state,started:false},{...f.state,in_battle:true},{...f.state,screen:"battle"},{...f.state,field_controls_locked:null},{...f.state,party_owner:"tutorial"},{...f.state,map_id:null},{...f.state,blackout_active:true},withoutHeal,{...f.state,heal_before_trainers:{...heal,last_heal:null}},{...f.state,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A",diagnostic:null}}];
 for(const state of variants)expect(townCenterFacts(state,places.places,f.resultText)).toBeNull();
 for(const text of ["",f.resultText+"\nScreen: battle",f.resultText+"\nSTATE COVERAGE ERROR: unknown owner",f.resultText.replace("Menu: none open","Menu: start_menu"),f.resultText.replace("Field-message text: none (no message box is open).","Field-message text: hello"),f.resultText.replaceAll('"kind":"warp","x":6,"y":16','"kind":"warp","x":99,"y":99')])expect(townCenterFacts(f.state,places.places,text)).toBeNull();
 expect(townCenterFacts(f.state,[],f.resultText)).toBeNull();
});
it("does not deliver a stale, failed, unseen or mismatched result",async()=>{
 for(const mode of ["wrong-state","error","absent","changed-text"]){const s=setup(),input=s.arrive();if(mode==="wrong-state"||mode==="error")s.feed(event({type:"tool_result",seq:102,id:"result",name:"observe",text:f.resultText,state_seq:mode==="wrong-state"?99:100,is_error:mode==="error",frames:[],duration_ms:0}));const actual=mode==="absent"?[]:mode==="changed-text"?s.input("result","unrelated result"):input;expect(await s.wiring.transformContext(actual)).toBe(actual);expect(s.notes).toEqual([]);}
});
it("restores a recorded delivery without emitting a second durable event",async()=>{const s=setup(),input=s.arrive();s.feed(event({type:"ledger_context",seq:102,text:NOTE,evidence:[100,101]}));expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);expect(s.notes).toEqual([]);});
it("does not invent a Center on routes, from a missing warp, or behind a native reachability gate",()=>{
 const here=places.places.find(p=>p.map_id[0]===0&&p.map_id[1]===10);if(here===undefined)throw Error("town");
 expect(townCenterFacts(f.state,places.places.map(p=>p===here?{...p,warps:[]}:p),f.resultText)).toBeNull();
 expect(townCenterFacts({...f.state,map_id:[0,16]},places.places,f.resultText)).toBeNull();
 expect(townCenterFacts({...f.state,exit_reach:{warps:[{x:6,y:16,reach:"none"}],connections:[],foot:{width:1,height:1,rows:["0"]}}},places.places,f.resultText)).toBeNull();
});
it.each([{on:false,mode:"estimated"},{on:true,mode:"estimated"},{on:true,mode:"exact"},{on:true,mode:"retry"}] as const)("real pinned pi HTTP delivery ON=$on/$mode retains exact wording and stops after native entry",async({on,mode})=>{
 const requests:{messages:{role:string;content:unknown}[]}[]=[];let placeReads=0;
 const server=createServer((req,res)=>{
  if(req.url==="/pokebench/places"){placeReads++;res.end(JSON.stringify(places));return;}
  if(req.url==="/v1/models"){res.end(JSON.stringify({data:[{id:"checkpoint-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(c:string)=>{body+=c;});req.on("end",()=>{
   requests.push(JSON.parse(body) as typeof requests[number]);const center=requests.length===(mode==="retry"?3:2),textOnly=mode==="retry"&&requests.length===2;
   res.writeHead(200,{"content-type":"text/event-stream"});
   const chunks=textOnly?[[{role:"assistant",content:"I should enter the Center."},null],[{},"stop"]]as const:[[{role:"assistant",tool_calls:[{index:0,id:`call-${String(requests.length)}`,type:"function",function:{name:center?"navigate_to_target":"observe",arguments:center?' {"map_id":[0,10],"target":{"kind":"warp","x":6,"y":16}}':"{}"}}]},null],[{},"tool_calls"]]as const;
   for(const[delta,finish]of chunks)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"checkpoint-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const {port}=server.address()as AddressInfo,model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["checkpoint-fixture"]}),"checkpoint-fixture");
  const s=setup(on,new StateWatcher(`http://127.0.0.1:${String(port)}`)),controller=new AbortController();let observations=0,trims=0;
  const exact=new ExactContext({source:"vllm-tokenize",count:p=>Promise.resolve({tokens:1+p.messages.filter(m=>m.role==="assistant").length*100,window:null})},201,1,{compaction:()=>{trims++;},promptCount:()=>{}});
  const governor=new Governor({limits:{maxTurns:mode==="retry"?4:3,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{controller.abort();},now:()=>0});
  const execute=(id:string)=>{const after=observations++>0;const state=after?{...f.state,heal_before_trainers:{...heal,last_heal:[0,10] as [number,number]}}:f.state;s.arrive(state,f.resultText,id,100+observations*10);return Promise.resolve({content:[{type:"text"as const,text:f.resultText}],details:undefined});};
  const tools=[{name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute},{name:"navigate_to_target",label:"Navigate",description:"Navigate",parameters:Type.Object({map_id:Type.Array(Type.Integer()),target:Type.Object({kind:Type.Literal("warp"),x:Type.Integer(),y:Type.Integer()})}),execute}];
  const loop=piLoop({systemPrompt:"Play",tools,base:playLoopBase(model,"off",undefined,1,flags(on),mode==="exact"?p=>exact.fit(p):undefined),governor,signal:controller.signal,transformContext:s.wiring.transformContext,emit:e=>{if(e.type==="message_end"&&e.message.role==="assistant")s.reply(e.message.stopReason,e.message.content.some(p=>p.type==="toolCall"));},...(mode==="estimated"?{budget:new ContextBudget(1),onBudgetTrim:()=>{trims++;}}:{})});
  expect(await play({role:"user",content:"Play",timestamp:0},governor,loop)).toBe("budget");expect(requests).toHaveLength(mode==="retry"?4:3);if(mode!=="retry")expect(trims).toBeGreaterThan(0);
  expect(requests[0]?.messages.some(m=>m.content===NOTE)).toBe(false);expect(requests[1]?.messages.at(-1)?.content===NOTE).toBe(on);expect(requests[2]?.messages.some(m=>m.content===NOTE)).toBe(mode==="retry");expect(requests.at(-1)?.messages.some(m=>m.content===NOTE)).toBe(false);
  if(on)expect(requests[1]?.messages.at(-1)).toEqual({role:"user",content:NOTE});expect(s.notes).toHaveLength(on?1:0);expect(placeReads).toBe(on?1:0);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(e=>{if(e)reject(e);else resolve();});});}
});
it("retains the note across the actual text-only assistant and governor follow-up history",async()=>{
 const s=setup(),input=s.arrive();await s.wiring.transformContext(input);s.reply("stop",false);
 const textOnly:AgentMessage={role:"assistant",api:"openai-completions",provider:"fixture",model:"fixture",content:[{type:"text",text:"I should enter the Center."}],usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:0};
 const retry:AgentMessage[]=[...input,textOnly,{role:"user",content:"Use a tool to continue.",timestamp:0}];
 expect((await s.wiring.transformContext(retry)).at(-1)?.content).toBe(NOTE);expect(s.notes).toHaveLength(1);
});
it("decision replay preserves consumed visit receipts and rearms only after a new visit",async()=>{
 let seq=0;const events:RunEvent[]=[];const add=(body:Record<string,unknown>)=>{const e=event({seq:seq++,turn:1,...body});events.push(e);return e;};
 add({type:"run_start",turn:0,...RUN_START_META,harness_features:playHarnessFeatures(flags(true),null)});
 const turn=(n:number)=>add({type:"turn_start",turn:n,context:{messages:1,images:0,est_tokens:1}});
 const observe=(n:number,id:string,state:GameStateSnapshot=f.state)=>{
  add({type:"assistant",turn:n,thinking:"",text:"",tool_calls:[{id,name:"observe",args:{}}],usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null,stop_reason:"toolUse"});add({type:"tool_call",turn:n,id,name:"observe",args:{}});
  const s=add({...state,type:"state",turn:n,raw_ram:f.rawRam});const r=add({type:"tool_result",turn:n,id,name:"observe",text:f.resultText,state_seq:s.seq,is_error:false,duration_ms:0,frames:[]});return {s,r};
 };
 turn(1);const first=observe(1,"first");add({type:"ledger_context",turn:2,text:NOTE,evidence:[first.s.seq,first.r.seq]});turn(2);observe(2,"consumed");turn(3);
 const run=recordedRun(events),features=recordedFeatures(run),ports={frame:()=>"",rerender:()=>Promise.resolve([]),thinkingSignature:"reasoning_content",places:()=>Promise.resolve(places.places)};
 const recorded=await decisionContext(run,3,features,ports,"recorded"),replayed=await decisionContext(run,3,features,ports,"replayed");
 expect(recorded.messages.some(m=>m.role==="user"&&m.content===NOTE)).toBe(false);expect(replayed.messages.some(m=>m.role==="user"&&m.content===NOTE)).toBe(false);
 observe(3,"leave",{...f.state,map_id:[0,16],location:"ROUTE 101"});turn(4);observe(4,"return");turn(5);
 const returned=await decisionContext(recordedRun(events),5,features,ports,"replayed");expect(returned.messages.at(-1)?.content).toBe(NOTE);
});
