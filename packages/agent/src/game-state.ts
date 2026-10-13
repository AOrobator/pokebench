import type { Static } from "typebox";
import { Value } from "typebox/value";
import { StateBodySchema } from "./events.js";

export class GameStateError extends Error {
  override readonly name = "GameStateError";
}

export type GameStateSnapshot = Static<typeof StateBodySchema>;

export interface StateSource {
  read(signal?:AbortSignal): Promise<GameStateSnapshot>;
}

export function parseGameState(body: unknown): GameStateSnapshot {
  if (!Value.Check(StateBodySchema, body)) {
    const [first] = Value.Errors(StateBodySchema, body);
    throw new GameStateError(
      `malformed /pokebench/state at ${first?.instancePath ?? ""}: ${first?.message ?? "unexpected shape"}`,
    );
  }
  return body;
}

export class StateWatcher implements StateSource {
  constructor(
    private readonly gameServerUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async read(signal?:AbortSignal): Promise<GameStateSnapshot> {
    const url = `${this.gameServerUrl}/pokebench/state`;
    const response = await this.fetchFn(url, { signal: signal===undefined ? AbortSignal.timeout(15_000) : AbortSignal.any([signal,AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new GameStateError(`GET ${url} returned HTTP ${String(response.status)}`);
    return parseGameState(await response.json());
  }
}
