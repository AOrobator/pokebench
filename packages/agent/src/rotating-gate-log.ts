import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";
import {armAhead,gateTurns,gatesOf,label,turnOf,walkable,type Gate,type Tile} from "./rotating-gate-press.js";

// rotating-gate-turn-reasons-v1 and rotating-gate-push-log-v1: facts about the gates pinned before each
// decision on a gate map. The log comes from recorded events, so trimming the context cannot lose it,
// and the note is not added to history. It never names a push to make.
type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Press=Extract<RunEvent,{type:"button_press"}>;

// rotating_gate.c sRotatingGate_FortreePuzzleConfig and sRotatingGate_TrickHousePuzzleConfig orientations;
// RotatingGate_InitPuzzle sets these on every entry to the map.
const START:Readonly<Record<string,readonly number[]>>={"12/1":[1,2,1,1,0,0,0,2],"29/8":[1,2,1,1,3,1,0,2,3,1,2]};
const TURNS_HEADER="Which way each gate can turn right now (the game refuses a turn that would swing an arm into a wall):";
const LOG_HEADER="Gate log for this map, oldest first, recorded from the game:";
const DIRECTIONS=new Set(["UP","DOWN","LEFT","RIGHT"]);
// The note rides outside the context fitter, so it must stay bounded (the operator 2026-10-28). About 10k tokens; 08b5 logged 107 lines in 2 hours.
export const GATE_LOG_LINES=200;

const mapKey=(state:GameStateSnapshot):string|null=>state.map_id===null?null:state.map_id.join("/");
const point=(tile:Tile):string=>`(${String(tile.x)},${String(tile.y)})`;
const gateOrder=(group:string):number=>Number(group.replace("gate:",""));

export function gateTurnLines(state:GameStateSnapshot):readonly string[] {
 const turns=gateTurns(state);
 if(turns===null)return [];
 const side=(name:string,wall:Tile|null):readonly [boolean,string]=>wall===null?[false,`${name} free`]:[true,`${name} blocked, an arm would swing into the wall at ${point(wall)}`];
 return [...turns].sort(([a],[b])=>gateOrder(a)-gateOrder(b)).map(([group,gate])=>{
  const both=[side("clockwise",gate.clockwise),side("counterclockwise",gate.counterclockwise)].sort((a,b)=>Number(a[0])-Number(b[0]));
  return `${label(group)}: ${both.map(([,text])=>text).join("; ")}.`;
 });
}

function entryFact(map:string,gates:ReadonlyMap<string,Gate>):string {
 const start=START[map];
 if(start===undefined)return "gate starting positions not known";
 const moved=[...gates].filter(([group,gate])=>start[gateOrder(group)]!==gate.orientation).map(([group])=>group).sort((a,b)=>gateOrder(a)-gateOrder(b));
 if(moved.length===0)return "all gates at their starting positions.";
 return `${moved.map(label).join(", ")} ${moved.length===1?"is":"are"} not at ${moved.length===1?"its":"their"} starting position${moved.length===1?"":"s"}.`;
}

/** Every entry, turn and refused push on gate maps, from state and button_press events. */
export class GateLog {
 readonly #lines=new Map<string,string[]>();
 #latest:State|null=null;
 #previous:State|null=null;
 #map:string|null=null;
 #presses:Press[]=[];

 observe(event:RunEvent):void {
  // A direction in a menu or a battle pushes nothing, and a press outside a gate visit has no gate to push.
  if(event.type==="button_press"){if(this.#previous!==null&&this.#latest!==null&&walkable(this.#latest))this.#presses.push(event);return;}
  if(event.type==="state"&&"started" in event)this.#state(event);
 }

 #state(state:State):void {
  const map=mapKey(state);
  this.#latest=state;
  if(map===null)return;
  const gates=gatesOf(state);
  // A read with no gates on the same map is a transition, not a new visit, so its press stays pending.
  if(gates===null||gates==="unread"){if(map!==this.#map){this.#map=map;this.#previous=null;this.#presses=[];}return;}
  const presses=this.#presses;this.#presses=[];
  const entered=this.#previous===null||this.#map!==map,first=this.#map===null;
  this.#map=map;
  const lines=this.#lines.get(map)??[];this.#lines.set(map,lines);
  if(entered)lines.push(`Turn ${String(state.turn)}: ${first?"first read on":"entered"} ${state.location??"this map"}: ${entryFact(map,gates)}`);
  else if(this.#previous!==null)lines.push(...this.#changes(this.#previous,state,gates,presses));
  this.#previous=state;
 }

 #changes(before:State,after:State,gates:ReadonlyMap<string,Gate>,presses:readonly Press[]):string[] {
  const was=gatesOf(before);
  if(was===null||was==="unread")return [];
  const turn=`Turn ${String(after.turn)}: `;
  const moves=presses.flatMap(press=>press.buttons.filter(button=>DIRECTIONS.has(button)));
  const from=before.position,to=after.position;
  // As in gatePressNote: a repeat that stayed on its tile never pushed, so it is one step.
  const stayed=from!==null&&to!==null&&from.x===to.x&&from.y===to.y;
  const direction=moves.length===1||(stayed&&moves.every(move=>move===moves[0]))?moves[0]:undefined;
  const turned=[...gates].sort(([a],[b])=>gateOrder(a)-gateOrder(b)).flatMap(([group,gate])=>{const old=was.get(group);return old===undefined||old.orientation===gate.orientation?[]:[turnOf(group,old,gate)];});
  if(turned.length>0)return turned.map(line=>direction!==undefined&&from!==null&&to!==null?`${turn}${direction} from ${point(from)} to ${point(to)}: ${line}`:`${turn}${line} with no single press read`);
  // Facing a new way turns the player in place without reaching the gate's collision check.
  if(direction===undefined||from===null||!stayed||!walkable(before)||before.facing?.toUpperCase()!==direction)return [];
  const refused=armAhead(before,direction,true,true);
  return refused===null?[]:[`${turn}${direction} at ${point(from)}: ${refused}`];
 }

 onGateMap():boolean {return this.#latest!==null&&this.#map===mapKey(this.#latest)&&this.#previous!==null;}
 lines():readonly string[] {return this.#map===null?[]:this.#lines.get(this.#map)??[];}
 /** The newest whole lines, saying how many older ones are not shown. */
 shown():readonly string[] {
  const lines=this.lines(),hidden=lines.length-GATE_LOG_LINES;
  return hidden>0?[`${String(hidden)} older lines not shown.`,...lines.slice(hidden)]:lines;
 }
 latest():State|null {return this.#latest;}
}

export function gateLogContext(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform,now:()=>number=Date.now):Transform {
 const reasons=features["rotating-gate-turn-reasons-v1"],pushes=features["rotating-gate-push-log-v1"];
 if(!reasons&&!pushes)return base;
 const log=new GateLog();
 recorder.subscribe(event=>{log.observe(event);},false,true,true);
 return async messages=>{
  const state=log.latest();
  const turns=reasons&&state!==null&&log.onGateMap()?gateTurnLines(state):[];
  const entries=pushes&&log.onGateMap()?log.shown():[];
  const note=[...(turns.length===0?[]:[TURNS_HEADER,...turns]),...(entries.length===0?[]:[LOG_HEADER,...entries])].join("\n");
  if(note===""||state===null)return base(messages);
  recorder.recordLedgerContext({text:note,evidence:[state.seq]});
  return [...await base(messages),{role:"user",content:note,timestamp:now()}];
 };
}
