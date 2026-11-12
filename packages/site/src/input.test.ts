import { describe, expect, it } from "vitest";
import { at, rec } from "../test-support/at.js";
import { fixture } from "../test-support/fixture.js";
import { InputError, parseChartData, parsePoints, parseRuns, parseSiteData } from "./input.js";

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

describe("parseSiteData models", () => {
  it("reads each model's name, kind, reasoning effort and context window", () => {
    const s = parseSiteData(fixture().site);
    expect(s.models).toEqual([
      { slug: "model-a", name: "Model A", kind: "cloud", effort: "medium", context: 262144 },
      { slug: "model-b", name: "Model B", kind: "local", effort: "medium", context: 65536 },
      { slug: "model-c", name: "Model C", kind: "cloud", effort: "off", context: 32768 },
    ]);
  });

  it("rejects a kind other than cloud or local", () => {
    const f = fixture();
    rec(f.site.models, 0).kind = "remote";
    expect(() => parseSiteData(f.site)).toThrow(/models\[0\]\.kind/);
  });

  it("rejects a context window that is not a positive whole number", () => {
    const f = fixture();
    rec(f.site.models, 0).context = 0;
    expect(() => parseSiteData(f.site)).toThrow(/models\[0\]\.context/);
  });

  it("rejects an unknown model field", () => {
    const f = fixture();
    rec(f.site.models, 0).sku = "x";
    expect(() => parseSiteData(f.site)).toThrow(/unknown field "sku"/);
  });

  it("rejects a series slug with no model entry", () => {
    const f = fixture();
    (f.site.models as unknown[]).splice(2, 1);
    expect(() => parseSiteData(f.site)).toThrow(/model-c/);
  });

  it("rejects a model no series uses", () => {
    const f = fixture();
    (f.site.models as unknown[]).push({ slug: "model-z", name: "Model Z", kind: "cloud", effort: "high", context: 1 });
    expect(() => parseSiteData(f.site)).toThrow(/model-z/);
  });

  it("rejects two model entries with one slug", () => {
    const f = fixture();
    (f.site.models as unknown[]).push({ ...rec(f.site.models, 0) });
    expect(() => parseSiteData(f.site)).toThrow(/model-a/);
  });

  it("rejects a series whose model name or local flag disagrees with its model entry", () => {
    const f = fixture();
    rec(f.site.series, 2).model = "Model Bee";
    expect(() => parseSiteData(f.site)).toThrow(/Model Bee/);
    const g = fixture();
    rec(g.site.series, 2).local = false;
    expect(() => parseSiteData(g.site)).toThrow(/series\[2\]\.local/);
  });
});

