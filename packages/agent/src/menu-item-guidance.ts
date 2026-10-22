// pret/pokeemerald 731ad5bf: start_menu.c StartMenu_Input; party_menu.c
// Task_HandleSelectionMenuInput / CursorCb_Item / CursorCb_Give; item_menu.c
// Task_BagMenu_HandleInput, Task_ItemContext_{SingleRow,MultipleRows};
// party_menu.h PARTY_ACTION_USE_ITEM = 3. Labels come from the current native UI.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";

const PHASES=new Set(["start_menu","party_menu","party_action_menu","bag_menu","bag_context_menu"]);
export function menuItemGuidance(state:GameStateSnapshot):string|null {
 const ui=state.active_ui;
 if(ui==null||ui.diagnostic!=null||!PHASES.has(ui.phase))return null;
 if(ui.ready!==true)return "Menu input is not ready; observe again before selecting.";
 if(ui.selected===null)return null;
 const values=ui.details?.["options"];
 const options=Array.isArray(values)&&values.every((v):v is string=>typeof v==="string")?values:null;
 const accept=`A chooses ${ui.selected}; B cancels`;
 const lines:string[]=[];
 if(ui.phase==="start_menu"||ui.phase==="party_action_menu"){
  if(options===null||!options.includes(ui.selected))return null;
  lines.push(`Menu controls: UP/DOWN selects; ${accept}.`);
  lines.push("Choices, top to bottom:\n"+options.map((v,i)=>`${String(i+1)}. ${v}${v===ui.selected?" (selected)":""}`).join("\n"));
  if(ui.phase==="start_menu"&&options.includes("BAG"))lines.push("To use an item, choose BAG from this menu; inspect its item list before choosing an item.");
  if(ui.phase==="party_action_menu"&&options.includes("ITEM"))lines.push("ITEM manages held items; it does not apply medicine. To use an item, return to the START menu and choose BAG.");
 }else if(ui.phase==="bag_menu"){
  // item_menu.c ItemMenu_HandleInput: berry tree/blender owners lock
  // pockets, and blender/crush forbids B. Only normal field/battle is qualified.
  if(ui.details?.["bag_location"]!==0&&ui.details?.["bag_location"]!==1)return null;
  lines.push(`Menu controls: UP/DOWN selects an item; LEFT/RIGHT changes pockets; ${accept}.`);
  if(typeof ui.details["item_id"]==="number")lines.push("A opens the selected item's available actions; inspect them before confirming.");
 }else if(ui.phase==="bag_context_menu"){
  if(options===null||!options.includes(ui.selected))return null;
  const grid=options.length>2;
  lines.push(`Menu controls: ${grid?"UP/DOWN changes row; LEFT/RIGHT changes column":"UP/DOWN selects"}; ${accept}.`);
  lines.push(grid?"Choices by row:\n"+Array.from({length:Math.ceil(options.length/2)},(_,i)=>options.slice(i*2,i*2+2).map(v=>`${v}${v===ui.selected?" (selected)":""}`).join(" | ")).join("\n"):"Choices, top to bottom:\n"+options.map(v=>`${v}${v===ui.selected?" (selected)":""}`).join("\n"));
  if(options.includes("USE"))lines.push(`USE applies the item.${options.includes("GIVE")?" GIVE makes a Pokémon hold it.":""} After USE, inspect whether the game asks for a Pokémon or displays a message.`);
 }else{
  // Only the verified medicine-target owner gets item-target guidance. Ordinary
  // party layout navigation is not necessarily a simple vertical list.
  if(ui.details?.["party_action"]!==3||!/^PARTY SLOT [1-6]$/.test(ui.selected))return null;
  lines.push(`Item target: ${ui.selected}; A uses the selected item on this Pokémon; B cancels item use.`);
  lines.push("After confirming, inspect the game's message, party HP and BAG quantity; entering this screen alone does not mean the item was used.");
 }
 return lines.join("\n");
}
export function withMenuItemGuidance(tools:readonly AgentTool[],on:boolean):AgentTool[]{
 if(!on)return [...tools];
 const annotate=<T>(r:AgentToolResult<T>):AgentToolResult<T>=>{
  const d:unknown=r.details;
  if(typeof d!=="object"||d===null||!("state" in d)||d.state==null)return r;
  let state:GameStateSnapshot;
  try{state=parseGameState(d.state);}catch{return r;}
  const line=menuItemGuidance(state);
  return line===null?r:{...r,content:[...r.content,{type:"text",text:line}]};
 };
 return tools.map(tool=>{
  const execute:AgentTool["execute"]=async(...args)=>annotate(await tool.execute(...args));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
