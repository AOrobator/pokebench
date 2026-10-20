import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listReports, reportFile } from "./reports.js";

function root(): string {
  const runs = join(mkdtempSync(join(tmpdir(), "reports-")), "runs"), dir = join(runs, "reports", "run-analysis");
  mkdirSync(dir, { recursive: true });
  return runs;
}
function report(runs: string, slug: string, html: string | null, meta?: unknown): string {
  const d = join(runs, "reports", "run-analysis", slug); mkdirSync(d, { recursive: true });
  if (html !== null) writeFileSync(join(d, "index.html"), html);
  if (meta !== undefined) writeFileSync(join(d, "report.json"), typeof meta === "string" ? meta : JSON.stringify(meta));
  return d;
}

describe("the run-analysis report list", () => {
  it("lists every report that has an index page, newest first, with its own metadata or its page title", () => {
    const runs = root();
    report(runs, "2026-10-16_overnight", "<html><title> Overnight Run Analysis </title>");
    report(runs, "2026-10-17_top50", "<title>Top 50</title>", { version: 1, title: "Top 50 run analysis", kind: "FRONTIER", verdict: "The harness is helping.", frontier: "TEAM_AQUA_WOODS_EVENT_COMPLETE", facts: [["Bundle vs control", "8–0"]], trainer: "norman" });
    report(runs, "2026-10-18_jit-v2-cache", null, { version: 1, title: "Data only" });
    report(runs, "2026-10-19_map-efficiency", "<title>Map efficiency</title>", { version: 1, kind: "AUDIT" });
    report(runs, "not-a-report", "<title>x</title>");
    expect(listReports(runs)).toEqual([
      { slug: "2026-10-19_map-efficiency", date: "2026-10-19", title: "Map efficiency", kind: "AUDIT", verdict: null, frontier: null, facts: [], trainer: null },
      { slug: "2026-10-17_top50", date: "2026-10-17", title: "Top 50 run analysis", kind: "FRONTIER", verdict: "The harness is helping.", frontier: "TEAM_AQUA_WOODS_EVENT_COMPLETE", facts: [["Bundle vs control", "8–0"]], trainer: "norman" },
      { slug: "2026-10-16_overnight", date: "2026-10-16", title: "Overnight Run Analysis", kind: "REPORT", verdict: null, frontier: null, facts: [], trainer: null },
    ]);
  });
  it("ignores a report.json it cannot trust and falls back to the page", () => {
    const runs = root();
    for (const [slug, meta] of [["2026-10-01_a", "{not json"], ["2026-10-02_b", { version: 2, title: "x" }], ["2026-10-03_c", { version: 1, kind: "lowercase" }], ["2026-10-04_d", { version: 1, facts: [["only one"]] }], ["2026-10-05_e", { version: 1, trainer: "../x" }]] as const)
      report(runs, slug, `<title>${slug}</title>`, meta);
    expect(listReports(runs).map(r => [r.slug, r.title, r.kind])).toEqual([["2026-10-05_e", "2026-10-05_e", "REPORT"], ["2026-10-04_d", "2026-10-04_d", "REPORT"], ["2026-10-03_c", "2026-10-03_c", "REPORT"], ["2026-10-02_b", "2026-10-02_b", "REPORT"], ["2026-10-01_a", "2026-10-01_a", "REPORT"]]);
  });
  it("is empty when there are no reports yet", () => {
    expect(listReports(join(mkdtempSync(join(tmpdir(), "reports-")), "runs"))).toEqual([]);
  });
  it("titles a page with no title by its folder name", () => {
    const runs = root(); report(runs, "2026-10-20_untitled", "<p>no title</p>");
    expect(listReports(runs)[0]?.title).toBe("2026-10-20_untitled");
  });
});

describe("files inside one report", () => {
  it("resolves the report's own pages and assets, and nothing outside it", () => {
    const runs = root(), d = report(runs, "2026-10-17_cook", "<title>x</title>");
    mkdirSync(join(d, "shots")); writeFileSync(join(d, "shots", "a-1.png"), "png"); writeFileSync(join(d, "notes.md"), "#"); writeFileSync(join(d, "run.py"), "x");
    writeFileSync(join(runs, "reports", "run-analysis", "secret.html"), "no");
    symlinkSync(join(runs, "reports", "run-analysis", "secret.html"), join(d, "escape.html"));
    expect(reportFile(runs, "2026-10-17_cook", ["index.html"])).toEqual({ path: join(d, "index.html"), type: "text/html; charset=utf-8" });
    expect(reportFile(runs, "2026-10-17_cook", ["shots", "a-1.png"])?.type).toBe("image/png");
    expect(reportFile(runs, "2026-10-17_cook", [])?.path).toBe(join(d, "index.html"));
    for (const parts of [["run.py"], ["..", "secret.html"], ["escape.html"], ["missing.html"], [".hidden.html"], ["shots", ""], ["a/b.html"]]) expect(reportFile(runs, "2026-10-17_cook", parts), parts.join("/")).toBeNull();
    for (const slug of ["../runs", "2026-10-17", "x_2026-10-17", "2026-10-17_Cook", "2026-10-17_missing"]) expect(reportFile(runs, slug, ["index.html"]), slug).toBeNull();
  });
});
