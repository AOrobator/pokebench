import {PROGRESS_CATALOG} from "./story-progress.js";
import type {RunEvent} from "./events.js";

// gym-puzzle-supervisor-hold-v1: each gym-entry milestone's map and the badge that follows it in the catalog.
// Harness-internal: the supervisor uses it to decide what not to send, and no model-facing text names it.
export const GYM_PUZZLES:ReadonlyMap<string,{readonly map:string;readonly badge:string}>=(()=>{
 const out=new Map<string,{map:string;badge:string}>();
 PROGRESS_CATALOG.forEach((entry,index)=>{
  if(!entry.name.endsWith("_GYM_ENTERED")||entry.map===undefined)return;
  const badge=PROGRESS_CATALOG.slice(index+1).find(next=>next.name.endsWith("_BADGE"));
  if(badge!==undefined)out.set(entry.name,{map:entry.map.join("/"),badge:badge.name});
 });
 return out;
})();

const CENTER=/POK[EÉ]MON CENTER/i;
const mapOf=(id:readonly number[]|null|undefined):string|null=>id==null?null:id.join("/");
// A StallBriefing room key is "<location>|<map>": see dialogue-log.ts roomKey.
const roomMap=(key:string):string=>key.slice(key.lastIndexOf("|")+1);
const roomPlace=(key:string):string=>key.slice(0,key.lastIndexOf("|"));

/**
 * A gym this run has entered whose badge it does not have is open. Its town is any map the player walked
 * to or from the gym map. Closed by the badge milestone, from the save or observed.
 */
export class GymPuzzle {
 readonly #open=new Map<string,string>();
 readonly #badges=new Set<string>();
 readonly #towns=new Map<string,Set<string>>();
 #map:string|null=null;

 observe(event:RunEvent):void {
  if(event.type==="milestone"){
   const puzzle=GYM_PUZZLES.get(event.name);
   if(puzzle!==undefined&&!this.#badges.has(puzzle.badge))this.#open.set(puzzle.map,puzzle.badge);
   if(event.name.endsWith("_BADGE")){
    this.#badges.add(event.name);
    for(const [map,badge] of this.#open)if(badge===event.name){this.#open.delete(map);this.#towns.delete(map);}
   }
   return;
  }
  if(event.type!=="state"||!("started" in event)||!event.started)return;
  const map=mapOf(event.map_id);
  if(map===null)return;
  const was=this.#map;
  this.#map=map;
  if(was===null||was===map)return;
  if(this.#open.has(map))this.#town(map,was);
  if(this.#open.has(was))this.#town(was,map);
 }
 #town(gym:string,town:string):void {
  const towns=this.#towns.get(gym)??new Set<string>();
  towns.add(town);this.#towns.set(gym,towns);
 }

 /** The map is an open gym's. */
 openGym(mapId:readonly number[]|null|undefined):boolean {
  const map=mapOf(mapId);
  return map!==null&&this.#open.has(map);
 }

 /** The open gym a pair of room keys walks to and from, or that gym's town and a POKéMON CENTER; null otherwise. */
 heldPair(a:string,b:string):string|null {
  const [ma,mb]=[roomMap(a),roomMap(b)];
  for(const gym of this.#open.keys()){
   if(ma===gym||mb===gym)return gym;
   const towns=this.#towns.get(gym);
   if(towns===undefined)continue;
   if(towns.has(ma)&&CENTER.test(roomPlace(b))||towns.has(mb)&&CENTER.test(roomPlace(a)))return gym;
  }
  return null;
 }
}
