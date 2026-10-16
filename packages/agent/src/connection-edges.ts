import type {GameStateSnapshot} from "./game-state.js";

// connection-edge-tiles-v1: the walkable edge tiles the game server reads for each map connection
// (env/pokebench_env/topology.py). Wording matches the readout's Map connections lines.
type Topology=NonNullable<GameStateSnapshot["topology"]>;
type Connection=Topology["connections"][number];
type Tile={readonly x:number;readonly y:number};
const BUTTON:Readonly<Partial<Record<Connection["direction"],string>>>={NORTH:"UP",SOUTH:"DOWN",WEST:"LEFT",EAST:"RIGHT"};
const at=(t:Tile):string=>`(${String(t.x)},${String(t.y)})`;
const place=(c:Connection):string=>`${c.destination_name} (map ${String(c.destination[0])}/${String(c.destination[1])})`;

// Every tile, in order; a run of three or more adjacent tiles is named by its two ends.
export function edgePhrase(tiles:readonly Tile[]):string {
 const runs:Tile[][]=[];
 for(const tile of tiles){
  const run=runs.at(-1),last=run?.at(-1);
  if(run!==undefined&&last!==undefined&&Math.abs(tile.x-last.x)+Math.abs(tile.y-last.y)===1)run.push(tile);else runs.push([tile]);
 }
 const parts=runs.flatMap(run=>{const first=run[0],end=run.at(-1);return run.length>=3&&first!==undefined&&end!==undefined?[`any tile from ${at(first)} to ${at(end)}`]:run.map(at);});
 return parts.length===1?parts[0]??"":`${parts.slice(0,-1).join(", ")} or ${parts.at(-1)??""}`;
}

const walking=(topology:Topology|null|undefined):(Connection&{edges:readonly Tile[];button:string})[]=>
 (topology?.connections??[]).flatMap(c=>{const button=BUTTON[c.direction];return button===undefined||c.edges===undefined?[]:[{...c,edges:c.edges,button}];});

// navigate_to refusals: what the nearest reachable tile leads to, when it is an edge tile.
export function edgeNote(topology:Topology|null|undefined,tile:Tile):string|null {
 const c=walking(topology).find(w=>w.edges.some(e=>e.x===tile.x&&e.y===tile.y));
 return c===undefined?null:`, an edge tile of this map: stand on ${at(tile)} and press ${c.button} to walk off the map ${c.direction} to ${place(c)}`;
}

// Supervisor bearings: every walking connection's edge tiles, or null when the state lists none.
export function edgeBearings(topology:Topology|null|undefined):string|null {
 const listed=walking(topology);
 if(listed.length===0)return null;
 return listed.map(c=>`${c.direction} -> ${place(c)}: ${c.edges.length===0?"no tile on this edge can be walked across":`stand on ${edgePhrase(c.edges)} and press ${c.button}`}`).join("; ");
}
