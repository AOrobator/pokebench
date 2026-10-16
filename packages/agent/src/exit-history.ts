// Which exits the player has taken, from the recorded overworld states alone (briefing-exits-v1, untaken-exits-v1).
// A map change A -> B takes, on A, the warps to B next to A's last recorded tile and, on B, the warps back to A next
// to B's first recorded tile (a door arrival can already be one step out), each with the warps sharing its exact
// destination (a two-tile door). When no warp is that close, the warps to the other map count only if they all share
// one destination. With no warp either way, the map connections between A and B count as crossed.
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
const single=(ws:readonly Warp[]):boolean=>new Set(ws.map(destinationOf)).size===1;
// The warps on a map that lead to `to` and were used from (x,y), with their same-destination siblings. When the warps
// next to (x,y) lead to different destinations, the other end decides: the one whose destination warp (an index into
// the other map's warp events) lies next to where the player was on the other map. Still ambiguous: none.
export function usedWarps(warps:readonly Warp[],x:number,y:number,to:string,other?:End):Warp[] {
 const toward=warps.filter(w=>mapKey(w.destination)===to||mapKey(w.destination)===DYNAMIC);
 const close=toward.filter(w=>near(w,x,y));
 const exact=toward.filter(w=>mapKey(w.destination)===to);
 const matched=close.filter(w=>{const end=other?.warps[w.destination[2]];return end!==undefined&&mapKey(w.destination)===to&&other!==undefined&&near(end,other.x,other.y);});
 const pool=matched.length>0?matched:close;
 const chosen=pool.length>0?(single(pool)?pool:[]):single(exact)?exact:[];
 const destinations=new Set(chosen.map(destinationOf));
 return toward.filter(w=>destinations.has(destinationOf(w)));
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
 // The landing pad is not used by arriving on it: it is its own exit (AquaHideout_B1F warp 12 leads to warp 9).
 private sameMap(from:Seen,seen:Seen):ExitMark[] {
  if(from.x===seen.x&&from.y===seen.y)return [];
  const used=from.warps.filter(w=>mapKey(w.destination)===seen.map&&Math.abs(w.x-from.x)+Math.abs(w.y-from.y)<=1)
   .flatMap(w=>{const end=from.warps[w.destination[2]];return end!==undefined&&end.x===seen.x&&end.y===seen.y?[w]:[];});
  const marks=used.map(w=>({room:seen.room,map:seen.map,tile:tileKey(w.x,w.y)}));
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
