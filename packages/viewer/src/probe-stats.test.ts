import { describe, expect, it } from "vitest";
import { fisher, gap, grade, laneTail, nyTime, parseKey, pText, sameCall, tally, verdict } from "./probe-stats.js";

const NAV = { tool: "navigate_to", args: { x: 10, y: 19, map_id: [0, 16], because: "find MAY" } };

describe("reading a sampled call", () => {
  it("splits the tool from its JSON arguments, and has no call for text-only or errored replies", () => {
    expect(parseKey('navigate_to {"x":1,"y":2}')).toEqual({ tool: "navigate_to", args: { x: 1, y: 2 } });
    expect(parseKey("observe")).toEqual({ tool: "observe", args: {} });
    expect(parseKey("observe {not json")).toEqual({ tool: "observe", args: {} });
    expect(parseKey('press_buttons ["A"]')).toEqual({ tool: "press_buttons", args: {} });
    expect(parseKey("(text only)")).toBeNull();
    expect(parseKey("(model error: 500)")).toBeNull();
  });
  it("calls two calls the same when the tool and arguments match, ignoring the citation and key order", () => {
    expect(sameCall({ tool: "navigate_to", args: { map_id: [0, 16], y: 19, x: 10, because: "other" } }, NAV)).toBe(true);
    expect(sameCall({ tool: "navigate_to", args: { map_id: [0, 16], y: 18, x: 10 } }, NAV)).toBe(false);
    expect(sameCall({ tool: "press_buttons", args: { x: 10, y: 19, map_id: [0, 16] } }, NAV)).toBe(false);
  });
});

describe("the automatic grade", () => {
  it("is departs, repeats or error, and ungraded when the recorded call is unknown", () => {
    expect(grade('navigate_to {"map_id":[0,16],"x":10,"y":19,"because":"again"}', NAV)).toBe("rep");
    expect(grade('press_buttons {"buttons":["UP","A"]}', NAV)).toBe("dif");
    expect(grade("(text only)", NAV)).toBe("err");
    expect(grade("(model error: timeout)", null)).toBe("err");
    expect(grade("observe", null)).toBe("unk");
  });
  it("counts grades", () => {
    expect(tally(["dif", "dif", "rep", "err", "unk"])).toEqual({ n: 5, dif: 2, rep: 1, err: 1, unk: 1 });
  });
});

describe("statistics", () => {
  it("gives the two-sided Fisher exact p for a 2x2 table", () => {
    expect(fisher(5, 3, 8, 0)).toBeCloseTo(0.2, 3);
    expect(fisher(0, 16, 14, 2)).toBeLessThan(0.001);
    expect(fisher(4, 4, 4, 4)).toBe(1);
    expect(fisher(0, 0, 3, 3)).toBe(1);
    expect(pText(0.2)).toBe("p=0.20");
    expect(pText(0.004)).toBe("p=0.004");
    expect(pText(0.0001)).toBe("p<0.001");
    expect(pText(0.999)).toBe("p=1");
  });
  it("gives the gap in departure rate with a range clamped to ±1", () => {
    const g = gap({ n: 8, dif: 5, rep: 3, err: 0, unk: 0 }, { n: 8, dif: 8, rep: 0, err: 0, unk: 0 });
    expect(g.d).toBeCloseTo(-0.375, 6);
    expect(g.lo).toBeLessThan(g.d);
    expect(g.hi).toBeGreaterThan(g.d);
    expect(g.hi).toBeGreaterThan(0);
    const wide = gap({ n: 1, dif: 0, rep: 1, err: 0, unk: 0 }, { n: 1, dif: 1, rep: 0, err: 0, unk: 0 });
    expect(wide.lo).toBe(-1);
    expect(gap({ n: 0, dif: 0, rep: 0, err: 0, unk: 0 }, { n: 4, dif: 2, rep: 2, err: 0, unk: 0 })).toBeNull();
  });
});

describe("the verdict", () => {
  const t = (dif: number, n: number) => ({ n, dif, rep: n - dif, err: 0, unk: 0 });
  it("says who departs more, and whether the gap could be chance", () => {
    expect(verdict(t(5, 8), t(8, 8), "ON", "OFF")).toEqual({ lead: "OFF departs more", detail: "(ON 5/8 vs OFF 8/8). With 8 samples, a gap this size could still be chance (p=0.20)." });
    expect(verdict(t(16, 16), t(0, 16), "X", "Y")).toEqual({ lead: "X departs more", detail: "(X 16/16 vs Y 0/16). A gap this size is unlikely to be chance (p<0.001)." });
    expect(verdict(t(5, 8), t(5, 8), "ON", "OFF")).toEqual({ lead: "About the same.", detail: "ON 5/8 vs OFF 5/8 depart from the recorded call." });
    expect(verdict(t(0, 0), t(5, 8), "ON", "OFF")).toEqual({ lead: "Waiting for samples.", detail: "" });
  });
});

describe("lane timing", () => {
  const base = { id: "mac", model: "m", completed: 40, planned: 64, started: "2026-10-20T23:20:00.000Z", ended: null, current: "case-02", ceilingMs: 3_600_000 };
  it("names the done time, the ETA, or the ceiling it will hit first, in New York time", () => {
    expect(nyTime("2026-10-20T23:25:46.292Z")).toBe("7:25 PM");
    expect(laneTail({ ...base, state: "complete", ended: "2026-10-20T23:25:46.292Z" }, 3000, Date.parse("2026-10-21T00:00:00Z"))).toBe("done 7:25 PM");
    expect(laneTail({ ...base, state: "running" }, 60_000, Date.parse("2026-10-20T23:50:00Z"))).toBe("ETA 8:14 PM");
    expect(laneTail({ ...base, state: "running" }, 200_000, Date.parse("2026-10-20T23:50:00Z"))).toBe("ceiling 8:20 PM · ~49/64 by then");
    expect(laneTail({ ...base, state: "running", ceilingMs: null }, 0, Date.parse("2026-10-20T23:50:00Z"))).toBe("running");
    expect(laneTail({ ...base, state: "stopped" }, 1000, 0)).toBe("stopped at 40/64");
    expect(laneTail({ ...base, state: "unknown" }, 1000, 0)).toBe("no status yet");
  });
});
