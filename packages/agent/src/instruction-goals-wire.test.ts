import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {Governor,piLoop,play} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {contextTools,playGameTools} from "./play-wiring.js";
import {playSystemPrompt} from "./play-config.js";
import {featuresOf} from "./features.js";
import {checkEvent,type RunEvent,type BodyOf,type Button} from "./events.js";
import {parseGameState} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";

it("delivers recorded scientist instruction, inline goal schema and chosen menu execution through pinned pi HTTP",async()=>{
 const requests:unknown[]=[],buttons:Button[]=[];
 const review={reviewed:[{episode:39430,interpretation:"Scientist asks me to call Stone"},{episode:39462,interpretation:"Select POKéNAV"}],updates:[{id:"select",title:"Select POKéNAV",sources:[{episode:39462,page:0}],parent:null,status:"active",reason:"Scientist asks",completion:"POKéNAV opens"}]};
 const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"instruction-goal-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(chunk:string)=>{body+=chunk;});req.on("end",()=>{
   requests.push(JSON.parse(body) as unknown);res.writeHead(200,{"content-type":"text/event-stream"});
   const name=requests.length===1?"select_menu_option":"observe",args=requests.length===1?{phase:"field_multichoice",menu_id:86,option:"POKéNAV",goal_review:review}:{};
   for(const [delta,finish] of [[{role:"assistant",tool_calls:[{index:0,id:`choice-${String(requests.length)}`,type:"function",function:{name,arguments:JSON.stringify(args)}}]},null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"instruction-goal-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 try{
  const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`,visionModels:["instruction-goal-fixture"]}),"instruction-goal-fixture");
  const fixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz",import.meta.url))).toString()) as {events:unknown[]};const events=fixture.events.map(checkEvent);
  const source=events.find(e=>e.seq===39512)!;const {v:_v,run:_r,seq:_s,t:_t,type:_ty,turn:_tu,...body}=source;let state=parseGameState(body);
  const subscribers:((event:RunEvent)=>void)[]=[],records:Omit<BodyOf<"ledger_context">,"type"|"turn">[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLedgerContext:(b:Omit<BodyOf<"ledger_context">,"type"|"turn">)=>{records.push(b);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:2,turn:1}),lowHpTrainerWarning:()=>{},peopleIdCard:()=>{},destinationCitation:()=>{},unfinishedActivity:()=>{}};
  const features={...featuresOf([]),"ram-state-v1":true,"instruction-goal-ledger-v1":true,"menu-option-tool-v1":true};
  const context=contextTools(features,recorder,m=>Promise.resolve(m));for(const e of events.filter(e=>e.seq<=39462))for(const fn of subscribers)fn(e);
  const observe={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:async()=>({content:[{type:"text" as const,text:"recorded menu / scripted transition fixture"}],details:{state}})};
  const press:CheckedPressTool={...observe,name:"press",parameters:Type.Object({buttons:Type.Array(Type.Enum(["A","B","START","SELECT","UP","DOWN","LEFT","RIGHT"]),{minItems:1,maxItems:8}),walking:Type.Optional(Type.Boolean())}),executeChecked:async(_id,args,check)=>{check(state);const b=args.buttons[0]!;buttons.push(b);state=b==="A"?{...state,active_ui:null}:{...state,active_ui:{...state.active_ui!,selected:"POKéNAV",details:{...state.active_ui!.details,selected_index:3}}};return observe.execute();}};
  const tools=playGameTools([observe,press],features,{read:async()=>state},recorder,undefined,context.tools,context.training,context.instructionGoals);
  const abort=new AbortController(),governor=new Governor({limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{abort.abort();},now:()=>0});
  const loop=piLoop({systemPrompt:playSystemPrompt(features,null),tools,base:gatewayLoopConfig(model,"off"),governor,signal:abort.signal,transformContext:context.transformContext,emit:()=>{}});
  expect(await play({role:"user",content:"Continue from the recorded menu",timestamp:0},governor,loop)).toBe("budget");
  expect(requests).toHaveLength(2);expect(JSON.stringify(requests[0])).toContain("Please select the POKéNAV.");expect(JSON.stringify(requests[0])).toContain("goal_review");expect(JSON.stringify(requests[1])).toContain('Select POKéNAV');expect(buttons).toEqual(["DOWN","A"]);expect(records.some(r=>r.instruction_goals?.call_id==="choice-1")).toBe(true);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});}
});
