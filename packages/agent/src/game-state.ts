import type { Static } from "typebox";
import { Value } from "typebox/value";
import { BattleJournalSchema, BattleTextJournalSchema, BattleWaitSchema, NativeActionJournalSchema, StateBodySchema } from "./events.js";
import { parseTrainerSight, type TrainerSightReply } from "./trainer-sight.js";

export class GameStateError extends Error {
  override readonly name = "GameStateError";
}

export type GameStateSnapshot = Static<typeof StateBodySchema>;

export interface StateSource {
  read(signal?:AbortSignal): Promise<GameStateSnapshot>;
  nativeActions?(after:number):Promise<Static<typeof NativeActionJournalSchema>>;
  battleChoices?(after:number):Promise<Static<typeof BattleJournalSchema>>;
  battleMessages?(after:number,signal?:AbortSignal):Promise<Static<typeof BattleTextJournalSchema>>;
  battleWait?(signal?:AbortSignal):Promise<Static<typeof BattleWaitSchema>>;
  // story-destinations-v1: the game's map table (GET /pokebench/places), validated by its reader.
  places?(signal?:AbortSignal):Promise<unknown>;
  // trainer-sight-check-v1: which planned route tiles an unbeaten trainer can see (POST /pokebench/trainer-sight).
  trainerSight?(mapId:readonly [number,number],tiles:readonly {readonly x:number;readonly y:number}[],signal?:AbortSignal):Promise<TrainerSightReply>;
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

  async nativeActions(after:number):Promise<Static<typeof NativeActionJournalSchema>> {
    const response=await this.fetchFn(`${this.gameServerUrl}/pokebench/actions?after=${String(after)}`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new GameStateError(`Native action journal returned HTTP ${String(response.status)}`);
    const payload:unknown=await response.json();
    if(!Value.Check(NativeActionJournalSchema,payload))throw new GameStateError("Malformed native action journal");
    return payload;
  }

  async battleChoices(after:number):Promise<Static<typeof BattleJournalSchema>> {
    const response=await this.fetchFn(`${this.gameServerUrl}/pokebench/battle/choices?after=${String(after)}`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new GameStateError(`Battle choices journal returned HTTP ${String(response.status)}`);
    const payload:unknown=await response.json();
    if(!Value.Check(BattleJournalSchema,payload))throw new GameStateError("Malformed battle choices journal");
    return payload;
  }

  async battleMessages(after:number,signal?:AbortSignal):Promise<Static<typeof BattleTextJournalSchema>> {
    const response=await this.fetchFn(`${this.gameServerUrl}/pokebench/battle/messages?after=${String(after)}`,{signal:signal===undefined?AbortSignal.timeout(5000):AbortSignal.any([signal,AbortSignal.timeout(5000)])});
    if(!response.ok)throw new GameStateError(`Battle text journal returned HTTP ${String(response.status)}`);
    const payload:unknown=await response.json();
    if(!Value.Check(BattleTextJournalSchema,payload))throw new GameStateError("Malformed battle text journal");
    return payload;
  }

  // Held by the server until the battle needs input or ends, at most 600 emulated frames (about 10 s).
  async battleWait(signal?:AbortSignal):Promise<Static<typeof BattleWaitSchema>> {
    const response=await this.fetchFn(`${this.gameServerUrl}/pokebench/battle/wait`,{signal:signal===undefined?AbortSignal.timeout(30_000):AbortSignal.any([signal,AbortSignal.timeout(30_000)])});
    if(!response.ok)throw new GameStateError(`Battle wait returned HTTP ${String(response.status)}`);
    const payload:unknown=await response.json();
    if(!Value.Check(BattleWaitSchema,payload))throw new GameStateError("Malformed battle wait");
    return payload;
  }

  async places(signal?:AbortSignal):Promise<unknown> {
    const response=await this.fetchFn(`${this.gameServerUrl}/pokebench/places`,{signal:signal===undefined?AbortSignal.timeout(15_000):AbortSignal.any([signal,AbortSignal.timeout(15_000)])});
    if(!response.ok)throw new GameStateError(`Map table returned HTTP ${String(response.status)}`);
    return response.json() as Promise<unknown>;
  }

  async trainerSight(mapId:readonly [number,number],tiles:readonly {readonly x:number;readonly y:number}[],signal?:AbortSignal):Promise<TrainerSightReply> {
    const response=await this.fetchFn(`${this.gameServerUrl}/pokebench/trainer-sight`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({map_id:[mapId[0],mapId[1]],tiles:tiles.map(t=>[t.x,t.y])}),signal:signal===undefined?AbortSignal.timeout(15_000):AbortSignal.any([signal,AbortSignal.timeout(15_000)])});
    if(!response.ok)throw new GameStateError(`Trainer sight returned HTTP ${String(response.status)}`);
    return parseTrainerSight(await response.json());
  }

  async read(signal?:AbortSignal): Promise<GameStateSnapshot> {
    const url = `${this.gameServerUrl}/pokebench/state`;
    const response = await this.fetchFn(url, { signal: signal===undefined ? AbortSignal.timeout(15_000) : AbortSignal.any([signal,AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new GameStateError(`GET ${url} returned HTTP ${String(response.status)}`);
    return parseGameState(await response.json());
  }
}
