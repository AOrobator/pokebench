// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(join(import.meta.dirname, "../static", file), "utf8");

function phoneRules(css: string): string {
  const blocks: string[] = [];
  for (const match of css.matchAll(/@media\s*\(max-width:\s*700px\)\s*\{/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    blocks.push(css.slice(start, i - 1));
  }
  return blocks.join("\n").replace(/\s+/g, " ");
}

describe("phone-width watch deck", () => {
  it("keeps the timeline a direct child of the watch deck, after the game stream", () => {
    const document = new DOMParser().parseFromString(read("index.html").replace(/<(script|link)\b[^>]*>(<\/script>)?/g, ""), "text/html");
    const deck = document.querySelector(".watch-deck");
    const children = Array.from(deck?.children ?? [], (el) => el.className);
    expect(children).toEqual(["box red objective-strip", "game-stream", "box lanesBox"]);
    expect(Array.from(document.querySelector(".game-stream")?.children ?? [], (el) => el.className)).toEqual(["gbaStage", "box red side"]);
  });

  it("flattens the game stream so the timeline sits right under the Game Boy and the live panel follows it", () => {
    const rules = phoneRules(read("style.css"));
    expect(rules).toContain(".watch-deck { display:flex; flex-direction:column;");
    expect(rules).toContain(".game-stream { display:contents; }");
    expect(rules).toContain(".game-stream .side { order:1; }");
  });
});
