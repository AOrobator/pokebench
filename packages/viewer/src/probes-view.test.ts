// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"disableCSSFileLoading":true,"disableJavaScriptFileLoading":true}}
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProbeDetail, ProbeSample, ProbeSummary } from "./probes.js";
import { defaultGroup, hashOf, keepGroup, modelGroups, pageHtml, parseHash, parseProbe, parseProbeList, type ViewState } from "./probes-view.js";
import { REFRESH_MS, bootProbes, mountProbes } from "./probes-main.js";

const PAGE = readFileSync(join(import.meta.dirname, "../static/probes.html"), "utf8");
const STATS = readFileSync(join(import.meta.dirname, "../static/workbench.html"), "utf8");
const REPORTS = readFileSync(join(import.meta.dirname, "../static/reports.html"), "utf8");
const CSS = readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8").replace(/\s+/g, " ");
const RUN = "2026-10-18T03-30-52_qwen36-gpu1_d3fc";
const NOW = Date.parse("2026-10-20T23:50:00Z");

function s(lane: string, c: string, arm: string, i: number, key: string, thinking = "t"): ProbeSample {
  return { lane, case: c, arm, sample: i, at: `2026-10-20T23:2${String(i)}:00.000Z`, elapsedMs: 3000, key, thinking };
}
const REP = 'navigate_to {"map_id":[0,16],"x":10,"y":19,"because":"back to LITTLEROOT"}';
const DIF = 'press_buttons {"buttons":["UP","A"]}';
function probe(over: Partial<ProbeDetail> = {}): ProbeDetail {
  return {
    id: "cited-destination-v1", title: "Does requiring a destination citation help or hurt loop recovery?", feature: "cited-destination-v1", tier: "diagnostic", arms: ["on", "off"],
    cases: [
      { id: "case-07", run: RUN, turn: 206, split: "heldout", title: "first milestone drought", at: "2026-10-18T03:48:16.516-04:00", recorded: { tool: "navigate_to", args: { x: 10, y: 19, map_id: [0, 16], because: "find MAY" } }, frame: "000019_0.png" },
      { id: "case-01", run: RUN, turn: 79, split: "development", title: "post-Birch <house> search", at: null, recorded: null, frame: null },
    ],
    lanes: [
      { id: "gpu0", model: "Qwen3.6-35B", state: "complete", completed: 16, planned: 16, started: "2026-10-20T23:21:25.439Z", ended: "2026-10-20T23:25:46.292Z", current: null, ceilingMs: 3_600_000 },
      { id: "gpu1", model: "Qwen3.6-35B", state: "complete", completed: 16, planned: 16, started: "2026-10-20T23:21:25.439Z", ended: "2026-10-20T23:26:22.104Z", current: null, ceilingMs: 3_600_000 },
      { id: "mac", model: "Qwen3.8-Flash", state: "running", completed: 3, planned: 64, started: "2026-10-20T23:20:15.074Z", ended: null, current: "case-07", ceilingMs: 3_600_000 },
    ],
    samples: [
      s("gpu0", "case-07", "on", 0, REP, "<script>alert(1)</script> thinking"), s("gpu0", "case-07", "on", 1, DIF), s("gpu1", "case-07", "on", 0, DIF),
      s("gpu0", "case-07", "off", 0, DIF), s("gpu1", "case-07", "off", 0, DIF), s("gpu1", "case-07", "off", 1, "(text only)"),
      s("gpu0", "case-01", "on", 0, "observe"), s("mac", "case-07", "on", 0, REP), s("mac", "case-07", "off", 0, REP),
    ],
    problems: [],
    ...over,
  };
}
const STATE: ViewState = { probe: "cited-destination-v1", group: "model:Qwen3.6-35B", caseId: "case-07", sample: null, blind: false, plot: false };
function dom(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}
const texts = (d: Document, sel: string): string[] => [...d.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, " ").trim());

