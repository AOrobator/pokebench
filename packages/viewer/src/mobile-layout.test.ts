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
    // Substring scan, any context: an @media, a bare declaration, or a comment
    // mentioning a breakpoint width outside phone.ts all fail here. One read
    // per fixture; every assertion runs against the in-memory string.
    const widths = ["700px", "880px", "800px"];
    const staticSources = ["style.css", "human.css", "index.html", "play.html", "workbench.html"].map((file) => [file, read(file)] as const);
    for (const [file, source] of staticSources) {
      for (const width of widths) expect(source, `${file} mentions ${width}`).not.toContain(width);
    }
    const sources = readdirSync(import.meta.dirname)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => [file, readFileSync(join(import.meta.dirname, file), "utf8")] as const);
    expect(sources.filter(([, source]) => widths.some((width) => source.includes(width))).map(([file]) => file)).toEqual(["phone.ts"]);
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

describe("current-run trainer cards", () => {
  it("has no obsolete name-plate CSS and lets current cards shrink", () => {
    const css = read("style.css");
    expect(css).not.toContain(".wb-plate"); expect(css).not.toContain(".wb-ty"); expect(css).not.toContain("wb-new-blink");
    expect(css).toContain("width:min(100%, 400px)"); expect(css).toContain(".wb-card .wb-button { overflow-wrap:anywhere; }");
  });
});