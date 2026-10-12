import { expect, it } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import type { GameStateSnapshot, StateSource } from "./game-state.js";
import { verifyIntro, verifyPreGame, verifyTruck } from "./verify-state.js";

const pre = (screen: string): GameStateSnapshot => ({ ...IN_GAME, screen, started: false, name: null, location: null, position: null, map_id: null, money: null, party: [], badges: [], play_time_s: null });
const truck: GameStateSnapshot = { ...IN_GAME, screen: "overworld", started: true, name: "AAAAAAA", location: "INSIDE OF TRUCK", map_id: [25, 40], position: { x: 2, y: 2 }, money: 3000, party: [], badges: [], field_controls_locked: true };
const source = (...states: GameStateSnapshot[]): StateSource => ({ read: () => Promise.resolve(states.shift() ?? pre("intro")) });

it("verifies the actual pre-game fields, not just a screen label", () => {
  expect(() => { verifyPreGame(pre("naming")); }).not.toThrow();
  for (const change of [{ started: true }, { name: "MILTON" }, { position: { x: 0, y: 0 } }, { location: "PETALBURG CITY" }, { money: 3000 }, { party: IN_GAME.party }]) {
    if ("party" in change && change.party.length === 0) continue;
    expect(() => { verifyPreGame({ ...pre("naming"), ...change }); }).toThrow(/pre-game data/);
  }
});

it("checks the truck map identity, money and lock signal", () => {
  verifyTruck(truck);
  const missingLock = { ...truck }; delete missingLock.field_controls_locked;
  expect(() => { verifyTruck(missingLock); }).toThrow(/truck checkpoint/);
  for (const change of [{ started: false }, { screen: "title" }, { location: "PETALBURG CITY" }, { map_id: [0, 40] as [number, number] }, { map_id: [25, 0] as [number, number] }, { party: IN_GAME.party }, { money: 0 }, { badges: ["STONE"] }, { name: "" }, { name: null }, { position: null }, { field_controls_locked: false }, { field_controls_locked: null }]) {
    expect(() => { verifyTruck({ ...truck, ...change }); }).toThrow(/truck checkpoint/);
  }
});

it("uses bounded A presses and verifies every labelled intro checkpoint", async () => {
  const labels: string[] = [];
  const snapshots = [...["intro", "title", "main_menu", "birch_speech", "naming"].flatMap((s) => [pre(s), pre(s)]), truck, truck];
  const plan = verifyIntro(source(...snapshots), (label) => labels.push(label), 6, () => Promise.resolve());
  const commands = [];
  for await (const command of plan) commands.push(command);
  expect(labels).toEqual(["intro", "title", "main_menu", "birch_speech", "naming", "truck"]);
  expect(commands).toEqual([...Array.from({ length: 5 }, () => [{ action: "observe" }, { action: "press", buttons: ["A"] }]).flat(), { action: "observe" }, { action: "end" }]);
});

it("fails if the protocol jumps over a required labelled screen", async () => {
  const plan = verifyIntro(source(truck), () => undefined, 1, () => Promise.resolve());
  await expect(plan.next()).rejects.toThrow(/missed title/);
});

it("fails at a tiny injected bound without a long live fixture", async () => {
  const plan = verifyIntro(source(), () => undefined, 1, () => Promise.resolve());
  expect((await plan.next()).value).toEqual({ action: "observe" });
  expect((await plan.next()).value).toEqual({ action: "press", buttons: ["A"] });
  await expect(plan.next()).rejects.toThrow(/within 1 presses/);
});