describe("probe JSON from the server", () => {
  it("accepts the server's shapes and refuses anything else", () => {
    expect(parseProbe(probe())).toEqual(probe());
    for (const bad of [null, {}, { ...probe(), cases: [{ id: 1 }] }, { ...probe(), samples: [{ lane: "x" }] }, { ...probe(), lanes: "x" }, { ...probe(), arms: [1] }])
      expect(() => parseProbe(bad)).toThrow("probe");
    const list: ProbeSummary[] = [{ id: "a", title: "A", feature: "f", started: null, live: false, lanes: [{ id: "gpu0", state: "complete", completed: 1, planned: 1 }] }];
    expect(parseProbeList(list)).toEqual(list);
    for (const bad of [null, [{ id: "a" }], [{ ...list[0], lanes: [{ id: "x", state: "weird", completed: 1, planned: 1 }] }]]) expect(() => parseProbeList(bad)).toThrow("probe list");
  });
  it("reads and writes the selection in the hash", () => {
    expect(parseHash("#cited-destination-v1/case-07")).toEqual({ probe: "cited-destination-v1", caseId: "case-07" });
    expect(parseHash("#only")).toEqual({ probe: "only", caseId: null });
    expect(parseHash("")).toEqual({ probe: null, caseId: null });
    expect(parseHash("#%E0%A4%A")).toEqual({ probe: null, caseId: null });
    expect(hashOf("p", "case 1")).toBe("#p/case%201");
  });
});

