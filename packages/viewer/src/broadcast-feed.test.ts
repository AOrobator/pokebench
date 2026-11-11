import { describe, expect, it } from "vitest";
import { parseBroadcast } from "./broadcast-feed.js";

const OK = { header: { run: "r", model: "m/x", started: "2026-11-06T14:36:04.547-05:00", kind: "boot", save: null }, items: [{ k: "press", t: 1, b: ["A"] }], next: 1, ended: false, commentary: [{ turn: 1, t: 2, text: "Hi", wav: "1.wav" }], rates: null };

describe("the broadcast feed guard", () => {
  it("accepts the server's answer", () => {
    expect(parseBroadcast(OK)).toEqual(OK);
    expect(parseBroadcast({ ...OK, rates: { input: 1, output: 2, cacheRead: 3 } }).rates).toEqual({ input: 1, output: 2, cacheRead: 3 });
    expect(parseBroadcast({ ...OK, items: [{ k: "usd", t: 1, usd: 0.5 }] }).items).toEqual([{ k: "usd", t: 1, usd: 0.5 }]);
  });

  it.each([null, 1, {}, { ...OK, header: null }, { ...OK, items: {} }, { ...OK, next: "1" }, { ...OK, ended: 0 }, { ...OK, commentary: null }, { ...OK, rates: 3 }, { ...OK, items: [{ k: "press" }] }, { ...OK, items: [{ t: 1 }] }])("refuses %j", value => {
    expect(() => parseBroadcast(value)).toThrow(/broadcast/);
  });
});
