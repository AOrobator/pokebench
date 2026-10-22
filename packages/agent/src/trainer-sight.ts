// trainer-sight-check-v1: before a navigate_to call walks, the game server tests every tile of the planned route
// against the sight of every trainer on the map the player has not beaten (pret/pokeemerald src/trainer_see.c,
// CheckTrainer; env/pokebench_env/trainer_sight.py). A tile in sight refuses the walk; confirm_trainer_sight: true
// walks it anyway. Each check is one trainer_sight_check event.
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import type {GameStateSnapshot} from "./game-state.js";

const closed={additionalProperties:false} as const;
const Int=Type.Integer(),NonNegativeInt=Type.Integer({minimum:0});
const Facing=Type.Enum(["DOWN","UP","LEFT","RIGHT"] as const);
const Tile=Type.Tuple([Int,Int]);
export const SightTrainerSchema=Type.Object({local_id:NonNegativeInt,graphics_id:NonNegativeInt,sprite_kind:Type.Union([Type.String({minLength:1}),Type.Null()]),trainer_id:NonNegativeInt,double:Type.Boolean(),x:Int,y:Int,facing:Facing,sight:NonNegativeInt,loaded:Type.Boolean()},closed);
export const SightingSchema=Type.Object({local_id:NonNegativeInt,step:Type.Integer({minimum:1}),tile:Tile,from:Tile,facing:Facing},closed);
export const TrainerSightReplySchema=Type.Union([
 Type.Object({available:Type.Literal(true),map_id:Type.Tuple([NonNegativeInt,NonNegativeInt]),trainers:Type.Array(SightTrainerSchema,{maxItems:64}),sightings:Type.Array(SightingSchema,{maxItems:64})},closed),
 Type.Object({available:Type.Literal(false),reason:Type.String({minLength:1})},closed),
]);
export type TrainerSightReply=Static<typeof TrainerSightReplySchema>;
export type SightTrainer=Static<typeof SightTrainerSchema>;

export function parseTrainerSight(value:unknown):TrainerSightReply {
 if(!Value.Check(TrainerSightReplySchema,value))throw new Error("Malformed trainer sight reply");
 return value;
}

type Point={readonly x:number;readonly y:number};
export type SightOutcome="clear"|"refused"|"confirmed"|"unavailable";
export interface SightSeen {
 readonly local_id:number;readonly sprite_kind:string|null;readonly trainer_id:number;readonly x:number;readonly y:number;
 readonly facing:"DOWN"|"UP"|"LEFT"|"RIGHT";readonly sight:number;readonly loaded:boolean;
 readonly step:number;readonly tile:Point;readonly from:Point;readonly seen_facing:"DOWN"|"UP"|"LEFT"|"RIGHT";
}
export interface TrainerSightCheck {
 readonly tool_call_id:string;readonly map_id:readonly [number,number];readonly origin:Point;readonly goal:Point;
 readonly route_tiles:number;readonly confirmed:boolean;readonly outcome:SightOutcome;readonly reason:string|null;
 readonly sightings:readonly SightSeen[];readonly text:string|null;
}
export interface TrainerSightPorts {
 readonly check:(mapId:readonly [number,number],tiles:readonly Point[],signal?:AbortSignal)=>Promise<TrainerSightReply>;
 readonly record:(check:TrainerSightCheck)=>void;
}

// The argument the model passes to walk a route a trainer can see.
export const CONFIRM_ARG="confirm_trainer_sight";
export const CONFIRM_DESCRIPTION="Only after navigate_to said a trainer you have not beaten can see a tile of this route: true walks the route anyway.";
export const SIGHT_TOOL_SENTENCE="Before it walks, it checks the planned route against the sight of every trainer on this map you have not beaten; when one can see a tile of the route it does not walk and names the trainer and the tile. Call it again with confirm_trainer_sight: true to walk that route anyway.";
// src/battle_message.c sText_NoRunningFromTrainers; the sentence heal-before-trainers-v1 uses.
export const NO_RUNNING="In a trainer battle the game says \"No! There's no running from a TRAINER battle!\"";

