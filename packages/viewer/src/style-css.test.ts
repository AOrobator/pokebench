import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every block in the shared stylesheet closes where it opened: a lost "}" after a merge
// silently scopes every later rule to the media query above it.
function unclosed(css: string): number[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (s) => " ".repeat(s.length));
  const open: number[] = [], lines = text.split("\n");
  for (const [i, line] of lines.entries()) for (const ch of line) { if (ch === "{") open.push(i + 1); else if (ch === "}") { if (open.pop() === undefined) return [-(i + 1)]; } }
  return open;
}
describe("static/style.css", () => {
  it("closes every block it opens", () => {
    expect(unclosed(readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8"))).toEqual([]);
  });
  it("puts each collapsed legend bar on its own line and spaces the legend from the range toggle", () => {
    const css = readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8");
    expect(css).toMatch(/\.wb-fgx details\.wb-bar \{[^}]*flex:0 0 100%/);
    expect(css).toMatch(/\.wb-fgx \{[^}]*margin-top:14px/);
  });
  it("draws the party HP bar flush: the tag as tall as the bar and sharing its left border, the fill over the whole white interior", () => {
    const css = readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8");
    const body = (selector: string): string => new RegExp(`^${selector.replace(/[.*]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
    const rule = (selector: string): Record<string, number> => {
      const units = (value: string): number => value.trim() === "0" ? 0 : value.trim() === "var(--u)" ? 1 : Number(/^calc\(var\(--u\) \* (\d+)\)$/.exec(value.trim())?.[1] ?? NaN);
      return Object.fromEntries(body(selector).split(";").map((d) => d.split(":")).filter(([k, v]) => k !== undefined && v !== undefined && ["left", "right", "top", "width", "height"].includes(k.trim())).map(([k, v]) => [(k ?? "").trim(), units(v ?? "")]));
    };
    // hp-tag.png is 16x9: rows 0-1 are empty and column 14 is the bar's dark left border, so the tag
    // shows rows 2-8 and columns 0-14 and the frame starts under its last column.
    expect(rule(".pv-hp")).toEqual({ height: 7 });
    expect(rule(".pv-hp .tag")).toEqual({ left: 0, top: 0, width: 15, height: 7 });
    expect(body(".pv-hp .tag")).toContain("url(/sprites/party/parts/hp-tag.png) 0 calc(var(--u) * -2) / calc(var(--u) * 16) calc(var(--u) * 9)");
    expect(rule(".pv-hp .frame")).toEqual({ left: 14, right: 0, top: 0, height: 7 });
    expect(body(".pv-hp .frame::before")).toBe("");
    expect(rule(".pv-hp .track")).toEqual({ left: 15, right: 1, top: 1, height: 5 });
  });
  it("rounds the party HP bar's right end like the game's slot tiles", () => {
    const css = readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8");
    const body = (selector: string): string => new RegExp(`^${selector.replace(/[.*]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
    // sSlotTilemap_Wide's bar end, columns R-1 and R: top/bottom border rows "2." , white rows "d2", track rows "3d".
    // The frame drops its two outer corner pixels, the track (and its fill) drop their inner ones,
    // and the four #737373 pixels sit at (R-1, 0), (R, 1), (R, 5), (R-1, 6).
    expect(body(".pv-hp .frame")).toContain("clip-path: polygon(0 0, calc(100% - var(--u)) 0, calc(100% - var(--u)) var(--u), 100% var(--u), 100% calc(100% - var(--u)), calc(100% - var(--u)) calc(100% - var(--u)), calc(100% - var(--u)) 100%, 0 100%)");
    expect(body(".pv-hp .track")).toContain("clip-path: polygon(0 0, calc(100% - var(--u)) 0, calc(100% - var(--u)) var(--u), 100% var(--u), 100% calc(100% - var(--u)), calc(100% - var(--u)) calc(100% - var(--u)), calc(100% - var(--u)) 100%, 0 100%)");
    const corner = body(".pv-hp .frame::after");
    expect(corner).toContain("right: var(--u); top: 0; width: var(--u); height: var(--u); background: #737373;");
    expect(corner).toContain("box-shadow: var(--u) var(--u) #737373, var(--u) calc(var(--u) * 5) #737373, 0 calc(var(--u) * 6) #737373;");
  });
  it("finds an unclosed media block and a stray close", () => {
    expect(unclosed("@media(x){\n.a{b:c}\n.d{e:f}")).toEqual([1]);
    expect(unclosed(".a{}\n}")).toEqual([-2]);
    expect(unclosed('/* { */ .a{content:"}"}')).toEqual([]);
  });
});
