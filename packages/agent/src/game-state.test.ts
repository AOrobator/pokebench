import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GameStateError, StateWatcher, parseGameState } from "./game-state.js";

const SERVER = "http://127.0.0.1:8000";

// Captured from run 2026-10-11T22-16-26_think-swarm_890b (title screen); the
// screenshot field is truncated, the rest is the pinned vendor's real body.
const TITLE: Record<string, unknown> = JSON.parse(
  readFileSync(new URL("./fixtures/vendor-state-title.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

function withParty(party: unknown, where: "player" | "game" = "player"): Record<string, unknown> {
  const body = structuredClone(TITLE) as { player: Record<string, unknown>; game: Record<string, unknown> };
  body[where].party = party;
  body.player.location = "ROUTE 101";
  body.player.position = { x: 7, y: 12 };
  body.game.money = 3000;
  body.game.time = [1, 2, 3];
  body.game.badges = ["Stone", "Knuckle"];
  body.game.game_state = "battle";
  body.game.is_in_battle = true;
  return body;
}

const TORCHIC = {
  species_id: 280,
  species_name: "TORCHIC",
  level: 5,
  current_hp: 9,
  max_hp: 20,
  status: "OK",
  types: ["FIRE"],
  moves: ["SCRATCH", "GROWL"],
  move_pp: [35, 40],
  nickname: "TORCHIC",
};

describe("parseGameState", () => {
  it("parses the title-screen body the pinned vendor returns", () => {
    expect(parseGameState(TITLE)).toEqual({
      location: "TITLE_SEQUENCE",
      position: { x: 0, y: 0 },
      facing: null,
      mode: "overworld",
      in_battle: false,
      party: [],
      money: 0,
      badges: [],
      play_time_s: 0,
    });
  });

  it("maps the party, money, badges and play time", () => {
    expect(parseGameState(withParty([TORCHIC]))).toEqual({
      location: "ROUTE 101",
      position: { x: 7, y: 12 },
      facing: null,
      mode: "battle",
      in_battle: true,
      party: [{ species: "TORCHIC", level: 5, hp: 9, max_hp: 20 }],
      money: 3000,
      badges: ["Stone", "Knuckle"],
      play_time_s: 3723,
    });
  });

  it("falls back to game.party when player.party is absent", () => {
    expect(parseGameState(withParty([TORCHIC], "game")).party).toEqual([
      { species: "TORCHIC", level: 5, hp: 9, max_hp: 20 },
    ]);
  });

  it("reads no position when the vendor reports none", () => {
    const body = structuredClone(TITLE) as { player: Record<string, unknown> };
    delete body.player.position;
    expect(parseGameState(body).position).toBeNull();
  });

  it("never carries the screenshot", () => {
    expect(JSON.stringify(parseGameState(TITLE))).not.toContain("iVBORw0KGgo");
  });

  it.each([
    ["no player", { game: (TITLE as { game: unknown }).game }],
    ["a party member without max_hp", withParty([{ ...TORCHIC, max_hp: undefined }])],
    ["a play time that is not h/m/s", { ...TITLE, game: { ...(TITLE as { game: object }).game, time: [1, 2] } }],
    ["a non-object", "nope"],
  ])("rejects %s", (_label, body) => {
    expect(() => parseGameState(body)).toThrow(GameStateError);
  });
});

describe("StateWatcher", () => {
  it("reads and parses /state from the run's own server", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(TITLE)));
    const snapshot = await new StateWatcher(SERVER, fetchFn).read();
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/state`, expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }));
    expect(snapshot.location).toBe("TITLE_SEQUENCE");
  });

  it("names the path on an HTTP error", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(new StateWatcher(SERVER, fetchFn).read()).rejects.toThrow(`GET ${SERVER}/state returned HTTP 503`);
  });
});
