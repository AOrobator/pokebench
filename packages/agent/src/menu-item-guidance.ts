import type {AgentTool} from "@mariozechner/pi-agent-core";
import type {GameStateSnapshot} from "./game-state.js";
export function menuItemGuidance(_state:GameStateSnapshot):string|null{return null;}
export function withMenuItemGuidance(tools:readonly AgentTool[],_on:boolean):AgentTool[]{return [...tools];}
