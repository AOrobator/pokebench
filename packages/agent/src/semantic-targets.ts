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


// A warp or fixed interaction is resolved by kind and tile, so a tile listing two of that kind gets no target.
export function uniqueTile(targets:readonly Pick<Listed,"kind"|"x"|"y">[]|null|undefined,kind:string,x:number,y:number):boolean {
 return (targets??[]).filter(t=>t.kind===kind&&t.x===x&&t.y===y).length===1;
}

// The target for a listed interaction, or null when the tool could not tell it apart.
// A warp must be the only warp on its tile; any other interaction the only non-warp target there, objects included.
export function listedArgument(target:Pick<Listed,"kind"|"x"|"y"|"local_id">,targets:readonly Pick<Listed,"kind"|"x"|"y">[]|null|undefined):string|null {
 if(target.kind==="object")return targetArgument(target);
 if(target.kind==="warp")return uniqueTile(targets,"warp",target.x,target.y)?targetArgument(target):null;
 // A person or object on the tile answers A before any background or metatile does.
 const fixed=(targets??[]).filter(t=>t.kind!=="warp"&&t.x===target.x&&t.y===target.y).length;
 return fixed===1?targetArgument(target):null;
}
