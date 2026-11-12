import { describe, expect, it } from "vitest";
import { html } from "./html.js";
import { page, type Shell } from "./layout.js";

const shell: Shell = { sections: ["home", "results"], githubUrl: "https://github.com/example/pokebench", footer: html`<p>foot</p>` };

describe("page", () => {
  it("marks only the current section and links the others", () => {
    const out = page(shell, { title: "Results", description: "d", section: "results", crumbs: ["RESULTS"], depth: 0, body: html`<p>b</p>` });
    expect(out).toContain('<a class="m-home" href="index.html"><span');
    expect(out).toContain('<a class="m-results" href="results.html" aria-current="page">');
  });

  it("makes every site link relative to a nested page", () => {
    const out = page(shell, { title: "A", description: "d", section: "results", crumbs: ["MODELS", "A & B"], depth: 1, body: html`` });
    expect(out).toContain('href="../site.css"');
    expect(out).toContain('href="../index.html" class="mark"');
    expect(out).toContain('<a class="m-home" href="../index.html">');
    expect(out).toContain("<span>A &amp; B</span>");
  });
});
