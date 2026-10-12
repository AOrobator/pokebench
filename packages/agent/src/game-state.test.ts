import { describe, expect, it, vi } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { GameStateError, StateWatcher, parseGameState, type GameStateSnapshot } from "./game-state.js";

const SERVER = "http://127.0.0.1:8000";


const PRE_GAME: GameStateSnapshot = {
  screen: "naming",
  started: false,
  name: null,
  location: null,
  map_id: null,
  position: null,
  facing: null,
  in_battle: false,
  party: [],
  money: null,
  badges: [],
  play_time_s: null,
};

describe("parseGameState", () => {
  it.each([
    ["in game", IN_GAME],
    ["before the game starts", PRE_GAME],
  ])("accepts the RAM reader's state %s", (_label, body) => {
    expect(parseGameState(structuredClone(body))).toEqual(body);
  });

  it.each([
    ["a missing screen", { ...IN_GAME, screen: undefined }, /screen/],
    ["an extra vendor field", { ...IN_GAME, mode: "overworld" }, /mode|additional/i],
    ["a negative level", { ...IN_GAME, party: [{ species: "X", level: -1, hp: 1, max_hp: 1 }] }, /party/],
  ])("rejects %s", (_label, body, message) => {
    expect(() => parseGameState(body)).toThrow(GameStateError);
    expect(() => parseGameState(body)).toThrow(message);
  });
});

describe("StateWatcher", () => {
  it("reads PokeBench's own /pokebench/state", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(IN_GAME)));
    expect(await new StateWatcher(SERVER, fetchFn).read()).toEqual(IN_GAME);
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/pokebench/state`, expect.anything());
  });

  it("names the HTTP status on failure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(new StateWatcher(SERVER, fetchFn).read()).rejects.toThrow(/\/pokebench\/state returned HTTP 503/);
  });
});
