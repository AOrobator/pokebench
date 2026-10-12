import { describe, expect, it } from "vitest";
import { GameServerError, createGameClient, type Fetch } from "./game.js";

function png(width: number, height: number): string {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString("base64");
}

function fakeFetch(routes: Record<string, unknown>, status = 200): { fetch: Fetch; urls: string[] } {
  const urls: string[] = [];
  const fetch: Fetch = (url) => {
    urls.push(String(url));
    const path = new URL(String(url)).pathname;
    return Promise.resolve(new Response(JSON.stringify(routes[path] ?? null), { status }));
  };
  return { fetch, urls };
}

const STATE = {
  step_number: 7,
  player: { location: "LITTLEROOT TOWN", position: { x: 5, y: 8 } },
  game: { is_in_battle: false, badges: ["STONE"], money: 3000 },
};

describe("createGameClient", () => {
  it("returns a validated 240x160 screenshot", async () => {
    const { fetch, urls } = fakeFetch({ "/screenshot": { screenshot_base64: png(240, 160), step_number: 3 } });
    const shot = await createGameClient("http://127.0.0.1:8000", fetch).screenshot();
    expect(shot).toEqual({ pngBase64: png(240, 160), step: 3 });
    expect(urls).toEqual(["http://127.0.0.1:8000/screenshot"]);
  });

  it.each([
    ["wrong size", { screenshot_base64: png(100, 100), step_number: 1 }],
    ["not a PNG", { screenshot_base64: Buffer.from("GIF89a-and-more-bytes-to-pad-it-out").toString("base64"), step_number: 1 }],
    ["missing data", { step_number: 1 }],
    ["fractional step", { screenshot_base64: png(240, 160), step_number: 1.5 }],
  ])("rejects a screenshot with %s", async (_label, body) => {
    const { fetch } = fakeFetch({ "/screenshot": body });
    await expect(createGameClient("http://127.0.0.1:8000", fetch).screenshot()).rejects.toThrow(GameServerError);
  });

  it("returns a typed state summary", async () => {
    const { fetch } = fakeFetch({ "/state": STATE });
    expect(await createGameClient("http://127.0.0.1:8000", fetch).state()).toEqual({
      location: "LITTLEROOT TOWN",
      x: 5,
      y: 8,
      inBattle: false,
      badges: 1,
      money: 3000,
      step: 7,
    });
  });

  it.each([
    ["no player", { ...STATE, player: null }],
    ["a string x", { ...STATE, player: { location: "A", position: { x: "5", y: 8 } } }],
    ["non-list badges", { ...STATE, game: { ...STATE.game, badges: 1 } }],
    ["a numeric battle flag", { ...STATE, game: { ...STATE.game, is_in_battle: 0 } }],
  ])("rejects a state with %s", async (_label, body) => {
    const { fetch } = fakeFetch({ "/state": body });
    await expect(createGameClient("http://127.0.0.1:8000", fetch).state()).rejects.toThrow(GameServerError);
  });

  it("turns an HTTP error into a GameServerError naming the path", async () => {
    const { fetch } = fakeFetch({}, 500);
    await expect(createGameClient("http://127.0.0.1:8000", fetch).state()).rejects.toThrow(/\/state.*500/);
  });

  it("turns a network failure into a GameServerError", async () => {
    const fetch: Fetch = () => Promise.reject(new TypeError("fetch failed"));
    await expect(createGameClient("http://127.0.0.1:8000", fetch).screenshot()).rejects.toThrow(GameServerError);
  });
});
