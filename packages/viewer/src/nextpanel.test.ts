// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ALL_ON, FEATURES } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { NextRunPanel, type PanelDeps } from "./nextpanel.js";

const PAGE = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8");
const DRAFT = { model: "", thinking: "medium", maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3, maxTokens: 4096, target: null, features: { ...ALL_ON } };
const ui = (name: string): HTMLElement => { const e = document.querySelector<HTMLElement>(`[data-ui="${name}"]`); if (e === null) throw new Error(name); return e; };

function panel(replies: Record<string, unknown>, writes: (method: string, url: string, body: unknown) => Promise<unknown> = (_m, _u, body) => Promise.resolve({ draft: body, queue: { state: "idle" } })) {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const problems: string[] = [];
  const deps: PanelDeps = {
    fetchJson: (url) => url in replies ? (replies[url] instanceof Error ? Promise.reject(replies[url]) : Promise.resolve(replies[url])) : Promise.reject(new Error(`unexpected ${url}`)),
    sendJson: (method, url, body) => writes(method, url, body),
    problem: (text) => { problems.push(text); },
  };
  return { panel: new NextRunPanel(document, deps), problems };
}
const ok = { "/api/features": { features: FEATURES }, "/api/next-run": { draft: DRAFT, queue: { state: "idle" } }, "/api/models": { models: [] }, "/api/features/history": {} };

describe("next-run panel", () => {
  it("reports malformed or failing payloads instead of rendering guesses", async () => {
    for (const [url, value] of [["/api/features", { features: [{ id: 1 }] }], ["/api/features", {}], ["/api/next-run", { draft: {} }], ["/api/next-run", { draft: DRAFT, queue: {} }]] as const) {
      const { panel: p, problems } = panel({ ...ok, [url]: value });
      await p.load();
      expect(problems).toHaveLength(1);
      expect(p.draft === null || p.registry.length === 0 || problems[0]?.includes("queue")).toBe(true);
    }
    const { panel: p, problems } = panel({ ...ok, "/api/models": new Error("router down"), "/api/features/history": [] });
    await p.load();
    expect(ui("next-model-info").textContent).toContain("router down");
    expect(problems).toEqual(["feature history: Error: malformed history payload"]);
    const bad = panel({ ...ok, "/api/models": { models: [{}] } });
    await bad.panel.load();
    expect(ui("next-model-info").textContent).toContain("malformed models payload");
  });

  it("says when no run is live and starts the next run directly", async () => {
    const { panel: p } = panel({ ...ok, "/api/models": { models: [{ id: "Qwen", status: "loaded", vision: false, contextWindow: null }] } });
    await p.load();
    p.setLive(null);
    expect(ui("next-note").textContent).toContain("No run is live right now.");
    expect((ui("next-queue") as HTMLButtonElement).disabled).toBe(true);
    expect(ui("next-model").textContent).toContain("Qwen (no vision)");
    p.copyLive();
    expect(p.draft?.model).toBe("");
    const model = ui("next-model") as HTMLSelectElement;
    model.value = "Qwen"; model.dispatchEvent(new Event("change"));
    await vi.waitFor(() => { expect(p.draft?.model).toBe("Qwen"); });
    expect(ui("next-queue").textContent).toBe("▶ START NEXT RUN");
    const target = ui("next-target") as HTMLSelectElement;
    target.value = "RIVAL_MET"; target.dispatchEvent(new Event("change"));
    await vi.waitFor(() => { expect(p.draft?.target).toBe("RIVAL_MET"); });
    target.value = ""; target.dispatchEvent(new Event("change"));
    await vi.waitFor(() => { expect(p.draft?.target).toBeNull(); });
  });

  it("turns on what a switch needs and keeps inputs the operator is typing in", async () => {
    const { panel: p } = panel(ok);
    await p.load();
    p.toggle("live-map-v1", false);
    expect(p.draft?.features["world-coordinate-grid-v1"]).toBe(false);
    p.toggle("world-coordinate-grid-v1", true);
    expect([p.draft?.features["world-coordinate-grid-v1"], p.draft?.features["live-map-v1"]]).toEqual([true, true]);
    const turns = ui("next-max-turns") as HTMLInputElement;
    turns.focus(); turns.value = "12";
    p.render();
    expect(turns.value).toBe("12");
    ui("switchboard").dispatchEvent(new Event("click", { bubbles: true }));
    ui("next-thinking").dispatchEvent(new Event("click", { bubbles: true }));
    expect(p.expanded.size).toBe(0);
  });

  it("reports failed saves, queue requests and status polls", async () => {
    const { panel: p, problems } = panel(ok, () => Promise.reject(new Error("409 conflict")));
    await p.load();
    p.toggle("story-state-v1", false);
    await vi.waitFor(() => { expect(problems).toContain("save next run: Error: 409 conflict"); });
    await p.queueRun();
    await p.cancel();
    expect(problems).toEqual(expect.arrayContaining(["queue: Error: 409 conflict", "cancel: Error: 409 conflict"]));
    const replies: Record<string, unknown> = { ...ok };
    const polling = panel(replies);
    await polling.panel.poll();
    expect(polling.problems).toEqual([]);
    await polling.panel.load();
    replies["/api/next-run"] = new Error("gone");
    await polling.panel.poll();
    expect(polling.problems).toEqual(["queue status: Error: gone"]);
  });

  it("copies the live run's model, sampling, budgets, target and features", async () => {
    const { panel: p } = panel(ok);
    await p.load();
    const log = new Log();
    log.add(0, { ...START, harness_features: FEATURES.filter((f) => f.id !== "press-result-v1").map((f) => f.id), evaluation: { preset_id: "x", target: "RIVAL_MET", failure_limit: 5, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true } }, budgets: {} });
    const view = new RunView(); for (const e of log.events) view.apply(e);
    p.setLive(view);
    p.setLive(view);
    p.copyLive();
    expect(p.draft).toMatchObject({ model: "think-swarm", target: "RIVAL_MET", failureLimit: 5, maxTurns: 300, maxWallMs: 1_800_000, features: { "press-result-v1": false, "story-state-v1": true } });
  });
});

