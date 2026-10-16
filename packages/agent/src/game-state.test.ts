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

// battle-text-auto-advance-v1: the battle message window, YES/NO prompt and advance phase (battle_text.py).
type Battle = NonNullable<GameStateSnapshot["battle"]>;
const MESSAGE: NonNullable<Battle["message"]> = { state: "waiting_for_input", render_state: "page_wait", text: "Wild WURMPLE appeared!\n", cursor: 23, identity: "b6c531f15122f7647024660f21f45cc36e8468b1113094cc8ec051fb34d83a4f", diagnostic: null };
const BATTLE: Battle = {
    active: true, initialized: true, phase: "resolving", ready: false, main_func: 0x0803e08d, script_pc: 0x082d9000, battle_type: 4, turn: 1,
    outcome_code: 0, outcome: "ongoing", battlers: [], player_inputs: [], controller_exec_flags: 1, signals: [], current_execution: null,
    diagnostic: null, raw_hex: null,
    message: MESSAGE,
    prompt: null,
    text_phase: "message_waiting",
};
const BATTLE_WAITING: GameStateSnapshot = { ...IN_GAME, screen: "battle", in_battle: true, battle: BATTLE };

describe("battle text state", () => {
  it("accepts the message window, a YES/NO prompt and the advance phase", () => {
    expect(parseGameState(structuredClone(BATTLE_WAITING))).toEqual(BATTLE_WAITING);
    const prompt = { ...BATTLE_WAITING, battle: { ...BATTLE, message: { state: "idle", render_state: null, text: null, cursor: null, identity: null, diagnostic: null }, prompt: { kind: "yes_no", ready: true, selected: "NO" }, text_phase: "prompt" } };
    expect(parseGameState(structuredClone(prompt))).toEqual(prompt);
  });

  it.each([
    ["an unknown message state", { state: "scrolling" }],
    ["an unknown phase", { text_phase: "waiting" }],
    ["an unknown prompt", { prompt: { kind: "evolve", ready: true, selected: "YES" } }],
  ])("rejects %s", (_label, patch) => {
    const body = { ...BATTLE_WAITING, battle: { ...BATTLE, ...("state" in patch ? { message: { ...MESSAGE, ...patch } } : patch) } };
    expect(() => parseGameState(body)).toThrow(GameStateError);
  });

  it("reads the battle text journal after a cursor", async () => {
    const journal = { frame: 9, first_id: 1, last_id: 1, errors: 0, last_error: null, entries: [{ id: 1, frame: 7, recorded_ms: 5, battle: 1, battle_turn: 1, text: "Wild WURMPLE appeared!", waited_for_input: true }] };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(journal)));
    expect(await new StateWatcher(SERVER, fetchFn).battleMessages(0)).toEqual(journal);
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/pokebench/battle/messages?after=0`, expect.anything());
    fetchFn.mockResolvedValue(new Response(JSON.stringify({ ...journal, entries: [{ text: "" }] })));
    await expect(new StateWatcher(SERVER, fetchFn).battleMessages(0, new AbortController().signal)).rejects.toThrow(/Malformed battle text journal/);
    fetchFn.mockResolvedValue(new Response("{}", { status: 409 }));
    await expect(new StateWatcher(SERVER, fetchFn).battleMessages(3)).rejects.toThrow(/HTTP 409/);
  });

  it("waits on the server for the frame the battle needs input", async () => {
    const wait = { reason: "message_waiting", frames: 12, state: BATTLE_WAITING };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(wait)));
    expect(await new StateWatcher(SERVER, fetchFn).battleWait()).toEqual(wait);
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/pokebench/battle/wait`, expect.anything());
    fetchFn.mockResolvedValue(new Response(JSON.stringify({ ...wait, reason: "later" })));
    await expect(new StateWatcher(SERVER, fetchFn).battleWait(new AbortController().signal)).rejects.toThrow(/Malformed battle wait/);
    fetchFn.mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(new StateWatcher(SERVER, fetchFn).battleWait()).rejects.toThrow(/HTTP 404/);
  });
});
