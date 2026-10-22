import type {GameStateSnapshot} from "./game-state.js";
// Native owners: evolution_scene.c Task_EvolutionScene / Task_TradeEvolutionScene;
// pokemon_summary_screen.c move-forget/HM-rejection screens. gMain.inBattle can
// remain set after battle hands control to these callbacks. No readiness inferred.
export function nonBattleOwner(s:Pick<GameStateSnapshot,"screen"|"active_ui">):string|null {
 const ui=s.active_ui;
 if(ui?.diagnostic===null&&(ui.phase.startsWith("evolution")||ui.phase==="trade_evolution"||ui.phase==="summary_move_forget"||ui.phase==="summary_hm_rejection"))return ui.phase;
 return s.screen==="evolution"||s.screen==="trade_evolution"?s.screen:null;
}
export function battleOnScreen(s:Pick<GameStateSnapshot,"in_battle"|"screen"|"active_ui">,owned=false):boolean {
 return s.in_battle&&(!owned||nonBattleOwner(s)===null);
}
