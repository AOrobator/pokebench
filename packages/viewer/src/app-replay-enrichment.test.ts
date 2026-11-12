// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { App, type AppDeps } from "./app.js";
import type { CurrentBrowser, CurrentBrowserState } from "./current-browser.js";
import { currentFixture } from "../test-support/current.js";
import { run } from "../test-support/frontier-run.js";
import { graphSplits } from "./run-splits.js";
import { RunView } from "./model.js";
import type { WorkbenchData } from "./workbench-data.js";

// Rendering is verified by the real headless browser. This fixture isolates the cards-fetch/merge seam.
class CardsApp extends App { override render(): void {} }

it("enriches a detached ended replay from cards despite a populated current projector", async () => {
  const fixture = currentFixture({ ended: true, extra: [{ type: "milestone", name: "PLAYER_NAME_CONFIRMED", turn: 1, server_timestamp: 1 }] });
  const id = fixture.summary.id, full = run({ id, splits: run().splits.map((split, i) => ({ ...split, seq: i + 1 })) });
  const state: CurrentBrowserState = { epoch: "epoch", cursor: "cursor", runs: [fixture.summary], selected: null, snapshot: null, stale: false, indexing: false, problem: null, progress: [], progressProblem: null, history: [], head: [], before: null, historyLoading: false, historyProblem: null, historyLimited: false, historyFull: false, historyOlder: false };
  const current: CurrentBrowser = { state, start: async () => {}, select: async () => {}, poll: async () => {}, history: async () => {}, progress: async () => {}, holdHistory: () => {}, display: () => null, close: () => {} };
  const calls: string[] = [];
  let switchSelection = false;
  const deps: AppDeps = {
    hash: `#replay=${id}`, now: () => 1000,
    fetchJson: url => {
      calls.push(url);
      if (!url.startsWith("/api/cards?run=")) return Promise.resolve(null);
      if (switchSelection) Object.assign(app, { runId: "other" });
      return Promise.resolve({ version: 1, at: 1000, milestones: [], runs: [full], problems: [] });
    },
    sendJson: () => Promise.resolve(null),
    openStream: () => ({ addEventListener: () => {}, close: () => {} }),
  };
  document.body.innerHTML = '<select data-ui="run"></select>';
  const app = new CardsApp(document, deps);
  // Represent the existing recorded-replay handoff: current remains available for other live cards.
  Object.assign(app, { current, runId: id, mode: "replay" });
  await app.pollCardsIfNeeded();
  expect(calls.filter(url => url.startsWith("/api/cards"))).toEqual([`/api/cards?run=${encodeURIComponent(id)}`]);
  const workbench = Reflect.get(app, "workbench") as WorkbenchData;
  expect(workbench.runs.map(row => [row.id, row.splits])).toEqual([[id, full.splits]]);
  const view = new RunView(); for (const event of fixture.log.events) view.apply(event);
  expect(graphSplits("replay", full, view)).toEqual(full.splits);
  // Another projector/cards poll must retain full recorded progress, rather than bounded summary progress.
  await app.pollCards();
  expect((Reflect.get(app, "workbench") as WorkbenchData).runs.map(row => [row.id, row.splits])).toEqual([[id, full.splits]]);
  Object.assign(app, { mode: "live" }); state.selected = id; state.snapshot = fixture.snapshot;
  calls.length = 0;
  await app.pollCardsIfNeeded();
  expect(calls.filter(url => url.startsWith("/api/cards"))).toEqual([]);
  Object.assign(app, { mode: "replay" }); state.selected = null; state.snapshot = null;
  const retained = Reflect.get(app, "workbench") as WorkbenchData;
  switchSelection = true;
  await app.pollCards();
  expect(Reflect.get(app, "workbench") as WorkbenchData).toBe(retained);
  app.dispose();
});
