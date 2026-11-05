// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { frontierLegend } from "./frontier-legend.js";
import { checkpointResume, drawnRun, frontierPlot, frontierReferences, frontierTags, frontierVersions, racePlot, startMilestone } from "./frontier.js";
import { keepsSplits, probeSplitsApart } from "./frontier-recording.js";
import type { RunOrigin, WorkbenchRun } from "./workbench-data.js";

const NAMES = ["CLOCK_SET", "RIVAL_MET", "STARTER_CHOSEN", "STONE_BADGE", "FORTREE_CITY", "FEATHER_BADGE"];
const raced = (id: string, count = NAMES.length, overrides: Partial<WorkbenchRun> = {}): WorkbenchRun => {
  const names = NAMES.slice(0, count);
  return { ...run({ id, splits: names.map((name, i) => ({ name, elapsedMs: (i + 1) * 60000, segmentMs: 0, seq: i + 1, turn: i + 1, inputTokens: 0, outputTokens: 0 })) }), measurement: { controller: "agent", features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] }, ...overrides };
};
const start = (source: WorkbenchRun, start: string, resume: string | null): WorkbenchRun["config"] => { if (source.config === null) throw new Error("fixture"); return { ...source.config, start, resume }; };
const saved = (id: string, origin: RunOrigin | null, count = NAMES.length): WorkbenchRun => { const base = raced(id, count); return { ...base, config: start(base, "save_state", null), ...(origin === null ? {} : { origin }) }; };
const known = (milestone: string | null): RunOrigin => ({ milestone, save: "PAUSED_BEFORE_RESTART.state", sourceRun: "5f0f", sourceTurn: 2181 });
const measured = (source: WorkbenchRun): NonNullable<WorkbenchRun["measurement"]> => { if (source.measurement === undefined) throw new Error("fixture"); return source.measurement; };
const features = (source: WorkbenchRun, id: string): NonNullable<WorkbenchRun["measurement"]> => ({ ...measured(source), features: [...measured(source).features, id] });
const plot = (runs: readonly WorkbenchRun[], zoom = false): void => { document.body.innerHTML = frontierPlot({ human: null, best: null }, runs, 900, null, [], zoom); };
const series = (id: string): Element | null => document.querySelector(`polyline[data-series="${id}"]`)?.closest(".wb-series") ?? null;
const hidden = (): string => document.querySelector("[data-frontier-hidden]")?.textContent ?? "";

