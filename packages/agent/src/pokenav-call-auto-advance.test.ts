import {expect,it} from "vitest";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {featureInfo,playHarnessFeatures,SERVER_FEATURES} from "./features.js";
const ID="pokenav-call-auto-advance-v1";
it("registers the default-OFF call driver and native readout",()=>{
 const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(off[ID]).toBe(false);
 expect(normalizeFeatures(off)[ID]).toBe(false);
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(SERVER_FEATURES).toContain(ID);
 expect(playHarnessFeatures({...off,[ID]:true},null).at(-1)).toBe(ID);
});

import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {IN_GAME} from "../test-support/events.js";
import {withPokenavCallAutoAdvance,POKENAV_CALL_LIMITS,POKENAV_CALL_NOTE} from "./pokenav-call-auto-advance.js";
import {playGameTools} from "./play-wiring.js";
import {playSystemPrompt} from "./play-config.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {BodyOf,Button} from "./events.js";
import type {AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
const must=<T>(value:T|undefined):T=>{if(value===undefined)throw new Error("missing fixture value");return value;};
const off=()=>flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:false,objectives:false});
const base={...IN_GAME,map_id:[0,3] as [number,number],location:"RUSTBORO CITY",screen:"pokenav",field_controls_locked:true};
function nav(phase="pokenav_menu",selected="HOENN MAP",details:Record<string,string|number|boolean|string[]>={},ready=true):GameStateSnapshot {
 return {...base,active_ui:{phase,selected,ready,controls:"controls",diagnostic:null,value:null,details:{callback2:"0x081C7401",owner_task:0,pokenav_task_state:3,pokenav_mode:1,input_callback:"0x081C9521",options:["HOENN MAP","CONDITION","MATCH CALL","SWITCH OFF"],selected_index:0,...details}}};
}
const contact={pokenav_menu_index:11,input_callback:"0x081CAB45",header_id:0,is_special_trainer:true,trainer_name:"MR. STONE",list_count:1,registered_count:1,selected_index:0,visible_trainer_names:["MR. STONE"]};
const list=(mode=1)=>nav("pokenav_match_call","MR. STONE",{...contact,pokenav_mode:mode});
const options=()=>nav("pokenav_match_call","CALL",{...contact,input_callback:"0x081CAC05",options:["CALL","CANCEL"],option_index:0});
const call=(phase="waiting",mode=2)=>nav("pokenav_match_call_call","MR. STONE",{...contact,input_callback:"0x081CACF9",pokenav_mode:mode,call_text_state:phase,message:"MR. STONE: Hello! | See you again!"},phase!=="printing");
const field=()=>({...base,screen:"overworld",active_ui:null,field_controls_locked:false});
type Advance=Omit<BodyOf<"dialogue_auto_advance">,"type"|"turn">;
function fixture(states:GameStateSnapshot[],on=true,production=false,config:{cap?:number;race?:GameStateSnapshot;poll?:GameStateSnapshot;throwInput?:boolean}={}){
 let current=must(states[0]),index=0,now=0;const sent:Button[]=[],events:Advance[]=[],recorded:GameStateSnapshot[]=[];
 const result=():AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:`current ${current.active_ui?.phase??current.screen}`}],details:{state:current}});
 const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result())};
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(_id:string,args:{buttons:Button[]})=>{
  sent.push(...args.buttons);current=states[++index]??current;return Promise.resolve(result());
 },executeChecked:async(id:string,args:{buttons:Button[]},check:(s:GameStateSnapshot)=>void)=>{
  if(config.throwInput)throw new Error("native input failed");
  if(config.race)current=config.race;
  check(current);return press.execute(id,args);
 }} as unknown as CheckedPressTool;
 const recorder:AutoAdvanceRecorder={subscribe:()=>undefined,recordState:s=>{recorded.push(s);return {seq:recorded.length,turn:12};},recordDialogueAutoAdvance:e=>{events.push(e);return {seq:90,turn:12};}};
 const state={read:()=>{if(config.poll)current=config.poll;return Promise.resolve(current);}};
 const features={...off(),[ID]:on};
 const tools=production?playGameTools([observe,press],features,state,{...recorder,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined}):withPokenavCallAutoAdvance([observe,press],features,{state,recorder,observe,press,clock:{now:()=>now,sleep:ms=>{now+=ms;return Promise.resolve();}},limits:{...POKENAV_CALL_LIMITS,presses:config.cap??50,waitMs:200}});
 const tool=tools.find(t=>t.name==="observe");
 return {tool:must(tool),sent,events,recorded,original:observe,press,features};
}
it("production factory completes the forced tutorial and hands back the field with exact call text and event",async()=>{
 const f=fixture([nav(),nav("pokenav_menu","CONDITION",{selected_index:1}),nav("pokenav_menu","MATCH CALL",{selected_index:2}),list(),options(),call(),call("finished"),list(2),nav("pokenav_menu","MATCH CALL",{selected_index:2,pokenav_mode:2,input_callback:"0x081C9589"}),field()],true,true);
 const out=await f.tool.execute("tutorial",{});
 expect(f.sent).toEqual(["DOWN","DOWN","A","A","A","A","A","B","B"]);
 expect(out.details).toMatchObject({state:{screen:"overworld",active_ui:null}});
 expect(out.content.some(p=>p.type==="text"&&p.text.includes("MR. STONE: Hello! | See you again!"))).toBe(true);
 expect(f.events).toHaveLength(1);expect(f.events[0]).toMatchObject({tool_call_id:"tutorial",tool:"observe",auto_presses:9,pokenav_buttons:f.sent,pages:[{speaker:"MR. STONE",speaker_source:"name_prefix",text:"MR. STONE: Hello! | See you again!",state_seq:6}]});
});
it("ordinary call advances and closes, without selecting another contact or exiting the menu",async()=>{
 const f=fixture([call("waiting",0),call("finished",0),list(0)]);await f.tool.execute("ordinary",{});
 expect(f.sent).toEqual(["A","A"]);expect(f.events[0]?.detail).toBe("call ended; contact selection remains with the model");
});
it("OFF preserves exact tools, result, prompt bytes and sends no inputs",async()=>{
 const f=fixture([call()],false);expect(f.tool).toBe(f.original);
 expect(await f.tool.execute("off",{})).toEqual(await f.original.execute("original",{}));expect(f.sent).toEqual([]);expect(f.events).toEqual([]);
 const {[ID]:removed,...old}=f.features;expect(removed).toBe(false);
 expect(playSystemPrompt(f.features,null)).toBe(playSystemPrompt({...old,[ID]:false},null));
 expect(playSystemPrompt({...f.features,[ID]:true},null)).toContain(POKENAV_CALL_NOTE);
});
it.each(["unverified","map","battle","owner","recipient","multiple","unexpected"])("stops safely on %s",async kind=>{
 const bad=kind==="map"?{...list(),map_id:[0,4] as [number,number]}:kind==="battle"?{...list(),in_battle:true}:kind==="owner"?nav("pokenav_match_call","MR. STONE",{...contact,callback2:"wrong"}):kind==="recipient"?nav("pokenav_match_call","OTHER",{...contact,trainer_name:"OTHER"}):kind==="multiple"?nav("pokenav_match_call","MR. STONE",{...contact,list_count:2}):kind==="unexpected"?nav("pokenav_condition","COOL"):nav("pokenav_match_call","MR. STONE",{...contact},false);
 const f=fixture([list(),bad]);await f.tool.execute("stop",{});expect(f.sent).toEqual(["A"]);expect(f.events).toHaveLength(1);
});
it("rechecks the native state immediately before an automatic input",async()=>{
 const f=fixture([list()],true,false,{race:field()});await f.tool.execute("race",{});expect(f.sent).toEqual([]);expect(f.events[0]?.detail).toContain("changed before input");
});
it("bounds a stalled input loop with an injected small press cap",async()=>{
 const f=fixture([list()],true,false,{cap:2});await f.tool.execute("cap",{});expect(f.sent).toEqual(["A","A"]);expect(f.events[0]?.stop).toBe("press_cap");expect(POKENAV_CALL_LIMITS.presses).toBe(50);
});
it("waits through printing without inputs, then stops if it remains unready",async()=>{
 const f=fixture([call("printing")]);await f.tool.execute("printing",{});expect(f.sent).toEqual([]);expect(f.events[0]?.stop).toBe("interface_not_ready");
});
it("resumes from a printing poll once the printer waits",async()=>{
 const f=fixture([call("printing"),list(0)],true,false,{poll:call("waiting",0)});await f.tool.execute("poll",{});expect(f.sent).toEqual(["A"]);
});
it("never swallows an automatic input failure",async()=>{
 const f=fixture([list()],true,false,{throwInput:true});await expect(f.tool.execute("error",{})).rejects.toThrow("native input failed");
});
it("does not automate an ordinary contact list",async()=>{
 const f=fixture([list(0)]);await f.tool.execute("list",{});expect(f.sent).toEqual([]);expect(f.events).toEqual([]);
});
it("selects POKéNAV from the verified native forced START menu",async()=>{
 const menu=(index:number)=>({...base,screen:"overworld",active_ui:{phase:"field_multichoice",selected:["POKéDEX","POKéMON","BAG","POKéNAV"][index]??"missing",ready:true,controls:"select",diagnostic:null,value:null,details:{menu_id:86,options:["POKéDEX","POKéMON","BAG","POKéNAV"],selected_index:index}}});
 const f=fixture([menu(0),menu(1),menu(2),menu(3),field()]);await f.tool.execute("start",{});expect(f.sent).toEqual(["DOWN","DOWN","DOWN","A"]);
});

