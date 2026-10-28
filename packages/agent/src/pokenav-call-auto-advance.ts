import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {Button,BodyOf} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool,type Clock} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import type {AutoAdvanceRecorder,DialoguePage} from "./dialogue-auto-advance.js";

export const POKENAV_CALL_ID="pokenav-call-auto-advance-v1";
export const POKENAV_CALL_NOTE="PokéNav calls advance automatically: the harness advances verified call text and returns it. During the game's forced tutorial it makes the required call to the sole registered contact and exits; ordinary contact selection remains yours. Unknown states stop automation.";
export const POKENAV_CALL_LIMITS={presses:50,callMs:90_000,waitMs:10_000,pollMs:100} as const;
type Result=AgentToolResult<unknown>;
type Episode=Omit<BodyOf<"dialogue_auto_advance">,"type"|"turn">;
type Decision={kind:"press";button:Button;key:string}|{kind:"wait"}|{kind:"stop";reason:string};
export interface PokenavCallPorts {
 readonly state:StateSource;
 readonly recorder:AutoAdvanceRecorder;
 readonly press:AgentTool|undefined;
 readonly observe:AgentTool|undefined;
 readonly gate?:(signal?:AbortSignal)=>Promise<void>;
 readonly clock?:Clock;
 readonly limits?:{readonly presses:number;readonly callMs:number;readonly waitMs:number;readonly pollMs:number};
}
const stateOf=(result:Result):GameStateSnapshot=>{
 const d=result.details;
 if(typeof d!=="object"||d===null||!("state"in d))throw new Error("PokéNav result lacks coherent state");
 return parseGameState(d.state);
};
const nativeNav=(s:GameStateSnapshot)=>s.screen==="pokenav"&&s.active_ui?.diagnostic==null&&s.active_ui?.details?.["callback2"]==="0x081C7401";
const forcedMenu=(s:GameStateSnapshot)=>s.screen==="overworld"&&s.map_id?.[0]===0&&s.map_id[1]===3&&s.active_ui?.phase==="field_multichoice"&&s.active_ui.diagnostic==null&&s.active_ui.details?.["menu_id"]===86;
class Changed extends Error {}

