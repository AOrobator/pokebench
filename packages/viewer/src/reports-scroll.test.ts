import { describe, expect, it } from "vitest";
import { reportScrollProbe } from "./reports-scroll.js";

interface Sent { readonly data: unknown; readonly target: string }
function fakeWindow(scrollHeight: number, innerHeight: number) {
  const sent: Sent[] = [], listeners = new Map<string, () => void>(), observed: unknown[] = [];
  let resized: (() => void) | null = null;
  const win = {
    scrollY: 0, innerHeight,
    document: { documentElement: { scrollHeight } },
    parent: { postMessage: (data: unknown, target: string) => { sent.push({ data, target }); } },
    addEventListener: (type: string, fn: () => void) => { listeners.set(type, fn); },
    ResizeObserver: class { constructor(fn: () => void) { resized = fn; } observe(el: unknown): void { observed.push(el); } },
  };
  return { win, sent, listeners, observed, resize: () => { resized?.(); } };
}

describe("the scroll probe the viewer adds to a report", () => {
  it("tells the viewer how far down the report is when it loads, scrolls, resizes or changes size", () => {
    const f = fakeWindow(2000, 500);
    reportScrollProbe(f.win as unknown as Window);
    expect(f.sent).toEqual([{ data: { pokebenchReportScroll: 0 }, target: "*" }]);
    f.win.scrollY = 600; f.listeners.get("scroll")?.();
    f.win.scrollY = 1500; f.listeners.get("resize")?.();
    f.win.scrollY = 1600; f.listeners.get("load")?.();
    f.win.document.documentElement.scrollHeight = 3500; f.resize();
    expect(f.sent.map(s => s.data)).toEqual([{ pokebenchReportScroll: 0 }, { pokebenchReportScroll: 0.4 }, { pokebenchReportScroll: 1 }, { pokebenchReportScroll: 1 }, { pokebenchReportScroll: 0.5 }]);
    expect(f.observed).toEqual([f.win.document.documentElement]);
  });
  it("calls a report that fits the window fully read", () => {
    const f = fakeWindow(400, 500);
    reportScrollProbe(f.win as unknown as Window);
    expect(f.sent[0]?.data).toEqual({ pokebenchReportScroll: 1 });
  });
  it("runs from its own source text, as the viewer injects it", () => {
    const f = fakeWindow(1000, 500);
    f.win.scrollY = 250;
    // The viewer sends exactly this text, so the function must need nothing from its module.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("window", `(${reportScrollProbe.toString()})(window);`)(f.win);
    expect(f.sent[0]?.data).toEqual({ pokebenchReportScroll: 0.5 });
  });
});
