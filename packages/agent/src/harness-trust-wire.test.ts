// harness-trust-v1 and cited-destination-v1: registry, presets, system prompt, the production playGameTools factory,
// the recorder's events, and one run through the pinned pi loop that delivers the header, the walk-away note and the
// citation line to the model's next request.
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe,expect,it} from "vitest";
import {Type,type TObject} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,stateOnlyProblems,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {CITED_DESTINATION_SECTION,playSystemPrompt} from "./play-config.js";
import {TRUST_HEADER,trustSection,type StoryGoalAwayFacts} from "./harness-trust.js";
import {becauseDescription,type DestinationCitationFacts} from "./cited-destination.js";
import {playGameTools} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {Governor,piLoop,play} from "./harness.js";
import {discoverModels,selectModel} from "./gateway.js";
import {gatewayLoopConfig} from "./provider.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";
import type {PlacesBody} from "./story-destinations.js";

const TRUST="harness-trust-v1" as const,CITED="cited-destination-v1" as const;
interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa",Recording>;
const PLACES=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const CAAA:RunEvent[]=RECORDED["4caa"].events.map(e=>checkEvent(e));
const T272=CAAA.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.turn===272);
const STATE=((): GameStateSnapshot=>{
 const e=CAAA.find(x=>x.seq===T272?.state_seq);
 if(e?.type!=="state"||!("started" in e))throw Error("no state");
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
})();
const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const at=(x:number,y:number):GameStateSnapshot=>({...STATE,position:{x,y},field_controls_locked:false});
const LAB_GOAL="Story goal: \"Well, it's time to head back to the LAB.\" (MAY, turn 272) -> \"LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).";
const must=<T>(value:T|undefined):T=>{if(value===undefined)throw new Error("missing");return value;};

describe("registry and presets",()=>{
 it("both switches are registered last, in order, with copy that says what OFF does",()=>{
  expect(SWITCHABLE_FEATURES.slice(-29,-25)).toEqual(["exit-reachability-v1","heal-before-trainers-v1",TRUST,CITED]);
  expect(featureInfo(TRUST)).toMatchObject({switchable:true,group:"guidance",needs:"dialogue-auto-advance-v1",title:"HARNESS TRUST"});
  expect(featureInfo(CITED)).toMatchObject({switchable:true,group:"guidance",needs:"bounded-navigation-v1",title:"CITED DESTINATION"});
  for(const id of [TRUST,CITED])expect(featureInfo(id).description).toContain(" Off: ");
  expect(FEATURES.filter(f=>f.id===TRUST||f.id===CITED)).toHaveLength(2);
  expect(playHarnessFeatures(ALL_ON,null).slice(-27,-25)).toEqual([TRUST,CITED]);
  expect(playHarnessFeatures({...ALL_ON,[TRUST]:false,[CITED]:false},null)).not.toContain(TRUST);
  expect(dependencyProblems({...ALL_ON,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false,"bounded-navigation-v1":false})).toEqual(expect.arrayContaining([`${TRUST} needs dialogue-auto-advance-v1`,`${CITED} needs bounded-navigation-v1`]));
  expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toEqual(expect.arrayContaining([`state-only-decisions-v1 requires ${TRUST} OFF`,`state-only-decisions-v1 requires ${CITED} OFF`]));
 });
 it("presets default both OFF when omitted (new treatments), and keep an explicit value",()=>{
  const rest=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==TRUST&&id!==CITED)) as Omit<FeatureSet,typeof TRUST|typeof CITED>;
  expect(normalizeFeatures(rest)).toMatchObject({[TRUST]:false,[CITED]:false});
  expect(normalizeFeatures({...rest,[TRUST]:true,[CITED]:true})).toMatchObject({[TRUST]:true,[CITED]:true});
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})).toMatchObject({[TRUST]:false,[CITED]:false});
 });
});

describe("system prompt",()=>{
 it("ON appends the trust order last, after every other section; OFF is byte for byte today's prompt",()=>{
  for(const evidence of [false,true]){
   const base={...ALL_ON,"state-only-decisions-v1":false,"game-evidence-priority-v1":evidence,[TRUST]:false,[CITED]:false};
   const off=playSystemPrompt(base,null);
   expect(playSystemPrompt({...base,[TRUST]:true},null)).toBe(`${off}\n\n${trustSection(evidence,true)}`);
  }
  // Also after the objective-tracking section, which used to be last.
  const objectives={...ALL_ON,"state-only-decisions-v1":false,"objective-tracking-v1":true,[CITED]:false};
  expect(playSystemPrompt(objectives,null).endsWith(`\n\n${trustSection(true,true)}`)).toBe(true);
 });
 it("cited-destination adds its navigate_to rule with navigation on, before the trust order; nothing without navigation",()=>{
  const base={...ALL_ON,"state-only-decisions-v1":false,[TRUST]:false,[CITED]:false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false};
  const off=playSystemPrompt(base,null);
  expect(playSystemPrompt({...base,[CITED]:true},null)).toBe(`${off}\n\n${CITED_DESTINATION_SECTION}`);
  expect(playSystemPrompt({...base,[CITED]:true,[TRUST]:true},null)).toBe(`${off}\n\n${CITED_DESTINATION_SECTION}\n\n${trustSection(true,true)}`);
  expect(playSystemPrompt({...base,"bounded-navigation-v1":false,[CITED]:true},null)).toBe(playSystemPrompt({...base,"bounded-navigation-v1":false},null));
 });
});

