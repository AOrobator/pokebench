import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import {LEDGES,type Direction} from "./tile-rules.js";

type Point={readonly x:number;readonly y:number};
type Tile=NonNullable<GameStateSnapshot["navigation_grid"]>["tiles"][number];
interface MapMemory {readonly tiles:Map<string,Tile>;readonly warps:Map<string,Point>}
const key=(p:Point):string=>`${String(p.x)},${String(p.y)}`;
const mapKey=(id:readonly [number,number]):string=>`${String(id[0])}/${String(id[1])}`;
const MAX_RENDER_WIDTH=64,MAX_RENDER_HEIGHT=64;
const LEDGE_GLYPH:Readonly<Record<Direction,string>>={UP:"^",DOWN:"v",LEFT:"<",RIGHT:">"};

function stateFrom(result:AgentToolResult<unknown>):GameStateSnapshot|null {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))return null;
 try{return parseGameState(details.state);}catch{return null;}
}

function symbol(tile:Tile|undefined):string {
 if(tile===undefined)return "?";
 if(tile.behavior===2||tile.behavior===3)return '"';
 if(tile.behavior>=0x10&&tile.behavior<=0x15)return "~";
 const ledge=LEDGES.get(tile.behavior);
 return ledge===undefined?(tile.collision===0?".":"#"):LEDGE_GLYPH[ledge];
}

export class VisitedTerrain {
 private readonly maps=new Map<string,MapMemory>();

 private map(id:readonly [number,number]):MapMemory {
  const idKey=mapKey(id),existing=this.maps.get(idKey);
  if(existing!==undefined)return existing;
  const created:MapMemory={tiles:new Map(),warps:new Map()};this.maps.set(idKey,created);return created;
 }

 knownCellCount(id:readonly [number,number]):number{return this.maps.get(mapKey(id))?.tiles.size??0;}

 delivered(state:GameStateSnapshot):void {
  const grid=state.navigation_grid;
  if(state.map_id===null||grid==null)return;
  const memory=this.map(state.map_id),observed=new Set(grid.tiles.map(key));
  for(const tile of grid.tiles)memory.tiles.set(key(tile),tile);
  for(const [at] of memory.warps)if(observed.has(at))memory.warps.delete(at);
  for(const warp of grid.warps)if(observed.has(key(warp)))memory.warps.set(key(warp),warp);
 }

 navigationState(state:GameStateSnapshot):GameStateSnapshot {
  if(state.map_id===null||state.navigation_grid==null)return {...state,map_grid:null,navigation_grid:null};
  const memory=this.maps.get(mapKey(state.map_id)),known=new Map(memory?.tiles??[]),current=state.navigation_grid;
  // Internal reads may refresh facts for already delivered cells, but cannot disclose a new coordinate.
  for(const tile of current.tiles)if(known.has(key(tile)))known.set(key(tile),tile);
  const objects=current.objects.filter(point=>known.has(key(point)));
  const warps=new Map(memory?.warps??[]);
  const observed=new Set(current.tiles.filter(tile=>known.has(key(tile))).map(key));
  for(const [at] of warps)if(observed.has(at))warps.delete(at);
  for(const warp of current.warps)if(known.has(key(warp)))warps.set(key(warp),warp);
  return {...state,map_grid:null,navigation_grid:{elevation:current.elevation,tiles:[...known.values()].sort((a,b)=>a.y-b.y||a.x-b.x),objects,warps:[...warps.values()]}};
 }

 source(state:StateSource):StateSource{return {read:async signal=>this.navigationState(await state.read(signal))};}

 text(state:GameStateSnapshot):string|null {
  if(state.map_id===null||state.position===null||state.navigation_grid==null)return null;
  const position=state.position,memory=this.maps.get(mapKey(state.map_id));if(memory===undefined||memory.tiles.size===0)return null;
  const tiles=[...memory.tiles.values()],xs=tiles.map(tile=>tile.x),ys=tiles.map(tile=>tile.y);
  const natural={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  const width=Math.min(MAX_RENDER_WIDTH,natural.right-natural.left+1),height=Math.min(MAX_RENDER_HEIGHT,natural.bottom-natural.top+1);
  const left=Math.max(natural.left,Math.min(position.x-Math.floor(width/2),natural.right-width+1));
  const top=Math.max(natural.top,Math.min(position.y-Math.floor(height/2),natural.bottom-height+1));
  const right=left+width-1,bottom=top+height-1,lookup=new Map(tiles.map(tile=>[key(tile),tile]));
  const currentObjects=new Set(state.navigation_grid.objects.map(key)),currentWarps=new Set(state.navigation_grid.warps.map(key));
  const rows=Array.from({length:height},(_,dy)=>{
   const y=top+dy,row=Array.from({length:width},(_,dx)=>{const p={x:left+dx,y};return p.x===position.x&&p.y===position.y?"@":currentObjects.has(key(p))?"N":currentWarps.has(key(p))?"W":symbol(lookup.get(key(p)));}).join("");
   return `${String(y).padStart(4," ")} ${row}`;
  });
  const clipped=natural.left!==left||natural.right!==right||natural.top!==top||natural.bottom!==bottom;
  return `Visited terrain on map ${mapKey(state.map_id)}; only cells shown to you this run, north is up; ? unknown${clipped?`; view clipped to ${String(MAX_RENDER_WIDTH)}x${String(MAX_RENDER_HEIGHT)} around you`:""}:\n     x ${String(left)}..${String(right)}\n${rows.join("\n")}\n@ player; N current live object; W current warp; # solid; . clear; " grass; ~ water; arrows are ledges. Loading a game checkpoint does not restore this harness memory.`;
 }
}

export function withVisitedTerrain(base:readonly AgentTool[],memory:VisitedTerrain):AgentTool[] {
 return base.map((tool):AgentTool=>({...tool,execute:async(id,params,signal)=>{
  const result=await tool.execute(id,params,signal),state=stateFrom(result);if(state===null)return result;
  memory.delivered(state);const text=memory.text(state);if(text===null)return result;
  return {...result,content:[...result.content,{type:"text",text}]};
 }}));
}
