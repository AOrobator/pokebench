import { expect, it } from "vitest";
import { battleState, semanticState, waitingState } from "./loop/fingerprints.js";
import { cycleState } from "./fixed-point-breaker.js";
import type { GameStateSnapshot } from "./game-state.js";

const legacy = { species: "TORCHIC", level: 16, hp: 49, max_hp: 50, species_id: 280, nickname: "TORCHIC" };
const facts = { attack: 23, defense: 19, speed: 21, sp_attack: 24, sp_defense: 18, ability_num: 1, ability_id: 66, met_location: 16, met_location_name: "ROUTE 101", met_level: 5, met_game: 3, ball: 4, ball_name: "POKé BALL", ot_name: "MAY", ot_gender: "female" as const };
const nulls = Object.fromEntries(Object.keys(facts).map((key) => [key, null]));
const field = (party: GameStateSnapshot["party"]): GameStateSnapshot => ({ screen: "overworld", started: true, name: "A", location: "ROUTE104", map_id: [0, 19], position: { x: 30, y: 58 }, facing: "left", field_controls_locked: false, in_battle: false, party, money: 0, badges: [], play_time_s: 0 });

it("loop fingerprints ignore the party readout's summary-screen facts", () => {
  const known = field([{ ...legacy, ...facts }]), unknown = field([{ ...legacy, ...nulls }]), bare = field([legacy]), boosted = field([{ ...legacy, ...facts, attack: 26 }]);
  for (const s of [unknown, bare, boosted]) expect(semanticState(s, true)).toBe(semanticState(known, true));
  const waiting = (s: GameStateSnapshot): GameStateSnapshot => ({ ...s, active_ui: { selected: null, phase: "start_menu", diagnostic: null, ready: true, controls: "" } });
  expect(waitingState(waiting(unknown))).not.toBeNull();
  expect(waitingState(waiting(unknown))).toBe(waitingState(waiting(known)));
  expect(semanticState(field([{ ...legacy, level: 17 }]), true)).not.toBe(semanticState(bare, true));
});

it("battle fingerprints ignore the party readout's summary-screen facts", () => {
  const battle = (s: GameStateSnapshot): GameStateSnapshot => ({ ...s, in_battle: true, battle: { diagnostic: null } as unknown as NonNullable<GameStateSnapshot["battle"]> });
  expect(battleState(battle(field([{ ...legacy, ...facts }])))).not.toBeNull();
  expect(battleState(battle(field([{ ...legacy, ...nulls }])))).toBe(battleState(battle(field([{ ...legacy, ...facts }]))));
});

it("the short-cycle fingerprint ignores the party readout's summary-screen facts", () => {
  const cycle = (party: GameStateSnapshot["party"]): string | null => cycleState({ v: 1, run: "r", type: "state", seq: 1, turn: 1, t: 0, ...field(party) } as unknown as Parameters<typeof cycleState>[0]);
  const known = cycle([{ ...legacy, ...facts }]);
  expect(known).not.toBeNull();
  for (const party of [[{ ...legacy, ...nulls }], [legacy], [{ ...legacy, ...facts, attack: 26 }]]) expect(cycle(party)).toBe(known);
  expect(cycle([{ ...legacy, ...facts, level: 17 }])).not.toBe(known);
});

it("storage and daycare Pokémon's summary-screen facts stay out of the short-cycle fingerprint", () => {
  const boxed = (mon: Record<string, unknown>): string | null => cycleState({ v: 1, run: "r", type: "state", seq: 1, turn: 1, t: 0, ...field([legacy]), resources: { bag: null, pc_items: null, berry_trees: null, planted_berries: null, diagnostics: [], script_pc: null, script_mode: null, script_status: null, selected_tree_id: null, berry_script_owner: null, storage: { current_box: 0, occupied: [{ box: 0, slot: 0, pokemon: mon }] }, daycare: [{ slot: 0, pokemon: mon, steps: 0, displayed_level: 5 }] } } as unknown as Parameters<typeof cycleState>[0]);
  const known = boxed({ ...legacy, ...facts });
  expect(known).not.toBeNull();
  for (const mon of [{ ...legacy, ...nulls }, legacy, { ...legacy, ...facts, ability_id: 67 }]) expect(boxed(mon)).toBe(known);
  expect(boxed({ ...legacy, level: 17 })).not.toBe(known);
});
