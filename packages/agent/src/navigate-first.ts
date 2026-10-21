// navigate-first-prompt-v1: steer walking to navigate_to. The served Qwen3.6 chat template renders
// the tool JSON first and the system prompt after it, so the system prompt's tool list is the model's
// summary of what it can do; it names navigate_to as the way to move. The Moving around section is
// the prompt's last section, nearest the conversation. A press result adds one reminder line on every
// REMINDER_EVERY-th direction-only press in a row (no other tool call between) that ends on the free field.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";

export const NAVIGATE_FIRST_TOOL_LINE="- navigate_to: walks you to a tile on the current map. This is how you move: give it the destination and it finds the route around walls, ledges, water and people.";
export const PRESS_NOT_WALKING=" Use press for A, B, menus, dialogue, battles and single-tile steps or turns, not for walking.";

const MOVING_AROUND_HEAD=`Moving around: to go anywhere two or more tiles away on the current map, call navigate_to with that tile. Do not trace routes tile by tile in your thinking, and do not walk with runs of direction presses: navigate_to plans the route from the game's memory, which is more reliable than reading the ASCII map.
- To talk to someone, target a free tile next to them, then press the direction that faces them and press A.
- For a door, stairs or another listed warp, target the warp's own tile. At a directional exit, arrive on its tile, then press the direction its activation describes.
- If it refuses a tile (a ledge, wall, water or a person), choose a walkable tile beside the place you want, or the tile its reason names.`;
export const MOVING_AROUND_LOCAL=`${MOVING_AROUND_HEAD}
- If it stops with "command limit", call it again with the same destination; it carries on from where it stopped.
- A destination outside the local map is fine: it walks toward it as far as the local map allows. If it reports no path, choose a reachable tile in that direction.`;
export const MOVING_AROUND_FULL=`${MOVING_AROUND_HEAD}
- If it stops early, read its reason, then call it again or choose a reachable tile near the place you want.`;
export const MOVING_AROUND_VISITED=`${MOVING_AROUND_HEAD}
- It plans only across stitched terrain already shown to you this run; unknown cells are not routes. It may take up to 512 ordinary button attempts, re-planning before every press.
- If it stops early, read its reason. Explore until more terrain has been shown, then call it again or choose a reachable known tile nearer the place you want.`;

// semantic-navigation-v2: navigate_to_target reaches what the readout lists with a target; navigate_to the rest.
export const SEMANTIC_TOOL_LINE="- navigate_to_target: walks you to a person, object, door, stairs, other warp or map exit that the readout lists with a navigate_to_target target, then talks to it, uses it or goes through it. Give that target exactly as the readout writes it.";
export const SEMANTIC_NAVIGATE_TOOL_LINE="- navigate_to: walks you to any other tile on the current map. Give the destination and it finds the route around walls, ledges, water and people.";
const SEMANTIC_MOVING_AROUND_HEAD=`Moving around: to reach a person, object, door, stairs, other warp or map exit that the readout lists with a navigate_to_target target, call navigate_to_target with that target; it walks there, faces it and talks to it, uses it or goes through it. To go anywhere else two or more tiles away, call navigate_to with that tile. Do not trace routes tile by tile in your thinking, and do not walk with runs of direction presses: both tools plan the route from the game's memory, which is more reliable than reading the ASCII map.
- If navigate_to_target stops early, read its reason. When the way is free again, call it again with the same target.
- If navigate_to refuses a tile (a ledge, wall, water or a person), choose a walkable tile beside the place you want, or the tile its reason names.`;
const LOCAL_TAIL=`
- If navigate_to stops with "command limit", call it again with the same destination; it carries on from where it stopped.
- A navigate_to destination outside the local map is fine: it walks toward it as far as the local map allows. If it reports no path, choose a reachable tile in that direction.`;
const FULL_TAIL=`
- If navigate_to stops early, read its reason, then call it again or choose a reachable tile near the place you want.`;
const VISITED_TAIL=`
- navigate_to plans only across stitched terrain already shown to you this run; unknown cells are not routes. It may take up to 512 ordinary button attempts, re-planning before every press.
- If navigate_to stops early, read its reason. Explore until more terrain has been shown, then call it again or choose a reachable known tile nearer the place you want.`;
export const SEMANTIC_MOVING_AROUND_LOCAL=`${SEMANTIC_MOVING_AROUND_HEAD}${LOCAL_TAIL}`;
export const SEMANTIC_MOVING_AROUND_FULL=`${SEMANTIC_MOVING_AROUND_HEAD}${FULL_TAIL}`;
export const SEMANTIC_MOVING_AROUND_VISITED=`${SEMANTIC_MOVING_AROUND_HEAD}${VISITED_TAIL}`;
export const SEMANTIC_NAVIGATE_DESCRIPTION="Walks to a tile two or more tiles away; give the destination and it finds the route around walls, ledges, water and people. For a person, object, warp or map exit that the readout lists with a navigate_to_target target, use navigate_to_target with that target instead.";
export const SEMANTIC_REMINDER="Reminder: to reach anything the readout lists with a navigate_to_target target, call navigate_to_target with that target; to walk two or more tiles anywhere else, call navigate_to with the destination.";

