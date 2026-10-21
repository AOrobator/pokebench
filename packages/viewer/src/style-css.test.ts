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
    expect(body(".pv-hp .frame::before")).toContain("inset: var(--u)");
    expect(rule(".pv-hp .track")).toEqual({ left: 15, right: 1, top: 1, height: 5 });
  });
  it("finds an unclosed media block and a stray close", () => {
    expect(unclosed("@media(x){\n.a{b:c}\n.d{e:f}")).toEqual([1]);
    expect(unclosed(".a{}\n}")).toEqual([-2]);
    expect(unclosed('/* { */ .a{content:"}"}')).toEqual([]);
  });
});
