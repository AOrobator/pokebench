import { describe, expect, it } from "vitest";
import { at, find, rec } from "../test-support/at.js";
import { fixture } from "../test-support/fixture.js";
import { buildSite, SiteError } from "./site.js";

const text = (out: ReadonlyMap<string, string | Uint8Array>, path: string): string => {
  const v = out.get(path);
  if (typeof v !== "string") throw new Error(`${path} missing or binary`);
  return v;
};

describe("buildSite", () => {
  it("writes every page plus every asset, unchanged, and a run page only for released runs", () => {
    const f = fixture();
    const out = buildSite(f);
    const pages = ["index.html", "results.html", "models.html", "models/model-a.html", "models/model-b.html", "models/model-c.html", "runs.html", "runs/ab07.html"];
    expect([...out.keys()].sort()).toEqual([...pages, ...f.assets.keys()].sort());
    expect(out.get("img/badges-over-time.png")).toBe(f.assets.get("img/badges-over-time.png"));
  });

  it("puts the leader, the best unhelped run, the cheapest run and the human record on Home (INV-1, INV-2)", () => {
    const home = text(buildSite(fixture()), "index.html");
    expect(home).toContain("BEST WITH HELP");
    expect(home).toContain("Beat the game");
    expect(home).toContain("1:02:05");
    expect(home).toContain("BEST WITHOUT HELP");
    expect(home).toContain("Beat 1 of the Elite Four");
    expect(home).toContain("CHEAPEST TO 5 GYM BADGES");
    expect(home).toContain("$2.50");
    expect(home).toContain("estimate");
    expect(home).toContain("HUMAN WORLD RECORD");
    expect(home).toContain("0:15:50");
    expect(home).toContain("Speedy");
  });

  it("says (assisted) with what helped, and (local) for our own GPUs", () => {
    const home = text(buildSite(fixture()), "index.html");
    expect(home).toContain("Model A (assisted)");
    expect(home).toContain("two hints");
  });

  it("changes exactly the number that changed in the data (INV-1)", () => {
    const a = fixture();
    const b = fixture();
    rec(b.points.series, 2).cost_usd = 3.75;
    const before = text(buildSite(a), "index.html");
    const after = text(buildSite(b), "index.html");
    expect(before).toContain("$2.50");
    expect(after).toContain("$3.75");
    expect(after.replace("$3.75", "$2.50")).toBe(before);
  });

  it("drops BEST WITHOUT HELP when an unassisted run leads, and names the leader BEST RUN", () => {
    const f = fixture();
    rec(f.chartData.series, 1).assisted = false;
    delete rec(f.site.series, 1).help;
    const home = text(buildSite(f), "index.html");
    expect(home).toContain("BEST RUN");
    expect(home).not.toContain("BEST WITHOUT HELP");
    expect(home).not.toContain("(assisted)");
  });

  it("does not call the cheapest run an estimate when its cost was measured", () => {
    const f = fixture();
    delete (rec(f.chartData.series, 2).cost as Record<string, unknown>).estimated;
    const home = text(buildSite(f), "index.html");
    expect(home).toContain("$2.50");
    expect(home).not.toContain("estimate");
  });

  it("leaves out the cheapest window when no unassisted run reached the threshold", () => {
    const f = fixture();
    f.chartData.series = (f.chartData.series as Record<string, unknown>[]).map((x) => ({ ...x, assisted: true }));
    expect(text(buildSite(f), "index.html")).not.toContain("CHEAPEST TO");
  });

  it("shows the chart in light and dark, choosing by the reader's colour scheme (INV-5)", () => {
    const home = text(buildSite(fixture()), "index.html");
    expect(home).toMatch(/<source media="\(prefers-color-scheme: dark\)" srcset="img\/badges-over-time-dark\.png">/);
    expect(home).toMatch(/<img [^>]*src="img\/badges-over-time\.png"/);
  });

  it("is one page with a lang, a viewport, the stylesheet and no script", () => {
    const home = text(buildSite(fixture()), "index.html");
    expect(home.startsWith("<!doctype html>\n<html lang=\"en\">")).toBe(true);
    expect(home).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(home).toContain('<link rel="stylesheet" href="site.css">');
    expect(home).toContain('<meta name="color-scheme" content="light dark">');
    expect(home).not.toContain("<script");
  });

  it("lists only built sections in the menu, marks Home as current and links GitHub", () => {
    const home = text(buildSite(fixture()), "index.html");
    expect(home).toMatch(/<a class="m-home" href="index.html" aria-current="page">/);
    expect(home).toContain('<a class="m-results" href="results.html">');
    expect(home).toContain('<a class="m-models" href="models.html">');
    expect(home).toContain('<a class="m-runs" href="runs.html">');
    expect(home).not.toContain("updates.html");
    expect(home).toContain('href="https://github.com/example/pokebench"');
  });

  it("escapes data text", () => {
    const f = fixture();
    (f.site.human as Record<string, unknown>).name = "<i>Speedy</i>";
    const home = text(buildSite(f), "index.html");
    expect(home).toContain("&lt;i&gt;Speedy&lt;/i&gt;");
    expect(home).not.toContain("<i>Speedy</i>");
  });

  it("refuses to build when an asset Home needs is missing", () => {
    const f = fixture();
    f.assets.delete("img/badges-over-time-dark.png");
    expect(() => buildSite(f)).toThrow(SiteError);
    expect(() => buildSite(f)).toThrow(/img\/badges-over-time-dark\.png/);
  });

  it("refuses to build when the stylesheet reaches the network", () => {
    const f = fixture();
    f.assets.set("site.css", new TextEncoder().encode("@import url(https://fonts.example/x.css);"));
    expect(() => buildSite(f)).toThrow(/site\.css: network/);
  });

  it("refuses to build when an asset path is not a plain relative path", () => {
    const f = fixture();
    f.assets.set("../x.css", new Uint8Array([1]));
    expect(() => buildSite(f)).toThrow(/asset path/);
  });
});

