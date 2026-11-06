import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import preset from "../../../experiments/presets/current-control-24h-8k.json" with {type:"json"};
import rayquazaPreset from "../../../experiments/presets/rayquaza-lane-8h.json" with {type:"json"};
import current from "../../../experiments/feature-configs/current.json" with {type:"json"};
import rayquaza from "../../../experiments/feature-configs/rayquaza-lane.json" with {type:"json"};
import {IN_GAME} from "../test-support/events.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import type {AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import type {Button,RunEvent} from "./events.js";
import {ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
import type {BeforePressCheck,CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {playSystemPrompt} from "./play-config.js";
import {flagFeatures,parsePlayPreset} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {FIELD_CALL_ID,FIELD_CALL_NOTE,POKENAV_CALL_ID,POKENAV_CALL_NOTE,fieldCallDecision,withPokenavCallAutoAdvance,type PokenavCallPorts} from "./pokenav-call-auto-advance.js";

const OFF:FeatureSet={...LEGACY_ALL_ON,[POKENAV_CALL_ID]:true,[FIELD_CALL_ID]:false};
const ON:FeatureSet={...OFF,[FIELD_CALL_ID]:true};
const details=(call_state:number,call_text_state:string,more:Record<string,string|number|boolean>={})=>({owner_task:2,call_state,trainer_id:0,triggered_from_script:true,call_text_state,...more});
const ui=(phase:string,ready:boolean,d:Record<string,string|number|boolean>,value?:string)=>({phase,selected:ready?"CONTINUE":null,ready,controls:"c",diagnostic:null,details:d,...(value===undefined?{}:{value})});
const MESSAGE="Hello!\nIt's Dad.";
const screen=(active_ui:NonNullable<GameStateSnapshot["active_ui"]>|null):GameStateSnapshot=>({...IN_GAME,active_ui});
const printing=(call=5)=>screen(ui(call===5?"field_match_call_message":"field_match_call_transition",false,details(call,"printing",call===5?{message:MESSAGE}:{})));
const page=(value:string,call=5)=>screen(ui("field_match_call_message",true,details(call,"waiting",call===5?{message:MESSAGE}:{}),value));
const finished=screen(ui("field_match_call_message",true,details(5,"finished",{message:MESSAGE}),"It's Dad."));
const closing=(call:number)=>screen(ui("field_match_call_transition",false,details(call,"unavailable")));
const free=screen(null);

// Dad's call as run 7442 read it: ellipsis page, two message pages, the finished box, the slide out.
class FakeCall{
 buttons:Button[]=[];reads=0;now=0;
 constructor(private readonly script:GameStateSnapshot[],private at=0){}
 state():GameStateSnapshot{return this.script[this.at] as GameStateSnapshot;}
 step(){if(this.at<this.script.length-1)this.at++;}
 press(button:Button){this.buttons.push(button);this.step();}
}
const DAD=()=>new FakeCall([printing(4),page("……",4),printing(),page("Hello!"),printing(),finished,closing(6),closing(7),free]);

function recorder(){
 const events:RunEvent[]=[];let seq=0;
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-11-05T12:00:00.000-05:00",turn:7,...body} as RunEvent;events.push(e);return {seq:e.seq,turn:7};};
 const api:AutoAdvanceRecorder={recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:()=>undefined};
 return {api,advances:()=>events.filter((e):e is Extract<RunEvent,{type:"dialogue_auto_advance"}>=>e.type==="dialogue_auto_advance")};
}
const result=(game:FakeCall,text:string):AgentToolResult<unknown>=>({content:[{type:"text",text}],details:{state:game.state()}});
function wire(game:FakeCall,features:FeatureSet=ON,limits?:PokenavCallPorts["limits"],beforeCheck:()=>void=()=>undefined){
 const rec=recorder();
 const observe:AgentTool={name:"observe",label:"observe",description:"Observe.",parameters:Type.Object({}),execute:()=>Promise.resolve(result(game,`observed ${game.state().active_ui?.phase??"free"}`))};
 const press={name:"press",label:"press",description:"Press.",parameters:Type.Object({buttons:Type.Array(Type.String())}),
  execute:(_:string,args:{buttons:Button[]})=>{for(const b of args.buttons)game.press(b);return Promise.resolve(result(game,"pressed"));},
  executeChecked:(_:string,args:{buttons:Button[]},check:BeforePressCheck)=>{beforeCheck();check(game.state());for(const b of args.buttons)game.press(b);return Promise.resolve(result(game,"pressed"));}} as unknown as CheckedPressTool;
 const tools=withPokenavCallAutoAdvance([observe,press],features,{state:{read:()=>{game.reads++;return Promise.resolve(game.state());}},recorder:rec.api,press,observe,clock:{now:()=>game.now,sleep:ms=>{game.now+=ms;game.step();return Promise.resolve();}},...(limits===undefined?{}:{limits})});
 const tool=(name:string):AgentTool=>{const t=tools.find(x=>x.name===name);if(t===undefined)throw new Error(name);return t;};
 return {tool,rec,tools};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");

describe(FIELD_CALL_ID,()=>{
 it("is a server switch with no dependency, appended after the last switch",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(FIELD_CALL_ID)).toBe(SWITCHABLE_FEATURES.indexOf("shop-shelf-hidden-v1")+1);
  expect(SERVER_FEATURES).toContain(FIELD_CALL_ID);
  const feature=FEATURES.find(f=>f.id===FIELD_CALL_ID);
  expect(feature?.needs).toBeNull();
  expect(feature?.description).toContain(" Off: ");
 });
 it("reaches the server only when on",()=>{
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(FIELD_CALL_ID);
  expect(serverFeatureEnv({...ALL_ON,[FIELD_CALL_ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(FIELD_CALL_ID);
  expect(playHarnessFeatures(ALL_ON,"play")).toContain(FIELD_CALL_ID);
  expect(playHarnessFeatures({...ALL_ON,[FIELD_CALL_ID]:false},"play")).not.toContain(FIELD_CALL_ID);
 });
 it("defaults off when a preset or flag set omits it",()=>{
  const omitted=Object.fromEntries(Object.entries(preset.features).filter(([id])=>id!==FIELD_CALL_ID));
  const parsed=parsePlayPreset({...preset,features:omitted});
  if(parsed.version!==2)throw new Error("version");
  expect(parsed.features[FIELD_CALL_ID]).toBe(false);
  expect(flagFeatures({} as Parameters<typeof flagFeatures>[0])[FIELD_CALL_ID]).toBe(false);
 });
 it("is on in both arms of the current and Rayquaza recipes and their plain presets",()=>{
  for(const recipe of [current,rayquaza]){
   expect(recipe.onInBoth).toContain(FIELD_CALL_ID);
   expect((recipe.features as Record<string,boolean>)[FIELD_CALL_ID]).toBe(true);
  }
  for(const plain of [preset,rayquazaPreset])expect((plain.features as Record<string,boolean>)[FIELD_CALL_ID]).toBe(true);
 });

 it("decides from the reader's text state alone",()=>{
  expect(fieldCallDecision(page("Hello!")).kind).toBe("press");
  expect(fieldCallDecision(finished).kind).toBe("press");
  expect(fieldCallDecision(printing()).kind).toBe("wait");
  expect(fieldCallDecision(closing(6)).kind).toBe("wait");
  expect(fieldCallDecision(screen(ui("field_match_call_message",true,details(5,"strange")))).kind).toBe("stop");
  const bare=screen({phase:"field_match_call_message",selected:null,ready:false,controls:"c",diagnostic:null});
  expect(fieldCallDecision(bare).kind).toBe("stop");
  const old=screen(ui("field_match_call_message",false,{owner_task:2,call_state:5}));
  expect(fieldCallDecision(old).kind).toBe("stop");
 });

 it("presses A through a whole call, never while printing, and returns the text",async()=>{
  const game=DAD();const {tool,rec}=wire(game);
  const out=await tool("observe").execute("c",{});
  expect(game.buttons).toEqual(["A","A","A"]);
  const text=textOf(out);
  expect(text).toContain("observed free");
  expect(text).toContain(`PokéNav auto-advance: 3 ordinary inputs (A, A, A); stopped: call ended`);
  expect(text).toContain(MESSAGE);
  const [event]=rec.advances();
  expect(event?.pokenav_buttons).toEqual(["A","A","A"]);
  expect(event?.pages.map(p=>p.text)).toEqual([MESSAGE]);
  expect(event?.stop).toBe("menu");
 });

 it("starts from any wrapped tool that lands on the call",async()=>{
  const game=new FakeCall([free,page("……",4),printing(),finished,closing(6),free]);const {tool}=wire(game);
  await tool("press").execute("c",{buttons:["A"]});
  expect(game.buttons).toEqual(["A","A","A"]);
 });

 it("keeps the press cap",async()=>{
  const script=Array.from({length:12},(_,i)=>page(`p${String(i)}`));
  const game=new FakeCall(script);const {tool,rec}=wire(game,ON,{presses:3,callMs:90_000,waitMs:10_000,pollMs:100});
  await tool("observe").execute("c",{});
  expect(game.buttons.length).toBe(3);
  expect(rec.advances()[0]?.stop).toBe("press_cap");
 });

 it("keeps the wait cap on a printer that never reaches a page wait",async()=>{
  const game=new FakeCall([printing()]);const {tool,rec}=wire(game,ON,{presses:3,callMs:90_000,waitMs:500,pollMs:100});
  await tool("observe").execute("c",{});
  expect(game.buttons).toEqual([]);
  expect(rec.advances()[0]?.stop).toBe("interface_not_ready");
 });

 it("keeps the time cap",async()=>{
  const game=new FakeCall(Array.from({length:40},(_,i)=>i%2===0?printing():page(`p${String(i)}`)));const {tool,rec}=wire(game,ON,{presses:50,callMs:300,waitMs:10_000,pollMs:100});
  await tool("observe").execute("c",{});
  expect(rec.advances()[0]?.stop).toBe("time_cap");
 });

 it("stops on a battle, a coverage error or a new caller",async()=>{
  const battle=new FakeCall([page("Hi"),{...page("Hi"),in_battle:true}]);
  await wire(battle).tool("observe").execute("c",{});
  expect(battle.buttons).toEqual(["A"]);
  const error=new FakeCall([page("Hi"),screen({...ui("field_match_call_message",true,details(5,"waiting"),"Hi"),diagnostic:"harness bug: x"})]);
  await wire(error).tool("observe").execute("c",{});
  expect(error.buttons).toEqual(["A"]);
  const other=screen(ui("field_match_call_message",true,details(5,"waiting",{trainer_id:9}),"Hi"));
  const caller=new FakeCall([page("Hi"),other]);const wired=wire(caller);
  await wired.tool("observe").execute("c",{});
  expect(caller.buttons).toEqual(["A"]);
  expect(wired.rec.advances()[0]?.detail).toBe("call recipient changed");
 });

 it("sends nothing when the box changed before the press",async()=>{
  const game=new FakeCall([page("Hi"),printing()]);
  const {tool,rec}=wire(game,ON,undefined,()=>{game.step();});
  await tool("observe").execute("c",{});
  expect(game.buttons).toEqual([]);
  expect(rec.advances()[0]?.detail).toContain("state changed before input");
 });

 it("hands the field back after the call: a message that follows is not pressed",async()=>{
  const dialog:GameStateSnapshot={...free,world_context:{objects:[],triggers:[],dialogue:"Registered DAD"}};
  const game=new FakeCall([finished,closing(7),dialog]);const {tool}=wire(game);
  await tool("observe").execute("c",{});
  expect(game.buttons).toEqual(["A"]);
 });

 it("OFF leaves the call and every description alone",async()=>{
  const game=DAD();const {tool}=wire(game,OFF);
  game.step();
  const out=await tool("observe").execute("c",{});
  expect(game.buttons).toEqual([]);
  expect(textOf(out)).toBe("observed field_match_call_message");
  expect(tool("press").description).toBe(`Press. ${POKENAV_CALL_NOTE}`);
 });

 it("ON without the PokéNav switch does not automate calls inside the PokéNav",async()=>{
  const nav=screen({phase:"pokenav_match_call_call",selected:null,ready:true,controls:"c",diagnostic:null,details:{callback2:"0x081C7401",input_callback:"0x081CACF9",pokenav_mode:0,pokenav_task_state:3,owner_task:1,call_text_state:"waiting"}});
  const game=new FakeCall([{...nav,screen:"pokenav"}]);
  const {tool}=wire(game,{...ON,[POKENAV_CALL_ID]:false});
  await tool("observe").execute("c",{});
  expect(game.buttons).toEqual([]);
  expect(tool("press").description).toBe(`Press. ${FIELD_CALL_NOTE}`);
 });

 it("adds its note to the tools and the system prompt only when on",()=>{
  const game=DAD();
  expect(wire(game).tool("observe").description).toBe(`Observe. ${POKENAV_CALL_NOTE} ${FIELD_CALL_NOTE}`);
  expect(wire(game,{...ON,[POKENAV_CALL_ID]:false,[FIELD_CALL_ID]:false}).tool("observe").description).toBe("Observe.");
  expect(playSystemPrompt(ON,null)).toContain(FIELD_CALL_NOTE);
  expect(playSystemPrompt(OFF,null)).not.toContain(FIELD_CALL_NOTE);
 });

 it("the production factory honors the switch",async()=>{
  const base:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true};
  const build=(on:boolean,game:FakeCall)=>{
   const features={...base,[FIELD_CALL_ID]:on};
   const {tools,rec}=wire(game,{...base,[POKENAV_CALL_ID]:false,[FIELD_CALL_ID]:false});
   const api={...rec.api,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
   return playGameTools(tools,features,{read:()=>Promise.resolve(game.state())},api);
  };
  const press=(tools:readonly AgentTool[])=>tools.find(t=>t.name==="press");
  const call=()=>new FakeCall([page("……",4),page("Hello!"),finished,free]);
  const game=call();
  const out=await press(build(true,game))?.execute("c",{buttons:[]});
  expect(game.buttons).toEqual(["A","A","A"]);
  expect(out?.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n")).toContain("stopped: call ended");
  const left=call();
  expect(press(build(false,left))?.description).not.toContain(FIELD_CALL_NOTE);
  await press(build(false,left))?.execute("c",{buttons:[]});
  expect(left.buttons).toEqual([]);
 });
});
