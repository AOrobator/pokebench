// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, expect, it } from "vitest";
import { Workbench } from "./workbench.js";
import { run } from "../test-support/frontier-run.js";
import { HUMAN_REFERENCE } from "./frontier.js";
const html = readFileSync(new URL("../static/workbench.html", import.meta.url), "utf8");
function ui(name: string): HTMLElement { const node = document.querySelector<HTMLElement>(`[data-wb="${name}"]`); if (node === null) throw new Error(name); return node; }
function change(name: string, value: string): void { (ui(name) as HTMLSelectElement).value = value; ui(name).dispatchEvent(new Event("change", { bubbles: true })); }
beforeEach(() => { document.documentElement.innerHTML = html.replace(/<!doctype html>/i, "").replace(/<link[^>]+>/g, "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""); });
it("keeps both reference lines across empty model/cohort filters and exposes recorded raw/evidence/hash detail", async () => {
  const measurement = { controller: "agent" as const, features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 120000, evidence: [18] }] };
  const data = { version: 1, at: 1000, milestones: [{ id: "PLAYER_NAME_CONFIRMED", label: "Name" }], runs: [Object.assign(run({ id: "dea1" }), { measurement }), Object.assign(run({ id: HUMAN_REFERENCE, cohort: null, model: "Human · Operator" }), { measurement: { ...measurement, controller: "human", pausedMs: 53869, rawSplits: [{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 173869, evidence: [18] }] } }), run({ id: "no-splits", model: "Other", cohort: "empty", splits: [] })], queue: [], problems: [] };
  const wb = new Workbench(document, { fetchSnapshot: () => Promise.resolve(data), now: () => 1000, width: () => 340 });
  await wb.refresh(); change("model", "Other"); change("cohort", "empty");
  expect(ui("frontier-full").querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(1);
  expect(ui("frontier-full").querySelectorAll('[data-run="dea1"]')).toHaveLength(1);
  expect(ui("frontier-early").querySelectorAll('[data-run="dea1"]')).toHaveLength(1);
  expect(ui("frontier-notes").textContent).toContain("exploration");
  expect(ui("frontier-notes").textContent).toContain("53.869");
  const mark = ui("frontier-full").querySelector(`[data-run="${HUMAN_REFERENCE}"]`);
  mark?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(ui("detail").hidden).toBe(false); expect(ui("detail-body").textContent).toContain("2:53.869");
  expect(ui("detail-body").textContent).toContain("#18"); expect(ui("detail-body").textContent).toContain("a".repeat(64));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  change("cohort", "all"); change("model", "all"); change("overlay", "none");
  expect(ui("frontier-full").querySelector('[data-run="no-splits"]')).toBeNull();
  expect(ui("frontier-full").querySelector('[data-run="dea1"]')).not.toBeNull();
  wb.destroy();
});
