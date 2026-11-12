// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { Log, START, must } from "../test-support/events.js";
import { run } from "../test-support/frontier-run.js";
import { RunView } from "./model.js";
import { racePlot } from "./frontier.js";
import { graphSplits } from "./run-splits.js";

it("draws earlier recorded splits from a paged replay head and removes future splits on rewind", () => {
  const log = new Log();
  log.add(0, START);
  log.add(20_000, { type: "milestone", turn: 1, name: "NEW_GAME_CREATED", server_timestamp: 1 });
  log.add(30_000, { type: "milestone", turn: 2, name: "PLAYER_NAME_CONFIRMED", server_timestamp: 2 });
  const tail = log.add(40_000, { type: "turn_start", turn: 3, context: { messages: 1, images: 0, est_tokens: 1 } });
  const recording = run({ id: tail.run, splits: run().splits.map((split, i) => ({ ...split, seq: i + 1 })) });
  const head = new RunView();
  head.apply(must(log.events[0])); head.apply(tail);
  expect(head.milestones).toEqual([]);
  const frontier = { run: "reference", milestones: recording.splits.map(s => ({ name: s.name, offsetMs: s.elapsedMs })) };
  const draw = (view: RunView): void => {
    const splits = graphSplits("replay", recording, view);
    document.body.innerHTML = racePlot(frontier, { ...recording, splits }, 640);
  };
  expect(graphSplits("replay", recording, head)).toEqual(recording.splits);
  draw(head);
  expect(document.querySelector(`polyline[data-series="${recording.id}"]`)?.getAttribute("points")?.split(" ")).toHaveLength(2);
  const rewind = new RunView(); rewind.apply(must(log.events[0])); rewind.apply(must(log.events[1]));
  expect(graphSplits("replay", recording, rewind)).toEqual([recording.splits[0]]);
  draw(rewind);
  expect(document.querySelector(`polyline[data-series="${recording.id}"]`)).toBeNull();
  expect(document.querySelectorAll(`[data-run="${recording.id}"]`)).toHaveLength(1);
  expect(graphSplits("replay", recording, new RunView())).toEqual([]);
  expect(graphSplits("live", recording, rewind)).toBe(recording.splits);
});

it("keeps screenshot-derived splits behind their displayed evidence rather than their source sequence", () => {
  const base = run(), first = must(base.splits[0]);
  const derived = { ...first, name: "ROXANNE_FIRST_INTERACTION", derived: true as const, screenshotEvidence: [{ seq: 0, path: "frames/000000_0.png", sha1: "a".repeat(40) }] };
  const recording = { ...base, splits: [derived] }, view = new RunView();
  const log = new Log(); view.apply(log.add(0, START));
  view.apply(log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 1 } }));
  expect(graphSplits("replay", recording, view)).toEqual([]);
  view.milestones.push({ name: derived.name, seq: 0, ms: 1000, derived: true });
  expect(graphSplits("replay", recording, view)).toEqual([derived]);
});
