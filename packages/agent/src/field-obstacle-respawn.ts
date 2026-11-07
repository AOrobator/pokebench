// field-obstacle-respawn-v1: a BREAKABLE_ROCK or CUTTABLE_TREE the player cleared is back after the map reloads, and a
// pushed STRENGTH boulder is back where it started with STRENGTH off (pret/pokeemerald 731ad5bf). Their templates hide
// them with temp flags (Route 111's rocks: FLAG_TEMP_11 and FLAG_TEMP_12), and LoadMapFromWarp and
// LoadMapFromCameraTransition (src/overworld.c) call ClearTempFieldEventData (src/event_data.c), which clears the temp
// flags and FLAG_SYS_USE_STRENGTH on every map load, a whiteout's included. A battle returns through ReturnToFieldLocal,
// which loads no map. The words are the game's: EventScript_RockSmash asks "Would you like to use ROCK SMASH?"
// (Text_WantToSmash), EventScript_CutTree "Would you like to CUT it?" (Text_WantToCut) and EventScript_StrengthBoulder
// "Would you like to use STRENGTH?" (Text_WantToStrength), all in data/scripts/field_move_scripts.inc.
import type {GameStateSnapshot} from "./game-state.js";

export const FIELD_OBSTACLE_RESPAWN="field-obstacle-respawn-v1";
type Obstacles=NonNullable<GameStateSnapshot["field_obstacles"]>;
type Obstacle=Obstacles["obstacles"][number];
export type ClearGate="rock_smash"|"cut"|"strength";
const GATES:ReadonlySet<string>=new Set<ClearGate>(["rock_smash","cut","strength"]);
const isClearGate=(gate:string):gate is ClearGate=>GATES.has(gate);

const target=(localId:number):string=>`navigate_to_target target {"kind":"object","local_id":${String(localId)}}`;
// What to do, in the game's words; without navigate_to_target (semantic-navigation-v2 off), the A press it makes.
export function clearInstruction(gate:ClearGate,localId:number,semantic:boolean):string {
 const reach=semantic?target(localId):"face it and press A";
 if(gate==="rock_smash")return `ROCK SMASH it: ${reach}, answer YES`;
 if(gate==="cut")return `CUT it: ${reach}, answer YES`;
 return `use STRENGTH again: ${reach}, answer YES, then walk into it`;
}
export const BACK="back since you left the map";

interface Seen {readonly visit:number;readonly tile:string}
const tileOf=(o:Obstacle):string|null=>o.tiles.length===1&&o.tiles[0]!==undefined?`${String(o.tiles[0].x)},${String(o.tiles[0].y)}`:null;

// Which obstacle objects the player cleared on an earlier visit to this map that the game has placed again. A rock or
// tree counts as cleared when field_obstacles, read on its map, stops listing it (its hide flag is set); a boulder when
// it stands on another tile than at the start of that visit. A visit is a run of states on one map; a state with no
// map or no field_obstacles says nothing.
export class ObstacleRespawn {
 private map:string|null=null;
 private visit=0;
 private readonly seen=new Map<string,Seen>();
 private readonly cleared=new Map<string,number>();
 observe(state:Pick<GameStateSnapshot,"map_id"|"field_obstacles">):void {
  const field=state.field_obstacles;
  if(state.map_id==null||field==null)return;
  const map=state.map_id.join("/");
  if(map!==this.map){this.map=map;this.visit++;}
  const here=new Set<string>();
  for(const o of field.obstacles){
   const tile=tileOf(o);
   if(o.kind!=="object"||o.local_id===null||tile===null||!isClearGate(o.gate))continue;
   const key=`${map}#${String(o.local_id)}`;here.add(key);
   const seen=this.seen.get(key);
   if(seen?.visit!==this.visit)this.seen.set(key,{visit:this.visit,tile});
   else if(o.gate==="strength"&&seen.tile!==tile)this.cleared.set(key,this.visit);
  }
  for(const [key,seen] of this.seen)if(seen.visit===this.visit&&key.startsWith(`${map}#`)&&!here.has(key))this.cleared.set(key,this.visit);
 }
 // The gate of the obstacle object with this local id if it is back on this visit after being cleared on an earlier one.
 respawned(state:Pick<GameStateSnapshot,"map_id"|"field_obstacles">,localId:number):ClearGate|null {
  this.observe(state);
  if(state.map_id==null)return null;
  const key=`${state.map_id.join("/")}#${String(localId)}`;
  const o=state.field_obstacles?.obstacles.find(item=>item.kind==="object"&&item.local_id===localId);
  const cleared=this.cleared.get(key);
  if(o===undefined||!isClearGate(o.gate)||cleared===undefined||cleared>=this.visit||this.seen.get(key)?.visit!==this.visit)return null;
  return o.gate;
 }
}