export function withPokenavCallAutoAdvance(tools:readonly AgentTool[],features:FeatureSet,ports:PokenavCallPorts):AgentTool[]{
 if(!features[POKENAV_CALL_ID])return [...tools];
 if(ports.press===undefined||ports.observe===undefined||!isCheckedPress(ports.press))throw new Error("PokéNav call auto-advance requires checked ordinary press");
 const press:CheckedPressTool=ports.press,observe=ports.observe;
 const clock=ports.clock??{now:()=>Date.now(),sleep:(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))};
 const limits=ports.limits??POKENAV_CALL_LIMITS;
 const supported=new Set<Episode["tool"]>(["observe","press","navigate_to","navigate_to_target","explore_map","select_menu_option"]);
 return tools.map(tool=>!supported.has(tool.name as Episode["tool"])?tool:{...tool,description:`${tool.description} ${POKENAV_CALL_NOTE}`,execute:async(id,args,signal,update)=>{
  let result:Result=await tool.execute(id,args,signal,update);
  const original=result;
  const initialDetails=result.details;
  if(typeof initialDetails!=="object"||initialDetails===null||!("state"in initialDetails)||initialDetails.state==null)return result;
  let state=stateOf(result);
  const initiallyForced=forcedMenu(state)||(nativeNav(state)&&(state.active_ui?.details?.["pokenav_mode"]===1||state.active_ui?.details?.["pokenav_mode"]===2));
  if(!initiallyForced&&!(nativeNav(state)&&state.active_ui?.phase==="pokenav_match_call_call"))return result;
  const began=clock.now(),map=JSON.stringify(state.map_id),buttons:Button[]=[],pages:DialoguePage[]=[];
  let tutorial=initiallyForced,contact:string|null=null,waitingSince=clock.now(),reason:string,stop:Episode["stop"]="menu";
  const decide=(s:GameStateSnapshot):Decision=>{
   const ui=s.active_ui,d=ui?.details;
   if(JSON.stringify(s.map_id)!==map||s.in_battle||ui?.diagnostic!=null)return {kind:"stop",reason:"map, battle or interface ownership changed"};
   const action=(button:Button):Decision=>({kind:"press",button,key:JSON.stringify([s.map_id,ui?.phase,ui?.selected,d?.["callback2"],d?.["input_callback"],d?.["menu_id"],d?.["owner_task"],d?.["pokenav_menu_index"],d?.["header_id"],d?.["is_special_trainer"]])});
   if(tutorial&&forcedMenu(s)){
    const options=d?.["options"],index=d?.["selected_index"];
    if(ui?.ready!==true)return {kind:"wait"};
    if(!Array.isArray(options)||options.filter(x=>x==="POKéNAV").length!==1||typeof index!=="number"||!Number.isInteger(index)||ui.selected!==options[index])return {kind:"stop",reason:"forced menu selection is unverified"};
    const target=options.indexOf("POKéNAV");return action(index===target?"A":index<target?"DOWN":"UP");
   }
   if(!nativeNav(s)||d==null)return {kind:"stop",reason:"PokéNav closed or another interface took control"};
   const mode=d["pokenav_mode"],callback=d["input_callback"];
   if((mode!==0&&mode!==1&&mode!==2)||!Number.isInteger(d["owner_task"])||(d["pokenav_task_state"]!==3&&d["pokenav_task_state"]!==4))return {kind:"stop",reason:"PokéNav owner or mode is unverified"};
   if(mode===1)tutorial=true;
   if(ui?.phase==="pokenav_match_call_call"&&callback==="0x081CACF9"){
    const identity=JSON.stringify([d["header_id"],d["is_special_trainer"],d["trainer_name"]]);
    if(contact!==null&&identity!==contact)return {kind:"stop",reason:"call recipient changed"};
    contact=identity;
    const phase=d["call_text_state"];
    if(phase==="waiting"||phase==="finished")return action("A");
    if(phase==="printing"||phase==="unavailable")return {kind:"wait"};
    return {kind:"stop",reason:"call printer is unverified"};
   }
   if(!tutorial)return {kind:"stop",reason:"call ended; contact selection remains with the model"};
   if(ui?.ready!==true)return {kind:"wait"};
   if(ui.phase==="pokenav_menu"&&((mode===1&&callback==="0x081C9521")||(mode===2&&callback==="0x081C9589"))){
    if(mode===2)return action("B");
    const options=d["options"],index=d["selected_index"];
    if(!Array.isArray(options)||options.filter(x=>x==="MATCH CALL").length!==1||typeof index!=="number"||!Number.isInteger(index)||ui.selected!==options[index])return {kind:"stop",reason:"MATCH CALL menu selection is unverified"};
    const target=options.indexOf("MATCH CALL");return action(index===target?"A":index<target?"DOWN":"UP");
   }
   if(ui.phase==="pokenav_match_call"&&(callback==="0x081CAB45"||callback==="0x081CAC05")&&(mode===1||mode===2)){
    const names=d["visible_trainer_names"],identity=JSON.stringify([d["header_id"],d["is_special_trainer"],d["trainer_name"]]);
    if(d["list_count"]!==1||d["registered_count"]!==1||d["selected_index"]!==0||!Array.isArray(names)||names.length!==1||names[0]!==d["trainer_name"]||typeof names[0]!=="string"||(contact!==null&&identity!==contact))return {kind:"stop",reason:"forced call does not have one verified contact"};
    contact=identity;
    if(mode===2&&callback==="0x081CAB45")return action("B");
    if(callback==="0x081CAB45"&&ui.selected===names[0])return action("A");
    const options=d["options"],index=d["option_index"];
    if(callback!=="0x081CAC05"||!Array.isArray(options)||options.length!==2||options[0]!=="CALL"||options[1]!=="CANCEL"||typeof index!=="number"||!Number.isInteger(index)||ui.selected!==options[index])return {kind:"stop",reason:"call option selection is unverified"};
    return action(index===0?"A":"UP");
   }
   return {kind:"stop",reason:"unexpected PokéNav interface"};
  };
  const emit=(why:Episode["stop"],detail:string)=>ports.recorder.recordDialogueAutoAdvance({tool_call_id:id,tool:tool.name as Episode["tool"],requested:[],sent:[],dropped:[],auto_presses:buttons.length,pokenav_buttons:buttons,pages,stop:why,detail,duration_ms:Math.max(0,Math.round(clock.now()-began))});
  try{for(;;){
   signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
   const decision=decide(state);
   if(decision.kind==="stop"){reason=decision.reason;break;}
   if(clock.now()-began>=limits.callMs){stop="time_cap";reason="PokéNav automatic input time cap";break;}
   const ui=state.active_ui,d=ui?.details,message=d?.["message"];
   if(ui?.phase==="pokenav_match_call_call"&&typeof message==="string"&&message!==""&&!pages.some(p=>p.text===message)){
    const recorded=ports.recorder.recordState(state),name=d?.["trainer_name"];
    pages.push({state_seq:recorded.seq,map:state.location,map_id:state.map_id,position:state.position,speaker:typeof name==="string"&&message.startsWith(`${name}:`)?name:null,speaker_source:typeof name==="string"&&message.startsWith(`${name}:`)?"name_prefix":null,text:message});
   }
   if(decision.kind==="wait"){
    if(clock.now()-waitingSince>=limits.waitMs){stop="interface_not_ready";reason="PokéNav remained unready; inspect the screen";break;}
    await clock.sleep(limits.pollMs);state=await ports.state.read(signal);continue;
   }
   if(buttons.length>=limits.presses){stop="press_cap";reason="PokéNav automatic input press cap";break;}
   try{
    result=await press.executeChecked(id,{buttons:[decision.button]},fresh=>{
     if(fresh===undefined)throw new Changed();
     const actual=decide(fresh);
     if(actual.kind!=="press"||actual.button!==decision.button||actual.key!==decision.key)throw new Changed();
    },signal);
   }catch(error){if(!(error instanceof Changed))throw error;reason="PokéNav state changed before input; no further button sent";break;}
   buttons.push(decision.button);state=stateOf(result);ports.recorder.recordState(state);waitingSince=clock.now();
  }
  }catch(error){emit("error",`PokéNav automatic input interrupted: ${error instanceof Error?error.message:String(error)}`);throw error;}
  const event=emit(stop,reason);
  const final:Result=await observe.execute(id,{},signal);
  const note=`PokéNav auto-advance: ${String(buttons.length)} ordinary inputs (${buttons.join(", ")||"none"}); stopped: ${reason}.\nCall text read from the active message buffer${pages.length===0?": none.":` (event ${String(event.seq)}, in order):\n${pages.map(p=>p.text).join("\n")}`}`;
  return {...final,content:[{type:"text",text:"Historical result before PokéNav automatic inputs:"},...original.content,{type:"text",text:"Current observation after PokéNav automatic inputs:"},...final.content,{type:"text",text:note}],details:{...((typeof final.details==="object"&&final.details!==null)?final.details:{}),state:stateOf(final)}};
 }});
}
