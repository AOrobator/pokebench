// Which exits the player has taken, from the recorded overworld states alone (briefing-exits-v1, untaken-exits-v1).
// A map change A -> B takes, on A, the doorway to B next to A's last recorded tile and, on B, the doorway back to A
// next to B's first recorded tile (a door arrival can already be one step out); see usedWarps for doorways and for
// how the other end settles a choice. With no warp either way, the map connections between A and B count as crossed.
import type {GameStateSnapshot} from "./game-state.js";
import {roomKey} from "./dialogue-log.js";

type Place=Pick<GameStateSnapshot,"started"|"screen"|"location"|"map_id"|"position"|"interaction_targets"|"topology">;
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
type Connection=NonNullable<GameStateSnapshot["topology"]>["connections"][number];
interface Seen {readonly room:string;readonly map:string;readonly x:number;readonly y:number;readonly warps:readonly Warp[];readonly connections:readonly Connection[]}
export interface ExitMark {readonly room:string;readonly map:string;readonly tile:string}

export const mapKey=(id:readonly number[]):string=>id.slice(0,2).join("/");
export const tileKey=(x:number,y:number):string=>`${String(x)},${String(y)}`;
// MAP_DYNAMIC (127/127): the destination is the game's own dynamic warp, so it may lead to any map.
const DYNAMIC="127/127";
const destinationOf=(warp:Warp):string=>JSON.stringify(warp.destination);

export type Warp=Target&{readonly destination:NonNullable<Target["destination"]>};
export function warpsOf(state:Pick<GameStateSnapshot,"interaction_targets">):Warp[] {
 return (state.interaction_targets??[]).filter((t):t is Warp=>t.kind==="warp"&&t.destination!==null);
}

interface End {readonly warps:readonly Warp[];readonly x:number;readonly y:number}
const near=(a:{x:number;y:number},x:number,y:number):boolean=>Math.abs(a.x-x)+Math.abs(a.y-y)<=1;
// One doorway: warps sharing an exact destination (a two-tile door into one warp), or side-by-side warps to the same map
// whose destination warps are side by side there too (a two-tile gate whose tiles name different warp ids, as at
// Route104 (10,30)/(11,30) -> PetalburgWoods warps 0/1). MtPyre_4F's stairs (12,10)/(12,12) stay apart.
function doorway(toward:readonly Warp[],seed:Warp,other?:End):Warp[] {
 const linked=(a:Warp,b:Warp):boolean=>{
  if(destinationOf(a)===destinationOf(b))return true;
  if(mapKey(a.destination)!==mapKey(b.destination)||!near(a,b.x,b.y))return false;
  const ea=other?.warps[a.destination[2]],eb=other?.warps[b.destination[2]];
  return ea!==undefined&&eb!==undefined&&near(ea,eb.x,eb.y);
 };
 const group=[seed];
 for(let i=0;i<group.length;i++){const g=group[i];if(g!==undefined)for(const w of toward)if(!group.includes(w)&&linked(g,w))group.push(w);}
 return group;
}
// The warps on a map that lead to `to` and were used from (x,y), as whole doorways. Candidates are the warps next to
// (x,y), else every warp to that map. When they form more than one doorway, the other end decides: the doorway whose
// destination warp (an index into the other map's warp events) lies next to where the player was there. Still
// ambiguous: none.
export function usedWarps(warps:readonly Warp[],x:number,y:number,to:string,other?:End):Warp[] {
 const toward=warps.filter(w=>mapKey(w.destination)===to||mapKey(w.destination)===DYNAMIC);
 const lands=(w:Warp):boolean=>{const end=other?.warps[w.destination[2]];return end!==undefined&&other!==undefined&&mapKey(w.destination)===to&&near(end,other.x,other.y);};
 const pick=(candidates:readonly Warp[]):Warp[]|null=>{
  const first=candidates[0];
  if(first===undefined)return null;
  const group=doorway(toward,first,other);
  if(candidates.every(w=>group.includes(w)))return group;
  const matched=candidates.filter(lands);
  const m=matched[0];
  if(m===undefined)return [];
  const chosen=doorway(toward,m,other);
  return matched.every(w=>chosen.includes(w))?chosen:[];
 };
 return pick(toward.filter(w=>near(w,x,y)))??pick(toward.filter(w=>mapKey(w.destination)===to))??[];
}

