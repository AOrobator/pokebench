// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { glyphPixels, paintGameText, parseGameFont, type GameFont, type GlyphSheet } from "./game-font.js";

function sheet(): GlyphSheet {
  const data = new Uint8ClampedArray(256 * 512 * 4);
  const set = (x: number, y: number, rgb: [number, number, number]): void => { const i = (y * 256 + x) * 4; data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; };
  set(16, 1, [255, 0, 0]); set(17, 1, [0, 255, 0]); // glyph 1: a foreground pixel and its shadow
  set(32 + 0, 2, [255, 0, 0]); // glyph 2: one foreground pixel on the row below
  return { width: 256, height: 512, data };
}
const FONT: GameFont = { widths: Array.from({ length: 512 }, (_, i) => (i === 1 || i === 2 ? 2 : 3)), cmap: { a: 1, b: 2 } };
const px = (p: { width: number; data: Uint8ClampedArray }, x: number, y: number): number[] => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

describe("the game font", () => {
  it("parses the art build's glyph table and refuses anything else", () => {
    expect(parseGameFont({ widths: FONT.widths, cmap: { a: 1 } })).not.toBeNull();
    for (const bad of [null, { widths: [1], cmap: {} }, { widths: FONT.widths, cmap: { a: -1 } }, { widths: FONT.widths.map(() => 99), cmap: {} }, { widths: FONT.widths, cmap: { ab: 1 } }]) expect(parseGameFont(bad)).toBeNull();
  });
  it("draws glyphs at the game's 1x with foreground and shadow colours", () => {
    const p = glyphPixels(FONT, sheet(), "ab", [1, 2, 3], [4, 5, 6], 0);
    expect(p.width).toBe(2 + 2 + 2); expect(p.height).toBe(14);
    expect(px(p, 0, 0)).toEqual([1, 2, 3, 255]); expect(px(p, 1, 0)).toEqual([4, 5, 6, 255]); expect(px(p, 2, 1)).toEqual([1, 2, 3, 255]); expect(px(p, 3, 3)).toEqual([0, 0, 0, 0]);
  });
  it("heavier strokes widen each foreground pixel by one; no shadow leaves it out", () => {
    const p = glyphPixels(FONT, sheet(), "a", [1, 2, 3], null, 1);
    expect(p.width).toBe(2 + 1 + 2); expect(px(p, 0, 0)).toEqual([1, 2, 3, 255]); expect(px(p, 1, 0)).toEqual([1, 2, 3, 255]); expect(px(p, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(glyphPixels(FONT, sheet(), "?", [1, 2, 3], null, 0).width).toBe(3 + 2);
  });
  it("paints each placeholder once, at the card's scale, keeping the text for screen readers", () => {
    document.body.innerHTML = '<div><span data-gt="ab" data-c="tab" data-h="14" data-b="1">ab</span><span data-gt="a" data-c="nope" data-h="12">a</span></div>';
    const drawn: string[] = [];
    paintGameText(document.body, FONT, sheet(), (canvas, pixels) => { drawn.push(`${String(canvas.width)}x${String(canvas.height)}:${String(pixels.width)}`); });
    expect(drawn).toEqual(["8x14:8"]);
    const span = document.querySelector<HTMLElement>('[data-gt="ab"]'); expect(span?.dataset.painted).toBe("1"); expect(span?.querySelector("canvas")?.style.width).toBe("calc(var(--u) * 8)"); expect(span?.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true"); expect(span?.textContent).toBe("ab");
    paintGameText(document.body, FONT, sheet(), () => { drawn.push("again"); });
    expect(drawn).toEqual(["8x14:8"]);
  });
  it("paints only the placeholders a selector picks, so two fonts can share a page", () => {
    document.body.innerHTML = '<span data-gt="a" data-c="pv-slot" data-f="s">a</span><span data-gt="b" data-c="pv-dark" data-f="n">b</span>';
    const drawn: string[] = [];
    paintGameText(document.body, FONT, sheet(), (canvas) => { drawn.push(canvas.closest<HTMLElement>("[data-gt]")?.dataset.gt ?? canvas.parentElement?.dataset.gt ?? "?"); }, '[data-gt][data-f="s"]');
    expect(document.querySelector('[data-f="s"]')?.getAttribute("data-painted")).toBe("1");
    expect(document.querySelector('[data-f="n"]')?.getAttribute("data-painted")).toBeNull();
    expect(drawn).toHaveLength(1);
  });
});
