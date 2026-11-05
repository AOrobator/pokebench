import type {Button} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";

// rotating-gate-press-feedback-v1: what two snapshots prove about the gates, never what to push next.
// rotating_gate.c CheckForRotatingGatePuzzleCollision writes the orientation byte at once and the player
// steps through, so a turn shows in the first read after that step. The game prints nothing for a gate,
// so these are the plain observable facts ("Harness messages use the game's own words", rule 2).
export interface Gate {readonly orientation:number;readonly arms:ReadonlySet<string>}
type Gates=ReadonlyMap<string,Gate>|"unread"|null;
type Element=NonNullable<GameStateSnapshot["map_observation"]>["elements"][number];

const COMPASS=["north","east","south","west"];
const STEP:Readonly<Record<string,readonly [number,number]>>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
// rotating_gate.c sRotatingGate_ArmPositions*Rotation, indexed 2*compass+length: the tile each arm sweeps, from the pivot.
const CLOCKWISE:readonly (readonly [number,number])[]=[[0,-1],[1,-2],[0,0],[1,0],[-1,0],[-1,1],[-1,-1],[-2,-1]];
const COUNTERCLOCKWISE:readonly (readonly [number,number])[]=[[-1,-1],[-1,-2],[0,-1],[1,-1],[0,0],[0,1],[-1,0],[-2,0]];
const NONE="no gate turned";
const UNREAD="gate state unavailable, so whether a gate turned is not known";

const sameMap=(a:readonly [number,number]|null,b:readonly [number,number]|null):boolean=>a!==null&&b!==null&&a[0]===b[0]&&a[1]===b[1];
export const label=(group:string):string=>`Gate ${group.replace("gate:","")}`;
const armList=(gate:Gate):string=>COMPASS.filter(side=>gate.arms.has(side)).join(", ");

function observed(state:GameStateSnapshot):readonly Element[]|"unread"|null {
 const observation=state.map_observation;
 if(observation===undefined||!sameMap(observation.map_id,state.map_id))return null;
 if(observation.unavailable.some(line=>line.includes("rotating gate")))return "unread";
 return observation.elements.filter(element=>element.kind==="rotating_gate");
}

export function gatesOf(state:GameStateSnapshot):Gates {
 const elements=observed(state);
 if(elements===null||elements==="unread")return elements;
 if(elements.length===0)return null;
 const gates=new Map<string,{orientation:number;arms:Set<string>}>();
 for(const {group,orientation,direction} of elements){
  if(group===undefined||orientation===undefined)return "unread";
  const gate=gates.get(group)??{orientation,arms:new Set<string>()};
  if(direction!==undefined)gate.arms.add(direction);
  gates.set(group,gate);
 }
 return gates;
}

export function turnOf(group:string,was:Gate,now:Gate):string {
 const quarter=(now.orientation-was.orientation+4)%4;
 const way=quarter===1?"90 degrees clockwise":quarter===3?"90 degrees counterclockwise":"180 degrees";
 return `${label(group)} turned ${way} (arms ${armList(was)} -> ${armList(now)})`;
}

export interface Tile {readonly x:number;readonly y:number}
/** The wall each turn would swing an arm into, or null where that turn is free. */
export interface GateTurns {readonly clockwise:Tile|null;readonly counterclockwise:Tile|null}

// An arm's length slot from its edge: map_rotating_elements.py _arm_edge, inverted.
const armLength=(side:number,pivot:Tile,edge:readonly [number,number,number,number]):number=>side===0?pivot.y-1-edge[1]:side===1?edge[0]-pivot.x:side===2?edge[1]-pivot.y:pivot.x-1-edge[0];

/**
 * rotating-gate-turn-reasons-v1: RotatingGate_CanRotate over the arms as they stand. Every arm's swept
 * tile must not be collision 1 (the unpatched game's check). Null unless every gate and swept tile was read.
 */
export function gateTurns(state:GameStateSnapshot):ReadonlyMap<string,GateTurns>|null {
 const elements=observed(state),grid=state.map_grid;
 if(elements===null||elements==="unread"||grid==null||elements.length===0)return null;
 // map_grid packs each tile as four hex digits, collision first, ffff unread: a gate sweeps tiles a local window may not hold.
 const collision=(x:number,y:number):number|undefined=>{
  const cell=x<0?undefined:grid.rows[y]?.slice(x*4,x*4+4);
  return cell===undefined||!/^[0-9a-f]{4}$/.test(cell)||cell==="ffff"?undefined:Number.parseInt(cell,16)>>12;
 };
 const out=new Map<string,GateTurns>();
 for(const pivot of elements.filter(element=>element.state==="pivot")){
  if(pivot.group===undefined)return null;
  const arms=elements.filter(element=>element.group===pivot.group&&element.state==="arm");
  const wall=(sweep:readonly (readonly [number,number])[]):Tile|null|"unread"=>{
   for(const arm of arms){
    const side=COMPASS.indexOf(arm.direction??"");
    if(side<0||arm.edge===undefined)return "unread";
    const step=sweep[2*side+armLength(side,pivot,arm.edge)];
    if(step===undefined)return "unread";
    const tile={x:pivot.x+step[0],y:pivot.y+step[1]},value=collision(tile.x,tile.y);
    if(value===undefined)return "unread";
    if(value===1)return tile;
   }
   return null;
  };
  const clockwise=wall(CLOCKWISE),counterclockwise=wall(COUNTERCLOCKWISE);
  if(clockwise==="unread"||counterclockwise==="unread")return null;
  out.set(pivot.group,{clockwise,counterclockwise});
 }
 return out.size===0?null:out;
}

