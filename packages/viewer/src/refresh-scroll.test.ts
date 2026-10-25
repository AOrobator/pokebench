// @vitest-environment happy-dom
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { run as recorded } from "../test-support/workbench.js";
import { Workbench } from "./workbench.js";
import type { WorkbenchData } from "./workbench-data.js";

const run = (id = "run_01") => recorded({ id, measurement: { controller: "agent", features: [], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] } });
const page = readFileSync(join(import.meta.dirname, "../static/workbench.html"), "utf8");
const body = page.slice(page.indexOf("<body>") + 6, page.indexOf("</body>"));
describe("comparison refresh reading position", () => {
  it("retains the version panel scroll across a changed snapshot", async () => {
    document.body.innerHTML = body;
    let data: WorkbenchData = { version: 1, at: 1000, milestones: [], problems: [], runs: [run()] };
    const wb = new Workbench(document, { fetchSnapshot: () => Promise.resolve(data), now: () => 6000, width: () => 640 });
    try {
      await wb.refresh();
      document.querySelector<HTMLElement>("[data-legend-toggle]")?.click();
      const panel = document.querySelector<HTMLElement>(".wb-vpanel"); if (panel === null) throw Error("no version panel");
      panel.scrollTop = 150; panel.scrollLeft = 10;
      data = { ...data, at: 2000, runs: [run(), run("second")] };
      await wb.refresh();
      expect(document.querySelector<HTMLElement>(".wb-vpanel")).not.toBe(panel);
      expect(document.querySelector<HTMLElement>(".wb-vpanel")?.scrollTop).toBe(150);
      expect(document.querySelector<HTMLElement>(".wb-vpanel")?.scrollLeft).toBe(10);
    } finally { wb.destroy(); }
  });
  it.each(["panel", "page"] as const)("anchors the visible version in the %s scroller when a refresh inserts a row above it", async (owner) => {
    document.body.innerHTML = body;
    let data: WorkbenchData = { version: 1, at: 1000, milestones: [], problems: [], runs: ["B", "C", "D"].map(model => ({ ...run(model), model })) };
    const wb = new Workbench(document, { fetchSnapshot: () => Promise.resolve(data), now: () => 6000, width: () => 640 });
    const style = document.createElement("style"); style.textContent = `.wb-vpanel { overflow-y: ${owner === "page" ? "visible" : "auto"}; }`; document.head.append(style);
    const rect = (top: number, height: number): DOMRect => ({ x: 0, y: top, width: 100, height, top, right: 100, bottom: top + height, left: 0, toJSON: () => ({}) });
    const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".wb-vpanel")) return rect(0, 100);
      const panel = this.closest<HTMLElement>(".wb-vpanel");
      return panel !== null && this.matches(".wb-ver") ? rect([...panel.querySelectorAll(".wb-ver")].indexOf(this) * 80 - (owner === "page" ? document.scrollingElement?.scrollTop ?? 0 : panel.scrollTop), 80) : rect(0, 0);
    });
    try {
      await wb.refresh(); document.querySelector<HTMLElement>("[data-legend-toggle]")?.click();
      const panel = document.querySelector<HTMLElement>(".wb-vpanel"); if (panel === null) throw Error("no version panel");
      const scroller = owner === "page" ? document.scrollingElement : panel; if (scroller === null) throw Error("no scroller"); scroller.scrollTop = 90;
      data = { ...data, at: 2000, runs: [{ ...run("A"), model: "A" }, ...data.runs] };
      await wb.refresh();
      expect(owner === "page" ? document.scrollingElement?.scrollTop : document.querySelector<HTMLElement>(".wb-vpanel")?.scrollTop).toBe(170);
    } finally { geometry.mockRestore(); style.remove(); if (document.scrollingElement !== null) document.scrollingElement.scrollTop = 0; wb.destroy(); }
  });

});
