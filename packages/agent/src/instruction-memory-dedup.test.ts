import {readFileSync} from "node:fs";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {expect,it} from "vitest";
import {Type} from "typebox";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,playHarnessFeatures,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {ObservedInstructions} from "./observed-instructions.js";
import {contextTools} from "./play-wiring.js";
import {ContextBudget} from "./context-budget.js";
import {ExactContext} from "./exact-context.js";
import {Governor,piLoop,play} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {playLoopBase} from "./provider.js";

const ID="instruction-memory-dedup-v1";
const quote="Please deliver the LETTER to STEVEN in DEWFORD.\nThen take the GOODS to SLATEPORT.";
const page=(text:string,speaker:string|null="MOM")=>({text,speaker,speaker_source:speaker===null?null:"name_prefix",map:"SOURCE MAP",map_display:"Source Town",map_id:[0,9],state_seq:2,position:null});
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"dedup",seq:1,t:"2026-10-27T21:00:00.000-04:00",turn:1,...body});
const dialogue=(id:string,pages:ReturnType<typeof page>[])=>event({type:"dialogue_auto_advance",seq:3,tool_call_id:id,pages,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,stop:"field_free",detail:"test",duration_ms:1});
const result=(id:string,error=false)=>event({type:"tool_result",seq:id==="named"?4:6,id,name:"press",text:"Location: Source Town\nStory: delivered facts",is_error:error,duration_ms:1,frames:[],state_seq:2});
const fixture=[dialogue("named",[page(quote),page("Come back after both errands.")]),result("named"),dialogue("unknown",[page("Our daughter is upstairs, I think.",null)]),result("unknown")];
const flags=(on:boolean,allField=true,trim=true)=>normalizeFeatures({...featuresOf(["observed-instructions-v1","delivered-place-evidence-v1","current-map-display-name-v1"]),"observed-field-dialogue-v1":allField,"milestone-instruction-memory-v1":trim,[ID]:on});
function setup(on:boolean,allField=true,trim=true){
 const listeners:((e:RunEvent)=>void)[]=[],records:{text:string;evidence:number[]}[]=[];
 const wiring=contextTools(flags(on,allField,trim),{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:r=>{records.push(r);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},messages=>Promise.resolve(messages));
 return {wiring,records,feed:(events:RunEvent[])=>{for(const e of events)for(const fn of listeners)fn(e);}};
}
interface Payload{columns:string[];episodes:{result:number;pages:unknown[][]}[]}
const payload=(text:string):Payload=>JSON.parse(text.slice(text.indexOf("\n")+1)) as Payload;

it.each([false,true])("renders every selected whole episode once and retains spatial metadata, allField=%s",async allField=>{
 const s=setup(true,allField);s.feed(fixture);const out=await s.wiring.transformContext([]);const text=s.records[0]?.text??"";
 const p=payload(text);expect(p.episodes.map(e=>e.result)).toEqual([4,6]);expect(p.episodes[0]?.pages.map(p=>p[2])).toEqual([quote,"Come back after both errands."]);
 const named=p.episodes[0]?.pages[0];expect(named?.[p.columns.indexOf("source_map_name")]).toBe("SOURCE MAP");expect(named?.[p.columns.indexOf("source_map_display")]).toBe("Source Town");
 expect(p.episodes[1]?.pages[0]?.slice(0,3)).toEqual([null,null,"Our daughter is upstairs, I think."]);
 expect(text).not.toContain("DELIVERED PERSON AND PLACE EVIDENCE");expect(out.at(-1)?.content).toBe(text);expect(s.wiring.tools).toEqual([]);expect(s.records[0]?.evidence).toEqual([2,3,4,6]);
});
it.each([false,true])("OFF preserves exact incumbent projection, trim=%s",async trim=>{
 const s=setup(false,true,trim),base=new ObservedInstructions(true,trim,true),places=new ObservedInstructions(true,true);
 for(const e of fixture){base.observe(e);places.observe(e);}s.feed(fixture);await s.wiring.transformContext([]);
 expect(s.records[0]?.text).toBe(`${base.text()??""}\n\n${places.placeEvidence()??""}`);
});
it("does not admit pending, failed or cross-run dialogue and is inert without its existing owner",async()=>{
 const s=setup(true);s.feed([dialogue("pending",[page(quote)]),dialogue("failed",[page(quote)]),result("failed",true),{...dialogue("other",[page(quote)]),run:"other"},{...result("other"),run:"other"}]);
 expect(await s.wiring.transformContext([])).toEqual([]);expect(s.records).toEqual([]);
 const listeners:((e:RunEvent)=>void)[]=[];const f={...flags(true),"instruction-goal-ledger-v1":true};const w=contextTools(f,{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:()=>{},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
 expect(w.tools.length).toBeGreaterThan(0);expect((await w.transformContext([])).some(m=>JSON.stringify(m).includes(quote))).toBe(false);
});
it("registers a default-OFF treatment without changing either maintained arm",()=>{
 expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);expect(normalizeFeatures(featuresOf([]))[ID]).toBe(false);expect(flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false})[ID]).toBe(false);
 expect(playHarnessFeatures(flags(false),null)).not.toContain(ID);expect(playHarnessFeatures(flags(true),null)).toContain(ID);
 const source=readFileSync(new URL("../../viewer/src/next-run.ts",import.meta.url),"utf8");expect(source).toContain('"instruction-memory-dedup-v1": false');
});

