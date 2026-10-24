import type {GameStateSnapshot} from "./game-state.js";

const POCKETS = new Set(["ITEMS","POKE BALLS","TMS HMS","BERRIES","KEY ITEMS"]);
const integer = (value:unknown,low:number,high:number):value is number => typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;

// Only the verified input owner and list cursor can establish bag equivalence.
export function bagListState(state:GameStateSnapshot) {
 const ui=state.active_ui;
 if(state.screen!=="bag_menu" || ui?.phase!=="bag_menu" || ui.ready!==true || ui.diagnostic!==null || ui.selected===null)return null;
 const d=ui.details,pocket=d?.["pocket"],location=d?.["bag_location"],owner=d?.["owner_task"],index=d?.["selected_index"],item=d?.["list_item_id"];
 if(typeof pocket!=="string" || !POCKETS.has(pocket) || !integer(location,0,11) || !integer(owner,0,15) || !integer(index,0,65535) || !integer(item,-2,65535) || item===-1)return null;
 return {pocket,location,index,item,selected:ui.selected};
}
