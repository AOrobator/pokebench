// script-line-presence-v1: a dialogue page with no attributed speaker (map-script text: no NAME:
// prefix and no faced object) says who is on screen at that page's own recorded state. It never
// names a speaker.
import type {RunEvent} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";

type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];
export type OnScreenObject=NonNullable<NonNullable<Page["on_screen"]>>[number];

// The GBA screen is 15 by 10 tiles of 16 px. The player's tile is drawn at column 7 and pixel rows
// 72-88, half a tile below centre (pokeemerald SetSpritePosToMapCoords), so rows -5 and +5 are partly shown.
export const SCREEN_REACH={columns:7,rows:5} as const;

// character-presence-v1's table (env/pokebench_env/character_presence.py CHARACTERS): a story character
// is named only on the maps where pret places that character, by its graphics id. Both suites check
// packages/agent/test-support/story-characters.json against their copy.
const RIVAL_MAPS=["LITTLEROOT TOWN","LITTLEROOT TOWN PROFESSOR BIRCHS LAB","OLDALE TOWN","ROUTE103","ROUTE104","RUSTBORO CITY","ROUTE110","LAVARIDGE TOWN","ROUTE119","LILYCOVE CITY","EVER GRANDE CITY CHAMPIONS ROOM"];
const HOUSES=["LITTLEROOT TOWN BRENDANS HOUSE 1F","LITTLEROOT TOWN BRENDANS HOUSE 2F","LITTLEROOT TOWN MAYS HOUSE 1F","LITTLEROOT TOWN MAYS HOUSE 2F"];
const range=(from:number,to:number)=>Array.from({length:to-from},(_,i)=>from+i);
export const STORY_CHARACTERS:readonly {readonly name:string;readonly graphics:readonly number[];readonly maps:readonly string[]}[]=[
 {name:"PROF. BIRCH",graphics:[64],maps:["LITTLEROOT TOWN","LITTLEROOT TOWN PROFESSOR BIRCHS LAB","ROUTE101","ROUTE103","ROUTE110","EVER GRANDE CITY CHAMPIONS ROOM"]},
 {name:"MAY",graphics:range(105,110),maps:[...RIVAL_MAPS,"LITTLEROOT TOWN MAYS HOUSE 1F","LITTLEROOT TOWN MAYS HOUSE 2F"]},
 {name:"BRENDAN",graphics:range(100,105),maps:[...RIVAL_MAPS,"LITTLEROOT TOWN BRENDANS HOUSE 1F","LITTLEROOT TOWN BRENDANS HOUSE 2F"]},
 {name:"MOM",graphics:[215],maps:[...HOUSES,"LITTLEROOT TOWN"]},
 {name:"NORMAN",graphics:[129],maps:["LITTLEROOT TOWN BRENDANS HOUSE 1F","LITTLEROOT TOWN MAYS HOUSE 1F","PETALBURG CITY GYM"]},
 {name:"WALLY",graphics:[135],maps:["PETALBURG CITY","PETALBURG CITY GYM","MAUVILLE CITY","VERDANTURF TOWN WANDAS HOUSE","VICTORY ROAD 1F"]},
 {name:"ROXANNE",graphics:[125],maps:["RUSTBORO CITY GYM"]},
 {name:"STEVEN",graphics:[134],maps:["GRANITE CAVE STEVENS ROOM","METEOR FALLS STEVENS CAVE","MOSSDEEP CITY SPACE CENTER 1F","MOSSDEEP CITY SPACE CENTER 2F","MOSSDEEP CITY STEVENS HOUSE","ROUTE118","ROUTE120","ROUTE128","SOOTOPOLIS CITY"]},
];

// Source-proven labels the game prints for a story character instead of that character's proper name.
// These are exact NAME: prefixes, not fuzzy kinship terms: Wally's father must never become Norman.
const STORY_CHARACTER_ALIASES:Readonly<Record<string,string>>={DAD:"NORMAN"};
export function canonicalStoryCharacterName(label:string):string|null {
 if(STORY_CHARACTERS.some(c=>c.name===label))return label;
 return STORY_CHARACTER_ALIASES[label]??null;
}

// A live object's graphics id is already resolved (VAR_OBJ_GFX_ID_n is read when it spawns), and a
// live object's hide flag was clear when it spawned, so the template rule applies to it directly.
export function storyCharacter(graphics:number,location:string|null):string|null {
 if(location===null)return null;
 return STORY_CHARACTERS.find(c=>c.graphics.includes(graphics)&&c.maps.includes(location))?.name??null;
}

// The live objects (world_context.objects: active, visible, not the player, this map) whose tile is on
// screen, in reading order. Null when the state does not say where the player or the objects are.
export function onScreen(s:Pick<GameStateSnapshot,"position"|"map_id"|"location"|"world_context">,named:boolean):OnScreenObject[]|null {
 const objects=s.world_context?.objects;
 if(s.position===null||s.map_id===null||objects===undefined)return null;
 const {x:px,y:py}=s.position;const [group,num]=s.map_id;
 return objects
  .filter(o=>o.map_id[0]===group&&o.map_id[1]===num&&Math.abs(o.x-px)<=SCREEN_REACH.columns&&Math.abs(o.y-py)<=SCREEN_REACH.rows)
  .sort((a,b)=>a.y-b.y||a.x-b.x)
  .map(o=>({local_id:o.local_id,graphics_id:o.graphics_id,sprite_kind:o.sprite_kind,x:o.x,y:o.y,character:named?storyCharacter(o.graphics_id,s.location):null}));
}

export function onScreenItem(o:OnScreenObject):string {
 const sprite=o.sprite_kind??`graphics ${String(o.graphics_id)}`;
 return `${o.character===null?sprite:`${o.character} (sprite ${sprite})`} at ${String(o.x)},${String(o.y)}`;
}
export function presenceTag(on:readonly OnScreenObject[]|null):string {
 if(on===null)return "(no speaker shown by the game; who is on screen was not read)";
 return `(no speaker shown by the game; on screen: ${on.length===0?"nothing but you":on.map(onScreenItem).join("; ")})`;
}