describe("the frontier fails open", () => {
  it("draws runs nothing recognizes rather than dropping them", () => {
    const base = raced("base");
    const made = { ...raced("made-up-start"), config: start(base, "teleport", null) };
    const unnamed = saved("unknown-save", null);
    const controller = { ...raced("robot"), measurement: { ...measured(base), controller: "robot" as "agent" } };
    const noConfig = { ...raced("no-config"), config: null };
    const noMeasurement = Object.fromEntries(Object.entries({ ...raced("no-measurement") }).filter(([key]) => key !== "measurement")) as unknown as WorkbenchRun;
    plot([made, unnamed, controller, noConfig, noMeasurement]);
    for (const id of ["made-up-start", "unknown-save", "robot", "no-config", "no-measurement"]) expect(series(id), id).not.toBeNull();
    expect(hidden()).toBe("Hidden: 0");
  });
  it("names every run it cannot draw, with the reason", () => {
    const excluded = { ...raced("excluded"), excluded: "Operator exclusion: wrong ROM" };
    const empty = raced("empty", 0), loading = { ...raced("loading", 0), problem: "Recording is still loading; story progress has not been validated yet" };
    const offAxis = { ...raced("off-axis", 0), splits: [{ ...raced("x", 1).splits[0], name: "NOT_A_FRONTIER_MILESTONE" } as WorkbenchRun["splits"][number]] };
    plot([excluded, empty, loading, offAxis, raced("drawn")]);
    expect(document.querySelector("[data-frontier-hidden] summary")?.textContent).toBe("Hidden: 4");
    expect(hidden()).toContain("excluded");
    expect(hidden()).toContain("Operator exclusion: wrong ROM");
    expect(hidden()).toContain("Recording is still loading");
    expect(hidden()).toContain("empty");
    expect(hidden()).toContain("off-axis");
    expect(hidden()).toContain("No recorded story checkpoints");
    expect(document.querySelector('[data-frontier-hidden] a[href="/#replay=empty"]')).not.toBeNull();
    expect(hidden()).not.toContain("drawn");
  });
  it("puts Hidden after the chart and keeps it out of the race plot", () => {
    plot([raced("empty", 0)]);
    const chart = document.querySelector("svg"), line = document.querySelector("[data-frontier-hidden]");
    expect(chart !== null && line !== null && (chart.compareDocumentPosition(line) & 4) !== 0).toBe(true);
  });
  it("accounts for every selected run in both views: each is a series or in Hidden", () => {
    const runs = [raced("a"), saved("b", known("STONE_BADGE")), saved("c", null), raced("d", 0), { ...raced("e"), excluded: "Operator exclusion: x" }, { ...raced("f"), problem: "bad log" }];
    for (const zoom of [false, true]) {
      plot(runs, zoom);
      const listed = hidden();
      for (const r of runs) expect(document.querySelector(`[data-run="${r.id}"]`) !== null || listed.includes(r.id), r.id).toBe(true);
    }
  });
  it("only an operator exclusion keeps a run with splits off the chart", () => {
    expect(drawnRun({ ...raced("a"), excluded: "Operator exclusion: x" })).toBe(false);
    expect(drawnRun({ ...raced("a"), excluded: "Excluded probe session" })).toBe(true);
    expect(drawnRun({ ...raced("a"), problem: "bad" })).toBe(true);
    expect(drawnRun({ ...raced("a"), config: null })).toBe(true);
  });
  it("draws a run with a problem dotted and says the problem on its marks", () => {
    plot([{ ...raced("broken"), problem: "viewer build is older" }]);
    expect(document.querySelector('polyline[data-series="broken"]')?.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(document.querySelector('[data-run="broken"]')?.getAttribute("aria-label")).toContain("viewer build is older");
  });
  it.each([["probe", "Excluded probe session"], ["synthetic-run", null], ["replay-v1", null]])("dims a %s run and keeps it drawn", (feature, excluded) => {
    const base = raced("dim");
    plot([{ ...base, excluded, measurement: features(base, feature) }]);
    expect(series("dim")?.classList.contains("wb-probe-run")).toBe(true);
    expect(document.querySelector('[data-run="dim"]')?.getAttribute("aria-label")).toContain("probe session");
  });
  it("still draws a probe with a problem dotted, with the problem on its marks", () => {
    const base = raced("dim");
    plot([{ ...base, splits: [], probeSplits: base.splits, excluded: "Excluded probe session", problem: "viewer build is older" }]);
    expect(document.querySelector('polyline[data-series="dim"]')?.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(series("dim")?.classList.contains("wb-invalid-run")).toBe(true);
    expect(document.querySelector('[data-run="dim"]')?.getAttribute("aria-label")).toContain("viewer build is older");
  });
  it("dims a run marked as a probe session even without its features", () => {
    plot([{ ...raced("dim"), excluded: "Excluded probe session" }]);
    expect(series("dim")?.classList.contains("wb-probe-run")).toBe(true);
  });
  it("tags a human or unknown controller and does not treat it as an agent", () => {
    const base = raced("base");
    expect(frontierTags({ ...base, measurement: { ...measured(base), controller: "human" } })).toContain("human controller");
    const bare = Object.fromEntries(Object.entries(base).filter(([key]) => key !== "measurement")) as unknown as WorkbenchRun;
    expect(frontierTags(bare)).toContain("controller not recorded");
    expect(frontierTags(base)).toEqual([]);
  });
});

describe("resumes from an arbitrary save", () => {
  it("draws an ee2a-shaped run from its origin, dashed, and marks that origin", () => {
    plot([saved("ee2a", known("FORTREE_CITY"))]);
    const group = series("ee2a");
    expect(group?.classList.contains("wb-resumed-run")).toBe(true);
    expect(group?.getAttribute("data-resume")).toBe("FORTREE_CITY");
    expect(document.querySelector('polyline[data-series="ee2a"]')?.getAttribute("stroke-dasharray")).toBe("8 5");
    expect(document.querySelector('[data-resume-origin="FORTREE_CITY"]')).not.toBeNull();
    expect(document.querySelector('[data-run="ee2a"][data-split="FEATHER_BADGE"]')?.getAttribute("aria-label")).toContain("not from New game");
    expect(document.querySelector('[data-run="ee2a"][data-split="FEATHER_BADGE"]')?.getAttribute("aria-label")).toContain("from 5f0f turn 2181");
    expect(document.querySelector('[data-run="ee2a"][data-split="STONE_BADGE"]')).toBeNull();
  });
  it("keeps every origin's rule but drops a label that would land on the one before it", () => {
    plot([saved("a", known("CLOCK_SET")), saved("b", known("RIVAL_MET")), saved("c", known("FEATHER_BADGE"))]);
    expect(document.querySelectorAll("line[data-resume-origin]")).toHaveLength(3);
    const tags = [...document.querySelectorAll(".wb-resume-tag")].map(t => t.getAttribute("data-resume-origin"));
    expect(tags).toContain("CLOCK_SET");
    expect(tags).toContain("FEATHER_BADGE");
    expect(tags).not.toContain("RIVAL_MET");
  });
  it("draws an unknown start from its first recorded milestone, tagged and dashed", () => {
    plot([saved("mystery", known(null))]);
    expect(document.querySelector('[data-run="mystery"][data-split="CLOCK_SET"]')?.getAttribute("aria-label")).toContain("start unknown");
    expect(document.querySelector('polyline[data-series="mystery"]')?.getAttribute("stroke-dasharray")).toBe("8 5");
    expect(series("mystery")?.getAttribute("data-resume")).toBe("");
    expect(frontierTags(saved("mystery", null))).toContain("start unknown");
  });
  it("treats a run with no recorded start as start unknown", () => {
    expect(frontierTags({ ...raced("a"), config: null })).toContain("start unknown");
    expect(checkpointResume({ ...raced("a"), config: null })).toBe(true);
  });
  it("does not treat a boot or main-menu start as a resume", () => {
    const base = raced("base");
    expect(checkpointResume(base)).toBe(false);
    expect(checkpointResume({ ...base, config: start(base, "save_state", "MAIN_MENU") })).toBe(false);
    expect(startMilestone({ ...base, config: start(base, "save_state", "MAIN_MENU") })).toBeNull();
  });
  it("prefers a recognized checkpoint name over a recorded origin", () => {
    const base = raced("base");
    expect(startMilestone({ ...base, config: start(base, "save_state", "CLOCK_SET"), origin: known("STONE_BADGE") })?.id).toBe("CLOCK_SET");
  });
  it("names an arbitrary save in the coverage list", () => {
    plot([saved("mystery", known(null))]);
    expect(document.querySelector("[data-frontier-coverage]")?.textContent).toContain("start unknown");
  });
  it("keeps the frontier line whole when a resumed run races it", () => {
    const frontier = { run: "best", milestones: NAMES.map((name, i) => ({ name, offsetMs: (i + 1) * 60000 })) };
    document.body.innerHTML = racePlot(frontier, saved("ee2a", known("FORTREE_CITY")), 900);
    expect(document.querySelector('[data-run="best"][data-split="CLOCK_SET"]')).not.toBeNull();
  });
});

describe("what stays closed", () => {
  it("never lets a save start, probe, problem or human run become the agent frontier", () => {
    const plain = raced("plain", 2), base = raced("base");
    const refs = frontierReferences([plain, saved("ee2a", known("FORTREE_CITY")), saved("mystery", null), { ...base, id: "probe", excluded: "Excluded probe session" }, { ...base, id: "dim", measurement: features(base, "probe") }, { ...base, id: "broken", problem: "bad" }, { ...base, id: "person", measurement: { ...measured(base), controller: "human" } }]);
    expect(refs.best?.id).toBe("plain");
    expect(refs.overall?.id).toBe("plain");
  });
  it("gives no harness version to a probe, problem, human or assisted run, but does to an arbitrary-save agent", () => {
    const base = raced("base");
    const versions = frontierVersions([base, saved("ee2a", known("FORTREE_CITY")), { ...base, id: "probe", excluded: "Excluded probe session" }, { ...base, id: "dim", measurement: features(base, "probe") }, { ...base, id: "broken", problem: "bad" }, { ...base, id: "person", measurement: { ...measured(base), controller: "human" } }, { ...base, id: "edited", model: "x-edit-1" }]);
    expect([...versions.byRun.keys()].sort()).toEqual(["base", "ee2a"]);
  });
  it("explains the new marks in the legend", () => {
    const versions = frontierVersions([saved("ee2a", known("FORTREE_CITY"))]);
    document.body.innerHTML = frontierLegend({ human: null, best: null }, [saved("ee2a", known("FORTREE_CITY"))], versions, { isolated: null, legendOpen: true, marksOpen: true, howOpen: false, changed: new Set(), all: new Set(), expanded: new Set() });
    expect(document.querySelector(".wb-legend-note")?.textContent).toContain("save");
    expect(document.querySelector("[data-bar=marks]")?.textContent).toContain("Faint line");
  });
});

describe("probe splits", () => {
  it("reach only the frontier: a probe's recorded splits stay empty for every other surface", () => {
    const source = raced("source"), measurement = { ...measured(source), rawSplits: [{ name: "CLOCK_SET", elapsedMs: 1, evidence: [1] }] };
    const parted = probeSplitsApart(["probe"], source.splits, measurement);
    expect(parted.splits).toEqual([]);
    expect(parted.measurement.rawSplits).toEqual([]);
    expect(parted.probeSplits).toEqual(source.splits);
    expect(probeSplitsApart(["ram-state-v1"], source.splits, measurement)).toEqual({ splits: source.splits, measurement });
    plot([{ ...source, id: "dim", excluded: "Excluded probe session", ...parted }]);
    expect(series("dim")?.classList.contains("wb-probe-run")).toBe(true);
    expect(hidden()).toBe("Hidden: 0");
  });
  it("are kept for the display reading only", () => {
    expect(keepsSplits(["probe"], "display")).toBe(true);
    expect(keepsSplits(["probe"], "strict")).toBe(false);
    expect(keepsSplits(["ram-state-v1"], "strict")).toBe(true);
  });
});
