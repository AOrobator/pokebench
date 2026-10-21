// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"disableCSSFileLoading":true,"disableJavaScriptFileLoading":true}}
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detailHtml, listHtml, openedHtml, parseReportList, type ReportEntry } from "./reports-view.js";
import { mountReports } from "./reports-main.js";
import type { CardArt } from "./trainer-card.js";

const ART: CardArt = { trainers: ["birch", "may", "norman"], icons: new Set(), egg: 412 };
const top50: ReportEntry = { slug: "2026-10-17_top50", date: "2026-10-17", title: "Top 50 run analysis", kind: "FRONTIER", verdict: "The harness is helping.", frontier: "TEAM_AQUA_WOODS_EVENT_COMPLETE", facts: [["Bundle vs control", "8–0"]], trainer: "norman" };
const cook: ReportEntry = { slug: "2026-10-20_cook-6h-v2", date: "2026-10-20", title: "Cook runs <analysis>", kind: "COOK", verdict: null, frontier: null, facts: [], trainer: null };
const plain: ReportEntry = { slug: "2026-10-16_overnight", date: "2026-10-16", title: "Overnight", kind: "REPORT", verdict: null, frontier: "NOT_A_MILESTONE", facts: [], trainer: "wally" };
const LIST = [cook, top50, plain];
const PAGE = readFileSync(join(import.meta.dirname, "../static/reports.html"), "utf8");
const STATS = readFileSync(join(import.meta.dirname, "../static/workbench.html"), "utf8");
const CSS = readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8").replace(/\s+/g, " ");

describe("the report list", () => {
  it("accepts the server's list and refuses anything else", () => {
    expect(parseReportList(LIST)).toEqual(LIST);
    for (const bad of [null, {}, [{ ...top50, slug: 1 }], [{ ...top50, facts: [["x"]] }], [{ ...top50, kind: null }]]) expect(() => parseReportList(bad)).toThrow("report list");
  });
  it("numbers reports oldest as No.001 and marks the selected one", () => {
    const html = listHtml(LIST, "2026-10-17_top50");
    expect(html.match(/No\.\d{3}/g)).toEqual(["No.003", "No.002", "No.001"]);
    expect(html).toContain('href="/reports#2026-10-17_top50" data-report="2026-10-17_top50" aria-current="true"');
    expect(html).toContain("OCT 20"); expect(html).toContain("Cook runs &lt;analysis&gt;"); expect(html).not.toContain("<analysis>");
    expect(html).toContain('TYPE/<em style="--c:#7a3fb8">COOK</em>'); expect(html).toContain('<em style="--c:#5a6b85">REPORT</em>');
  });
});

describe("the report card", () => {
  it("draws the trainer card top with the frontier run's trainer, tier from the frontier, STORY bar and the verdict sheet", () => {
    const html = detailHtml(top50, 2, ART);
    expect(html).toContain("/sprites/card/wide-silver.png"); expect(html).toContain("/sprites/trainers/norman.png");
    expect(html).toContain("OCT 17 · No.002"); expect(html).toContain(">39/49<"); expect(html).toContain("Aqua woods event");
    expect(html).toContain("The harness is helping."); expect(html).toContain("<dt>Bundle vs control</dt><dd>8–0</dd>");
    expect(html).toContain('href="/reports?open=2026-10-17_top50"');
  });
  it("uses Professor Birch and the green card when a report names no trainer or frontier, and says so when it has no verdict", () => {
    const html = detailHtml(cook, 3, ART);
    expect(html).toContain("/sprites/trainers/birch.png"); expect(html).toContain("/sprites/card/wide-green.png"); expect(html).not.toContain("STORY");
    expect(html).toContain("Open the report to read its findings.");
    expect(detailHtml(plain, 1, ART)).toContain("/sprites/trainers/birch.png"); expect(detailHtml(plain, 1, ART)).not.toContain("STORY");
  });
  it("without the card art, keeps the same header as plain blocks", () => {
    const html = detailHtml(top50, 2, null);
    expect(html).not.toContain("/sprites/"); expect(html).toContain('class="rp-card plain"'); expect(html).toContain("Top 50 run analysis");
  });
});

describe("an opened report", () => {
  it("shows the report itself under a bar back to the list and to the newer and older reports", () => {
    const html = openedHtml(LIST, "2026-10-17_top50");
    expect(html).toContain('<iframe class="rp-frame" src="/reports/2026-10-17_top50/index.html" title="Top 50 run analysis">');
    expect(html).toContain('href="/reports#2026-10-17_top50">◀ REPORTS'); expect(html).toContain('href="/reports?open=2026-10-20_cook-6h-v2">NEWER'); expect(html).toContain('href="/reports?open=2026-10-16_overnight">OLDER');
    expect(openedHtml(LIST, "2026-10-20_cook-6h-v2")).toContain('<span class="off">NEWER</span>');
    expect(openedHtml(LIST, "missing")).toContain("No report");
  });
});

