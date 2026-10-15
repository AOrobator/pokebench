import { describe, expect, it, vi } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { gameTools, observeTool, pressTool, type Clock } from "./game-tools.js";
import { SCREEN_SETTLE_BOUND_MS, SCREEN_SETTLE_POLL_MS, screenReader, settleScreen, type ScreenFacts } from "./screen-settle.js";

const SERVER = "http://127.0.0.1:8000";

function png(): string {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(240, 16);
  bytes.writeUInt32BE(160, 20);
  return bytes.toString("base64");
}

function fakeClock(): Clock & { slept: number[]; t: number } {
  const clock = { slept: [] as number[], t: 0, now: () => clock.t, sleep: (ms: number) => { clock.slept.push(ms); clock.t += ms; return Promise.resolve(); } };
  return clock;
}

function source(sequence: readonly (ScreenFacts | undefined)[]): { read: () => Promise<ScreenFacts | undefined>; polls: () => number } {
  let i = 0;
  return { read: () => Promise.resolve(sequence[Math.min(i++, sequence.length - 1)]), polls: () => i };
}

const FADING: ScreenFacts = { fading: true, black: false };
const BLACK: ScreenFacts = { fading: false, black: true };
const CLEAR: ScreenFacts = { fading: false, black: false };

describe("settleScreen", () => {
  it("adds no wait when the screen is not fading or black", async () => {
    const clock = fakeClock();
    const facts = source([CLEAR]);
    expect(await settleScreen(facts.read, clock)).toEqual({ settled: true, waitedMs: 0, polls: 1 });
    expect(clock.slept).toEqual([]);
  });

  it("waits while a palette fade is active, polling every 50 ms", async () => {
    const clock = fakeClock();
    const facts = source([FADING, FADING, FADING, CLEAR]);
    expect(await settleScreen(facts.read, clock)).toEqual({ settled: true, waitedMs: 150, polls: 4 });
    expect(clock.slept).toEqual([SCREEN_SETTLE_POLL_MS, SCREEN_SETTLE_POLL_MS, SCREEN_SETTLE_POLL_MS]);
  });

  it("also waits through the black loading frames between fade-out and fade-in (c497 turn 411 shape)", async () => {
    const clock = fakeClock();
    const facts = source([BLACK, BLACK, FADING, FADING, CLEAR]);
    expect(await settleScreen(facts.read, clock)).toEqual({ settled: true, waitedMs: 200, polls: 5 });
  });

  it("stops at the bound when the screen never settles", async () => {
    const clock = fakeClock();
    const facts = source([FADING]);
    const result = await settleScreen(facts.read, clock);
    expect(result.settled).toBe(false);
    expect(result.waitedMs).toBe(SCREEN_SETTLE_BOUND_MS);
    expect(SCREEN_SETTLE_BOUND_MS).toBe(1500);
    expect(clock.slept.every(ms => ms === SCREEN_SETTLE_POLL_MS)).toBe(true);
    expect(facts.polls()).toBe(SCREEN_SETTLE_BOUND_MS / SCREEN_SETTLE_POLL_MS + 1);
  });

  it("gives up silently when the server cannot report the screen", async () => {
    const clock = fakeClock();
    expect(await settleScreen(source([undefined]).read, clock)).toEqual({ settled: true, waitedMs: 0, polls: 1 });
    expect(clock.slept).toEqual([]);
  });

  it("stops when the run is stopped", async () => {
    const clock = fakeClock();
    const controller = new AbortController();
    const read = () => { controller.abort(); return Promise.resolve(FADING); };
    await expect(settleScreen(read, clock, controller.signal)).rejects.toThrow();
  });
});

describe("screenReader", () => {
  const reply = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("reads /pokebench/screen", async () => {
    const fetchFn = reply({ fading: true, black: false });
    expect(await screenReader(SERVER, fetchFn)()).toEqual({ fading: true, black: false });
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/pokebench/screen`, expect.anything());
  });

  it("is unavailable for an older server, an error or a malformed body", async () => {
    expect(await screenReader(SERVER, reply({}, 404))()).toBeUndefined();
    expect(await screenReader(SERVER, reply({ fading: "yes" }))()).toBeUndefined();
    expect(await screenReader(SERVER, vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")))()).toBeUndefined();
  });

  it("does not swallow a stopped run", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(screenReader(SERVER, fetchFn)(AbortSignal.abort())).rejects.toThrow();
  });
});

function server(screen: () => ScreenFacts, calls: string[]): typeof fetch {
  const table: Record<string, () => unknown> = {
    "/pokebench/state": () => IN_GAME,
    "/action": () => ({ status: "success" }),
    "/queue_status": () => ({ queue_empty: true }),
    "/pokebench/screen": screen,
    "/pokebench/observation": () => ({ state_text: "Screen: bag_menu", screenshot_base64: png(), state: IN_GAME }),
  };
  return vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.slice(SERVER.length);
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const route = table[path];
    return Promise.resolve(route === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(route())));
  });
}

const noHooks = { beforePress: () => undefined, afterPress: () => Promise.resolve() };

describe("production wiring", () => {
  it("press captures its observation only after the fade ends", async () => {
    const calls: string[] = [];
    let polls = 0;
    const clock = fakeClock();
    const fetchFn = server(() => (++polls <= 2 ? FADING : CLEAR), calls);
    await pressTool(SERVER, noHooks, fetchFn, clock).execute("p", { buttons: ["A"] });
    expect(calls).toEqual([
      "GET /pokebench/state", "POST /action", "GET /queue_status",
      "GET /pokebench/screen", "GET /pokebench/screen", "GET /pokebench/screen",
      "GET /pokebench/observation",
    ]);
    expect(clock.slept).toEqual([150, 50, 50]);
  });

  it("observe settles the same way (navigate_to's final observation goes through observe)", async () => {
    const calls: string[] = [];
    let polls = 0;
    const clock = fakeClock();
    await observeTool(SERVER, server(() => (++polls <= 1 ? BLACK : CLEAR), calls), undefined, undefined, clock).execute("o", {});
    expect(calls).toEqual(["GET /pokebench/screen", "GET /pokebench/screen", "GET /pokebench/observation"]);
    expect(clock.slept).toEqual([50]);
  });

  it("gameTools passes its clock to both tools", async () => {
    const calls: string[] = [];
    const clock = fakeClock();
    const [observe, press] = gameTools(SERVER, noHooks, server(() => FADING, calls), undefined, clock);
    await observe.execute("o", {});
    expect(clock.t).toBe(SCREEN_SETTLE_BOUND_MS);
    await press.execute("p", { buttons: ["B"] });
    expect(clock.t).toBe(2 * SCREEN_SETTLE_BOUND_MS + 150);
    expect(calls.at(-1)).toBe("GET /pokebench/observation");
  });

  it("adds about nothing when no fade is running: one screen poll, no sleep", async () => {
    const calls: string[] = [];
    const clock = fakeClock();
    await observeTool(SERVER, server(() => CLEAR, calls), undefined, undefined, clock).execute("o", {});
    expect(calls).toEqual(["GET /pokebench/screen", "GET /pokebench/observation"]);
    expect(clock.slept).toEqual([]);
    const started = performance.now();
    await observeTool(SERVER, server(() => CLEAR, []), undefined, undefined, clock).execute("o", {});
    expect(performance.now() - started).toBeLessThan(50);
  });
});
