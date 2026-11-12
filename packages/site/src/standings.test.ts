import { describe, expect, it } from "vitest";
import { at, rec, find } from "../test-support/at.js";
import { fixture, type FixtureInputs } from "../test-support/fixture.js";
import { parseChartData, parsePoints, parseSiteData } from "./input.js";
import { standings } from "./standings.js";

const build = (f: FixtureInputs) => standings(parseChartData(f.chartData), parsePoints(f.points), parseSiteData(f.site));

describe("standings", () => {
  it("orders by furthest progress, then by time to it", () => {
    const s = build(fixture());
    expect(s.entries.map((e) => e.chartLabel)).toEqual(["Model A, lane*", "Model A", "Model C", "Model B"]);
    expect(s.entries.map((e) => e.level)).toEqual([14, 9, 5, 5]);
    expect(at(s.entries, 2).seconds).toBe(9);
    expect(at(s.entries, 3).seconds).toBe(55);
  });

  it("counts badges in the order they were earned, so a run that took the gyms out of order still levels correctly", () => {
    const s = build(fixture());
    const b = find(s.entries, (e) => e.chartLabel === "Model B");
    expect(b.level).toBe(5);
    expect(b.furthest).toBe("BALANCE_BADGE");
  });

  it("joins each series to its model, local flag, help and note", () => {
    const s = build(fixture());
    const lane = at(s.entries, 0);
    expect(lane).toMatchObject({ model: "Model A", slug: "model-a", assisted: true, local: false, help: "two hints", costUsd: 70, estimated: false });
    const b = find(s.entries, (e) => e.chartLabel === "Model B");
    expect(b).toMatchObject({ local: true, estimated: true, runs: ["run-b001"] });
  });

  it("reads the human record from the last split", () => {
    const s = build(fixture());
    expect(s.human).toEqual({ name: "Speedy", note: "for reference", level: 14, seconds: 950 });
  });

  it("shows best unhelped beside the leader only when an assisted run leads (INV-2)", () => {
    const s = build(fixture());
    expect(s.best.chartLabel).toBe("Model A, lane*");
    expect(s.bestUnhelped?.chartLabel).toBe("Model A");
  });

  it("has no separate best unhelped when an unassisted run leads", () => {
    const f = fixture();
    rec(f.chartData.series, 1).assisted = false;
    const s = build(f);
    expect(s.best.assisted).toBe(false);
    expect(s.bestUnhelped).toBeUndefined();
  });

  it("finds the cheapest unassisted run with at least the configured badges", () => {
    const s = build(fixture());
    expect(s.cheapest?.chartLabel).toBe("Model B");
  });

  it("has no cheapest run when no unassisted run reached the threshold", () => {
    const f = fixture();
    f.site.cheapest_badges = 8;
    const s = build(f);
    expect(s.cheapest?.chartLabel).toBe("Model A");
    f.chartData.series = (f.chartData.series as Record<string, unknown>[]).map((x) => ({ ...x, assisted: true }));
    expect(build(f).cheapest).toBeUndefined();
  });

  it("fails when a chart series has no model entry, so a new model cannot appear unlabelled", () => {
    const f = fixture();
    f.site.series = (f.site.series as Record<string, unknown>[]).slice(1);
    expect(() => build(f)).toThrow(/no site\.json series entry for "Model A"/);
  });

  it("fails when the chart data and the points disagree on the series", () => {
    const f = fixture();
    f.points.series = (f.points.series as Record<string, unknown>[]).slice(0, 3);
    expect(() => build(f)).toThrow(/no chart points for "Model C"/);
  });

  it("fails when site.json names a series the charts do not have", () => {
    const f = fixture();
    (f.site.series as Record<string, unknown>[]).push({ chart_label: "Ghost", model: "Ghost", slug: "ghost", local: false });
    (f.site.models as Record<string, unknown>[]).push({ slug: "ghost", name: "Ghost", kind: "cloud", effort: "medium", context: 1 });
    expect(() => build(f)).toThrow(/"Ghost" is not a chart series/);
  });

  it("fails when the charts have no series", () => {
    const f = fixture();
    f.chartData.series = [];
    f.points.series = [];
    f.site.series = [];
    f.site.models = [];
    expect(() => build(f)).toThrow(/the charts have no series/);
  });

  it("fails when the human record has no splits", () => {
    const f = fixture();
    (f.chartData.human as Record<string, unknown>).splits_seconds = [null, null];
    expect(() => build(f)).toThrow(/human record has no split/);
  });
});