describe("parseRuns", () => {
  const release = (f: ReturnType<typeof fixture>): Record<string, unknown> => rec(f.runs.runs, 2).release as Record<string, unknown>;

  it("rejects a start time that is not a real date and time", () => {
    for (const bad of ["2026-99-99T99:99+99:99", "2026-02-30T10:00:00-05:00", "2026-11-12T24:00:00+00:00", "2026-11-12T10:60:00+00:00", "2026-11-12T10:00:00+15:00"]) {
      const f = fixture();
      rec((f.runs as { runs: unknown }).runs, 0).started = bad;
      expect(() => parseRuns(f.runs), bad).toThrow(/started/);
    }
  });

  it("reads each run, its short id, its date and the optional link and release", () => {
    const runs = parseRuns(fixture().runs);
    expect(runs.map((r) => r.short)).toEqual(["aa01", "aa02", "ab07", "b001", "c001"]);
    const a = at(runs, 0);
    expect(a).toMatchObject({ id: "run-aa01", date: "2026-11-01", start: "a new game at power-on", turns: 800, preset: "a-4h", code: "aaaaaaaa1", linked: "1 of 2" });
    expect(a.release).toBeUndefined();
    expect(at(runs, 3).linked).toBeUndefined();
    const r = at(runs, 2).release;
    expect(r?.tag).toBe("model-a-lane-ab07");
    expect(r?.assets.map((x) => [x.name, x.bytes, x.openWith])).toEqual([["events-ab07.tar.xz", 11811008, "tar -xf"], ["SHA256SUMS", 783, "shasum -a 256 -c"]]);
    expect(r?.team[0]).toEqual({ species: "RAYQUAZA", level: 74, hp: "251/251", moves: "Fly, Outrage", item: "none", caught: "Sky Pillar, level 70" });
    expect(r?.check[0]?.steps).toHaveLength(2);
    expect(r?.notes[0]?.title).toBe("INDEPENDENT REPLAY");
    expect(r?.facts.map((x) => x.label)).toEqual(["HELP", "CODE VERSION"]);
  });

  it("rejects unknown fields at every level", () => {
    const top = fixture();
    top.runs.extra = 1;
    expect(() => parseRuns(top.runs)).toThrow(/unknown field "extra"/);
    const run = fixture();
    rec(run.runs.runs, 0).tokens = 5;
    expect(() => parseRuns(run.runs)).toThrow(/unknown field "tokens"/);
    const rel = fixture();
    release(rel).path = "/x";
    expect(() => parseRuns(rel.runs)).toThrow(/unknown field "path"/);
    const asset = fixture();
    rec(release(asset).assets, 0).sha = "x";
    expect(() => parseRuns(asset.runs)).toThrow(/unknown field "sha"/);
    const team = fixture();
    rec(release(team).team, 0).ivs = "x";
    expect(() => parseRuns(team.runs)).toThrow(/unknown field "ivs"/);
  });

  it("rejects a start time without a UTC offset", () => {
    const f = fixture();
    rec(f.runs.runs, 0).started = "2026-11-01T02:00:00";
    expect(() => parseRuns(f.runs)).toThrow(/runs\[0\]\.started/);
  });

  it("rejects a code version that is not a 9-character commit", () => {
    const f = fixture();
    rec(f.runs.runs, 0).code = "main";
    expect(() => parseRuns(f.runs)).toThrow(/runs\[0\]\.code/);
  });

  it("rejects a turn count that is not a positive whole number", () => {
    const f = fixture();
    rec(f.runs.runs, 0).turns = 1.5;
    expect(() => parseRuns(f.runs)).toThrow(/runs\[0\]\.turns/);
  });

  it("rejects a link that is not \"n of m\"", () => {
    const f = fixture();
    rec(f.runs.runs, 0).linked = "first";
    expect(() => parseRuns(f.runs)).toThrow(/runs\[0\]\.linked/);
  });

  it("rejects two runs with one short id or one id", () => {
    const f = fixture();
    rec(f.runs.runs, 1).id = "other-aa01";
    expect(() => parseRuns(f.runs)).toThrow(/aa01/);
    const g = fixture();
    rec(g.runs.runs, 1).id = "run-aa01";
    expect(() => parseRuns(g.runs)).toThrow(/aa01/);
  });

  it("rejects an asset or tag name that could leave the release URL", () => {
    const f = fixture();
    rec(release(f).assets, 0).name = "../x";
    expect(() => parseRuns(f.runs)).toThrow(/assets\[0\]\.name/);
    const g = fixture();
    release(g).tag = "a/b";
    expect(() => parseRuns(g.runs)).toThrow(/release\.tag/);
  });

  it("rejects an asset size or team level that is not a whole number", () => {
    const f = fixture();
    rec(release(f).assets, 0).bytes = 1.5;
    expect(() => parseRuns(f.runs)).toThrow(/assets\[0\]\.bytes/);
    const g = fixture();
    rec(release(g).team, 0).level = "74";
    expect(() => parseRuns(g.runs)).toThrow(/team\[0\]\.level/);
  });

  it("rejects a run id too short to have a short id", () => {
    const f = fixture();
    rec(f.runs.runs, 0).id = "ab";
    expect(() => parseRuns(f.runs)).toThrow(/runs\[0\]\.id/);
  });

  it("reads optional trace files with their release tag", () => {
    const runs = parseRuns(fixture().runs);
    expect(at(runs, 0).traces).toEqual({ tag: "evidence-1", files: [{ label: "thinking", name: "aa01_thinking.jsonl.gz" }, { label: "trace", name: "aa01_trace.tar.xz" }] });
    expect(at(runs, 1).traces).toBeUndefined();
  });

  it("rejects a trace label outside thinking, trace and Codex transcript", () => {
    const f = fixture();
    rec((rec(f.runs.runs, 0).traces as Record<string, unknown>).files, 0).label = "notes";
    expect(() => parseRuns(f.runs)).toThrow(/traces\.files\[0\]\.label/);
  });

  it("rejects a trace tag or file name that could leave the release URL, and unknown trace fields", () => {
    const f = fixture();
    (rec(f.runs.runs, 0).traces as Record<string, unknown>).tag = "../x";
    expect(() => parseRuns(f.runs)).toThrow(/traces\.tag/);
    const g = fixture();
    rec((rec(g.runs.runs, 0).traces as Record<string, unknown>).files, 1).name = "a/b";
    expect(() => parseRuns(g.runs)).toThrow(/traces\.files\[1\]\.name/);
    const h = fixture();
    (rec(h.runs.runs, 0).traces as Record<string, unknown>).url = "x";
    expect(() => parseRuns(h.runs)).toThrow(/unknown field "url"/);
  });

  it("rejects an id whose last four characters are not lowercase letters and digits", () => {
    const f = fixture();
    rec(f.runs.runs, 0).id = "run-AA-1";
    expect(() => parseRuns(f.runs)).toThrow(/runs\[0\]\.id/);
    rec(f.runs.runs, 0).id = "run_a-01";
    expect(() => parseRuns(f.runs)).toThrow(/runs\[0\]\.id/);
  });
});

describe("parseSiteData base_url", () => {
  it("reads the https base URL the feed links from", () => {
    expect(parseSiteData(fixture().site).baseUrl).toBe("https://example.github.io/pokebench/");
  });

  it("rejects a base URL that is not https or does not end in a slash", () => {
    const f = fixture();
    f.site.base_url = "http://example.github.io/pokebench/";
    expect(() => parseSiteData(f.site)).toThrow(/base_url/);
    f.site.base_url = "https://example.github.io/pokebench";
    expect(() => parseSiteData(f.site)).toThrow(/base_url/);
  });
});
