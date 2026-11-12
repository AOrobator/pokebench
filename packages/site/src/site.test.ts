import { describe, expect, it } from "vitest";
import { rec } from "../test-support/at.js";
import { fixture } from "../test-support/fixture.js";
import { buildSite, SiteError } from "./site.js";

const text = (out: ReadonlyMap<string, string | Uint8Array>, path: string): string => {
  const v = out.get(path);
  if (typeof v !== "string") throw new Error(`${path} missing or binary`);
  return v;
};

describe("buildSite", () => {
  it("writes Home plus every asset, unchanged", () => {
    const f = fixture();
    const out = buildSite(f);
    expect([...out.keys()].sort()).toEqual(["index.html", ...f.assets.keys()].sort());
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
    expect(home).not.toContain("results.html");
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
