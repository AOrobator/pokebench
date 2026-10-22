import type { RunEvent } from "@pokebench/agent/events";
import { Log, START, state } from "./events.js";

type Resources = NonNullable<Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }>["resources"]>;
export type BagEntry = readonly [itemId: number, quantity: number, pocket: string, name: string];

export function resources(bag: readonly BagEntry[], pc: readonly BagEntry[] | null = []): Resources {
  const items = (list: readonly BagEntry[]): NonNullable<Resources["bag"]> => list.map(([item_id, quantity, pocket, name], slot) => ({ slot, item_id, quantity, pocket, name }));
  return { bag: items(bag), pc_items: pc === null ? null : items(pc), storage: null, berry_trees: null, planted_berries: null, diagnostics: [], script_pc: null, script_mode: null, script_status: null, selected_tree_id: null, berry_script_owner: null };
}

export function itemChange(turn: number, itemId: number, name: string, before: number, after: number): Extract<Parameters<Log["add"]>[1], { type: "native_action" }> {
  return { type: "native_action", turn, id: turn * 10 + itemId, kind: "item_quantity_changed", frame: turn * 100, server_timestamp: turn, details: { item_id: itemId, item_name: name, before, after, delta: after - before } };
}

const BALL: BagEntry = [4, 5, "poke_balls", "POKé BALL"];
const PC_POTION: BagEntry = [13, 1, "items", "POTION"];

// The shape of run e046's bag: Birch's lab gift, Wally's tutorial swap and restore (party_owner
// "tutorial"), a found ball, a mart buy, then a PC withdrawal, a sale, a use and a deposit.
export function bagRun(): Log {
  const log = new Log();
  let ms = 0;
  const at = (body: Parameters<Log["add"]>[1]): RunEvent => log.add((ms += 100), body);
  at(START);
  at(state({ turn: 0, money: 3000, resources: resources([], [PC_POTION]) }));
  at(itemChange(10, 4, "POKé BALL", 0, 5));
  at(state({ turn: 10, money: 3000, resources: resources([BALL], [PC_POTION]) }));
  at(state({ turn: 19, money: 3000, in_battle: true, party_owner: "tutorial", resources: resources([BALL], [PC_POTION]) }));
  at(itemChange(20, 4, "POKé BALL", 5, 1));
  at(itemChange(20, 13, "POTION", 0, 1));
  at(state({ turn: 20, money: 3000, in_battle: true, party_owner: "tutorial", resources: resources([[13, 1, "items", "POTION"], [4, 1, "poke_balls", "POKé BALL"]], [PC_POTION]) }));
  at(itemChange(22, 4, "POKé BALL", 1, 5));
  at(itemChange(22, 13, "POTION", 1, 0));
  at(state({ turn: 22, money: 3000, in_battle: true, party_owner: "tutorial", resources: resources([BALL], [PC_POTION]) }));
  at(state({ turn: 23, money: 3000, party_owner: "player", resources: resources([BALL], [PC_POTION]) }));
  at(itemChange(30, 3, "GREAT BALL", 0, 1));
  at(state({ turn: 30, money: 3000, resources: resources([BALL, [3, 1, "poke_balls", "GREAT BALL"]], [PC_POTION]) }));
  at(itemChange(40, 4, "POKé BALL", 5, 6));
  at(state({ turn: 40, money: 2800, resources: resources([[4, 6, "poke_balls", "POKé BALL"], [3, 1, "poke_balls", "GREAT BALL"]], [PC_POTION]) }));
  at(itemChange(50, 13, "POTION", 0, 1));
  at(state({ turn: 50, money: 2800, resources: resources([[13, 1, "items", "POTION"], [4, 6, "poke_balls", "POKé BALL"], [3, 1, "poke_balls", "GREAT BALL"]]) }));
  at(itemChange(60, 3, "GREAT BALL", 1, 0));
  at(state({ turn: 60, money: 3100, resources: resources([[13, 1, "items", "POTION"], [4, 6, "poke_balls", "POKé BALL"]]) }));
  at(itemChange(70, 13, "POTION", 1, 0));
  at(state({ turn: 70, money: 3100, in_battle: true, resources: resources([[4, 6, "poke_balls", "POKé BALL"]]) }));
  at(itemChange(80, 4, "POKé BALL", 6, 5));
  at(state({ turn: 80, money: 3100, resources: resources([BALL], [[4, 1, "poke_balls", "POKé BALL"]]) }));
  return log;
}
