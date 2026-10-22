import type {RunEvent} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {Place} from "./story-destinations.js";

type MapId=readonly [number,number];
export interface HealRoute {readonly outward:readonly MapId[];readonly back:readonly MapId[]}
export const HEAL_TRIP_CALL_LIMIT=48;
export const HEAL_TRIP_IDLE_LIMIT=4;
const key=(map:readonly number[]):string=>map.join("/");
const same=(a:readonly number[]|null,b:readonly number[]):boolean=>a!==null&&key(a)===key(b);
const full=(s:GameStateSnapshot):boolean=>s.party_owner==="player"&&s.party.some(p=>p.is_egg!==true)&&s.party.every(p=>p.is_egg===true||p.hp!=null&&p.max_hp!=null&&p.hp===p.max_hp&&p.max_hp>0&&p.diagnostic==null);
export function healRoutes(places:readonly Place[],origin:MapId,destinations:readonly MapId[]):HealRoute[]{
 const table=new Map(places.map(p=>[key(p.map_id),p]));
 const path=(from:MapId,to:MapId):MapId[]|null=>{
  const paths:MapId[][]=[[from]],seen=new Set([key(from)]);
  for(let i=0;i<paths.length;i++){
   const route=paths[i];const last=route?.at(-1);if(route===undefined||last===undefined)continue;
   if(same(last,to))return route;
   const place=table.get(key(last));if(place===undefined)continue;
   for(const next of [...place.connections.map(c=>c.to),...place.warps.map(w=>w.to)]){
    if(seen.has(key(next)))continue;seen.add(key(next));paths.push([...route,next]);
   }
  }
  return null;
 };
 return destinations.flatMap(destination=>{const outward=path(origin,destination),back=path(destination,origin);return outward===null||back===null||outward.length<2?[]:[{outward,back}];});
}
export interface CycleHold {readonly reason:"milestone"|"heal_trip";readonly evidence:readonly number[]}
interface Trip {readonly origin:{x:number;y:number};readonly opponents:readonly {x:number;y:number}[];readonly seq:number;candidates:{route:HealRoute;index:number}[];phase:"outward"|"back";calls:number;idle:number;readonly visited:Set<string>}

// The same typed events feed both owners; no dependency on model narration or wall-clock scheduling.
export class ProgressAwareCycles {
 private state:Extract<RunEvent,{type:"state";started:boolean}>|null=null;
 private trip:Trip|null=null;
 private readonly used=new Set<string>();
 private progress:{turn:number;seq:number}|null=null;
 private turn=0;
 private held:CycleHold|null=null;
 observe(e:RunEvent):void {
  this.turn=e.turn;
  if(e.type==="milestone"&&e.origin!=="present_at_start"&&e.name!=="GAME_RUNNING"&&e.name!=="ROXANNE_FIRST_INTERACTION")this.progress={turn:e.turn,seq:e.seq};
  if(e.type==="story_battle_heal_gate"){
   if(e.outcome==="confirmed"){this.trip=null;this.held=null;return;}
   if(e.outcome!=="refused"||this.trip!==null)return;
   const id=key(e.map_id);
   if(this.used.has(id))return;
   this.used.add(id);
   const routes=(e.heal_routes??[]).filter(r=>same(r.outward[0]??null,e.map_id)&&same(r.back.at(-1)??null,e.map_id)&&e.heal.some(h=>same(r.outward.at(-1)??null,h.map_id)&&same(r.back[0]??null,h.map_id)));
   if(routes.length>0&&this.state?.position!=null&&same(this.state.map_id,e.map_id))this.trip={origin:this.state.position,opponents:e.reached,seq:e.seq,candidates:routes.map(route=>({route,index:0})),phase:"outward",calls:0,idle:0,visited:new Set()};
  }
  if(e.type==="state"){
   if(!("started"in e)){this.state=null;this.trip=null;this.held=null;return;}
   this.state=e;
   if(e.in_battle){this.trip=null;this.held=null;this.used.clear();return;}
   const trip=this.trip;
   if(trip!==null&&e.map_id!==null){
    trip.candidates=trip.candidates.flatMap(c=>{
     const route=trip.phase==="outward"?c.route.outward:c.route.back;
     if(same(e.map_id,route[c.index]??[]))return [c];
     return same(e.map_id,route[c.index+1]??[])?[{...c,index:c.index+1}]:[];
    });
    if(trip.candidates.length===0){this.trip=null;this.held=null;return;}
    if(trip.phase==="outward"&&full(e)){
     const reached=trip.candidates.filter(c=>c.index===c.route.outward.length-1);
     // Full HP elsewhere does not establish that the offered healing place was used.
     if(reached.length===0){this.trip=null;this.held=null;return;}
     trip.phase="back";trip.candidates=reached.map(c=>({route:c.route,index:0}));trip.visited.clear();trip.idle=0;
    }
   }
  }
  if(e.type!=="tool_result")return;
  this.held=null;
  const trip=this.trip;if(trip===null)return;
  trip.calls++;
  const s=this.state;const position=s?.position;
  const valid=!e.is_error&&e.state_seq!==undefined&&s?.seq===e.state_seq&&s.started&&s.map_id!==null&&s.position!==null&&s.party_owner==="player";
  const place=valid?JSON.stringify([s.map_id,s.position,s.party.map(p=>[p.species,p.hp,p.max_hp])]):null;
  if(place===null||trip.visited.has(place))trip.idle++;else{trip.visited.add(place);trip.idle=0;}
  if(trip.calls>HEAL_TRIP_CALL_LIMIT||trip.idle>=HEAL_TRIP_IDLE_LIMIT){this.trip=null;return;}
  if(valid)this.held={reason:"heal_trip",evidence:[trip.seq,e.seq]};
  if(valid&&position!=null&&trip.phase==="back"&&trip.candidates.some(c=>c.index===c.route.back.length-1)&&(position.x===trip.origin.x&&position.y===trip.origin.y||trip.opponents.some(o=>Math.abs(o.x-position.x)+Math.abs(o.y-position.y)<=1)))this.trip=null;
 }
 hold():CycleHold|null {return this.progress?.turn===this.turn?{reason:"milestone",evidence:[this.progress.seq]}:this.held;}
}
