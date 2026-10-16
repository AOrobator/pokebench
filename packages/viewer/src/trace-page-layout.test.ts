// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(join(import.meta.dirname, "../static", file), "utf8");
const page = (): Document => new DOMParser().parseFromString(read("index.html").replace(/<(script|link)\b[^>]*>(<\/script>)?/g, ""), "text/html");
const css = read("style.css").replace(/\s+/g, " ");

describe("PokéNav agent trace page", () => {
  it("opens on AGENT TRACE", () => {
    const document = page();
    const pressed = [...document.querySelectorAll<HTMLButtonElement>("[data-page]")].filter((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed.map((button) => button.dataset.page)).toEqual(["trace"]);
    const shown = [...document.querySelectorAll<HTMLElement>("[data-nav-page]")].filter((panel) => !panel.hasAttribute("hidden"));
    expect(shown.map((panel) => panel.dataset.navPage)).toEqual(["trace"]);
  });

  it("lets the trace and inspector grow to the bottom of the PokéNav panel instead of a fixed height", () => {
    expect(page().querySelector("#page-trace .page-content")?.classList.contains("trace-content")).toBe(true);
    expect(css).toContain(".trace-content { display:flex; flex-direction:column; overflow:hidden; }");
    expect(css).toContain(".trace-content .logcols { flex:1; height:auto; min-height:350px; grid-template-rows:minmax(0,1fr); }");
    expect(css).toContain(".trace-content .log,.trace-content .inspector { height:auto; min-height:0; }");
  });

  it("keeps the phone layout's stacked trace and inspector scrollable", () => {
    expect(css).toContain(".trace-content { overflow-y:auto; } .trace-content .logcols { flex:none; grid-template-rows:none; } }");
  });
});