export class ExitHistory {
 private last:Seen|null=null;
 private readonly warps=new Set<string>();
 private readonly crossings=new Set<string>();
 // One recorded state. Returns the warp tiles this state's map change took (empty without a map change).
 observe(state:Place):ExitMark[] {
  if(!state.started||state.screen!=="overworld"||state.map_id===null||state.position===null)return [];
  const seen:Seen={room:roomKey(state),map:mapKey(state.map_id),x:state.position.x,y:state.position.y,warps:state.interaction_targets==null?[]:warpsOf(state),connections:state.topology?.connections??[]};
  const from=this.last;this.last=seen;
  if(from===null)return [];
  if(from.map===seen.map)return this.sameMap(from,seen);
  const marks=[
   ...usedWarps(from.warps,from.x,from.y,seen.map,seen).map(w=>({room:from.room,map:from.map,tile:tileKey(w.x,w.y)})),
   ...usedWarps(seen.warps,seen.x,seen.y,from.map,from).map(w=>({room:seen.room,map:seen.map,tile:tileKey(w.x,w.y)})),
  ];
  for(const mark of marks)this.warps.add(`${mark.map}|${mark.tile}`);
  if(marks.length===0){
   if(from.connections.some(c=>mapKey(c.destination)===seen.map))this.crossings.add(`${from.map}>${seen.map}`);
   if(seen.connections.some(c=>mapKey(c.destination)===from.map))this.crossings.add(`${seen.map}>${from.map}`);
  }
  return marks;
 }
 // A warp can lead to its own map (teleporter pads). It counts as used only when the player, from on or next to it,
 // lands exactly on the warp it leads to: destination warp ids index this map's warp events in order (pokeemerald
 // warp_events). One press batch is recorded as two states, so distance alone cannot tell a walk from a teleport.
 // The whole doorway left from counts (PetalburgCity_Gym (7,85)/(6,85) both lead to warp 2). The landing warp counts
 // only when it leads back into that doorway, like a door back; otherwise it is an exit of its own (AquaHideout_B1F
 // warp 12, landed on from warp 14, leads to warp 9).
 private sameMap(from:Seen,seen:Seen):ExitMark[] {
  if(from.x===seen.x&&from.y===seen.y)return [];
  const toward=from.warps.filter(w=>mapKey(w.destination)===seen.map);
  const here={warps:from.warps,x:seen.x,y:seen.y};
  const used=new Set<Warp>();
  for(const w of toward.filter(v=>near(v,from.x,from.y))){
   const end=from.warps[w.destination[2]];
   if(end===undefined||end.x!==seen.x||end.y!==seen.y)continue;
   const left=doorway(toward,w,here);
   for(const v of left)used.add(v);
   const back=mapKey(end.destination)===seen.map?from.warps[end.destination[2]]:undefined;
   if(back!==undefined&&left.includes(back))for(const v of doorway(toward,end,here))used.add(v);
  }
  const marks=[...used].map(w=>({room:seen.room,map:seen.map,tile:tileKey(w.x,w.y)}));
  for(const mark of marks)this.warps.add(`${mark.map}|${mark.tile}`);
  return marks;
 }
 taken(map:string,x:number,y:number):boolean {return this.warps.has(`${map}|${tileKey(x,y)}`);}
 crossed(map:string,to:string):boolean {return this.crossings.has(`${map}>${to}`);}
}

// The names the readout itself gave to maps: its Location line for the map it describes, and destinations it wrote as
// "-> NAME (map g/n)" (warps and map connections) or "Warp to NAME (map g/n)". A map the readout never named has none.
const NAMED=/(?:-> |Warp to )([^\n[\]>|]+?) \(map (\d+)\/(\d+)\)/g;
export function readoutNames(text:string,map:readonly number[]|null,into:Map<string,string>):void {
 for(const match of text.matchAll(NAMED))into.set(`${match[2] ?? ""}/${match[3] ?? ""}`,match[1] ?? "");
 const location=/^Location: (.+)$/m.exec(text)?.[1];
 if(map!==null&&location!==undefined)into.set(mapKey(map),location);
}
