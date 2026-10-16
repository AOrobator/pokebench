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
  it("finds an unclosed media block and a stray close", () => {
    expect(unclosed("@media(x){\n.a{b:c}\n.d{e:f}")).toEqual([1]);
    expect(unclosed(".a{}\n}")).toEqual([-2]);
    expect(unclosed('/* { */ .a{content:"}"}')).toEqual([]);
  });
});
