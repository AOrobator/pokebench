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
  it("finds an unclosed media block and a stray close", () => {
    expect(unclosed("@media(x){\n.a{b:c}\n.d{e:f}")).toEqual([1]);
    expect(unclosed(".a{}\n}")).toEqual([-2]);
    expect(unclosed('/* { */ .a{content:"}"}')).toEqual([]);
  });
});
