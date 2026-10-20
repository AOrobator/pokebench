// semantic-navigation-v2: the navigate_to_target argument for a listed game target, written exactly
// as the tool's schema takes it (and as the game server's readout writes it), so it can be copied.
import type {FeatureSet} from "./features.js";
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

// semantic-navigation-v2: navigate_to_target and explore_map results get every annotation navigate_to results get.
export function semanticWalk(name:string,features:Pick<FeatureSet,"semantic-navigation-v2">):boolean {
 return features["semantic-navigation-v2"]&&(name==="navigate_to_target"||name==="explore_map");
}

// navigate_to_target resolves a connection by its direction alone, so a side with two connections gets no target.
export function uniqueDirection(connections:readonly {readonly direction:string}[]|undefined,direction:string):boolean {
 return (connections??[]).filter(c=>c.direction===direction).length===1;
}

// navigate_to_target statuses that end the call before any travel or input: nothing was tried.
export const SEMANTIC_REFUSALS=["refused because the requested map is not current","target is not listed in the current verified state","no supported route to a valid approach"] as const;
export function semanticRefusal(text:string):boolean {
 return text.split("\n").some(line=>SEMANTIC_REFUSALS.some(r=>line.startsWith(`Semantic navigation: ${r}.`)));
}