describe("lanes by model (INV-1)", () => {
  it("keeps two models apart when their names end alike, and labels a lane with no model", () => {
    const models: Record<string, string | null> = { gpu0: "original/model.gguf", gpu1: "finetuned/model.gguf", mac: null };
    const names: Record<string, string> = { gpu0: "a", gpu1: "b", mac: "c" };
    const p = probe({ lanes: probe().lanes.map((l) => ({ ...l, id: names[l.id] ?? l.id, model: models[l.id] ?? null })) });
    expect(modelGroups(p).map((g) => g.lanes)).toEqual([["a"], ["b"], ["c"]]);
    expect(texts(dom(pageHtml(p, { ...STATE, group: "lane:c" }, NOW, false)), "[data-group]")).toEqual(["MODEL · A", "MODEL · B", "UNKNOWN MODEL · C"]);
  });
  it("keeps the selected lanes when a lane's model name arrives on refresh", () => {
    const before = probe({ lanes: probe().lanes.map((l) => (l.id === "gpu0" ? { ...l, model: null } : l)) });
    expect(keepGroup(before, probe(), "lane:gpu0")).toBe("model:Qwen3.6-35B");
    expect(keepGroup(probe(), probe(), "model:Qwen3.8-Flash")).toBe("model:Qwen3.8-Flash");
    expect(keepGroup(probe(), probe(), "lane:gone")).toBe(defaultGroup(probe()));
  });
  it("groups lanes that run the same model, and never pools models", () => {
    expect(modelGroups(probe())).toEqual([{ key: "model:Qwen3.6-35B", lanes: ["gpu0", "gpu1"] }, { key: "model:Qwen3.8-Flash", lanes: ["mac"] }]);
    const gpu = dom(pageHtml(probe(), STATE, NOW, false));
    const mac = dom(pageHtml(probe(), { ...STATE, group: "model:Qwen3.8-Flash" }, NOW, false));
    expect(gpu.querySelectorAll('[data-arm="on"] .pr-sq:not(.todo)')).toHaveLength(3);
    expect(mac.querySelectorAll('[data-arm="on"] .pr-sq:not(.todo)')).toHaveLength(1);
    expect(texts(gpu, "[data-group]")).toEqual(["QWEN3.6-35B · GPU0+GPU1", "QWEN3.8-FLASH · MAC"]);
    expect(gpu.querySelector('[data-group="model:Qwen3.6-35B"]')?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the page (design N)", () => {
  const d = dom(pageHtml(probe(), STATE, NOW, false));
  it("has the big header: one tile per lane and the held-out summary", () => {
    expect(texts(d, ".pr-kpi .pr-k")).toEqual(["GPU0 · QWEN3.6-35B", "GPU1 · QWEN3.6-35B", "MAC · QWEN3.8-FLASH", "HELD-OUT DEPARTS · ON VS OFF"]);
    expect(texts(d, ".pr-kpi .pr-v")).toEqual(["16/16", "16/16", "3/64", "67% · 67%"]);
    expect(texts(d, ".pr-kpi .pr-tail").slice(0, 3)).toEqual(["done 7:25 PM", "done 7:26 PM", "ETA 7:53 PM"]);
    expect(d.querySelector("h1")?.textContent).toBe("Does requiring a destination citation help or hurt loop recovery?");
  });
  it("lists every case as a slot with ON/OFF pills and a gap bar, the selected one current", () => {
    expect(texts(d, ".pr-slot .pr-slot-id")).toEqual(["C7 T206", "C1 T79"]);
    expect(d.querySelector('.pr-slot[data-case="case-07"]')?.getAttribute("aria-current")).toBe("true");
    expect(d.querySelectorAll('.pr-slot[data-case="case-07"] .pr-hp')).toHaveLength(2);
    expect(d.querySelectorAll('.pr-slot[data-case="case-07"] .pr-gap')).toHaveLength(1);
    expect(d.body.innerHTML).toContain("post-Birch &lt;house&gt; search");
  });
  it("shows the case as a battle with the source frame between the arms", () => {
    expect(d.querySelector(".pr-scene img")?.getAttribute("src")).toBe(`/api/runs/${RUN}/frames/000019_0.png`);
    expect(texts(d, ".pr-scene .pr-side .pr-big")).toEqual(["2/3", "2/3"]);
  });
  it("draws one square per sample, hollow squares for those still to come, the gap bar, the hint and the stand-in note", () => {
    expect([...d.querySelectorAll('.pr-main [data-arm="on"] .pr-sq')].map((e) => e.className)).toEqual(["pr-sq rep", "pr-sq dif", "pr-sq dif", "pr-sq todo", "pr-sq todo", "pr-sq todo", "pr-sq todo", "pr-sq todo"]);
    expect([...d.querySelectorAll('.pr-main [data-arm="off"] .pr-sq')].map((e) => e.className).slice(0, 3)).toEqual(["pr-sq dif", "pr-sq dif", "pr-sq err"]);
    expect(d.querySelectorAll(".pr-main .pr-gap")).toHaveLength(1);
    expect(texts(d, ".pr-verdict")[0]).toBe("About the same. ON 2/3 vs OFF 2/3 depart from the recorded call.");
    expect(d.body.textContent).toContain("A line that crosses the middle means too close to call.");
    expect(d.body.textContent).toContain("automatic stand-in until the hand rubric is graded"); // INV-5
    expect(texts(d, ".pr-recorded .pr-call")[0]).toContain("navigate_to x=10 y=19 map_id=[0,16]");
  });
  it("reads a picked sample: its call, citation and thinking, escaped", () => {
    const picked = dom(pageHtml(probe(), { ...STATE, sample: "gpu0/case-07/on/0" }, NOW, false));
    const reader = picked.querySelector(".pr-reader");
    expect(reader?.textContent).toContain("because: back to LITTLEROOT");
    expect(reader?.innerHTML).toContain("&lt;script&gt;alert(1)&lt;/script&gt; thinking");
    expect(picked.querySelector('.pr-sq[data-sample="gpu0/case-07/on/0"]')?.getAttribute("aria-current")).toBe("true");
    expect(d.querySelector(".pr-reader")?.textContent).toContain("Pick a square");
  });
  it("hides the arm names when arm-blind", () => {
    const blind = dom(pageHtml(probe(), { ...STATE, blind: true }, NOW, false));
    expect(texts(blind, ".pr-main .pr-type em")).toEqual(["X", "Y"]);
    expect(blind.querySelector(".pr-main")?.textContent).not.toMatch(/\bON\b|\bOFF\b/);
  });
  it("folds the effect plot with its reading guide, and opens it on request", () => {
    expect(d.querySelector("details.pr-more")?.hasAttribute("open")).toBe(false);
    const open = dom(pageHtml(probe(), { ...STATE, plot: true }, NOW, false));
    expect(open.querySelector("details.pr-more")?.hasAttribute("open")).toBe(true);
    expect(open.querySelectorAll("svg.pr-plot g[data-case]")).toHaveLength(2);
    expect(open.querySelector(".pr-guide")?.textContent).toContain("If the line crosses the center");
    const phone = dom(pageHtml(probe(), { ...STATE, plot: true }, NOW, true));
    expect(phone.querySelector("svg.pr-plot")?.getAttribute("viewBox")).toMatch(/^0 0 360 /);
  });
  it("marks squares ungraded when the recorded call is unknown, and lists the probe's problems", () => {
    const dev = dom(pageHtml(probe({ problems: ["mac/samples.jsonl line 2 is not JSON"] }), { ...STATE, caseId: "case-01" }, NOW, false));
    expect([...dev.querySelectorAll('.pr-main [data-arm="on"] .pr-sq')].map((e) => e.className)[0]).toBe("pr-sq unk");
    expect(dev.body.textContent).toContain("Recorded call unknown");
    expect(texts(dev, ".pr-problems li")).toEqual(["mac/samples.jsonl line 2 is not JSON"]);
  });
});

describe("the headers", () => {
  const chips = (html: string): string[][] => [...new DOMParser().parseFromString(html, "text/html").querySelectorAll<HTMLElement>('header.bar nav.nav-chips[aria-label="Pages"] .nav-chip')]
    .map((a) => [a.tagName, a.textContent, a.getAttribute("href") ?? "", a.getAttribute("aria-current") ?? ""]);
  it("link PROBES from every page, the current one filled and not a link", () => {
    expect(chips(PAGE)).toEqual([["A", "RUNS & COMPARISONS", "/comparisons", ""], ["A", "REPORTS", "/reports", ""], ["SPAN", "PROBES", "", "page"]]);
    expect(chips(STATS)).toEqual([["SPAN", "RUNS & COMPARISONS", "", "page"], ["A", "REPORTS", "/reports", ""], ["A", "PROBES", "/probes", ""]]);
    expect(chips(REPORTS)).toEqual([["A", "RUNS & COMPARISONS", "/comparisons", ""], ["SPAN", "REPORTS", "", "page"], ["A", "PROBES", "/probes", ""]]);
    expect(CSS).toContain(":root[data-phone] .pr-layout { grid-template-columns: minmax(0, 1fr); }");
  });
});

describe("mounting the page", () => {
  interface Harness { doc: Document; urls: string[]; ticks: (() => Promise<void>)[]; stopped: number; replaced: string[] }
  async function mount(hash: string, details: ProbeDetail[], list?: unknown): Promise<Harness> {
    const doc = new DOMParser().parseFromString(PAGE, "text/html");
    const h: Harness = { doc, urls: [], ticks: [], stopped: 0, replaced: [] };
    let n = 0;
    await mountProbes(doc, {
      hash, phone: false, now: () => NOW,
      fetchJson: (url) => {
        h.urls.push(url);
        if (url === "/api/probes") return Promise.resolve(list ?? [{ id: "cited-destination-v1", title: "T", feature: "f", started: null, live: true, lanes: [] }]);
        const detail = details[Math.min(n, details.length - 1)];
        n++;
        return Promise.resolve(detail);
      },
      every: (fn) => { h.ticks.push(fn); return () => { h.stopped++; }; },
      setHash: (value) => { h.replaced.push(value); },
    });
    return h;
  }
  const click = async (h: Harness, sel: string): Promise<void> => {
    const el = h.doc.querySelector(sel);
    if (el === null) throw new Error(`no ${sel}`);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  };

  it("opens the probe and case the hash names, and follows clicks", async () => {
    const h = await mount("#cited-destination-v1/case-01", [probe()]);
    expect(h.urls).toEqual(["/api/probes", "/api/probes/cited-destination-v1"]);
    expect(h.doc.querySelector('.pr-slot[aria-current="true"]')?.getAttribute("data-case")).toBe("case-01");
    await click(h, '.pr-slot[data-case="case-07"]');
    expect(h.replaced.at(-1)).toBe("#cited-destination-v1/case-07");
    await click(h, '.pr-sq[data-sample="gpu1/case-07/on/0"]');
    expect(h.doc.querySelector(".pr-reader")?.textContent).toContain("press_buttons");
    await click(h, '[data-group="model:Qwen3.8-Flash"]');
    expect(h.doc.querySelectorAll('.pr-main [data-arm="on"] .pr-sq:not(.todo)')).toHaveLength(1);
    await click(h, "[data-blind]");
    expect(texts(h.doc, ".pr-main .pr-type em")).toEqual(["X", "Y"]);
    await click(h, "details.pr-more summary");
    expect(h.doc.querySelector("details.pr-more")?.hasAttribute("open")).toBe(true);
    await click(h, 'svg.pr-plot g[data-case="case-01"]');
    expect(h.doc.querySelector('.pr-slot[aria-current="true"]')?.getAttribute("data-case")).toBe("case-01");
  });

  it("refreshes while a lane runs and stops once every lane is done", async () => {
    const done = probe({ lanes: probe().lanes.map((l) => ({ ...l, state: "complete" as const })) });
    const h = await mount("", [probe(), done]);
    expect(h.ticks).toHaveLength(1);
    await h.ticks[0]?.();
    expect(h.urls).toEqual(["/api/probes", "/api/probes/cited-destination-v1", "/api/probes/cited-destination-v1"]);
    expect(h.stopped).toBe(1);
    const still = await mount("", [done]);
    expect(still.ticks).toHaveLength(0);
  });

  it("switches probe from the picker and refetches it", async () => {
    const other = probe({ id: "older", title: "Older probe", lanes: probe().lanes.map((l) => ({ ...l, state: "complete" as const })) });
    const list = [{ id: "cited-destination-v1", title: "T", feature: "f", started: null, live: true, lanes: [] }, { id: "older", title: "O", feature: "f", started: null, live: false, lanes: [] }];
    const doc = new DOMParser().parseFromString(PAGE, "text/html");
    const urls: string[] = [], hashes: string[] = [];
    let stopped = 0;
    await mountProbes(doc, {
      hash: "", phone: false, now: () => NOW,
      fetchJson: (url) => { urls.push(url); return Promise.resolve(url === "/api/probes" ? list : url.endsWith("/older") ? other : probe()); },
      every: () => () => { stopped++; },
      setHash: (h) => { hashes.push(h); },
    });
    const select = doc.querySelector<HTMLSelectElement>("select[data-probe]");
    if (select === null) throw new Error("no picker");
    expect([...select.options].map((o) => o.textContent)).toEqual(["cited-destination-v1 · live", "older"]);
    select.value = "older";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(urls.at(-1)).toBe("/api/probes/older");
    expect(doc.querySelector("h1")?.textContent).toBe("Older probe");
    expect(hashes.at(-1)).toBe("#older/case-07");
    expect(stopped).toBe(1);
  });

  it("boots on the real window: fetch, a timer while live, and the hash in history", async () => {
    document.documentElement.innerHTML = new DOMParser().parseFromString(PAGE, "text/html").documentElement.innerHTML;
    const timers: number[] = [];
    const realSet = window.setInterval.bind(window), realClear = window.clearInterval.bind(window);
    window.setInterval = ((fn: () => void, ms: number) => { timers.push(ms); return realSet(fn, 1_000_000); }) as typeof window.setInterval;
    window.fetch = ((url: string) => Promise.resolve(new Response(JSON.stringify(url === "/api/probes" ? [{ id: "cited-destination-v1", title: "T", feature: "f", started: null, live: true, lanes: [] }] : probe())))) as typeof window.fetch;
    try {
      await bootProbes(window);
      expect(timers).toEqual([REFRESH_MS]);
      document.querySelector('.pr-slot[data-case="case-01"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(window.location.hash).toBe("#cited-destination-v1/case-01");
      window.fetch = (() => Promise.resolve(new Response("nope", { status: 500 })));
      await expect(bootProbes(window)).rejects.toThrow("GET /api/probes returned HTTP 500");
    } finally { window.setInterval = realSet; window.clearInterval = realClear; }
  });

  it("refuses a page without its mount point", async () => {
    await expect(mountProbes(new DOMParser().parseFromString("<body></body>", "text/html"), { hash: "", phone: false, now: () => NOW, fetchJson: () => Promise.resolve([]), every: () => () => undefined, setHash: () => undefined })).rejects.toThrow("data-pr");
  });

  it("keeps showing a lane's squares when its model name arrives on refresh", async () => {
    const noModel = probe({ lanes: probe().lanes.map((l) => ({ ...l, model: null })) });
    const h = await mount("#cited-destination-v1/case-07", [noModel, probe({ lanes: probe().lanes.map((l) => ({ ...l, state: "complete" as const })) })]);
    const ids = (): string[] => [...h.doc.querySelectorAll('.pr-main [data-arm="on"] .pr-sq:not(.todo)')].map((e) => e.getAttribute("data-sample") ?? "");
    expect(ids()).toEqual(["gpu0/case-07/on/0", "gpu0/case-07/on/1"]);
    await h.ticks[0]?.();
    expect(ids()).toEqual(["gpu0/case-07/on/0", "gpu0/case-07/on/1", "gpu1/case-07/on/0"]);
    expect(h.doc.querySelector('[data-group][aria-pressed="true"]')).not.toBeNull();
  });

  it("says so when there are no probes", async () => {
    const h = await mount("", [probe()], []);
    expect(h.doc.querySelector("[data-pr=app]")?.textContent).toContain("No probes yet");
    expect(h.urls).toEqual(["/api/probes"]);
  });
});