const rows = (page: string): string[] => {
  const body = page.slice(page.indexOf("<tbody>"), page.indexOf("</tbody>"));
  return body.split("<tr").slice(1);
};

describe("results.html", () => {
  const results = (): string => text(buildSite(fixture()), "results.html");

  it("shows the intro, the badges-over-time chart above the table, then the table, then badges for the money", () => {
    const r = results();
    const intro = r.indexOf('class="win intro"');
    const time = r.indexOf("img/badges-over-time.png");
    const table = r.indexOf('<table class="lb">');
    const money = r.indexOf("img/badges-for-the-money.png");
    expect(intro).toBeGreaterThan(0);
    expect(time).toBeGreaterThan(intro);
    expect(table).toBeGreaterThan(time);
    expect(money).toBeGreaterThan(table);
    expect(r).toMatch(/<source media="\(prefers-color-scheme: dark\)" srcset="img\/badges-over-time-dark\.png">/);
    expect(r).toMatch(/<source media="\(prefers-color-scheme: dark\)" srcset="img\/badges-for-the-money-dark\.png">/);
    expect(r).toContain('<a class="m-results" href="results.html" aria-current="page">');
  });

  it("has the column heads in order", () => {
    const heads = [...results().matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(heads).toEqual(["#", "MODEL", "FURTHEST PROGRESS", "TIME TO IT", "COST AT API PRICES", "HARNESS SETTINGS", "RUN"]);
  });

  it("puts the human world record first, unranked, with its red pill and note", () => {
    const first = at(rows(results()), 0);
    expect(first).toMatch(/^ class="ref">/);
    expect(first).toContain('<td class="rank c-rank">—</td>');
    expect(first).toContain('Speedy <span class="pill ref">HUMAN WORLD RECORD</span><span class="sub">for reference</span>');
    expect(first).toContain('aria-label="8 of 8 gym badges and the Hall of Fame"');
    expect(first).toContain("Beat the game (Hall of Fame)");
    expect(first).toContain("0:15:50");
  });

  it("ranks one row per chart series in standings order (INV-2: assisted rows ranked with the rest)", () => {
    const r = rows(results()).slice(1);
    expect(r).toHaveLength(4);
    expect(r.map((x) => /<td class="rank c-rank">(\d+)<\/td>/.exec(x)?.[1])).toEqual(["1", "2", "3", "4"]);
    expect(at(r, 0)).toContain("run-ab07".slice(4));
    expect(at(r, 1)).toContain("aa01");
    expect(at(r, 2)).toContain("Model C");
    expect(at(r, 3)).toContain("Model B");
  });

  it("labels assisted and local rows inline in plain parentheses, with no pills and no unassisted label", () => {
    const r = rows(results()).slice(1);
    expect(at(r, 0)).toMatch(/^ class="assisted">/);
    expect(at(r, 0)).toContain('<a href="models/model-a.html">Model A</a> <span class="where">(assisted)</span><span class="sub">two hints</span>');
    expect(at(r, 1)).toContain('<a href="models/model-a.html">Model A</a><span class="sub">linked runs</span>');
    expect(at(r, 3)).toContain('<a href="models/model-b.html">Model B</a> <span class="where">(local)</span>');
    expect(results()).not.toMatch(/unassisted/i);
    expect(r.join("")).not.toContain('class="pill');
  });

  it("says (local, assisted) for a local assisted run", () => {
    const f = fixture();
    rec(f.chartData.series, 2).assisted = true;
    rec(f.site.series, 2).help = "a guide";
    const r = text(buildSite(f), "results.html");
    expect(r).toContain('<span class="where">(local, assisted)</span><span class="sub">a guide</span>');
  });

  it("draws stars in the progress cell, and the crown only for the Hall of Fame", () => {
    const r = rows(results()).slice(1);
    expect(at(r, 0)).toContain('<i class="medal hof" title="Hall of Fame"></i>');
    expect(at(r, 1)).toContain('aria-label="8 of 8 gym badges"');
    expect(at(r, 1)).not.toContain("hof");
    expect(at(r, 1)).toContain("Beat 1 of the Elite Four (through Sidney)");
    expect(at(r, 3)).toContain('aria-label="5 of 8 gym badges"');
    expect(at(r, 3)).toContain("5 gym badges (Balance)");
  });

  it("shows cost, marking estimates, and the harness preset with its code version", () => {
    const r = rows(results()).slice(1);
    expect(at(r, 3)).toContain('about $2.50<span class="sub">estimate</span>');
    expect(at(r, 2)).toContain(">$1,234.50</td>");
    expect(at(r, 1)).toContain('<span class="mono">a-4h</span><a class="sub mono" href="https://github.com/example/pokebench/commit/aaaaaaaa1">code aaaaaaaa1</a>');
  });

  it("joins linked runs with arrows and links a short id only when that run has a released page", () => {
    const r = rows(results()).slice(1);
    expect(at(r, 0)).toContain('<a href="runs/ab07.html" class="mono">ab07</a>');
    expect(at(r, 1)).toContain('<span class="mono">aa01</span> → <span class="mono">aa02</span>');
    expect(at(r, 1)).not.toContain("runs/aa01.html");
  });
});

describe("models.html and model pages", () => {
  it("lists one card per model, linked to its page, with best progress with and without help", () => {
    const out = buildSite(fixture());
    const m = text(out, "models.html");
    expect(m.split('class="card model"').length - 1).toBe(3);
    expect(m).toContain('<a href="models/model-a.html">Model A</a>');
    expect(m).toContain("CLOUD MODEL");
    expect(m).toContain("OUR GPUS (local)");
    expect(m).toContain("BEST WITH HELP");
    expect(m).toContain("BEST WITHOUT HELP");
    expect(m).toContain("Beat the game (Hall of Fame)");
    expect(m).toContain('<a class="m-models" href="models.html" aria-current="page">');
  });

  it("heads a model page with its name, where it ran, its reasoning effort and context window", () => {
    const out = buildSite(fixture());
    const a = text(out, "models/model-a.html");
    expect(a).toContain("MODEL A · CLOUD MODEL · REASONING EFFORT MEDIUM · CONTEXT WINDOW 262,144 TOKENS");
    expect(a).toContain('href="../site.css"');
    expect(a).toContain('<a class="m-models" href="../models.html" aria-current="page">');
    expect(text(out, "models/model-b.html")).toContain("MODEL B · OUR GPUS (local) · REASONING EFFORT MEDIUM · CONTEXT WINDOW 65,536 TOKENS");
  });

  it("summarises the best run with and without help", () => {
    const a = text(buildSite(fixture()), "models/model-a.html");
    expect(a).toContain("Beat the game with help. Beat 1 of the Elite Four without.");
    const c = text(buildSite(fixture()), "models/model-c.html");
    expect(c).toContain("5 gym badges in 0:00:09.");
  });

  it("lists every run of the model with date, help, start, result, turns and harness", () => {
    const a = text(buildSite(fixture()), "models/model-a.html");
    const runRows = rows(a.slice(0, a.indexOf("</table>")));
    expect(runRows).toHaveLength(3);
    const lane = find(runRows, (r) => r.includes("ab07"));
    expect(lane).toContain('<a class="mono" href="../runs/ab07.html">ab07</a><span class="sub">2026-11-10</span>');
    expect(lane).toContain('Assisted<span class="sub">two hints</span>');
    expect(lane).toContain("4,124");
    expect(lane).toContain('<span class="mono">a-lane</span><a class="sub mono" href="https://github.com/example/pokebench/commit/bbbbbbbb2">code bbbbbbbb2</a>');
    expect(lane).toContain('<td data-l="TRACES">—</td>');
    const first = find(runRows, (r) => r.includes("aa01"));
    expect(first).toContain('<span class="mono">aa01</span><span class="sub">2026-11-01 · linked run 1 of 2</span>');
    expect(first).toContain(">None</td>");
    expect(first).toContain("a new game at power-on");
    expect(first).toContain("3 gym badges; stopped at its 4-hour limit");
    expect(first).toContain('<td data-l="TRACES"><a href="https://github.com/example/pokebench/releases/download/evidence-1/aa01_thinking.jsonl.gz">thinking</a> · <a href="https://github.com/example/pokebench/releases/download/evidence-1/aa01_trace.tar.xz">trace</a></td>');
  });

  it("compares milestone splits when a model has an assisted and an unassisted run", () => {
    const a = text(buildSite(fixture()), "models/model-a.html");
    expect(a).toContain("SPLITS");
    const splits = rows(a.slice(a.indexOf('<table class="tight">')));
    expect(at(splits, 0)).toContain("Stone Badge (gym 1)");
    expect(at(splits, 0)).toContain('<span class="faster">▲ 0:05 faster</span>');
    expect(at(splits, 1)).toContain('<span class="slower">▼ 0:10 slower</span>');
    expect(at(splits, 2)).toContain("even");
    const phoebe = find(splits, (r) => r.includes("Elite Four: Phoebe"));
    expect(phoebe).toContain("not reached");
    expect(find(splits, (r) => r.includes("Hall of Fame"))).toContain("1:02:05");
    expect(text(buildSite(fixture()), "models/model-b.html")).not.toContain("SPLITS");
  });
});

describe("runs.html and run pages", () => {
  it("lists every run, newest first, linking released runs and each model page", () => {
    const r = text(buildSite(fixture()), "runs.html");
    const list = rows(r);
    expect(list).toHaveLength(5);
    expect(list.map((x) => /(?:>|")([a-z0-9]{4})<\/(?:a|span)>/.exec(x)?.[1])).toEqual(["ab07", "aa02", "aa01", "c001", "b001"]);
    expect(at(list, 0)).toContain('<a class="mono" href="runs/ab07.html">ab07</a>');
    expect(at(list, 0)).toContain('<a href="models/model-a.html">Model A</a>');
    expect(at(list, 0)).toContain("2026-11-10");
    expect(at(list, 0)).toContain("Assisted");
    expect(at(list, 4)).toContain("None");
    expect(at(list, 4)).toContain("7,248");
    expect(r).toContain('<a class="m-runs" href="runs.html" aria-current="page">');
  });

  it("links each run's released thinking, trace and Codex transcript files, and explains them", () => {
    const r = text(buildSite(fixture()), "runs.html");
    const list = rows(r);
    expect(at(list, 3)).toContain('<a href="https://github.com/example/pokebench/releases/download/evidence-1/c001_thinking.jsonl.gz">thinking</a> · <a href="https://github.com/example/pokebench/releases/download/evidence-1/c001_codex-transcript.jsonl.gz">Codex transcript</a>');
    expect(at(list, 4)).toContain('<td data-l="TRACES">—</td>');
    expect(r).toContain("<th>TRACES</th>");
    expect(r).toContain("one line per turn");
    expect(r).toContain("encrypted");
  });

  it("puts the release on the run page: title, facts, downloads with sizes, verify command, team and how to check", () => {
    const p = text(buildSite(fixture()), "runs/ab07.html");
    expect(p).toContain("HEAVILY ASSISTED · RELEASED FOR CHECKING");
    expect(p).toContain("Model A, from power-on to the Hall of Fame");
    expect(p).toContain("Started 2026-11-10 at 15:38 from a new game.");
    expect(p).toContain("4,124 TURNS");
    expect(p).toContain('<a class="go" href="https://github.com/example/pokebench/releases/tag/model-a-lane-ab07">DOWNLOAD THE RELEASE</a>');
    expect(p).toContain('<a class="mono" href="https://github.com/example/pokebench/releases/download/model-a-lane-ab07/events-ab07.tar.xz">events-ab07.tar.xz</a>');
    expect(p).toContain("12 MB");
    expect(p).toContain("783 B");
    expect(p).toContain("<code>just verify-release &lt;folder&gt;</code>");
    expect(p).toContain("commit <code>bbbbbbbb2</code>, with no local changes");
    expect(p).toContain("<b>RAYQUAZA</b>");
    expect(p).toContain("Run <code>just verify-release &lt;this folder&gt;</code>.");
    expect(p).toContain("INDEPENDENT REPLAY");
    expect(p).toContain('<a href="../models/model-a.html">Model A</a>, reasoning effort medium, context window 262,144 tokens');
    expect(p).toContain('<a class="m-runs" href="../runs.html" aria-current="page">');
  });

  it("changes every page that shows a run's turns when the data changes, and no other (INV-1)", () => {
    const a = buildSite(fixture());
    const f = fixture();
    rec(f.runs.runs, 2).turns = 4200;
    const b = buildSite(f);
    const changed = [...a.keys()].filter((k) => a.get(k) !== b.get(k) && typeof a.get(k) === "string");
    expect(changed.sort()).toEqual(["models/model-a.html", "runs.html", "runs/ab07.html"]);
    expect(text(b, "runs/ab07.html")).toContain("4,200 TURNS");
  });

  it("escapes release text", () => {
    const f = fixture();
    (rec(f.runs.runs, 2).release as Record<string, unknown>).title = "<script>x</script>";
    const p = text(buildSite(f), "runs/ab07.html");
    expect(p).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(p).not.toContain("<script>");
  });

  it("refuses to build when runs.json leaves out a plotted run", () => {
    const f = fixture();
    (f.runs.runs as unknown[]).splice(0, 1);
    expect(() => buildSite(f)).toThrow(/run-aa01/);
  });
});

describe("a released run that is one of several linked runs", () => {
  it("leaves out series totals, names its final team plainly and skips empty notes", () => {
    const f = fixture();
    const release = rec(f.runs.runs, 2).release as Record<string, unknown>;
    delete rec(f.runs.runs, 2).release;
    release.notes = [];
    rec(f.runs.runs, 0).release = release;
    const out = buildSite(f);
    expect(out.has("runs/ab07.html")).toBe(false);
    const p = text(out, "runs/aa01.html");
    expect(p).toContain("800 TURNS");
    expect(p).not.toContain("AT API PRICES");
    expect(p).toContain("FINAL TEAM");
    expect(p).not.toContain("HALL OF FAME TEAM");
    expect(p).not.toContain("INDEPENDENT REPLAY");
    expect(text(out, "results.html")).toContain('<a href="runs/aa01.html" class="mono">aa01</a> → <span class="mono">aa02</span>');
  });
});
