import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect,it} from "vitest";
import type {StreamFn} from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,type Message,type Model} from "@mariozechner/pi-ai";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {FrameStore} from "./frames.js";
import {Governor,piLoop,play} from "./harness.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {checkEvent,parseEvent} from "./events.js";
import {observeTool,pressTool} from "./game-tools.js";
import {SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {playGameTools} from "./play-wiring.js";
import {playSystemPrompt,playTools} from "./play-config.js";

const ID="citation-evidence-v1";
const fixture=JSON.parse(readFileSync(new URL("../test-support/citation-evidence-4f08.json",import.meta.url),"utf8")) as {events:unknown[]};
const source=fixture.events.map(checkEvent).find(e=>e.type==="tool_result");
if(source?.type!=="tool_result")throw Error("missing source");
const sourceText=source.text;
const quote="You can usually find me in my cottage by the sea near PETALBURG WOODS.";
const rationale="object 1 is Mr. Briney";
const model:Model<"openai-completions">={id:"offline-citation-fixture",name:"offline-citation-fixture",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text","image"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:100};
const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
it.each([false,true])("structured citation ON=%s reaches the next pinned-pi request and recorded event without changing navigation",async enabled=>{
 const dir=mkdtempSync(join(tmpdir(),"citation-delivery-"));
 try{
  const log=RunLog.create(dir,"offline-citation");
  const recorder=new RunRecorder({log,frames:new FrameStore(dir),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(IN_GAME)}});
  const features={...OFF,"cited-destination-v1":true,"bounded-navigation-v1":true,"input-cuts-v1":true,[ID]:enabled};
  let presses=0;
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
  const fetchFn:typeof fetch=(input)=>{if((typeof input==="string"?input:input instanceof URL?input.href:input.url).includes("/press"))presses++;return Promise.resolve(new Response(JSON.stringify({state:IN_GAME,state_text:sourceText,screenshot_base64:png.toString("base64")})));};
  const tools=playGameTools([observeTool("http://offline-fixture",fetchFn),pressTool("http://offline-fixture",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn)],features,{read:()=>Promise.resolve(IN_GAME)},recorder);
  const prompt=playSystemPrompt(features,null);
  await recorder.start({...RUN_START_META,harness_features:enabled?["cited-destination-v1",ID]:["cited-destination-v1"],tools:playTools(features),system_prompt:prompt});
  const governor=new Governor({limits:{maxTurns:3,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  let decisions=0,delivered="";
  const because=enabled?{quote,rationale}:quote;
  const streamFn:StreamFn=(_model,context)=>{
   decisions++;
   if(decisions===3){
    delivered=context.messages.filter(m=>m.role==="toolResult").flatMap(m=>m.content.filter(c=>c.type==="text").map(c=>c.text)).join("\n");
    expect(delivered.includes("Destination citation: quotation found in observations from turn 1.")).toBe(enabled);
    if(enabled)expect(delivered).toContain("speaker identity, rationale and destination are not verified.");
    expect(delivered).not.toContain(rationale);
   }
   const message=decisions===1?assistant({toolCalls:[toolCall("observe","observe",{})],stopReason:"toolUse"}):decisions===2?assistant({toolCalls:[toolCall("nav","navigate_to",{x:6,y:4,map_id:[17,0],because})],stopReason:"toolUse"}):assistant({text:"Offline fixture complete"});
   const stream=createAssistantMessageEventStream();stream.push({type:"done",reason:message.stopReason==="toolUse"?"toolUse":"stop",message});return stream;
  };
  const loop=piLoop({systemPrompt:prompt,tools,base:{model,convertToLlm:messages=>messages as Message[]},governor,transformContext:recorder.transformContext,emit:recorder.emit,streamFn,signal:new AbortController().signal});
  expect(await play(userText("Offline fixture"),governor,loop)).toBe("budget");recorder.end("budget");
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
  const cite=events.find(e=>e.type==="destination_citation");
  expect(cite).toMatchObject({type:"destination_citation",because:quote,verdict:"found",found_turn:1});
  const result=events.find(e=>e.type==="tool_result"&&e.name==="navigate_to");
  if(result?.type!=="tool_result"||cite?.type!=="destination_citation")throw Error("missing delivery events");
  expect(result.is_error).toBe(false);expect(decisions).toBe(3);expect(presses).toBe(0);
  if(enabled){expect(result.text).toContain(cite.text);expect(delivered).toContain(result.text);}
  expect(events.find(e=>e.type==="tool_call"&&e.name==="navigate_to")).toMatchObject({args:{because}});
  // Optional evidence export is test-owned and is never a gameplay launch.
  const exportPath=process.env.POKEBENCH_CITATION_TEST_EXPORT;
  if(enabled&&exportPath!==undefined)writeFileSync(exportPath,readFileSync(log.eventsPath));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
