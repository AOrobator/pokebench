// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { HUMAN_REFERENCE, FRONTIER_MILESTONES, frontierReferences, frontierPlot, frontierCoverage, frontierModelColors } from "./frontier.js";
import type { WorkbenchRun } from "./workbench-data.js";
const referenceNames = ["PLAYER_NAME_CONFIRMED", "FIRST_TRUCK_EXIT", "CLOCK_SET", "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED", "RIVAL_MET", "STARTER_CHOSEN", "RUSTBORO_CITY_GYM", "STONE_BADGE"];
function measured(id: string, times: readonly (number | null)[], controller: "agent" | "human" = "agent"): WorkbenchRun {
  return Object.assign(run({ id, cohort: "selected", splits: times.flatMap((elapsedMs, i) => elapsedMs === null ? [] : [{ name: referenceNames[i] ?? "", elapsedMs, segmentMs: 0, seq: i + 1, turn: 1, inputTokens: 0, outputTokens: 0 }]) }), {
    measurement: { controller, features: ["story-milestones-v2", "post-clock-navigation-milestones-v1"], logSha256: "a".repeat(64), pausedMs: controller === "human" ? 53869 : 0,
      rawSplits: times.flatMap((elapsedMs, i) => elapsedMs === null ? [] : [{ name: referenceNames[i] ?? "", elapsedMs: elapsedMs + (controller === "human" ? 53869 : 0), evidence: [i] }]) },
  });
}
const human = (): WorkbenchRun => measured(HUMAN_REFERENCE, [92246, 132921, 180979, 248863, 257446, 284511, 317885, 408081, 4194258, 6645610], "human");
const best = (): WorkbenchRun => measured("dea1", [153477, 200600, 496944, 579200, 1301593, 1328664, 1477567]);
describe("persistent actual native frontier", () => {
  it("selects progress before speed and keeps one actual run, with stable ties", () => {
    const fast = measured("early", [1000, 2000, 3000]);
    const slow = measured("later-slow", [5000, 6000, 7000, 8000, 1500000]);
    const picked = frontierReferences([slow, best(), human(), fast]);
    expect(picked.human?.id).toBe(HUMAN_REFERENCE); expect(picked.best?.id).toBe("dea1");
    expect(picked.best?.splits[0]?.elapsedMs).toBe(153477);
    expect(frontierReferences([best(), measured("aaa", [153477, 200600, 496944, 579200, 1301593, 1328664, 1477567])]).best?.id).toBe("aaa");
  });
  it("excludes probes, human, incomplete, infrastructure, unknown-provenance and resumed sessions from records", () => {
    const advanced = measured("advanced", [1, 2, 3, 4, 5, 6, 7, 8]);
    const config = advanced.config; if (config === null) throw new Error("fixture config");
    const unknown = run({ id: "unknown", splits: advanced.splits });
    const refs = frontierReferences([human(), best(), unknown, { ...advanced, id: "probe", excluded: "Excluded probe session" }, { ...advanced, id: "infra", problem: "invalid" }, { ...advanced, id: "running", status: "live" }, { ...advanced, id: "resumed", config: { ...config, start: "save_state" } }]);
    expect(refs.best?.id).toBe("dea1");
    expect(frontierReferences([])).toMatchObject({ human: null, best: null });
  });
  it("exposes required rival locations while excluding optional detours from axis and frontier credit", () => {
    expect(FRONTIER_MILESTONES.map(m => m.id)).toContain("RIVAL_HOUSE_ENTERED");
    expect(FRONTIER_MILESTONES.map(m => m.id)).toContain("RIVAL_BEDROOM_REACHED");
    expect(FRONTIER_MILESTONES.map(m => m.id)).toContain("RIVAL_MET");
    expect(FRONTIER_MILESTONES.some(m => /LAB|AIDE/.test(m.id))).toBe(false);
    const optional = measured("optional", [1000]);
    optional.splits.push({ name: "LAB_ENTERED", elapsedMs: 2000, segmentMs: 1000, seq: 2, turn: 2, inputTokens: 0, outputTokens: 0 });
    expect(frontierReferences([optional, best()]).best?.id).toBe("dea1");
  });
  it("keeps missing splits as gaps and references independent of filtered overlays", () => {
    const refs = frontierReferences([human(), best()]);
    const gap = measured("gap<script>", [1000, null, 3000]);
    document.body.innerHTML = frontierPlot(refs, [gap], 340);
    expect(document.querySelector(".wb-frontier-chart")?.getAttribute("viewBox")).toContain("0 0 340");
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(10);
    expect(document.querySelectorAll('[data-run="dea1"]')).toHaveLength(7);
    expect(document.querySelectorAll('polyline[data-series="gap<script>"]')).toHaveLength(0);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(document.querySelector('[data-split="STONE_BADGE"]')).not.toBeNull();
    document.body.innerHTML = frontierPlot(refs, [], 920);
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(10);
    expect(document.querySelector('[data-split="PLAYER_HOUSE_EXITED_AFTER_CLOCK"]')).not.toBeNull();
    expect(document.querySelector('[data-split="STONE_BADGE"]')).not.toBeNull();
  });
  it("colors models distinctly, shares color within a model and identifies each color in a legend", () => {
    const a = { ...best(), id: "model-a-1", model: "Alpha" }, a2 = { ...best(), id: "model-a-2", model: "Alpha" };
    const b = { ...best(), id: "model-b", model: "Beta" }, refs = { human: human(), best: a };
    document.body.innerHTML = frontierPlot(refs, [a, a2, b], 640);
    const first = document.querySelector('[data-run="model-a-1"]')?.getAttribute("fill"), second = document.querySelector('[data-run="model-a-2"]')?.getAttribute("fill"), other = document.querySelector('[data-run="model-b"]')?.getAttribute("fill");
    expect(first).toBe("#af8915"); expect(second).not.toBe(other);
    expect(document.querySelector('[data-run="model-a-1"]')?.getAttribute("stroke")).toBe("#af8915");
    expect(document.querySelector('[data-model="Alpha"]')?.textContent).toContain("Alpha");
    expect(document.querySelector('[data-model="Beta"]')?.textContent).toContain("Beta");
    expect(document.querySelector('[data-model="Alpha"] i')?.getAttribute("style")).toContain(second);
    for (const id of ["model-a-1", "model-a-2", "model-b", HUMAN_REFERENCE]) {
      expect(document.querySelector(`[data-series="${id}"]`)?.getAttribute("stroke")).toBe(document.querySelector(`[data-run="${id}"]`)?.getAttribute("fill"));
    }
    expect(document.querySelector('[data-reference="human"]')?.textContent).toContain("Human baseline");
    expect(document.querySelector('[data-reference="best"]')?.textContent).toContain("Agent frontier");
    expect(document.querySelector('[data-reference="best"] svg')?.getAttribute("fill")).toBe("#af8915");
    expect(document.querySelector('[data-reference="human"] svg')?.getAttribute("fill")).toBe("#304f7a");
  });
  it("keeps colors stable across filtering, reordered snapshots and newly recorded models", () => {
    const a = { ...best(), model: "Zulu" }, b = { ...best(), model: "Alpha" }, unknown = { ...best(), model: null };
    const colors = frontierModelColors([a, b, unknown]);
    const updated = frontierModelColors([{ ...best(), model: "A newly recorded model" }, b, a, unknown], colors);
    expect(updated.get("Zulu")).toBe(colors.get("Zulu")); expect(updated.get("Alpha")).toBe(colors.get("Alpha"));
    document.body.innerHTML = frontierPlot({ human: null, best: a }, [{ ...a, id: "filtered-overlay" }], 640, updated);
    expect(document.querySelector('[data-run="filtered-overlay"]')?.getAttribute("fill")).toBe(colors.get("Zulu"));
    const many = frontierModelColors(Array.from({ length: 12 }, (_, i) => ({ ...best(), model: `Model ${String(i)}` })));
    expect(new Set(many.values()).size).toBe(12); expect(colors.has("Model not recorded")).toBe(true);
  });
  it("includes the full required progression instead of skipping the human run's middle and finish", () => {
    const names = FRONTIER_MILESTONES.map(m => m.id);
    for (const name of ["NEW_GAME_CREATED", "LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "MOM_CLOCK_INSTRUCTION", "PLAYER_BEDROOM", "MOM_RIVAL_INSTRUCTION", "ROUTE_101", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "OLDALE_TOWN", "ROUTE_103", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "ROUTE_102", "PETALBURG_CITY", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "ROUTE_104", "PETALBURG_WOODS", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_CITY", "ROXANNE_DEFEATED", "RUSTBORO_GYM_COMPLETE", "ROCK_TOMB_RECEIVED"]) expect(names).toContain(name);
    expect(names.some(name => /TRAINER|FIRST_POKEMON|EVOLUTION|HEAL|ROUTE_115|ROUTE_116|RUSTURF/.test(name))).toBe(false);
    const recorded = human(); recorded.splits = names.map((name, i) => ({ name, elapsedMs: i * 1000, segmentMs: 1000, seq: i, turn: 0, inputTokens: 0, outputTokens: 0 }));
    document.body.innerHTML = frontierPlot({human: recorded, best: null}, [], 340);
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(names.length);
  });
  it("omits optional gym battles and preserves their exclusion from story rank", () => {
    const trainer = measured("trainer", [1000]);
    trainer.splits.push({name:"RUSTBORO_GYM_TRAINER_JOSH_DEFEATED",elapsedMs:2000,segmentMs:1000,seq:20,turn:2,inputTokens:0,outputTokens:0});
    document.body.innerHTML=frontierPlot({human:human(),best:best()},[trainer],900);
    expect(document.body.textContent).not.toContain("GYM TRAINER BATTLES");
    expect(document.querySelector('.wb-gym-checkpoints')).toBeNull();
    expect(frontierReferences([trainer,best()]).best?.id).toBe("dea1");
  });
  it("retains failed denominators and identifies unsupported and censored outcomes", () => {
    const failed = measured("failed", []), running = measured("running", []), interrupted = measured("interrupted", []); running.status = "live"; interrupted.status = "unresponsive";
    const unknown = run({ id: "old", splits: [] });
    const html = frontierCoverage([best(), failed, running, interrupted, unknown], "RIVAL_MET");
    expect(html).toContain("1 / 5"); expect(html).toContain("1 not reached"); expect(html).toContain("1 pending"); expect(html).toContain("1 censored"); expect(html).toContain("1 unsupported");
    expect(frontierCoverage([], "RIVAL_MET")).toContain("0 / 0");
    const resumed = best(); if (resumed.config !== null) resumed.config.start = "save_state";
    expect(frontierCoverage([best(), human(), resumed], "RIVAL_MET")).toContain("1 / 1");
    expect(frontierCoverage([best(), human(), resumed], "RIVAL_MET")).toContain("2 excluded");
  });
  it("shows unavailable persistent references explicitly instead of silently substituting another human", () => {
    document.body.innerHTML = frontierPlot(frontierReferences([measured("other-human", [1], "human")]), [], NaN);
    expect(document.body.textContent).toContain("Human reference unavailable");
    expect(document.body.textContent).toContain("Agent frontier unavailable");
  });
});
describe("zoom to frontier", () => {
  const axis = (): string[] => Array.from(document.querySelectorAll(".wb-frontier-chart text.wb-axis")).map(t => t.textContent);
  it("ends at the next human milestone after the farthest agent and rescales time to visible points", () => {
    const refs = { human: human(), best: best() };
    document.body.innerHTML = frontierPlot(refs, [], 2000, undefined, [], true);
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(8);
    expect(document.querySelector('[data-split="STARTER_CHOSEN"]')).not.toBeNull();
    expect(document.querySelector('[data-split="STONE_BADGE"]')).toBeNull();
    expect(axis()).toContain("Starter"); expect(axis()).not.toContain("Oldale"); expect(axis()).not.toContain("Badge");
    expect(axis()).toContain("30"); expect(axis()).not.toContain("120");
    expect(document.querySelector(".wb-frontier-chart")?.getAttribute("aria-label")).toBe("Story frontier zoomed to New game through Starter");
    expect(document.body.textContent).toContain("Zoomed to the frontier: New game → Starter, 15 of 36 checkpoints");
    expect(document.body.textContent).toContain("21 later checkpoints hidden");
    document.body.innerHTML = frontierPlot(refs, [], 2000);
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(10);
    expect(axis()).toContain("120"); expect(document.body.textContent).not.toContain("Zoomed");
  });
  it("widens for overlays and live runs but never for human-only progress", () => {
    const deeper = measured("deeper", [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]);
    document.body.innerHTML = frontierPlot({ human: human(), best: best() }, [deeper], 2000, undefined, [], true);
    expect(axis()).toContain("Gym entry"); expect(document.querySelector('[data-split="STONE_BADGE"]')).toBeNull();
    const live = { ...measured("live", [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]), status: "live" as const };
    document.body.innerHTML = frontierPlot({ human: human(), best: best() }, [], 2000, undefined, [live], true);
    expect(document.querySelector('[data-split="STONE_BADGE"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("Zoomed");
    document.body.innerHTML = frontierPlot({ human: human(), best: null }, [], 2000, undefined, [], true);
    expect(axis()).toContain("New game"); expect(axis()).toContain("Name"); expect(axis()).not.toContain("Truck exit");
    expect(document.body.textContent).toContain("2 of 36 checkpoints");
  });
  it("ends at the next dense human checkpoint and widens for paused runs, keeping narrow labels honest", () => {
    const dense = human(); dense.splits = FRONTIER_MILESTONES.map((m, i) => ({ name: m.id, elapsedMs: (i + 1) * 1000, segmentMs: 1000, seq: i, turn: 0, inputTokens: 0, outputTokens: 0 }));
    document.body.innerHTML = frontierPlot({ human: dense, best: best() }, [], 2000, undefined, [], true);
    expect(document.body.textContent).toContain("New game → Route 101, 14 of 36 checkpoints");
    const paused = { ...measured("paused", [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]), status: "paused" as const };
    document.body.innerHTML = frontierPlot({ human: dense, best: best() }, [], 300, undefined, [paused], true);
    expect(document.body.textContent).toContain("New game → Birch rescue, 16 of 36 checkpoints");
    expect(document.body.textContent).toContain("all visible points remain plotted");
  });
  it("uses the next checkpoint when the human baseline is missing or has nothing later", () => {
    document.body.innerHTML = frontierPlot({ human: null, best: best() }, [], 2000, undefined, [], true);
    expect(axis()).toContain("Route 101"); expect(axis()).not.toContain("Starter");
    const short = measured(HUMAN_REFERENCE, [1000, 2000], "human");
    document.body.innerHTML = frontierPlot({ human: short, best: best() }, [], 2000, undefined, [], true);
    expect(axis()).toContain("Route 101"); expect(axis()).not.toContain("Starter");
  });
});

