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

it("validates owned interface state and preserves historical absence", () => {
  const active_ui = {phase:"name_confirmation",selected:"NO",ready:true,controls:"B declines",diagnostic:null};
  expect(parseGameState({...PRE_GAME,active_ui}).active_ui).toEqual(active_ui);
  expect(() => parseGameState({...PRE_GAME,active_ui:{...active_ui,ready:"true"}})).toThrow(/active_ui/);
  expect(() => parseGameState({...PRE_GAME,active_ui:{...active_ui,diagnostic:12}})).toThrow(/active_ui/);
  expect(parseGameState(PRE_GAME).active_ui).toBeUndefined();
});

it("propagates parent cancellation into a state read deadline",async()=>{
 let request:AbortSignal|null|undefined;
 const fetchFn:typeof fetch=(_input,init)=>{request=init?.signal;return Promise.resolve(new Response(JSON.stringify(IN_GAME)));};
 const stop=new AbortController();await new StateWatcher("http://127.0.0.1",fetchFn).read(stop.signal);stop.abort();expect(request?.aborted).toBe(true);
});

it('accepts optional nullable gym trainer fields without changing older story payloads',()=>{
 const story={name_confirmed:true,intro_stage:7,rival_stage:4,birch_lab_stage:5,petalburg_gym_stage:2,woods_stage:1,clock_set:true,rival_battle_won:true,pokedex_received:true,running_shoes_received:true,starter_tutorial_complete:true,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
 expect(parseGameState({...IN_GAME,story}).story).toEqual(story);
 const extended={...story,rustboro_josh_defeated:true,rustboro_tommy_defeated:false,rustboro_marc_defeated:null};
 expect(parseGameState({...IN_GAME,story:extended}).story).toEqual(extended);
 expect(()=>parseGameState({...IN_GAME,story:{...extended,rustboro_marc_defeated:'won'}})).toThrow('malformed');
});
