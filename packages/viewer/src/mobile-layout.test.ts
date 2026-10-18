// @vitest-environment happy-dom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(join(import.meta.dirname, "../static", file), "utf8");

function phoneRules(css: string): string {
  return (css.match(/:root\[data-phone\][^{]*\{[^}]*\}/g) ?? []).join("\n").replace(/\s+/g, " ");
}

describe("phone-width watch deck", () => {
  it("drives every phone rule off the data-phone flag so the breakpoint lives only in phone.ts", () => {
    expect(read("style.css")).not.toMatch(/@media\s*\(\s*max-width:\s*(700|880)px\s*\)/);
    const owners = readdirSync(import.meta.dirname)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) => {
        const source = readFileSync(join(import.meta.dirname, file), "utf8");
        return ["700px", "880px", "800px"].some((width) => source.includes(width));
      });
    expect(owners).toEqual(["phone.ts"]);
  });

  it("keeps the timeline a direct child of the watch deck, after the game stream", () => {
    const document = new DOMParser().parseFromString(read("index.html").replace(/<(script|link)\b[^>]*>(<\/script>)?/g, ""), "text/html");
    const deck = document.querySelector(".watch-deck");
    const children = Array.from(deck?.children ?? [], (el) => el.className);
    expect(children).toEqual(["game-stream", "box lanesBox"]);
    expect(Array.from(document.querySelector(".game-stream")?.children ?? [], (el) => el.className)).toEqual(["gbaStage", "box red side"]);
  });

  it("flattens the game stream so the timeline sits right under the Game Boy and the live panel follows it", () => {
    const rules = phoneRules(read("style.css"));
    expect(rules).toContain(".watch-deck { display:flex; flex-direction:column;");
    expect(rules).toContain(".game-stream { display:contents; }");
    expect(rules).toContain(".game-stream .side { order:1; }");
  });
});

describe("current-run name plates (stats page)", () => {
  const css = read("style.css").replace(/\s+/g, " ");
  it("stacks the plates in one column on a phone and lets every plate shrink instead of overflowing", () => {
    expect(css).toContain(".wb-plates { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr)); gap:12px; }");
    expect(css).toContain("@media(max-width:520px) { .wb-party { padding:9px; } .wb-plates { grid-template-columns:minmax(0,1fr); } }");
    expect(css).toMatch(/\.wb-plate \{[^}]*min-width:0;/);
    expect(css).toMatch(/\.wb-ty>em \{[^}]*overflow-wrap:anywhere;/);
  });
  it("blinks the NEW MILESTONE! chip at a third of the mockup's speed (3.6 s) and not at all under reduced motion", () => {
    expect(css).toMatch(/\.wb-new-chip \{[^}]*animation:wb-new-blink 3\.6s steps\(2\) infinite;/);
    expect(css).toContain("@keyframes wb-new-blink { 50% { opacity:.35; } }");
    expect(css).toContain("@media(prefers-reduced-motion:reduce) { .wb-new-chip { animation:none; } }");
  });
  it("drops the old single-run card styles", () => {
    expect(css).not.toContain(".wb-current {");
    expect(css).not.toContain(".wb-current-go");
  });
});
