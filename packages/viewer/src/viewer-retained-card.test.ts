// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { mountApp, type AppDeps } from "./app.js";
import { parseWorkbench, type WorkbenchRun } from "./workbench-data.js";
import { BASE_MS, must } from "../test-support/events.js";

it("retains missing card projections but hides unreachable sessions and recovers live presentation", async () => {
  const page = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8");
  document.body.innerHTML = page.slice(page.indexOf("<body>") + 6, page.indexOf("</body>"));
  const id = "retained-card", other = "other-card", historical = "historical-offline";
  const choice = (run: string) => ({ id: run, model: "fixture", started: "2026-10-11T22:00:00-04:00", ended: false, reason: null, problem: null, live: true });
  const choices = [choice(id), choice(other), { ...choice(historical), live: false }];
  const run = (run: string): WorkbenchRun => ({ id: run, cohort: null, arm: null, model: "fixture", started: null, status: "live", reason: null, problem: null, excluded: null, elapsedMs: 1000, turn: 1, config: null, splits: [], card: { name: "MAY", location: "OLDALE TOWN", party: [{ speciesId: 280, level: 7, egg: false }] } });
  const selected = run(id), snapshot = { version: 1, at: BASE_MS, milestones: [], problems: [], runs: [selected, run(other), { ...run(historical), status: "unresponsive" as const }] };
  let now = BASE_MS + 1000;
  const deps: AppDeps = {
    hash: `#run=${id}`, now: () => now,
    fetchJson: url => {
      if (url === "/api/runs") return Promise.resolve(choices);
      if (url.startsWith("/api/cards")) return Promise.resolve(structuredClone(snapshot));
      if (url === "/sprites/manifest.json") return Promise.resolve({ version: 1, tiers: ["green", "bronze", "copper", "silver", "gold"], trainers: ["may"], icons: [280], egg: 412 });
      if (url === "/sprites/font/glyphs.json") return Promise.resolve({ widths: Array.from({ length: 512 }, () => 4), cmap: { A: 1 } });
      if (url === "/api/features") return Promise.resolve({ features: [], milestones: [] });
      if (url === "/api/models") return Promise.resolve({ models: [] });
      if (url === "/api/features/history") return Promise.resolve({});
      if (url.endsWith("/comparisons")) return Promise.resolve({ candidates: [], baseline: null });
      return Promise.reject(new Error(`fixture unavailable: ${url}`));
    },
    sendJson: () => Promise.reject(new Error("unexpected write")),
    openStream: () => ({ addEventListener: () => undefined, close: () => undefined }),
  };
  const app = await mountApp(document, deps); await app.pollCards();
  const hosts = () => [must(document.querySelector('[data-ui="run-cards"]')), must(document.querySelector('[data-ui="run-sheet-body"]'))];
  const mine = (host: Element) => must(host.querySelector(`[data-watch="${id}"]`));
  for (const host of hosts()) {
    expect(mine(host).querySelector('[data-gt="WATCHING"]')).not.toBeNull();
    expect(host.querySelector(`[data-watch="${historical}"]`)).toBeNull();
  }
  const ready = snapshot.runs;
  snapshot.runs = []; snapshot.at = BASE_MS + 5000; now = snapshot.at;
  await app.pollCards();
  for (const host of hosts()) {
    expect([...host.querySelectorAll("[data-watch]")].map(e => (e as HTMLElement).dataset.watch)).toEqual([id, other]);
    expect(mine(host).querySelector('img[src="/sprites/icons/280.png"]')).not.toBeNull();
    expect(mine(host).querySelector("[data-clock]")?.textContent).toBe("0:06");
  }
  snapshot.runs = ready; selected.elapsedMs = 6000; must(snapshot.runs[1]).elapsedMs = 6000;
  await app.pollCards();
  expect(parseWorkbench(Reflect.get(app, "workbench") as unknown).runs.map(run => run.id)).toEqual([id, other, historical]);
  selected.status = "unresponsive"; must(snapshot.runs[1]).status = "unresponsive";
  await app.pollCards();
  for (const host of hosts()) expect(host.querySelectorAll("[data-watch]")).toHaveLength(0);
  selected.status = "live"; must(choices[0]).live = false; must(choices[1]).live = false;
  await app.refreshRuns(); await app.pollCards();
  for (const host of hosts()) expect(host.querySelectorAll("[data-watch]")).toHaveLength(0);
  selected.status = "live"; must(choices[0]).live = true;
  await app.refreshRuns(); await app.pollCards();
  for (const host of hosts()) {
    expect(mine(host).querySelector('[data-gt="WATCHING"]')).not.toBeNull();
    expect(mine(host).getAttribute("aria-pressed")).toBe("true");
    expect(mine(host).textContent).toContain("MAY");
    expect(mine(host).querySelector('img[src="/sprites/icons/280.png"]')).not.toBeNull();
  }
  must(choices[1]).ended = true; must(snapshot.runs[1]).status = "ended";
  await app.refreshRuns(); await app.pollCards();
  for (const host of hosts()) expect([...host.querySelectorAll("[data-watch]")].map(e => (e as HTMLElement).dataset.watch)).toEqual([id]);
});
