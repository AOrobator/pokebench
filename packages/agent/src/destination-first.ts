import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {PRESS_NOT_WALKING,SEMANTIC_NAVIGATE_DESCRIPTION,NAVIGATE_FIRST_DESCRIPTION} from "./navigate-first.js";

const PRESS_USAGE="Use press for menus, dialogue, confirmation choices, an intentional facing adjustment, or a specific manual action required by the current observation. Use destination tools for field travel.";
const TILE_POLICY="Choose destinations rather than individual walking steps. For another location on the current map, use navigate_to with the destination, including a nearby tile. If navigation stops, read its reason and retry when the way is free or choose another reachable destination. A blocked route is not an instruction to reconstruct it with direction presses.";
export const DESTINATION_POLICY=`Moving around: Choose destinations rather than individual walking steps. For a person, object, door, stairs or map exit with a listed navigate_to_target target, use navigate_to_target with that exact target, even when nearby; it handles approach, facing and activation. For another location on the current map, use navigate_to with the destination, including a nearby tile. If navigation stops, read its reason and retry when the way is free or choose another reachable destination. A blocked route is not an instruction to reconstruct it with direction presses.`;
export const DESTINATION_RECOVERY="Field travel: choose the destination with navigate_to_target for a currently listed target, or navigate_to for another tile. Navigation can route around walls; repeated direction presses do not plan a route. Read the stop reason before choosing your next destination.";
const TILE_RECOVERY="Field travel: choose the destination with navigate_to. Navigation can route around walls; repeated direction presses do not plan a route. Read the stop reason before choosing your next destination.";
const NAVIGATE_DESCRIPTION="Walk to another location on the current map, including a nearby tile. Give the destination; the tool plans the route. Use navigate_to_target instead for a currently listed target.";

export function destinationFirstPrompt(prompt:string,semantic:boolean):string {
 const policy=semantic?DESTINATION_POLICY:`Moving around: ${TILE_POLICY}`;
 const moving=/^Moving around: [^\n]*/m;
 let revised=moving.test(prompt)?prompt.replace(moving,policy):`${prompt}\n\n${policy}`;
 revised=revised.replace(PRESS_NOT_WALKING,` ${PRESS_USAGE}`)
  .replace(/\n\nWarps: [^\n]*/,`\n\nWarps: W marks a transition location. ${semantic?"For a currently listed target, use navigate_to_target; it handles the approach and activation. ":""}Manual activation descriptions explain the game mechanics; they are a fallback when navigation cannot handle the required action. After a transition, inspect the returned map and position before choosing another destination. If field controls are locked, resolve the dialogue, menu or script first.`)
  .replaceAll(/two or more tiles(?: away)?/g,"any distance")
  .replace("To talk to someone, target a free tile next to them, then press the direction that faces them and press A.",semantic?"Use the currently listed navigate_to_target target to talk to someone.":"To talk to someone, navigate to a free tile beside them, then face them and press A.")
  .replace("For a door, stairs or another listed warp, target the warp's own tile. At a directional exit, arrive on its tile, then press the direction its activation describes.","For a door, stairs or another listed warp, choose the destination tool appropriate to the current readout.");
 if(!revised.includes(PRESS_USAGE))revised=revised.replace(/^(- press: [^\n]*)$/m,`$1 ${PRESS_USAGE}`);
 return revised;
}

function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return undefined;
 try{return parseGameState(details.state);}catch{return undefined;}
}
function freeField(state:GameStateSnapshot|undefined):boolean {
 return state!==undefined&&state.started&&state.screen==="overworld"&&!state.in_battle&&state.active_ui===null&&state.field_controls_locked===false&&state.world_context?.dialogue==null&&state.world_context?.message==null&&state.world_context?.field_activity==null;
}
function directionPress(params:unknown):boolean {
 return typeof params==="object"&&params!==null&&"buttons" in params&&Array.isArray(params.buttons)&&params.buttons.length>0&&params.buttons.every(b=>b==="UP"||b==="DOWN"||b==="LEFT"||b==="RIGHT");
}
// Only the native connection readout's structural line moves; dialogue and state stay unchanged.
function targetFirst(text:string):string {
 return text.replace(/^(- (?:NORTH|SOUTH|EAST|WEST) -> [^\n]*?; )(walk off the map from [^\n]*?); navigate_to_target target (\{"kind":"connection","direction":"(?:NORTH|SOUTH|EAST|WEST)"\})$/gm,
  "$1navigate_to_target target $3; activation mechanics handled by the tool: $2");
}
export function withDestinationFirst(tools:readonly AgentTool[],features:FeatureSet):readonly AgentTool[] {
 if(!features["destination-first-navigation-v1"]||!features["bounded-navigation-v1"])return tools;
 const semantic=tools.some(t=>t.name==="navigate_to_target");
 return tools.map(tool=>{
  if(!["press","observe","navigate_to","navigate_to_target"].includes(tool.name))return tool;
  let description=tool.description;
  if(tool.name==="press")description=description.replace(" Direction-only field travel runs whenever native controls permit it; the harness, not the model, owns this choice.","")+` ${PRESS_USAGE}`;
  if(tool.name==="navigate_to")description=`${semantic?NAVIGATE_DESCRIPTION:"Walk to another location on the current map, including a nearby tile. Give the destination; the tool plans the route."} ${description.replace(SEMANTIC_NAVIGATE_DESCRIPTION,"").replace(NAVIGATE_FIRST_DESCRIPTION,"")}`.trim();
  if(tool.name==="navigate_to_target")description=`Use for a currently listed target, even when nearby; the tool handles approach, facing and activation. ${description}`;
  return {...tool,description,execute:async(...args:Parameters<AgentTool["execute"]>)=>{
   const result=await tool.execute(...args);
   if(!freeField(stateOf(result)))return result;
   const content=result.content.map(p=>p.type==="text"&&semantic?{...p,text:targetFirst(p.text)}:p);
   if(tool.name==="press"&&directionPress(args[1]))content.push({type:"text",text:semantic?DESTINATION_RECOVERY:TILE_RECOVERY});
   return {...result,content};
  }};
 });
}
