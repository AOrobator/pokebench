import type { GameStateSnapshot } from "./game-state.js";

// pokeemerald 731ad5bf, RustboroCity_Gym_EventScript_Roxanne and
// RustboroCity_Gym_Text_RoxanneIntro. The opponent ID alone survives whiteout.
export function roxanneFirstInteraction(s: GameStateSnapshot): boolean | null {
  if (!s.started || s.screen === "unknown" || s.screen === "field_transition" || s.map_id === null) return null;
  if (s.map_id[0] !== 11 || s.map_id[1] !== 3) return false;
  if (s.in_battle) return s.trainer_opponent?.battle_active === true ? s.trainer_opponent.trainer_id === 265 : null;
  if (s.field_controls_locked === false) return false;
  const context = s.world_context;
  if (s.field_controls_locked !== true || context?.message == null || context.message_diagnostic !== undefined || context.dialogue == null) return null;
  return context.dialogue.replaceAll("\n", " ").startsWith("Hello, I am ROXANNE, the RUSTBORO POKéMON GYM LEADER.");
}