describe("the reports page", () => {
  function mount(search: string, hash: string, art = true): Promise<void> {
    document.documentElement.innerHTML = PAGE.replace(/<!doctype html>/i, "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
    return mountReports(document, { search, hash, fetchJson: (url) => url === "/api/reports" ? Promise.resolve(LIST) : art ? Promise.resolve(url.endsWith("manifest.json") ? { version: 1, tiers: ["green", "bronze", "copper", "silver", "gold"], trainers: ["birch", "norman"], icons: [1], egg: 412, proof: {}, source: {} } : {}) : Promise.reject(new Error("404")) });
  }
  const q = (s: string): HTMLElement => { const e = document.querySelector<HTMLElement>(s); if (e === null) throw new Error(s); return e; };
  it("lists every report newest first and shows the newest as the card", async () => {
    await mount("", "");
    expect([...document.querySelectorAll("[data-report]")].map(a => (a as HTMLElement).dataset.report)).toEqual(LIST.map(r => r.slug));
    expect(q('[data-rp="detail"]').innerHTML).toContain("Cook runs &lt;analysis&gt;");
    expect(q('[data-rp="open"]').hidden).toBe(true);
  });
  it("selecting a report shows its card without leaving the page; the hash picks one too", async () => {
    await mount("", "#2026-10-16_overnight");
    expect(q('[data-rp="detail"]').innerHTML).toContain("Overnight");
    q('[data-report="2026-10-17_top50"]').click();
    expect(q('[data-rp="detail"]').innerHTML).toContain("Top 50 run analysis"); expect(q('[data-report="2026-10-17_top50"]').getAttribute("aria-current")).toBe("true");
  });
  it("follows the address when only its hash changes, as back and forward do", async () => {
    await mount("", "");
    window.location.hash = "#2026-10-16_overnight"; window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(q('[data-rp="detail"]').innerHTML).toContain("Overnight"); expect(q('[data-report="2026-10-16_overnight"]').getAttribute("aria-current")).toBe("true");
  });
  it("on a phone, picking a report brings its card into view", async () => {
    await mount("", "");
    document.documentElement.setAttribute("data-phone", "");
    let scrolled = false; q('[data-rp="detail"]').scrollIntoView = () => { scrolled = true; };
    q('[data-report="2026-10-16_overnight"]').click();
    expect(scrolled).toBe(true);
    document.documentElement.removeAttribute("data-phone");
  });
  it("shows the newest report when the address carries a hash it cannot read", async () => {
    await mount("", "#%");
    expect(q('[data-rp="detail"]').innerHTML).toContain("Cook runs &lt;analysis&gt;");
    window.location.hash = "#%E0%A4%A"; window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(q('[data-rp="detail"]').innerHTML).toContain("Cook runs &lt;analysis&gt;");
  });
  it("opens a report inside the page", async () => {
    await mount("?open=2026-10-17_top50", "");
    expect(q('[data-rp="open"]').hidden).toBe(false); expect(q('[data-rp="index"]').hidden).toBe(true);
    expect(q("iframe.rp-frame").getAttribute("src")).toBe("/reports/2026-10-17_top50/index.html");
  });
  it("works without the card art", async () => {
    await mount("", "", false);
    expect(q('[data-rp="detail"]').innerHTML).toContain('class="rp-card plain"');
  });
  it("is linked from the stats page and styled for phones", () => {
    expect(STATS).toContain('href="/reports"');
    expect(CSS).toContain(":root[data-phone] .rp-split { grid-template-columns: minmax(0, 1fr); }"); expect(CSS).toContain(":root[data-phone] .rp-list { order: 2; }");
  });
});

describe("the header chips", () => {
  const chips = (html: string): string[][] => [...new DOMParser().parseFromString(html, "text/html").querySelectorAll<HTMLElement>('header.bar nav.nav-chips[aria-label="Pages"] .nav-chip')]
    .map(a => [a.tagName, a.textContent, a.getAttribute("href") ?? "", a.getAttribute("aria-current") ?? ""]);
  // The current page is not a link: following it would drop ?from= (the stats page's way back to a run) or ?open=.
  it("show the same pages on both headers, the current one filled and not a link", () => {
    expect(chips(STATS)).toEqual([["SPAN", "RUNS & COMPARISONS", "", "page"], ["A", "REPORTS", "/reports", ""], ["A", "PROBES", "/probes", ""]]);
    expect(chips(PAGE)).toEqual([["A", "RUNS & COMPARISONS", "/comparisons", ""], ["SPAN", "REPORTS", "", "page"], ["A", "PROBES", "/probes", ""]]);
    expect(STATS).not.toContain("viewer-workbench-link"); expect(PAGE).not.toContain("viewer-workbench-link"); expect(PAGE).not.toContain("rp-here");
  });
  it("style a link as the outline of the filled chip", () => {
    expect(CSS).toContain(".nav-chip { font: 8px/1 'Press Start 2P', monospace; color: #ffd447; border: 2px solid #ffd447; border-radius: 4px; padding: 5px 7px; text-decoration: none; }");
    expect(CSS).toContain('.nav-chip[aria-current="page"] { color: #283038; background: #ffd447; }');
  });
});
