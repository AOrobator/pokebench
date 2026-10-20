// semantic-navigation-v2: the navigate_to_target argument for a listed game target, written exactly
// as the tool's schema takes it (and as the game server's readout writes it), so it can be copied.
import type {GameStateSnapshot} from "./game-state.js";

type Listed=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const WALKING=new Set(["NORTH","SOUTH","EAST","WEST"]);

export function targetArgument(target:Pick<Listed,"kind"|"x"|"y"|"local_id">):string|null {
 if(target.kind==="object")return target.local_id===null?null:JSON.stringify({kind:"object",local_id:target.local_id});
 if(target.kind==="warp")return JSON.stringify({kind:"warp",x:target.x,y:target.y});
 return JSON.stringify({kind:"interaction",interaction_kind:target.kind,x:target.x,y:target.y});
}

export function connectionArgument(direction:string):string|null {
 return WALKING.has(direction)?JSON.stringify({kind:"connection",direction}):null;
}

export function targetSuffix(argument:string|null):string {
 return argument===null?"":` [navigate_to_target target ${argument}]`;
}