type Details={state:GameStateSnapshot};
function gameTools(states:()=>GameStateSnapshot,onCall?:(name:string,id:string)=>void):AgentTool[] {
 const result=(name:string,id:string):Promise<AgentToolResult<Details>>=>{onCall?.(name,id);return Promise.resolve({content:[{type:"text",text:`${name}: Location: ROUTE103`}],details:{state:states()}});};
 return [
  {name:"observe",label:"o",description:"o",parameters:Type.Object({}),execute:id=>result("observe",id)},
  {name:"press",label:"p",description:"p",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(id:string)=>result("press",id),executeChecked:(id:string)=>result("press",id)} as AgentTool,
 ];
}
function fakeRecorder() {
 const subs:((e:RunEvent)=>void)[]=[];const away:StoryGoalAwayFacts[]=[];const cites:DestinationCitationFacts[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:(_t:string,f:StoryGoalAwayFacts)=>{away.push(f);},destinationCitation:(f:DestinationCitationFacts)=>{cites.push(f);}} as unknown as Parameters<typeof playGameTools>[3];
 return {recorder,subs,away,cites};
}
const textOf=(r:AgentToolResult<unknown>|undefined)=>(r?.content??[]).map(c=>c.type==="text"?c.text:"").join("|");

describe("the production factory",()=>{
 it("harness-trust-v1 heads every game-tool result; OFF leaves results as they were",async()=>{
  const reader={read:()=>Promise.resolve(STATE),places:()=>Promise.resolve(PLACES)};
  const on=fakeRecorder();
  const tools=playGameTools(gameTools(()=>STATE),{...OFF,[TRUST]:true},reader,on.recorder);
  for(const s of on.subs)for(const e of CAAA)s(e);
  expect(textOf(await tools[0]?.execute("o",{}))).toBe(`${TRUST_HEADER}\n${LAB_GOAL}\n\nobserve: Location: ROUTE103`);
  const off=fakeRecorder();
  const plain=playGameTools(gameTools(()=>STATE),OFF,reader,off.recorder);
  expect(textOf(await plain[0]?.execute("o",{}))).toBe("observe: Location: ROUTE103");
 });
 it("cited-destination-v1 gives the production navigate_to a required because, with the whole-map and exit-reach text",async()=>{
  const reader={read:()=>Promise.resolve(STATE),places:()=>Promise.resolve(PLACES)};
  const nav=(features:FeatureSet)=>must(playGameTools(gameTools(()=>STATE),features,reader,fakeRecorder().recorder).find(t=>t.name==="navigate_to"));
  const base={...OFF,"live-map-v1":true,"bounded-navigation-v1":true,"ram-state-v1":true};
  expect((nav(base).parameters as TObject).required).toEqual(["x","y","map_id"]);
  const cited=nav({...base,[CITED]:true,"full-map-navigation-v1":true,"exit-reachability-v1":true});
  expect((cited.parameters as TObject).required).toEqual(["x","y","map_id","because"]);
  expect((cited.parameters as TObject).properties.because).toMatchObject({description:becauseDescription({fullMap:true,exitReach:true})});
  const rec=fakeRecorder();
  const tools=playGameTools(gameTools(()=>STATE),{...base,[CITED]:true,[TRUST]:true},reader,rec.recorder);
  for(const s of rec.subs)for(const e of CAAA)s(e);
  const text=textOf(await must(tools.find(t=>t.name==="navigate_to")).execute("n",{x:9,y:3,map_id:[0,18],because:"the LAB is in RUSTBORO CITY"}));
  expect(text.startsWith(`${TRUST_HEADER}\n${LAB_GOAL}\n\nBecause: "the LAB is in RUSTBORO CITY" is not in anything the game has shown you this run`)).toBe(true);
  expect(rec.cites).toMatchObject([{tool_call_id:"n",verdict:"not_found",x:9,y:3,map_id:[0,18]}]);
 });
});