it("locks the next-run settings while a queued run waits, and unlocks on cancel", async () => {
  const { panel: p } = panel({ ...ok, "/api/models": { models: [{ id: "Qwen", status: "loaded", vision: true, contextWindow: 262144 }] } }, (_m, url, body) => Promise.resolve(url === "/api/next-run/queue" ? { queue: { state: "queued", runId: "r", waitingFor: "live run x" } } : url === "/api/next-run/cancel" ? { queue: { state: "idle" } } : { draft: body, queue: { state: "idle" } }));
  await p.load();
  p.toggle("story-state-v1", false);
  await vi.waitFor(() => { expect(p.draft?.features["story-state-v1"]).toBe(false); });
  const model = ui("next-model") as HTMLSelectElement;
  model.value = "Qwen"; model.dispatchEvent(new Event("change"));
  await vi.waitFor(() => { expect(p.draft?.model).toBe("Qwen"); });
  await p.queueRun();
  expect((ui("next-max-turns") as HTMLInputElement).disabled).toBe(true);
  expect((ui("next-copy") as HTMLButtonElement).disabled).toBe(true);
  expect((ui("next-queue") as HTMLButtonElement).disabled).toBe(true);
  expect(ui("switchboard").querySelectorAll("input[data-feature]:not([disabled])")).toHaveLength(0);
  expect(ui("next-note").textContent).toContain("Cancel it to edit");
  await p.cancel();
  expect((ui("next-max-turns") as HTMLInputElement).disabled).toBe(false);
  expect(ui("switchboard").querySelectorAll("input[data-feature]:not([disabled])").length).toBeGreaterThan(10);
});
