import type { GameStateSnapshot } from "./game-state.js";

// The party readout's summary-screen facts (stats, ability, met data, ball, OT) are recorded for
// the viewer's POKéMON PARTY page only: the model's record and every progress or loop check see the party as before.
export const SUMMARY_FACT_KEYS = ["attack", "defense", "speed", "sp_attack", "sp_defense", "ability_num", "ability_id", "met_location", "met_location_name", "met_level", "met_game", "ball", "ball_name", "ot_name", "ot_gender"] as const;
const SUMMARY_FACTS: ReadonlySet<string> = new Set(SUMMARY_FACT_KEYS);

export function legacyParty(party: GameStateSnapshot["party"]): Record<string, unknown>[] {
  return party.map((mon) => Object.fromEntries(Object.entries(mon).filter(([key]) => !SUMMARY_FACTS.has(key))));
}