const at=(p:Point):string=>`(${String(p.x)},${String(p.y)})`;
const tuple=(t:readonly [number,number]):Point=>({x:t[0],y:t[1]});

// CheckTrainer: a double battle script needs two party Pokémon that can battle (GetMonsStateToDoubles_2: not an
// egg, HP above 0). An unread HP counts as able, so the check stays on the side of warning.
const usable=(state:GameStateSnapshot):number=>state.party.filter(m=>m.is_egg!==true&&m.species!==null&&m.hp!==0).length;

export function seenTrainers(reply:Extract<TrainerSightReply,{available:true}>,state:GameStateSnapshot):SightSeen[] {
 const two=usable(state)>=2;
 return reply.sightings.flatMap(s=>{
  const t=reply.trainers.find(x=>x.local_id===s.local_id);
  if(t===undefined||(t.double&&!two))return [];
  return [{local_id:t.local_id,sprite_kind:t.sprite_kind,trainer_id:t.trainer_id,x:t.x,y:t.y,facing:t.facing,sight:t.sight,loaded:t.loaded,step:s.step,tile:tuple(s.tile),from:tuple(s.from),seen_facing:s.facing}];
 });
}

const partyText=(state:GameStateSnapshot):string=>{
 const mons=state.party.filter(m=>m.is_egg!==true);
 return mons.length===0?"Your party: none.":`Your party: ${mons.map(m=>`${m.species??"unknown"} ${m.hp==null?"?":String(m.hp)}/${m.max_hp==null?"?":String(m.max_hp)} HP`).join(", ")}.`;
};

export function trainerLine(s:SightSeen,steps:number):string {
 const where=s.loaded?"loaded, its tile now":"not loaded; where the map places it, it may have moved";
 const pose=s.from.x===s.x&&s.from.y===s.y&&s.seen_facing===s.facing?"":` when it faces ${s.seen_facing} from ${at(s.from)}`;
 return `- object ${String(s.local_id)}, sprite ${s.sprite_kind??"unknown"} at ${at(s)} (${where}), facing ${s.facing}, sight ${String(s.sight)} tile${s.sight===1?"":"s"}: it can see ${at(s.tile)}${pose}, step ${String(s.step)} of ${String(steps)} on the route.`;
}

export const SIGHT_STATUS="not walked: a trainer you have not beaten can see the planned route";
// trainer-sight-check-v2: navigate_to_target's routes are checked too; the text names the tool the model called.
export type SightTool="navigate_to"|"navigate_to_target";
export const TARGET_CONFIRM_DESCRIPTION="Only after navigate_to_target said a trainer you have not beaten can see a tile of its route: true walks the route anyway.";
export const TARGET_SIGHT_TOOL_SENTENCE="Before it walks, it checks the route it plans against the sight of every trainer on this map you have not beaten, except one you asked to talk to; when one can see a tile of the route it does not walk and names the trainer and the tile. Call it again with confirm_trainer_sight: true to walk that route anyway.";
export function sightText(seen:readonly SightSeen[],origin:Point,goal:Point,steps:number,state:GameStateSnapshot,tool:SightTool="navigate_to"):string {
 const lead=seen.length===1?"a trainer you have not beaten can see":"trainers you have not beaten can see";
 const again=tool==="navigate_to"?"call navigate_to again with the same x, y and map_id":"call navigate_to_target again with the same map_id and target";
 return [
  `Trainer sight: the route ${tool} planned from ${at(origin)} to ${at(goal)} (${String(steps)} step${steps===1?"":"s"}) passes tiles ${lead}. A trainer who sees you walks up to you and starts a battle. ${NO_RUNNING}`,
  ...seen.map(s=>trainerLine(s,steps)),
  partyText(state),
  `To walk this route anyway, ${again} and ${CONFIRM_ARG}: true.`,
 ].join("\n");
}