// The people-ledger line for an object that is back, when the party can clear it now; null keeps the ledger's own text.
export function respawnLine(tracker:ObstacleRespawn,state:Pick<GameStateSnapshot,"map_id"|"field_obstacles">,localId:number,semantic:boolean):string|null {
 const gate=tracker.respawned(state,localId);
 if(gate===null||state.field_obstacles?.capabilities[gate]!==true)return null;
 return `${BACK}; ${clearInstruction(gate,localId,semantic)}`;
}

// The rocks and trees on this map the party can clear now (field-move-gates-v1 open), each on one tile.
export function clearableObstacles(state:Pick<GameStateSnapshot,"field_obstacles">):readonly (Obstacle&{readonly local_id:number;readonly gate:"rock_smash"|"cut"})[] {
 return (state.field_obstacles?.obstacles??[]).flatMap(o=>o.kind==="object"&&o.local_id!==null&&o.open===true&&o.tiles.length===1&&(o.gate==="rock_smash"||o.gate==="cut")?[{...o,local_id:o.local_id,gate:o.gate}]:[]);
}

// The state with these obstacle tiles taken off the planners' object lists, as if cleared.
export function withoutObstacles(state:GameStateSnapshot,tiles:readonly {readonly x:number;readonly y:number}[]):GameStateSnapshot {
 const keep=<T extends {readonly x:number;readonly y:number}>(objects:readonly T[]):T[]=>objects.filter(o=>!tiles.some(t=>t.x===o.x&&t.y===o.y));
 const grid=state.navigation_grid,full=state.map_grid;
 return {...state,...(grid==null?{}:{navigation_grid:{...grid,objects:keep(grid.objects)}}),...(full==null?{}:{map_grid:{...full,objects:keep(full.objects)}})};
}

// navigate_to's note when a rock or tree the party can clear is what stops the route: the nearest one whose clearing alone
// lets the planner reach the goal, else the nearest one every route passes when clearing them all does. `plans` is the
// walker's own planner, which already treats obstacles the party cannot clear as walls.
export function blockerNote(state:GameStateSnapshot,plans:(state:GameStateSnapshot)=>boolean,semantic:boolean):string|null {
 const here=state.position;
 const found=clearableObstacles(state);
 if(here===null||found.length===0)return null;
 const at=(o:(typeof found)[number])=>o.tiles[0]??{x:0,y:0};
 const near=[...found].sort((a,b)=>Math.abs(at(a).x-here.x)+Math.abs(at(a).y-here.y)-(Math.abs(at(b).x-here.x)+Math.abs(at(b).y-here.y))||at(a).y-at(b).y||at(a).x-at(b).x);
 const alone=near.find(o=>plans(withoutObstacles(state,[at(o)])));
 // Otherwise only one every route passes once the others are cleared: with them all cleared a route exists, and without
 // clearing it there is none. Parallel ways that each need other rocks name nothing.
 const needed=alone===undefined&&plans(withoutObstacles(state,near.map(at)))?near.find(o=>!plans(withoutObstacles(state,near.filter(other=>other!==o).map(at)))):undefined;
 const pick=alone??needed;
 if(pick===undefined)return null;
 const tile=at(pick);
 return `${pick.name} object ${String(pick.local_id)} at (${String(tile.x)},${String(tile.y)}) stands in the way: ${clearInstruction(pick.gate,pick.local_id,semantic)}`;
}
