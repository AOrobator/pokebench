import { describe, expect, it } from "vitest";
import { at, rec } from "../test-support/at.js";
import { fixture } from "../test-support/fixture.js";
import { InputError, parseChartData, parsePoints, parseSiteData } from "./input.js";

describe("parseChartData", () => {
  it("reads the human splits and each series's assisted and estimated flags", () => {
    const c = parseChartData(fixture().chartData);
    expect(c.human.splitsSeconds).toHaveLength(14);
    expect(c.human.splitsSeconds[8]).toBeNull();
    expect(c.series.map((s) => [s.label, s.assisted, s.estimated])).toEqual([
      ["Model A", false, false],
      ["Model A, lane*", true, false],
      ["Model B", false, true],
      ["Model C", false, false],
    ]);
  });

  it("rejects a series whose assisted flag is not a boolean", () => {
    const f = fixture();
    rec(f.chartData.series, 0).assisted = "no";
    expect(() => parseChartData(f.chartData)).toThrow(/series\[0\]\.assisted/);
  });

  it("rejects a human split that is not a whole number of seconds or null", () => {
    const f = fixture();
    (f.chartData.human as { splits_seconds: unknown[] }).splits_seconds[0] = "1:00";
    expect(() => parseChartData(f.chartData)).toThrow(InputError);
  });

  it("rejects a document that is not an object", () => {
    expect(() => parseChartData([])).toThrow(/chart data/);
  });
});

describe("parsePoints", () => {
  it("reads milestones, the furthest milestone and cost", () => {
    const p = parsePoints(fixture().points);
    expect(p.pricesAsOf).toBe("2026-11-11");
    const b = at(p.series, 2);
    expect(b.label).toBe("Model B");
    expect(b.milestones.get("KNUCKLE_BADGE")).toBe(15);
    expect(b.furthest).toBe("BALANCE_BADGE");
    expect(b.costUsd).toBe(2.5);
  });

  it("rejects an unknown milestone name", () => {
    const f = fixture();
    rec(f.points.series, 0).furthest = "MYSTERY_BADGE";
    expect(() => parsePoints(f.points)).toThrow(/furthest/);
  });

  it("rejects a furthest milestone the run never reached", () => {
    const f = fixture();
    rec(f.points.series, 2).furthest = "RAIN_BADGE";
    expect(() => parsePoints(f.points)).toThrow(/not among its milestones/);
  });

  it("rejects a negative or non-finite cost", () => {
    const f = fixture();
    rec(f.points.series, 0).cost_usd = -1;
    expect(() => parsePoints(f.points)).toThrow(/cost_usd/);
  });

  it("rejects a cost that is not finite", () => {
    const f = fixture();
    rec(f.points.series, 0).cost_usd = Number.POSITIVE_INFINITY;
    expect(() => parsePoints(f.points)).toThrow(/cost_usd/);
  });

  it("rejects a milestone time that is not a number", () => {
    const f = fixture();
    (rec(f.points.series, 0).milestones as Record<string, unknown>).STONE_BADGE = null;
    expect(() => parsePoints(f.points)).toThrow(/STONE_BADGE/);
  });
});

describe("parseSiteData", () => {
  it("reads every field, with help and note optional", () => {
    const s = parseSiteData(fixture().site);
    expect(s.githubUrl).toBe("https://github.com/example/pokebench");
    expect(s.cheapestBadges).toBe(5);
    expect(s.human).toEqual({ name: "Speedy", note: "for reference" });
    expect(s.series[0]).toEqual({ chartLabel: "Model A", model: "Model A", slug: "model-a", local: false, note: "linked runs" });
    expect(s.series[1]).toEqual({ chartLabel: "Model A, lane*", model: "Model A", slug: "model-a", local: false, help: "two hints" });
  });

  it("rejects an unknown field, so a typo cannot silently drop data", () => {
    const f = fixture();
    rec(f.site.series, 0).loacl = true;
    expect(() => parseSiteData(f.site)).toThrow(/unknown field "loacl"/);
  });

  it("rejects an unknown top-level field", () => {
    const f = fixture();
    f.site.extra = 1;
    expect(() => parseSiteData(f.site)).toThrow(/unknown field "extra"/);
  });

  it("rejects a slug that is not lowercase letters, digits and hyphens", () => {
    const f = fixture();
    rec(f.site.series, 0).slug = "Model A";
    expect(() => parseSiteData(f.site)).toThrow(/slug/);
  });

  it("rejects a GitHub URL that is not https", () => {
    const f = fixture();
    f.site.github_url = "http://github.com/x";
    expect(() => parseSiteData(f.site)).toThrow(/github_url/);
  });

  it("rejects a badge threshold outside 1 to 8", () => {
    const f = fixture();
    f.site.cheapest_badges = 9;
    expect(() => parseSiteData(f.site)).toThrow(/cheapest_badges/);
  });

  it("rejects a badge threshold that is not a whole number", () => {
    const f = fixture();
    f.site.cheapest_badges = 0;
    expect(() => parseSiteData(f.site)).toThrow(/cheapest_badges/);
    f.site.cheapest_badges = 2.5;
    expect(() => parseSiteData(f.site)).toThrow(/cheapest_badges/);
    f.site.cheapest_badges = "5";
    expect(() => parseSiteData(f.site)).toThrow(/cheapest_badges/);
  });

  it("rejects an empty string", () => {
    const f = fixture();
    (f.site.human as Record<string, unknown>).name = "";
    expect(() => parseSiteData(f.site)).toThrow(/human\.name/);
  });
});
