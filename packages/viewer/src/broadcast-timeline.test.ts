import { describe, expect, it } from "vitest";
import type { BroadcastItem } from "./broadcast-feed.js";
import { BroadcastTimeline, clockText, scrollFraction, thinkingTail } from "./broadcast-timeline.js";

const MON = { name: "SWAMPERT", level: 45, hp: 24, maxHp: 159 };
const ITEMS: BroadcastItem[] = [
  { k: "state", t: 1, where: "FORTREE CITY GYM", foe: null, badges: ["STONE"], party: [MON] },
  { k: "turn", t: 2, turn: 1 },
  { k: "think", t: 3, turn: 1, d: "Let " },
  { k: "think", t: 4, turn: 1, d: "me think" },
  { k: "use", t: 5, input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0 },
  { k: "tool", t: 5, turn: 1, name: "press", detail: "A" },
  { k: "press", t: 6, b: ["A"] },
  { k: "frame", t: 7, f: "000007_0.png" },
  { k: "turn", t: 8, turn: 2 },
  { k: "state", t: 8, where: "ROUTE 120", foe: "WINONA", badges: ["STONE", "KNUCKLE"], party: [] },
  { k: "thought", t: 9, turn: 2, d: "Second" },
  { k: "use", t: 9, input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
  { k: "mile", t: 9, name: "FEATHER_BADGE" },
  { k: "frame", t: 10, f: "000010_0.png" },
];
const line = (turn: number, t: number) => ({ turn, t, text: `line ${String(turn)}`, wav: `${String(turn)}.wav` });
const rates = { input: 1, output: 2, cacheRead: 0.5 };
const timeline = (): BroadcastTimeline => { const b = new BroadcastTimeline(); b.add(ITEMS); return b; };

describe("the broadcast timeline", () => {
  it("shows the state, frame and action at or before t", () => {
    const b = timeline();
    expect(b.view(0.5, [], null)).toMatchObject({ where: null, frame: null, action: null, party: [], badges: [] });
    expect(b.view(7.5, [], null)).toMatchObject({ where: "FORTREE CITY GYM", foe: null, frame: "000007_0.png", action: { name: "press", detail: "A" }, party: [MON], badges: ["STONE"] });
    expect(b.view(10, [], null)).toMatchObject({ where: "ROUTE 120", foe: "WINONA", frame: "000010_0.png" });
  });

  it("streams a turn's thinking up to t and keeps the last thought until a new one starts", () => {
    const b = timeline();
    expect(b.view(2, [], null).think).toBeNull();
    expect(b.view(3.5, [], null).think).toEqual({ turn: 1, text: "Let ", start: 3, end: 9 });
    expect(b.view(8.5, [], null).think).toEqual({ turn: 1, text: "Let me think", start: 3, end: 9 });
    expect(b.view(9, [], null).think).toEqual({ turn: 2, text: "Second", start: 9, end: null });
  });

  it("scrolls a thought from its top, holding first and reaching its end before the next one", () => {
    expect(scrollFraction(10, 10, 30)).toBe(0);
    expect(scrollFraction(13, 10, 30)).toBe(0);
    expect(scrollFraction(20, 10, 30)).toBeCloseTo(0.5);
    expect(scrollFraction(27, 10, 30)).toBe(1);
    expect(scrollFraction(40, 10, 30)).toBe(1);
    expect(scrollFraction(5, 10, 30)).toBe(0);
    expect(scrollFraction(20, 10, null)).toBeCloseTo(0.5);
    expect(scrollFraction(10, 10, 10)).toBe(1);
  });

  it("adds up cost from usage so far, and has none without rates", () => {
    const b = timeline();
    expect(b.view(1, [], rates).cost).toBe(0);
    expect(b.view(5, [], rates).cost).toBeCloseTo(3.5);
    expect(b.view(10, [], rates).cost).toBeCloseTo(4.5);
    expect(b.view(10, [], null).cost).toBeNull();
  });

  it("counts recorded dollars when the run has them, with or without rates", () => {
    const b = timeline();
    b.add([{ k: "usd", t: 4, usd: 1.25 }, { k: "usd", t: 9, usd: 2.5 }]);
    expect(b.view(3, [], null).cost).toBe(0);
    expect(b.view(5, [], null).cost).toBe(1.25);
    expect(b.view(10, [], rates).cost).toBe(2.5);
  });

  it("captions only the current turn, once its line's time has come", () => {
    const b = timeline();
    expect(b.view(2.5, [line(1, 3)], null).caption).toBeNull();
    expect(b.view(4, [line(1, 3)], null).caption).toBe("line 1");
    expect(b.view(8.5, [line(1, 3)], null).caption).toBeNull();
    expect(b.view(9, [line(1, 3), line(2, 8.5)], null).caption).toBe("line 2");
  });

  it("gives the last minute of marks and knows where a finished run ends", () => {
    const b = new BroadcastTimeline();
    expect(b.end).toBeNull();
    b.add([{ k: "press", t: 1, b: ["A"] }, { k: "tool", t: 2, turn: 1, name: "x", detail: "" }, { k: "mile", t: 3, name: "M" }, { k: "press", t: 70, b: ["B"] }, { k: "end", t: 80 }]);
    expect(b.end).toBe(80);
    const v = b.view(61, [], null);
    expect(v.presses.map(p => p.t)).toEqual([1]);
    expect(v.tools.map(p => p.t)).toEqual([2]);
    expect(v.miles.map(p => p.name)).toEqual(["M"]);
    expect(b.view(62, [], null).presses).toEqual([]);
    expect(b.view(75, [], null).presses.map(p => p.t)).toEqual([70]);
  });

  it("accepts items in more than one batch", () => {
    const b = new BroadcastTimeline();
    b.add(ITEMS.slice(0, 4));
    b.add(ITEMS.slice(4));
    expect(b.view(4, [], null).think?.text).toBe("Let me think");
  });
});

describe("broadcast text", () => {
  it("writes the clock as h:mm:ss with no limit", () => {
    expect(clockText(0)).toBe("0:00:00");
    expect(clockText(4656.3)).toBe("1:17:36");
    expect(clockText(90_061)).toBe("25:01:01");
  });

  it("keeps the tail of long thinking from a word start, as paragraphs", () => {
    expect(thinkingTail("one\n\n\ntwo\n  \nthree")).toEqual(["one", "two", "three"]);
    const tail = thinkingTail(`${"word ".repeat(400)}end`, 100);
    expect(tail.join("").length).toBeLessThanOrEqual(100);
    expect(tail.join("").startsWith("word ")).toBe(true);
    expect(tail.join("").endsWith("end")).toBe(true);
  });
});