// Which way a step across an arm's edge pushes the gate: the sign of the turn about the pivot corner.
// Same result as sRotatingGate_RotationInfo*: y grows south, so a positive cross product is clockwise.
function refusal(state:GameStateSnapshot,group:string,from:Tile,to:Tile,step:readonly [number,number]):string|null {
 const elements=observed(state),turns=gateTurns(state)?.get(group);
 if(elements===null||elements==="unread"||turns===undefined)return null;
 const pivot=elements.find(element=>element.group===group&&element.state==="pivot");
 if(pivot===undefined)return null;
 const clockwise=(from.x+to.x+1-2*pivot.x)*step[1]-(from.y+to.y+1-2*pivot.y)*step[0]>0;
 const wall=clockwise?turns.clockwise:turns.counterclockwise;
 return wall===null?null:`turning ${clockwise?"clockwise":"counterclockwise"} would swing an arm into the wall at (${String(wall.x)},${String(wall.y)})`;
}

// The arm on the line between the player's tile and the next tile in this direction.
export function armAhead(state:GameStateSnapshot,direction:Button,position:boolean,reasons=false):string|null {
 const here=state.position,step=STEP[direction],elements=observed(state);
 if(here===null||step===undefined||elements===null||elements==="unread")return null;
 const x=here.x+step[0],y=here.y+step[1];
 const arm=elements.find(({edge})=>edge!==undefined&&((edge[0]===here.x&&edge[1]===here.y&&edge[2]===x&&edge[3]===y)||(edge[2]===here.x&&edge[3]===here.y&&edge[0]===x&&edge[1]===y)));
 if(arm?.edge===undefined||arm.group===undefined)return null;
 const [ax,ay,bx,by]=arm.edge;
 const cause=reasons?refusal(state,arm.group,here,{x,y},step):null;
 return `${label(arm.group)}'s arm ${position?`between (${String(ax)},${String(ay)}) and (${String(bx)},${String(by)})`:"ahead"} did not turn${cause===null?"":`: ${cause}`}`;
}

// Walking needs a free field: a direction in a menu, a battle or a locked script pushes nothing.
export const walkable=(state:GameStateSnapshot):boolean=>state.started&&state.screen==="overworld"&&!state.in_battle&&state.active_ui==null&&state.naming==null&&state.field_controls_locked!==true;

/**
 * What these two snapshots prove about the gates, or null where no input could have pushed one.
 * One direction is one step; a repeat that stayed on its tile never pushed, because a turned gate
 * lets the step through. Anything else is a net comparison and says so: a turn and its reverse cancel.
 */
export function gatePressNote(before:GameStateSnapshot|undefined,after:GameStateSnapshot,buttons:readonly Button[],position:boolean,reasons=false):string|null {
 const directions=buttons.filter(button=>STEP[button]!==undefined);
 if(before===undefined||directions.length===0||!walkable(before)||!sameMap(before.map_id,after.map_id))return null;
 const was=gatesOf(before),now=gatesOf(after);
 if(was===null&&now===null)return null;
 if(was===null||now===null||was==="unread"||now==="unread"||was.size!==now.size||[...was.keys()].some(group=>!now.has(group)))return UNREAD;
 const turns=[...was].flatMap(([group,gate])=>{const next=now.get(group);return next===undefined||next.orientation===gate.orientation?[]:[turnOf(group,gate,next)];});
 const stayed=before.position!==null&&before.position.x===after.position?.x&&before.position.y===after.position.y;
 const first=directions[0];
 const oneStep=directions.length===1||(stayed&&directions.every(direction=>direction===first));
 if(turns.length>0)return `${oneStep?"":"across this batch, "}${turns.join("; ")}`;
 if(!oneStep)return "no gate differs between the states before and after this batch; gate state was not read between its inputs";
 return (stayed&&first!==undefined?armAhead(before,first,position,reasons):null)??NONE;
}

/** rotating-gate-press-feedback-v1: a walking batch keeps only its last result, so this carries each step's fact to it. */
export class GateStepTrail {
 readonly #position:boolean;
 readonly #reasons:boolean;
 readonly #named:string[]=[];
 #steps=0;
 #read=0;
 constructor(position:boolean,reasons=false){this.#position=position;this.#reasons=reasons;}
 add(before:GameStateSnapshot,after:GameStateSnapshot,direction:Button):string|null {
  this.#steps+=1;
  const note=gatePressNote(before,after,[direction],this.#position,this.#reasons);
  if(note!==null)this.#read+=1;
  if(note!==null&&note!==NONE)this.#named.push(`step ${String(this.#steps)} ${direction}: ${note}`);
  if(this.#read===0)return null;
  if(this.#named.length===0)return `${NONE} on any step`;
  return `gates by step: ${this.#named.join("; ")}${this.#read>this.#named.length?`; ${NONE} on the other steps`:""}`;
 }
}