it("resumes the native tutorial exit from mode 2 without making another call",async()=>{
 const f=fixture([list(2),nav("pokenav_menu","MATCH CALL",{selected_index:2,pokenav_mode:2,input_callback:"0x081C9589"}),field()]);
 await f.tool.execute("resume",{});expect(f.sent).toEqual(["B","B"]);
});

import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {parseGameState} from "./game-state.js";
import {pressTool} from "./game-tools.js";
const nativeFixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-call-native.json.gz",import.meta.url))).toString()) as {cases:Record<string,{state:unknown}>};
const native=(name:string)=>parseGameState(must(nativeFixture.cases[name]).state);
it.each(["call","call_text"])("advances the actual native state-2 %s and completes the tutorial exit",async name=>{
 const at=native(name),after=native("list_after_call"),menu={...after,active_ui:nav("pokenav_menu","MATCH CALL",{pokenav_mode:2,input_callback:"0x081C9589",selected_index:2}).active_ui},free={...after,screen:"overworld",active_ui:null,field_controls_locked:false};
 expect(at.active_ui?.details?.["pokenav_task_state"]).toBe(2);
 expect(at.active_ui?.details?.["call_text_state"]).toBe("waiting");
 const f=fixture([at,after,menu,free],true,true);const result=await f.tool.execute("native",{});
 expect(f.sent).toEqual(["A","B","B"]);expect(result.details).toMatchObject({state:{screen:"overworld"}});
 if(name==="call_text"){
  const message=at.active_ui?.details?.["message"];expect(typeof message).toBe("string");
  expect(f.events[0]?.pages.map(p=>p.text)).toEqual([message]);
  expect(result.content.some(p=>p.type==="text"&&typeof message==="string"&&p.text.includes(message))).toBe(true);
 }
});
it("records an uncertain A when the real press tool succeeds remotely but its observation fails",async()=>{
 const state=call(),accepted:unknown[]=[],events:Advance[]=[];
 const fetchFn:typeof fetch=async(url,init)=>{
  const path=String(url);
  if(path.endsWith('/pokebench/state'))return Response.json(state);
  if(path.endsWith('/action')){accepted.push(JSON.parse(String(init?.body)) as unknown);return Response.json({status:"success"});}
  if(path.endsWith('/info'))return Response.json({queue_empty:true});
  return new Response('unavailable',{status:503});
 };
 const clock={now:()=>0,sleep:()=>Promise.resolve()};
 const press=pressTool('http://fixture',{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,clock);
 const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[],details:{state}})};
 const recorder:AutoAdvanceRecorder={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:e=>{events.push(e);return {seq:2,turn:1};}};
 const tools=withPokenavCallAutoAdvance([observe],{...off(),[ID]:true},{state:{read:()=>Promise.resolve(state)},recorder,press,observe,clock});
 await expect(must(tools[0]).execute('uncertain',{})).rejects.toThrow('503');
 expect(accepted).toHaveLength(1);
 expect(events).toHaveLength(1);expect(events[0]).toMatchObject({stop:"error",auto_presses:0,pokenav_buttons:[],pokenav_pending_button:"A"});
});