it.each(["estimated","exact"] as const)("preserves complete unique memory in the actual pinned pi HTTP body after %s trimming",async mode=>{
 const requests:{messages:{role:string;content:unknown}[]}[]=[];
 const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"dedup-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(chunk:string)=>{body+=chunk;});req.on("end",()=>{requests.push(JSON.parse(body) as typeof requests[number]);res.writeHead(200,{"content-type":"text/event-stream"});for(const [delta,finish]of [[{role:"assistant",tool_calls:[{index:0,id:`observe-${String(requests.length)}`,type:"function",function:{name:"observe",arguments:"{}"}}]},null],[{},"tool_calls"]]as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"dedup-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);res.end("data: [DONE]\n\n");});
 });await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const{port}=server.address()as AddressInfo;const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["dedup-fixture"]}),"dedup-fixture");
  const s=setup(true);s.feed(fixture);const controller=new AbortController();let trims=0;
  const exact=new ExactContext({source:"vllm-tokenize",count:p=>Promise.resolve({tokens:1+p.messages.filter(m=>m.role==="assistant").length*100,window:null})},201,1,{compaction:()=>{trims++;},promptCount:()=>{}});
  const governor=new Governor({limits:{maxTurns:3,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{controller.abort();},now:()=>0});
  const observe={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Current question: sail back? YES or NO; LETTER is still in BAG."}],details:undefined})};
  const loop=piLoop({systemPrompt:"Play",tools:[observe,...s.wiring.tools],base:playLoopBase(model,"off",undefined,1,flags(true),mode==="exact"?p=>exact.fit(p):undefined),governor,signal:controller.signal,transformContext:s.wiring.transformContext,emit:()=>{},...(mode==="estimated"?{budget:new ContextBudget(1),onBudgetTrim:()=>{trims++;}}:{})});
  expect(await play({role:"user",content:"Play",timestamp:0},governor,loop)).toBe("budget");expect(requests).toHaveLength(3);expect(trims).toBeGreaterThan(0);
  for(const [i,r]of requests.entries()){
   const memories=r.messages.filter(m=>typeof m.content==="string"&&m.content.startsWith("OBSERVED INSTRUCTION MEMORY"));expect(memories).toHaveLength(1);expect(memories[0]?.content).toBe(s.records[i]?.text);
   const p=payload(String(memories[0]?.content));expect(p.episodes.map(e=>e.result)).toEqual([4,6]);expect(p.episodes[0]?.pages.map(p=>p[2])).toEqual([quote,"Come back after both errands."]);
  }
  expect(JSON.stringify(requests[2])).toContain("Current question: sail back?");expect(requests[2]?.messages.filter(m=>m.role==="assistant")).toHaveLength(1);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});}
});
