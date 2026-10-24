import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";

type Dialogue=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Page=Dialogue["pages"][number];
interface Instruction {readonly page:Page;readonly turn:number;readonly result:number}
interface InterfaceRule {
 readonly owns:(state:GameStateSnapshot)=>boolean;
 readonly instruction:(page:Page)=>boolean;
 readonly completed:(state:GameStateSnapshot)=>boolean;
 readonly transitioning:(state:GameStateSnapshot)=>boolean;
}
// Adapter contract: native ownership, exact already-delivered words, expiry on
// leaving the interface. New custom screens add audited rules here; unknown
// screens never receive a fallback walkthrough. No JIT/prompt selection involved.
// pret/pokeemerald 731ad5bf RustboroCity_EventScript_MatchCallTutorial and
// RustboroCity_Text_AddedMatchCallPleaseCallMrStone. Preserve speaker uncertainty.
const RULES:readonly InterfaceRule[]=[{
 owns:state=>{
  const ui=state.active_ui;
  if(ui?.phase==="field_multichoice")return state.map_id?.[0]===0&&state.map_id[1]===3&&ui.details?.["menu_id"]===86;
  if(state.screen!=="pokenav"||ui?.details?.["pokenav_mode"]!==1||ui.details["callback2"]!=="0x081C7401")return false;
  const callback=ui.details["input_callback"];
  return ui.phase==="pokenav_menu"?callback==="0x081C9521":ui.phase==="pokenav_match_call"&&(callback==="0x081CAB45"||callback==="0x081CAC05");
 },
 instruction:page=>page.map_id?.[0]===0&&page.map_id[1]===3&&page.battle_turn===undefined&&page.text==="Test it out.\nPlease give our PRESIDENT a call.",
 completed:state=>state.active_ui?.details?.["pokenav_mode"]===2||state.active_ui?.details?.["pokenav_mode"]===0,
 transitioning:state=>state.screen==="pokenav",
}];

// Each factory owns one memory, independent of conversation pruning. Only a
// successful recorded tool_result can commit an instruction from its dialogue.
export function withInterfaceGuidance(tools:readonly AgentTool[],on:boolean,recorder:{subscribe(fn:(event:RunEvent)=>void,replayMilestones?:boolean,replayLatestState?:boolean,continuationMemory?:boolean):void}):AgentTool[]{
 if(!on)return [...tools];
 const pending=new Map<string,Dialogue[]>();
 let run:string|null=null;
 let instruction:{rule:InterfaceRule;source:Instruction}|null=null;
 recorder.subscribe(event=>{
  run??=event.run;if(event.run!==run)return;
  if(event.type==="dialogue_auto_advance"){
   pending.set(event.tool_call_id,[...(pending.get(event.tool_call_id)??[]),event]);return;
  }
  if(event.type!=="tool_result")return;
  const episodes=pending.get(event.id);pending.delete(event.id);
  if(event.is_error||episodes===undefined)return;
  for(const episode of episodes)for(const page of episode.pages){
   const rule=RULES.find(rule=>rule.instruction(page));
   // Require the source words in the delivered result as well as the producer
   // event. A diagnostic event alone does not prove model delivery.
   if(rule!==undefined&&event.text.includes(page.text))instruction={rule,source:{page,turn:event.turn,result:event.seq}};
  }
 },false,false,true);
 const annotate=<T>(result:AgentToolResult<T>):AgentToolResult<T>=>{
  const details:unknown=result.details;
  if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return result;
  let state:GameStateSnapshot;
  try{state=parseGameState(details.state);}catch{return result;}
  if(instruction===null)return result;
  if(instruction.rule.completed(state)){instruction=null;return result;}
  if(!instruction.rule.owns(state)){
   // A native PokéNav fade may omit its mode; suppress now but retain until a
   // qualified observation proves departure. Never apply it to that fade.
   if(!instruction.rule.transitioning(state))instruction=null;
   return result;
  }
  const ui=state.active_ui;
  if(ui==null||ui.ready!==true||ui.diagnostic!=null)return result;
  const {page,turn,result:seq}=instruction.source;
  const note=`Current interface instruction — speaker ${page.speaker??"unknown"} (${page.speaker_source??"unknown"}), turn ${String(turn)}, result event ${String(seq)}:\n${JSON.stringify(page.text)}`;
  return {...result,content:[...result.content,{type:"text",text:note}]};
 };
 return tools.map(tool=>{
  const execute:AgentTool["execute"]=async(...args)=>annotate(await tool.execute(...args));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,args,check,signal,update,options)=>annotate(await tool.executeChecked(id,args,check,signal,update,options))};
  return checked;
 });
}
