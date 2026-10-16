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
    expect(css).toContain(".trace-content { display:flex; flex-direction:column; overflow-y:auto; }");
    expect(css).toContain(".trace-content .logcols { flex:1; height:auto; min-height:350px; grid-template-rows:minmax(0,1fr); }");
    expect(css).toContain(".trace-content .log,.trace-content .inspector { height:auto; min-height:0; }");
  });

  it("keeps the phone layout's stacked trace and inspector scrollable", () => {
    expect(css).toContain(".trace-content .logcols { flex:none; grid-template-rows:none; } }");
  });

  it("swaps the side directory for the page picker at phone width only", () => {
    const picker = page().querySelector(".directory-pages > .page-picker");
    expect(picker?.querySelector('select[data-ui="page-select"][aria-label]')).not.toBeNull();
    expect([...(picker?.querySelectorAll<HTMLButtonElement>("button[data-page-step]") ?? [])].map((button) => button.dataset.pageStep)).toEqual(["-1", "1"]);
    expect(css).toContain(".page-picker { display:none; }");
    expect(css).toContain(".directory-pages { grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(0,1fr); } .page-directory { display:none; } .page-picker { display:flex; }");
  });
});
