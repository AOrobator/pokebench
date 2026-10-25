// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fillCards, loadCardArt, syncCards } from "./card-dom.js";
import type { LoadedArt } from "./card-dom.js";
import type { CardInput } from "./trainer-card.js";
import type { PlateFacts } from "./workbench-view.js";

const MANIFEST = { version: 1, tiers: ["green", "bronze", "copper", "silver", "gold"], trainers: ["may"], icons: [280], egg: 412, proof: {}, source: {} };
const FONT = { widths: Array.from({ length: 512 }, () => 4), cmap: { A: 1 } };
const FACTS: PlateFacts = { live: true, elapsed: 61_000, reached: null, level: 0, total: 45, recovered: false, fresh: false, cap: 120_000 };

describe("trainer card art", () => {
  it("publishes usable art before the optional font finishes", async () => {
    const font = Promise.withResolvers<unknown>();
    const ready = Promise.withResolvers<NonNullable<Awaited<ReturnType<typeof loadCardArt>>>>();
    const loading = loadCardArt(url => url.endsWith("manifest.json") ? Promise.resolve(MANIFEST) : font.promise, undefined, ready.resolve);
    // Observe the immediate callback without a timing-based race or leaving a pending promise on failure.
    await Promise.resolve();
    let early: Awaited<typeof ready.promise> | null = null;
    void ready.promise.then(value => { early = value; });
    await Promise.resolve();
    const beforeFont = early;
    font.resolve(FONT);
    await loading;
    expect(beforeFont).toMatchObject({ art: { trainers: ["may"] }, font: null, glyphs: null });
  });

  it("publishes usable card art while the optional font image is still pending", async () => {
    let finish: ((value: null) => void) | undefined;
    const glyphs = new Promise<null>(resolve => { finish = resolve; });
    const ready: LoadedArt[] = [];
    const loading = loadCardArt(url => Promise.resolve(url.endsWith("manifest.json") ? MANIFEST : FONT), () => glyphs, value => { ready.push(value); });
    await Promise.resolve(); await Promise.resolve();
    expect(ready).toHaveLength(1);
    expect(ready[0]?.art.trainers).toEqual(["may"]);
    expect(ready[0]?.font).toBeNull();
    finish?.(null);
    expect((await loading)?.font).not.toBeNull();
  });
  it("loads the manifest, font and glyph sheet, or nothing when the art was never built", async () => {
    const sheet = { width: 256, height: 512, data: new Uint8ClampedArray(4) };
    const loaded = await loadCardArt((url) => Promise.resolve(url.endsWith("manifest.json") ? MANIFEST : FONT), () => Promise.resolve(sheet));
    expect(loaded?.art.trainers).toEqual(["may"]); expect(loaded?.font).not.toBeNull(); expect(loaded?.glyphs).toBe(sheet);
    expect(await loadCardArt(() => Promise.reject(new Error("404")))).toBeNull();
    expect(await loadCardArt(() => Promise.resolve({ version: 2 }))).toBeNull();
    const noFont = await loadCardArt((url) => (url.endsWith("manifest.json") ? Promise.resolve(MANIFEST) : Promise.reject(new Error("404"))));
    expect(noFont?.art).not.toBeUndefined(); expect(noFont?.font).toBeNull(); expect(noFont?.glyphs).toBeNull();
  });
});

describe("card rows", () => {
  const card = (id: string, text: string): string => `<div class="wrap"><a class="tc tc-wide" href="#${id}" data-watch="${id}">${text}<span data-clock></span><i data-time-bar></i></a></div>`;
  it("replaces only the cards whose markup changed, adds and removes the rest, and keeps focus on a redrawn card", () => {
    document.body.innerHTML = '<div id="row"></div>';
    const row = document.getElementById("row") as HTMLElement, memo = new WeakMap<Element, string>();
    syncCards(row, [card("a", "1"), card("b", "1")], memo);
    const [a, b] = Array.from(row.children);
    syncCards(row, [card("a", "1"), card("b", "2")], memo);
    expect(row.children[0]).toBe(a); expect(row.children[1]).not.toBe(b);
    (row.querySelector('[data-watch="b"]') as HTMLElement).focus();
    syncCards(row, [card("a", "1"), card("b", "3"), card("c", "1")], memo);
    expect(row.children).toHaveLength(3); expect(document.activeElement).toBe(row.querySelector('[data-watch="b"]'));
    syncCards(row, [card("a", "1")], memo);
    expect(row.children).toHaveLength(1); expect(row.children[0]).toBe(a);
  });
  it("restores a refreshed Watch link without scrolling its page or sheet", () => {
    document.body.innerHTML = '<div id="row"></div>';
    const row = document.getElementById("row") as HTMLElement, memo = new WeakMap<Element, string>();
    syncCards(row, [card("a", "before")], memo);
    (row.querySelector('[data-watch="a"]') as HTMLElement).focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      syncCards(row, [card("a", "after")], memo);
      expect(document.activeElement).toBe(row.querySelector('[data-watch="a"]'));
      expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    } finally { focus.mockRestore(); }
  });
  it("fills each card's clock and time bar in place and paints game text when the font is loaded", () => {
    document.body.innerHTML = `<div id="row">${card("a", '<span class="gtx" data-gt="A" data-c="tab" data-h="14">A</span>')}</div>`;
    const row = document.getElementById("row") as HTMLElement, drawn: number[] = [];
    const input = { runId: "a", facts: FACTS } as unknown as CardInput;
    fillCards([row], [input], null, () => undefined);
    expect(row.querySelector("[data-clock]")?.textContent).toBe("1:01/2:00"); expect(row.querySelector<HTMLElement>("[data-time-bar]")?.style.width).toBe("50.8%");
    expect(row.querySelector("[data-painted]")).toBeNull();
    fillCards([row], [input], { art: { trainers: ["may"], icons: new Set(), egg: 412 }, font: FONT, glyphs: { width: 256, height: 512, data: new Uint8ClampedArray(256 * 512 * 4) } }, (_c, p) => { drawn.push(p.width); });
    expect(drawn).toHaveLength(1); expect(row.querySelector("[data-painted]")).not.toBeNull();
  });
});
