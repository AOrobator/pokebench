// @vitest-environment happy-dom
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { run as recorded } from "../test-support/workbench.js";
import { Workbench } from "./workbench.js";
import type { WorkbenchData } from "./workbench-data.js";

const run = (id = "run_01") => recorded({ id, measurement: { controller: "agent", features: [], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] } });
const page = readFileSync(join(import.meta.dirname, "../static/workbench.html"), "utf8");
describe("comparison refresh reading position", () => {
  it("retains the version panel scroll across a changed snapshot", async () => {
    document.body.innerHTML = page.slice(page.indexOf("<body") + page.slice(page.indexOf("<body")).indexOf(">") + 1, page.indexOf("</body>"));
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
});