describe("recorded events",()=>{
 it("story_goal_away and destination_citation are schema-valid run events",()=>{
  const away={tool:"navigate_to",speaker:"MAY",line_turn:272,quote:"Well, it's time to head back to the LAB.",targets:[{name:"PROF. BIRCH'S POKéMON LAB",map_id:[1,4]}],steps:[{measure:"tiles",from_map:[0,18],to_map:[0,18],from_name:"ROUTE103",to_name:"ROUTE103",from:{x:9,y:13},to:{x:9,y:10},before:8,after:11,way:"this map's SOUTH edge (to OLDALE TOWN (map 0/10))"},{measure:"maps",from_map:[0,10],to_map:[0,18],from_name:"OLDALE TOWN",to_name:"ROUTE103",from:{x:10,y:0},to:{x:10,y:21},before:3,after:4,way:null}],text:"SUPERVISOR: x"};
  expect(checkEvent({v:1,run:"r",seq:1,t:"2026-10-17T15:00:00.000-04:00",type:"story_goal_away",turn:3,...away}).type).toBe("story_goal_away");
  const cite={tool_call_id:"n",because:"x y",verdict:"not_found",found_turn:null,x:1,y:2,map_id:[0,9],text:"Because: x"};
  expect(checkEvent({v:1,run:"r",seq:2,t:"2026-10-17T15:00:00.000-04:00",type:"destination_citation",turn:3,...cite}).type).toBe("destination_citation");
  expect(checkEvent({v:1,run:"r",seq:3,t:"2026-10-17T15:00:00.000-04:00",type:"destination_citation",turn:3,...cite,verdict:"found",found_turn:272,text:null}).type).toBe("destination_citation");
  expect(()=>checkEvent({v:1,run:"r",seq:4,t:"2026-10-17T15:00:00.000-04:00",type:"destination_citation",turn:3,...cite,verdict:"maybe"})).toThrow();
 });
});

it("delivers the header and the walk-away note to the next model request through pi, and records story_goal_away before the result",async()=>{
 const requests:string[]=[];
 const server=createServer((req,res)=>{
  if(req.url==="/v1/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"trust-fixture",context_window:65536,max_tokens:4096}]}));return;}
  let body="";req.setEncoding("utf8");req.on("data",(part:string)=>{body+=part;});req.on("end",()=>{
   requests.push(body);res.writeHead(200,{"content-type":"text/event-stream"});
   for(const [delta,finish] of [[{role:"assistant",tool_calls:[{index:0,id:`observe-${String(requests.length)}`,type:"function",function:{name:"press",arguments:JSON.stringify({buttons:["UP"]})}}]},null],[{},"tool_calls"]] as const)res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"trust-fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
   res.end("data: [DONE]\n\n");
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,"127.0.0.1",resolve);});
 const root=mkdtempSync(join(tmpdir(),"pokebench-trust-wire-"));
 try{
  const {port}=server.address() as AddressInfo;
  const model=selectModel(await discoverModels({gatewayUrl:`http://127.0.0.1:${String(port)}/v1`,visionModels:["trust-fixture"]}),"trust-fixture");
  const log=RunLog.create(root,"trust");
  // Call 1 hears MAY's line (recorded the way dialogue auto-advance records it); calls 2-4 walk north on Route 103.
  const walk=[at(9,3),at(9,13),at(9,10),at(9,7)];let call=0;
  const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(STATE)}});
  await recorder.start(RUN_START_META);
  const states=()=>must(walk[Math.min(call,walk.length)-1]);
  const tools=playGameTools(gameTools(states,(_name,id)=>{call++;if(call===1)recorder.recordDialogueAutoAdvance({tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"ROUTE103",map_id:[0,18],position:{x:9,y:3},speaker:"MAY",speaker_source:"name_prefix",text:"MAY: Well, it's time to head back to\nthe LAB."}],stop:"field_free",detail:"d",duration_ms:1});}),{...OFF,[TRUST]:true},{read:()=>Promise.resolve(STATE),places:()=>Promise.resolve(PLACES)},recorder);
  const abort=new AbortController();
  const governor=new Governor({limits:{maxTurns:5,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{abort.abort();},now:()=>0});
  const loop=piLoop({systemPrompt:"Play",tools,base:gatewayLoopConfig(model,"off"),governor,signal:abort.signal,transformContext:m=>Promise.resolve(m),emit:event=>recorder.emit(event)});
  expect(await play({role:"user",content:"Play",timestamp:0},governor,loop)).toBe("budget");
  recorder.end("budget");
  const events:RunEvent[]=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
  const results=events.filter((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result");
  const notes=events.filter((e):e is Extract<RunEvent,{type:"story_goal_away"}>=>e.type==="story_goal_away");
  const goal="Story goal: \\\"Well, it's time to head back to the LAB.\\\" (MAY, turn 0)";
  expect(requests[1]).toContain(JSON.stringify(TRUST_HEADER).slice(1,-1));
  expect(requests[1]).toContain(goal);
  expect(results[0]?.text.startsWith(`${TRUST_HEADER}\nStory goal: "Well, it's time to head back to the LAB." (MAY, turn 0) -> "LAB" = PROF. BIRCH'S POKéMON LAB (map 1/4).`)).toBe(true);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({tool:"press",speaker:"MAY",line_turn:0,steps:[{measure:"tiles",from:{x:9,y:13},to:{x:9,y:10}},{measure:"tiles",from:{x:9,y:10},to:{x:9,y:7}}]});
  expect(results[3]?.text).toContain(`\n${must(notes[0]).text}\n`);
  expect(must(notes[0]).seq).toBeLessThan(must(results[3]).seq);
  expect(requests.some(r=>r.includes("SUPERVISOR: Your last two moves took you farther from PROF. BIRCH'S POKéMON LAB (map 1/4)"))).toBe(true);
 }finally{
  rmSync(root,{recursive:true,force:true});
  await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});
 }
});