export const NAVIGATE_FIRST_DESCRIPTION="The main way to move: use it for every walk of two or more tiles; give the destination and it finds the route around walls, ledges, water and people.";
export const COMMAND_LIMIT_HINT=" After \"command limit\", call it again with the same destination to continue.";

export const REMINDER="Reminder: to walk two or more tiles, call navigate_to with the destination; it finds the route for you.";
export const REMINDER_EVERY=3;

const OBSERVE_HEAD="- observe: ";
const PRESS_HEAD="- press: presses up to 8 buttons in order";

// The tool list gains navigate_to before press, and press says it is not for walking.
// semantic-navigation-v2: navigate_to_target comes first; navigate_to is for everything else.
export function navigateFirstToolList(prompt:string,semantic=false):string {
 const start=prompt.indexOf(PRESS_HEAD);
 if(start<0||prompt.indexOf(OBSERVE_HEAD)<0)throw new Error("navigate-first-prompt-v1 needs the observe and press tool lines");
 const end=prompt.indexOf("\n",start);
 const line=prompt.slice(start,end<0?undefined:end);
 return `${prompt.slice(0,start)}${semantic?`${SEMANTIC_TOOL_LINE}\n${SEMANTIC_NAVIGATE_TOOL_LINE}`:NAVIGATE_FIRST_TOOL_LINE}\n${line}${PRESS_NOT_WALKING}${end<0?"":prompt.slice(end)}`;
}

const DIRECTIONS=new Set(["UP","DOWN","LEFT","RIGHT"]);
function freeField(state:GameStateSnapshot|undefined):boolean {
 return state!==undefined&&state.started&&state.screen==="overworld"&&!state.in_battle&&state.field_controls_locked===false&&state.active_ui==null&&state.world_context?.dialogue==null&&state.world_context?.message==null;
}
function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return undefined;
 try{return parseGameState(details.state);}catch{return undefined;}
}
function buttonsOf(params:unknown):readonly string[] {
 if(typeof params!=="object"||params===null||!("buttons" in params)||!Array.isArray(params.buttons))return [];
 return params.buttons.filter((b):b is string=>typeof b==="string");
}

export function withNavigateFirst(tools:readonly AgentTool[],features:FeatureSet):readonly AgentTool[] {
 if(!features["navigate-first-prompt-v1"])return tools;
 const reminder=features["semantic-navigation-v2"]?SEMANTIC_REMINDER:REMINDER;
 let streak=0;
 return tools.map(tool=>{
  // Any other tool call (navigate_to, observe, ...) ends the run of presses.
  if(tool.name!=="press")return {...tool,execute:(...args:Parameters<AgentTool["execute"]>)=>{streak=0;return tool.execute(...args);}};
  return {...tool,execute:async(...args:Parameters<AgentTool["execute"]>)=>{
   // A press that throws never ends on the free field, so it ends the run too.
   const before=streak;streak=0;
   const result=await tool.execute(...args);
   streak=before;
   const buttons=buttonsOf(args[1]);
   if(buttons.length===0||!buttons.every(b=>DIRECTIONS.has(b))||!freeField(stateOf(result))){streak=0;return result;}
   streak++;
   if(streak%REMINDER_EVERY!==0)return result;
   return {...result,content:[...result.content,{type:"text",text:reminder}]};
  }};
 });
}
