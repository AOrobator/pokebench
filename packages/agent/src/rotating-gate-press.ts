import type {Button} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";

// rotating-gate-press-feedback-v1: what two snapshots prove about the gates, never what to push next.
// rotating_gate.c CheckForRotatingGatePuzzleCollision writes the orientation byte at once and the player
// steps through, so a turn shows in the first read after that step. The game prints nothing for a gate,
// so these are the plain observable facts ("Harness messages use the game's own words", rule 2).
interface Gate {readonly orientation:number;readonly arms:ReadonlySet<string>}
type Gates=ReadonlyMap<string,Gate>|"unread"|null;
type Element=NonNullable<GameStateSnapshot["map_observation"]>["elements"][number];

const COMPASS=["north","east","south","west"];
const STEP:Readonly<Record<string,readonly [number,number]>>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
const NONE="no gate turned";
const UNREAD="gate state unavailable, so whether a gate turned is not known";

const sameMap=(a:readonly [number,number]|null,b:readonly [number,number]|null):boolean=>a!==null&&b!==null&&a[0]===b[0]&&a[1]===b[1];
const label=(group:string):string=>`Gate ${group.replace("gate:","")}`;
const armList=(gate:Gate):string=>COMPASS.filter(side=>gate.arms.has(side)).join(", ");

function observed(state:GameStateSnapshot):readonly Element[]|"unread"|null {
 const observation=state.map_observation;
 if(observation===undefined||!sameMap(observation.map_id,state.map_id))return null;
 if(observation.unavailable.some(line=>line.includes("rotating gate")))return "unread";
 return observation.elements.filter(element=>element.kind==="rotating_gate");
}

function gatesOf(state:GameStateSnapshot):Gates {
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

function turnOf(group:string,was:Gate,now:Gate):string {
 const quarter=(now.orientation-was.orientation+4)%4;
 const way=quarter===1?"90 degrees clockwise":quarter===3?"90 degrees counterclockwise":"180 degrees";
 return `${label(group)} turned ${way} (arms ${armList(was)} -> ${armList(now)})`;
}

// The arm on the line between the player's tile and the next tile in this direction.
function armAhead(state:GameStateSnapshot,direction:Button,position:boolean):string|null {
 const here=state.position,step=STEP[direction],elements=observed(state);
 if(here===null||step===undefined||elements===null||elements==="unread")return null;
 const x=here.x+step[0],y=here.y+step[1];
 const arm=elements.find(({edge})=>edge!==undefined&&((edge[0]===here.x&&edge[1]===here.y&&edge[2]===x&&edge[3]===y)||(edge[2]===here.x&&edge[3]===here.y&&edge[0]===x&&edge[1]===y)));
 if(arm?.edge===undefined||arm.group===undefined)return null;
 const [ax,ay,bx,by]=arm.edge;
 return `${label(arm.group)}'s arm ${position?`between (${String(ax)},${String(ay)}) and (${String(bx)},${String(by)})`:"ahead"} did not turn`;
}

// Walking needs a free field: a direction in a menu, a battle or a locked script pushes nothing.
const walkable=(state:GameStateSnapshot):boolean=>state.started&&state.screen==="overworld"&&!state.in_battle&&state.active_ui==null&&state.naming==null&&state.field_controls_locked!==true;

/**
 * What these two snapshots prove about the gates, or null where no input could have pushed one.
 * One direction is one step; a repeat that stayed on its tile never pushed, because a turned gate
 * lets the step through. Anything else is a net comparison and says so: a turn and its reverse cancel.
 */
export function gatePressNote(before:GameStateSnapshot|undefined,after:GameStateSnapshot,buttons:readonly Button[],position:boolean):string|null {
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
 return (stayed&&first!==undefined?armAhead(before,first,position):null)??NONE;
}

/** rotating-gate-press-feedback-v1: a walking batch keeps only its last result, so this carries each step's fact to it. */
export class GateStepTrail {
 readonly #position:boolean;
 readonly #named:string[]=[];
 #steps=0;
 #read=0;
 constructor(position:boolean){this.#position=position;}
 add(before:GameStateSnapshot,after:GameStateSnapshot,direction:Button):string|null {
  this.#steps+=1;
  const note=gatePressNote(before,after,[direction],this.#position);
  if(note!==null)this.#read+=1;
  if(note!==null&&note!==NONE)this.#named.push(`step ${String(this.#steps)} ${direction}: ${note}`);
  if(this.#read===0)return null;
  if(this.#named.length===0)return `${NONE} on any step`;
  return `gates by step: ${this.#named.join("; ")}${this.#read>this.#named.length?`; ${NONE} on the other steps`:""}`;
 }
}
