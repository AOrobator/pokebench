import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {Value} from "typebox/value";
import type {Button} from "./events.js";
import type {BeforePressCheck} from "./game-tools.js";
import {isCheckedPress} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";

export const MENU_OPTION_ID="menu-option-tool-v1";
export const MENU_OPTION_SECTION='- select_menu_option: choose an option currently listed by a supported vertical menu. Copy phase and menu_id (null when absent) from the current menu and supply the exact option label. The tool checks the owner and highlight before every ordinary UP/DOWN press, then presses A once. It stops on a changed menu or unexpected cursor movement. It does not open menus, select a subsequent option, or prove the requested task completed. Unsupported menus still use press.';
export const MenuOptionArgs=Type.Object({phase:Type.String({minLength:1,maxLength:80}),menu_id:Type.Union([Type.Integer({minimum:0}),Type.Null()]),option:Type.String({minLength:1,maxLength:120})},{additionalProperties:false});
interface MenuView {phase:string;menu_id:number|null;options:string[];index:number;identity:string}
export function menuOptionView(state:GameStateSnapshot):MenuView|null {
 const ui=state.active_ui;
 if(ui==null||ui.ready!==true||ui.diagnostic!=null||!["field_multichoice","start_menu"].includes(ui.phase))return null;
 const d=ui.details,options=d?.["options"],index=d?.["selected_index"],id=d?.["menu_id"]??null;
 if(!Array.isArray(options)||options.length<1||options.length>16||!options.every((x):x is string=>typeof x==="string")||typeof index!=="number"||!Number.isInteger(index)||index<0||index>=options.length||ui.selected!==options[index]||(id!==null&&(typeof id!=="number"||!Number.isInteger(id))))return null;
 if(ui.phase==="field_multichoice"&&id===null)return null;
 // These owners use Menu_ProcessInput[NoWrap] or StartMenu's vertical input handler.
 // Never infer a grid/party/bag-item layout from a generic list of strings.
 const identity=JSON.stringify([state.map_id,ui.phase,id,options,d?.["callback2"],d?.["owner_task"],d?.["task_functions"]]);
 return {phase:ui.phase,menu_id:id,options,index,identity};
}
const stateOf=(result:AgentToolResult<unknown>):GameStateSnapshot=>{
 const d:unknown=result.details;
 if(typeof d!=="object"||d===null||!("state" in d))throw new Error("Menu selection observation lacks state");
 return parseGameState(d.state);
};
class MenuStop extends Error {}
export interface MenuOptionPorts {
 observe:(id:string,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>;
 press:(id:string,button:Button,check:BeforePressCheck,signal?:AbortSignal)=>Promise<AgentToolResult<unknown>>;
 gate?:(signal?:AbortSignal)=>Promise<void>;
}
export function menuOptionTool(ports:MenuOptionPorts):AgentTool<typeof MenuOptionArgs> {
 return {name:"select_menu_option",label:"Select menu option",description:"Select one currently visible option in a verified vertical START or field multichoice menu, using checked UP/DOWN and one A press.",parameters:MenuOptionArgs,execute:async(id,args,signal)=>{
  if(!Value.Check(MenuOptionArgs,args))throw new Error("Supply phase, menu_id and the exact visible option label");
  signal?.throwIfAborted();await ports.gate?.(signal);
  let result=await ports.observe(id,signal),state=stateOf(result);const initial=menuOptionView(state),buttons:Button[]=[];
  const finish=(message:string,confirmed=false):AgentToolResult<unknown>=>({...result,content:[...result.content,{type:"text",text:`Menu selection: ${message}`}],details:{state,menu_selection:{option:args.option,buttons,confirmation_sent:confirmed}}});
  if(initial===null||initial.phase!==args.phase||initial.menu_id!==args.menu_id)return finish("nothing pressed; the requested menu is not currently ready and verified.");
  const matches=initial.options.flatMap((name,i)=>name===args.option?[i]:[]),target=matches[0];
  if(matches.length!==1||target===undefined)return finish("nothing pressed; the requested label is absent or ambiguous in the visible menu.");
  let current=initial;
  try{
   for(let step=0;step<=initial.options.length;step++){
    signal?.throwIfAborted();await ports.gate?.(signal);signal?.throwIfAborted();
    const button:Button=current.index===target?"A":current.index<target?"DOWN":"UP";
    const expected=current.index+(button==="DOWN"?1:button==="UP"?-1:0),planned=current;
    result=await ports.press(id,button,before=>{
     const actual=before===undefined?null:menuOptionView(before);
     if(actual===null||actual.identity!==initial.identity||actual.index!==planned.index)throw new MenuStop("menu or highlight changed before input; no further button was sent.");
    },signal);
    buttons.push(button);state=stateOf(result);
    if(button==="A")return finish(`pressed ${buttons.join(", ")}; confirmation sent for ${args.option}. Inspect the returned state for the outcome.`,true);
    const next=menuOptionView(state);
    if(next===null||next.identity!==initial.identity||next.index!==expected)throw new MenuStop("menu changed or cursor did not move as expected; no confirmation was sent.");
    current=next;
   }
   return finish("input bound reached; inspect the returned state.");
  }catch(error){if(error instanceof MenuStop){result=await ports.observe(id,signal);state=stateOf(result);return finish(error.message);}throw error;}
 }};
}
export function withMenuOptionTool(tools:readonly AgentTool[],on:boolean,gate?:MenuOptionPorts["gate"]):AgentTool[]{
 if(!on)return [...tools];
 const press=tools.find(t=>t.name==="press"),observe=tools.find(t=>t.name==="observe");
 if(press===undefined||!isCheckedPress(press)||observe===undefined)throw new Error("select_menu_option requires checked press and observe");
 const annotate=(r:AgentToolResult<unknown>):AgentToolResult<unknown>=>{
  const d:unknown=r.details;if(typeof d!=="object"||d===null||!("state"in d)||d.state==null)return r;
  const view=menuOptionView(parseGameState(d.state));
  return view===null?r:{...r,content:[...r.content,{type:"text",text:`Menu selection tool available: select_menu_option with phase ${JSON.stringify(view.phase)}, menu_id ${JSON.stringify(view.menu_id)}, and option copied exactly from ${JSON.stringify(view.options.filter(x=>x!==""))}.`} ]};
 };
 const shown=tools.map(tool=>{
  const execute:AgentTool["execute"]=async(...args)=>annotate(await tool.execute(...args));
  if(!isCheckedPress(tool))return {...tool,execute};
  return {...tool,execute,executeChecked:async(...args:Parameters<typeof tool.executeChecked>)=>annotate(await tool.executeChecked(...args))};
 });
 return [...shown,menuOptionTool({observe:(id,signal)=>observe.execute(id,{},signal),press:(id,button,check,signal)=>press.executeChecked(id,{buttons:[button]},check,signal),...(gate===undefined?{}:{gate})})];
}
