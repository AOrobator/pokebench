import { isObject, type JsonObject } from "./json.js";

export type Fetch = (url: string) => Promise<Response>;

export class GameServerError extends Error {
  override readonly name = "GameServerError";
}

export interface Screenshot {
  readonly pngBase64: string;
  readonly step: number;
}

export interface GameState {
  readonly location: string;
  readonly x: number;
  readonly y: number;
  readonly inBattle: boolean;
  readonly badges: number;
  readonly money: number;
  readonly step: number;
}

export interface GameClient {
  screenshot(): Promise<Screenshot>;
  state(): Promise<GameState>;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GBA_WIDTH = 240;
const GBA_HEIGHT = 160;

function obj(value: unknown, where: string): JsonObject {
  if (!isObject(value)) {
    throw new GameServerError(`${where}: expected an object`);
  }
  return value;
}

function int(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new GameServerError(`${where}: expected an integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== "string") {
    throw new GameServerError(`${where}: expected a string`);
  }
  return value;
}

function bool(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") {
    throw new GameServerError(`${where}: expected a boolean, got ${JSON.stringify(value)}`);
  }
  return value;
}

function checkFrame(base64: string): void {
  const bytes = Buffer.from(base64, "base64");
  const isPng =
    bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) && bytes.toString("ascii", 12, 16) === "IHDR";
  if (!isPng) {
    throw new GameServerError("/screenshot: not a PNG");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== GBA_WIDTH || height !== GBA_HEIGHT) {
    throw new GameServerError(`/screenshot: ${String(width)}x${String(height)}, expected 240x160`);
  }
}

export function createGameClient(baseUrl: string, fetchFn: Fetch = fetch): GameClient {
  async function get(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`);
    } catch (error) {
      throw new GameServerError(`GET ${path} failed: ${String(error)}`);
    }
    if (!response.ok) {
      throw new GameServerError(`GET ${path} returned ${String(response.status)}`);
    }
    return response.json();
  }

  return {
    async screenshot() {
      const body = obj(await get("/screenshot"), "/screenshot");
      const pngBase64 = str(body.screenshot_base64, "/screenshot.screenshot_base64");
      checkFrame(pngBase64);
      return { pngBase64, step: int(body.step_number, "/screenshot.step_number") };
    },
    async state() {
      const body = obj(await get("/state"), "/state");
      const player = obj(body.player, "/state.player");
      const position = obj(player.position, "/state.player.position");
      const game = obj(body.game, "/state.game");
      if (!Array.isArray(game.badges)) {
        throw new GameServerError("/state.game.badges: expected a list");
      }
      return {
        location: str(player.location, "/state.player.location"),
        x: int(position.x, "/state.player.position.x"),
        y: int(position.y, "/state.player.position.y"),
        inBattle: bool(game.is_in_battle, "/state.game.is_in_battle"),
        badges: game.badges.length,
        money: int(game.money, "/state.game.money"),
        step: int(body.step_number, "/state.step_number"),
      };
    },
  };
}
