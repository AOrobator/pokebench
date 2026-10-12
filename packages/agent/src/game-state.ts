import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { StateBodySchema } from "./events.js";

export class GameStateError extends Error {
  override readonly name = "GameStateError";
}

export type GameStateSnapshot = Static<typeof StateBodySchema>;

export interface StateSource {
  read(): Promise<GameStateSnapshot>;
}

const PartyMon = Type.Object({
  species_name: Type.String(),
  level: Type.Integer({ minimum: 0 }),
  current_hp: Type.Integer({ minimum: 0 }),
  max_hp: Type.Integer({ minimum: 0 }),
});

const Party = Type.Optional(Type.Union([Type.Array(PartyMon), Type.Null()]));

// Only the fields the state event keeps; visual.screenshot_base64 is never read.
const VendorState = Type.Object({
  player: Type.Object({
    location: Type.String(),
    position: Type.Optional(Type.Union([Type.Object({ x: Type.Integer(), y: Type.Integer() }), Type.Null()])),
    party: Party,
  }),
  game: Type.Object({
    money: Type.Integer({ minimum: 0 }),
    game_state: Type.String(),
    is_in_battle: Type.Boolean(),
    time: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 3, maxItems: 3 }),
    badges: Type.Array(Type.String()),
    party: Party,
  }),
});

export function parseGameState(body: unknown): GameStateSnapshot {
  if (!Value.Check(VendorState, body)) {
    const [first] = Value.Errors(VendorState, body);
    throw new GameStateError(`malformed /state at ${first?.instancePath ?? ""}: ${first?.message ?? "unexpected shape"}`);
  }
  const { player, game } = body;
  const [hours = 0, minutes = 0, seconds = 0] = game.time;
  const position = player.position ?? null;
  return {
    location: player.location,
    position: position === null ? null : { x: position.x, y: position.y },
    // The pinned vendor comments facing out as unreliable (memory_reader.py).
    facing: null,
    mode: game.game_state,
    in_battle: game.is_in_battle,
    party: (player.party ?? game.party ?? []).map((mon) => ({
      species: mon.species_name,
      level: mon.level,
      hp: mon.current_hp,
      max_hp: mon.max_hp,
    })),
    money: game.money,
    badges: [...game.badges],
    play_time_s: hours * 3600 + minutes * 60 + seconds,
  };
}

export class StateWatcher implements StateSource {
  constructor(
    private readonly gameServerUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async read(): Promise<GameStateSnapshot> {
    const url = `${this.gameServerUrl}/state`;
    const response = await this.fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new GameStateError(`GET ${url} returned HTTP ${String(response.status)}`);
    return parseGameState(await response.json());
  }
}
