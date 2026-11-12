import { describe, expect, it } from "vitest";
import { rec } from "../test-support/at.js";
import { fixture, type FixtureInputs } from "../test-support/fixture.js";
import { runIndex } from "./catalog.js";
import { InputError, parseChartData, parsePoints, parseRuns, parseSiteData } from "./input.js";
import { standings } from "./standings.js";

const index = (f: FixtureInputs) => runIndex(standings(parseChartData(f.chartData), parsePoints(f.points), parseSiteData(f.site)).entries, parseRuns(f.runs));

describe("runIndex", () => {
  it("finds the runs.json entry for every run of every chart series", () => {
    const ix = index(fixture());
    expect([...ix.keys()].sort()).toEqual(["run-aa01", "run-aa02", "run-ab07", "run-b001", "run-c001"]);
    expect(ix.get("run-ab07")?.short).toBe("ab07");
  });

  it("rejects a chart run that runs.json does not describe", () => {
    const f = fixture();
    (f.runs.runs as unknown[]).splice(4, 1);
    expect(() => index(f)).toThrow(InputError);
    expect(() => index(f)).toThrow(/run-c001/);
  });

  it("rejects a runs.json run that no chart series plots", () => {
    const f = fixture();
    (f.runs.runs as unknown[]).push({ ...rec(f.runs.runs, 4), id: "run-x999" });
    expect(() => index(f)).toThrow(/run-x999/);
  });

  it("rejects a run plotted by two series", () => {
    const f = fixture();
    rec(f.points.series, 3).runs = ["run-c001", "run-b001"];
    rec(f.chartData.series, 3).runs = ["run-c001", "run-b001"];
    expect(() => index(f)).toThrow(/run-b001/);
  });

  it("rejects a series with no runs", () => {
    const f = fixture();
    rec(f.points.series, 3).runs = [];
    (f.runs.runs as unknown[]).splice(4, 1);
    expect(() => index(f)).toThrow(/plots no runs/);
  });
});
