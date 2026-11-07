// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mountBroadcast, type BroadcastDeps, type FrameSocket } from "./broadcast-main.js";

const STAGE = `<html><body><div id="stage"><div data-b="who"></div><div data-b="pill"></div><div data-b="where"></div><img data-b="game"><button data-b="sound" hidden></button><div data-b="cap"><div data-b="say"></div></div><div data-b="think-label"></div><div data-b="think"></div><div data-b="action"></div><div data-b="party"></div><span data-b="clock"></span><div data-b="lane"></div><div data-b="badges"></div><div data-b="cost"></div></div></body></html>`;
const HEADER = { run: "r1", model: "deepseek/deepseek-v4.1-flash", started: "2026-11-06T12:00:00.000Z", kind: "boot", save: null };
const T0 = Date.parse(HEADER.started);
const ITEMS = [
  { k: "state", t: 1, where: "PETALBURG CITY", foe: "NORMAN", badges: ["STONE"], party: [{ name: "MUDKIP", level: 7, hp: 3, maxHp: 20 }] },
  { k: "turn", t: 2, turn: 1 },
  { k: "think", t: 3, turn: 1, d: "Hello there" },
  { k: "use", t: 4, input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
  { k: "tool", t: 4, turn: 1, name: "press", detail: "A" },
  { k: "press", t: 5, b: ["A"] },
  { k: "frame", t: 6, f: "000006_0.png" },
];
const answer = (over: Record<string, unknown> = {}) => ({ header: HEADER, items: ITEMS, next: ITEMS.length, ended: true, commentary: [], rates: { input: 2, output: 0, cacheRead: 0 }, ...over });

function setup(search: string, fetchJson: BroadcastDeps["fetchJson"], over: Partial<BroadcastDeps> = {}) {
  document.documentElement.innerHTML = STAGE;
  document.documentElement.className = "";
  const timers: (() => void)[] = [];
  const shown: string[] = [];
  const deps: BroadcastDeps = {
    search, fetchJson, now: () => T0 + 7_000, width: () => 1920, height: () => 1080,
    after: (_ms, run) => { timers.push(run); },
    show: (_img, src) => { shown.push(src); return Promise.resolve(); },
    laneWidth: () => 600,
    ...over,
  };
  const part = (name: string): HTMLElement => { const el = document.querySelector<HTMLElement>(`[data-b="${name}"]`); if (el === null) throw new Error(name); return el; };
  return { deps, timers, shown, part, mount: () => mountBroadcast(document, deps) };
}

describe("the broadcast page", () => {
  it("renders the named run at ?t and stays there", async () => {
    const s = setup("?run=r1&t=5.5", url => { expect(url).toBe("/api/runs/r1/broadcast?after=0"); return Promise.resolve(answer()); });
    await s.mount();
    expect(s.part("clock").textContent).toBe("0:00:05");
    expect(s.part("who").textContent).toBe("DEEPSEEK V4.1 FLASH");
    expect(s.part("pill").textContent).toBe("FROM BOOT");
    expect(s.part("where").innerHTML).toBe("PETALBURG CITY <b>vs NORMAN</b>");
    expect(s.part("think-label").textContent).toBe("THINKING · turn 1");
    expect(s.part("think").textContent).toBe("Hello there");
    expect(s.part("action").innerHTML).toBe("<code>press</code> A");
    expect(s.part("party").textContent).toContain("MUDKIP");
    expect(s.part("badges").querySelectorAll(".got")).toHaveLength(1);
    expect(s.part("cost").textContent).toBe("$2.00");
    expect(s.part("lane").querySelectorAll(".chip")).toHaveLength(1);
    expect(s.part("cap").hidden).toBe(true);
    expect(s.timers).toHaveLength(0);
  });

  it("shows a dash for cost with no rates, and the caption when a line exists", async () => {
    const s = setup("?run=r1&t=5", () => Promise.resolve(answer({ rates: null, commentary: [{ turn: 1, t: 3, text: "Going in.", wav: "1.wav" }] })));
    await s.mount();
    expect(s.part("cost").textContent).toBe("—");
    expect(s.part("cap").hidden).toBe(false);
    expect(s.part("say").textContent).toBe("“Going in.”");
  });

  it("setTime resolves only after the frame for t is shown", async () => {
    let release = (): void => undefined;
    const s = setup("?run=r1&t=1", () => Promise.resolve(answer()), { show: (_i, src) => new Promise<void>(done => { s.shown.push(src); release = done; }) });
    const page = await s.mount();
    let finished = false;
    const pending = page.setTime(6.5).then(() => { finished = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(s.shown).toEqual(["/api/runs/r1/frames/000006_0.png"]);
    expect(finished).toBe(false);
    release();
    await pending;
    expect(s.part("clock").textContent).toBe("0:00:06");
  });

  it("does not reload a frame already on screen", async () => {
    const s = setup("?run=r1&t=6", () => Promise.resolve(answer()));
    const page = await s.mount();
    await page.setTime(6.1);
    expect(s.shown).toHaveLength(1);
  });

  it("transparent=1 clears the page and never loads the game", async () => {
    const s = setup("?run=r1&t=6.5&transparent=1", () => Promise.resolve(answer()));
    await s.mount();
    expect(document.documentElement.classList.contains("transparent")).toBe(true);
    expect(s.shown).toEqual([]);
  });

  it("with no run follows the newest live one, polling on past its cursor", async () => {
    const urls: string[] = [];
    const s = setup("", url => {
      urls.push(url);
      if (url === "/api/runs") return Promise.resolve([{ id: "2026-a", live: true }, { id: "2026-c", live: false }, { id: "2026-b", live: true }]);
      return Promise.resolve(url.endsWith("after=0") ? answer({ ended: false, header: { ...HEADER, run: "2026-b" } }) : answer({ ended: false, items: [{ k: "press", t: 6.9, b: ["B"] }], next: 8, header: { ...HEADER, run: "2026-b" } }));
    });
    await s.mount();
    expect(urls).toEqual(["/api/runs", "/api/runs/2026-b/broadcast?after=0"]);
    expect(s.part("clock").textContent).toBe("0:00:05");
    await Promise.all(s.timers.splice(0).map(run => { run(); return Promise.resolve(); }));
    await vi.waitFor(() => { expect(urls.at(-1)).toBe("/api/runs/2026-b/broadcast?after=7&lines=0"); });
  });

  it("follow stops polling a run that ends and holds its last moment", async () => {
    const s = setup("?run=r1", () => Promise.resolve(answer({ items: [...ITEMS, { k: "end", t: 6.5 }], next: 8 })));
    await s.mount();
    expect(s.part("clock").textContent).toBe("0:00:06");
    expect(s.timers).toHaveLength(0);
  });

  it("uses live frames while following and falls back to recorded ones when they stop", async () => {
    const handlers: Partial<Record<"message" | "close", (data?: unknown) => void>> = {};
    const socket: FrameSocket = { on: (name, run) => { handlers[name] = run; }, close: vi.fn() };
    const open = vi.fn(() => socket);
    const s = setup("?run=r1", () => Promise.resolve(answer({ ended: false })), { openFrames: open, frameUrl: () => "blob:1" });
    await s.mount();
    expect(open).toHaveBeenCalledWith("/api/runs/r1/frames");
    handlers.message?.(new ArrayBuffer(1));
    await vi.waitFor(() => { expect(s.shown).toContain("blob:1"); });
    handlers.close?.();
    expect(s.timers.length).toBeGreaterThan(0);
  });

  it("retires each live frame's blob even when a newer frame cancels its decode", async () => {
    const handlers: Partial<Record<"message" | "close", (data?: unknown) => void>> = {};
    const socket: FrameSocket = { on: (name, run) => { handlers[name] = run; }, close: vi.fn() };
    let n = 0;
    const s = setup("?run=r1", () => Promise.resolve(answer({ ended: false })), { openFrames: () => socket, frameUrl: () => { n += 1; return `blob:${String(n)}`; }, show: () => Promise.reject(new Error("cancelled")) });
    await s.mount();
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    handlers.message?.(new ArrayBuffer(1));
    handlers.message?.(new ArrayBuffer(1));
    await vi.waitFor(() => { expect(revoke).toHaveBeenCalledWith("blob:1"); });
    revoke.mockRestore();
  });

  it("setTime leaves live frames for good and waits for the recorded frame", async () => {
    const handlers: Partial<Record<"message" | "close", (data?: unknown) => void>> = {};
    const close = vi.fn();
    const socket: FrameSocket = { on: (name, run) => { handlers[name] = run; }, close };
    const s = setup("?run=r1", () => Promise.resolve(answer({ ended: false })), { openFrames: () => socket, frameUrl: () => "blob:1" });
    const fetched = vi.fn(() => Promise.resolve(answer({ ended: false })));
    s.deps.fetchJson = url => url.endsWith("after=0") ? Promise.resolve(answer({ ended: false, next: 7 })) : fetched();
    const page = await s.mount();
    handlers.message?.(new ArrayBuffer(1));
    await page.setTime(6.5);
    expect(close).toHaveBeenCalled();
    expect(s.shown.at(-1)).toBe("/api/runs/r1/frames/000006_0.png");
    handlers.message?.(new ArrayBuffer(1));
    handlers.close?.();
    expect(s.shown.at(-1)).toBe("/api/runs/r1/frames/000006_0.png");
    expect(fetched).toHaveBeenCalled();
  });

  it("setTime during a poll waits its turn, so nothing is added twice", async () => {
    const replies: (() => void)[] = [];
    const more = [{ k: "think", t: 5, turn: 1, d: " again" }];
    const s = setup("?run=r1", url => {
      if (url.endsWith("after=0")) return Promise.resolve(answer({ ended: false }));
      const after = Number(/after=(\d+)/.exec(url)?.[1]), items = after < ITEMS.length + 1 ? more : [];
      return new Promise(done => { replies.push(() => { done(answer({ ended: false, items, next: ITEMS.length + 1 })); }); });
    });
    const page = await s.mount();
    s.timers.splice(0).forEach(run => { run(); });
    await vi.waitFor(() => { expect(replies).toHaveLength(1); });
    const held = page.setTime(5.5);
    await Promise.resolve();
    expect(replies).toHaveLength(1);
    replies[0]?.();
    await vi.waitFor(() => { expect(replies).toHaveLength(2); });
    replies[1]?.();
    await held;
    expect(s.part("think").textContent).toBe("Hello there again");
  });

  it("two setTime calls on one frame both wait for its decode", async () => {
    let release = (): void => undefined;
    const s = setup("?run=r1&t=1", () => Promise.resolve(answer()), { show: () => new Promise<void>(done => { release = done; }) });
    const page = await s.mount();
    let second = false;
    void page.setTime(6.5);
    const later = page.setTime(6.6).then(() => { second = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(second).toBe(false);
    release();
    await later;
  });

  it("a frame that will not load fails the held moment, and can be tried again", async () => {
    let fail = true;
    const s = setup("?run=r1&t=1", () => Promise.resolve(answer()), { show: () => fail ? Promise.reject(new Error("no frame")) : Promise.resolve() });
    const page = await s.mount();
    await expect(page.setTime(6.5)).rejects.toThrow("no frame");
    fail = false;
    await expect(page.setTime(6.5)).resolves.toBeUndefined();
  });

  it("following rides over a frame that will not load", async () => {
    const s = setup("?run=r1", () => Promise.resolve(answer({ ended: false })), { show: () => Promise.reject(new Error("no frame")) });
    await expect(s.mount()).resolves.toBeDefined();
  });

  it("clears the picture when stepping back before the first frame", async () => {
    const s = setup("?run=r1&t=6.5", () => Promise.resolve(answer()));
    const page = await s.mount();
    s.part("game").setAttribute("src", "x");
    await page.setTime(1);
    expect(s.part("game").hasAttribute("src")).toBe(false);
  });

  it("reports a bad t, a missing run and no live run instead of hanging", async () => {
    await expect(setup("?run=r1&t=abc", () => Promise.resolve(answer())).mount()).rejects.toThrow(/t must be/);
    await expect(setup("?run=r1", () => Promise.reject(new Error("HTTP 404"))).mount()).rejects.toThrow(/404/);
    await expect(setup("", () => Promise.resolve([{ id: "x", live: false }])).mount()).rejects.toThrow(/no live run/);
  });

  it("scales the stage to fit a smaller window", async () => {
    const s = setup("?run=r1&t=1", () => Promise.resolve(answer()), { width: () => 960, height: () => 1080 });
    await s.mount();
    expect(document.querySelector<HTMLElement>("#stage")?.style.transform).toBe("scale(0.5)");
  });

  it("uses the badge sprites when all of them load, and the discs otherwise", async () => {
    const asked: string[][] = [];
    const s = setup("?run=r1&t=5.5", () => Promise.resolve(answer()), { badgeSprites: urls => { asked.push([...urls]); return Promise.resolve(true); } });
    await s.mount();
    expect(asked[0]).toHaveLength(8);
    expect(s.part("badges").querySelectorAll("img")).toHaveLength(8);
    const missing = setup("?run=r1&t=5.5", () => Promise.resolve(answer()), { badgeSprites: () => Promise.resolve(false) });
    await missing.mount();
    expect(missing.part("badges").querySelectorAll("img")).toHaveLength(0);
    expect(missing.part("badges").querySelectorAll(".got")).toHaveLength(1);
  });

  describe("live captions and sound", () => {
    const said = { turn: 1, t: 2, text: "Going north.", wav: "t000001.wav", said: 6 };
    const later = { turn: 2, t: 6, text: "Heading home.", wav: "t000002.wav", said: 7 };
    function live(search: string, polls: Record<string, unknown>[] = []) {
      const played: string[] = [];
      let stopped = 0, unlocked = 0;
      const s = setup(search, url => url.endsWith("after=0") ? Promise.resolve(answer({ ended: false })) : Promise.resolve(answer({ ended: false, items: [], ...(polls.shift() ?? {}) })), {
        speak: { unlock: () => { unlocked += 1; }, play: url => { played.push(url); return new Promise<void>(() => undefined); }, stop: () => { stopped += 1; } },
      });
      return { ...s, played, stops: () => stopped, unlocks: () => unlocked, button: () => s.part("sound") as HTMLButtonElement, run: () => { for (const timer of s.timers.splice(0)) timer(); } };
    }

    it("offers sound only in live follow mode", async () => {
      const follow = live("?run=r1");
      await follow.mount();
      expect(follow.button().hidden).toBe(false);
      for (const search of ["?run=r1&t=5", "?run=r1&transparent=1", "?run=r1&voice=0"]) {
        const quiet = live(search);
        await quiet.mount();
        expect(quiet.button().hidden).toBe(true);
      }
      const ended = setup("?run=r1", () => Promise.resolve(answer()), { speak: { unlock: () => undefined, play: () => Promise.resolve(), stop: () => undefined } });
      await ended.mount();
      expect(ended.part("sound").hidden).toBe(true);
    });

    it("shows a new caption as it arrives, long after its turn began", async () => {
      const s = live("?run=r1", [{ commentary: [said] }]);
      await s.mount();
      expect(s.part("cap").hidden).toBe(true);
      s.run();
      await vi.waitFor(() => { s.run(); expect(s.part("say").textContent).toBe("“Going north.”"); });
      expect(s.played).toEqual([]);
    });

    it("asks for only the lines it has not seen", async () => {
      const urls: string[] = [];
      const polls = [{ commentary: [said] }];
      const s = setup("?run=r1", url => { urls.push(url); return Promise.resolve(answer({ ended: false, ...(url.endsWith("after=0") ? {} : { items: [], ...(polls.shift() ?? {}) }) })); });
      await s.mount();
      await vi.waitFor(() => { for (const timer of s.timers.splice(0)) timer(); expect(urls.at(-1)).toContain("lines=1"); });
    });

    it("plays lines one at a time after the click and hides the button", async () => {
      const s = live("?run=r1", [{ commentary: [said, later] }]);
      await s.mount();
      await vi.waitFor(() => { s.run(); expect(s.part("say").textContent).not.toBe(""); });
      s.button().click();
      expect(s.button().hidden).toBe(true);
      s.run();
      expect(s.played).toEqual(["/api/runs/r1/commentary/t000001.wav"]);
    });

    it("unlocks sound in the click even with no line waiting", async () => {
      const s = live("?run=r1");
      await s.mount();
      s.button().click();
      expect(s.unlocks()).toBe(1);
      expect(s.played).toEqual([]);
    });

    it("goes silent when a moment is held", async () => {
      const s = live("?run=r1", [{ commentary: [said] }]);
      const page = await s.mount();
      await vi.waitFor(() => { s.run(); expect(s.part("say").textContent).not.toBe(""); });
      s.button().click();
      await page.setTime(3);
      expect(s.stops()).toBe(1);
      expect(s.button().hidden).toBe(true);
    });

    it("works with no speaker at all", async () => {
      const s = setup("?run=r1", () => Promise.resolve(answer({ ended: false })));
      await s.mount();
      expect(s.part("sound").hidden).toBe(true);
    });
  });
});
