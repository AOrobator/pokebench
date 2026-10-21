import type {GameStateSnapshot} from "./game-state.js";
type State=Pick<GameStateSnapshot,"exit_sections">;
export function sectionWarp(state:State,x:number,y:number,on:boolean):string|null {
 return on?state.exit_sections?.warps.find(w=>w.x===x&&w.y===y)?.label??null:null;
}
export function sectionConnection(state:State,c:{readonly direction:string;readonly offset:number;readonly destination:readonly number[]},on:boolean):string|null {
 return on?state.exit_sections?.connections.find(e=>e.direction===c.direction&&e.offset===c.offset&&e.destination[0]===c.destination[0]&&e.destination[1]===c.destination[1])?.label??null:null;
}
