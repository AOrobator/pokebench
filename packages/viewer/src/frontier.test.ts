// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { HUMAN_REFERENCE, FRONTIER_MILESTONES, frontierReferences, frontierPlot, frontierModelColors, milestoneStatus } from "./frontier.js";
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
    const refs = frontierReferences([human(), best(), unknown, { ...advanced, id: "probe", excluded: "Excluded probe session" }, { ...advanced, id: "infra", problem: "invalid" }, { ...advanced, id: "resumed", config: { ...config, start: "save_state" } }]);
    expect(refs.best?.id).toBe("dea1");
    expect(frontierReferences([])).toMatchObject({ human: null, best: null });
  });
  it("exposes required rival locations while excluding optional detours from axis and frontier credit", () => {
    expect(FRONTIER_MILESTONES.map(m => m.id)).toContain("RIVAL_HOUSE_ENTERED");
    expect(FRONTIER_MILESTONES.map(m => m.id)).toContain("RIVAL_BEDROOM_REACHED");
    expect(FRONTIER_MILESTONES.map(m => m.id)).toContain("RIVAL_MET");
    const axis = FRONTIER_MILESTONES.map(m => m.id);
    expect(axis.indexOf("RIVAL_MET")).toBeLessThan(axis.indexOf("RIVAL_HOUSE_EXITED"));
    expect(axis.indexOf("RIVAL_HOUSE_EXITED")).toBeLessThan(axis.indexOf("BIRCH_RESCUE_REQUESTED"));
    expect(FRONTIER_MILESTONES.find(m => m.id === "RIVAL_HOUSE_EXITED")?.label).toBe("Left rival house");
    expect(axis.indexOf("BIRCH_RESCUE_REQUESTED")).toBeLessThan(axis.indexOf("ROUTE_101"));
    expect(axis.indexOf("ROUTE_101_AFTER_HANDOFF")).toBe(axis.indexOf("BIRCH_STARTER_HANDOFF_COMPLETE") + 1);
    expect(axis.indexOf("OLDALE_TOWN")).toBe(axis.indexOf("ROUTE_101_AFTER_HANDOFF") + 1);
    expect(FRONTIER_MILESTONES.find(m => m.id === "ROUTE_101_AFTER_HANDOFF")?.label).toBe("Back on Route 101");
    expect(axis.indexOf("PLAYER_BEDROOM_EXITED_AFTER_CLOCK")).toBe(axis.indexOf("CLOCK_SET") + 1);
    expect(axis.indexOf("MOM_RIVAL_INSTRUCTION")).toBe(axis.indexOf("PLAYER_BEDROOM_EXITED_AFTER_CLOCK") + 1);
    expect(FRONTIER_MILESTONES.find(m => m.id === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK")?.label).toBe("Leave bedroom");
    expect(axis.slice(axis.indexOf("ROUTE_103"), axis.indexOf("RECEIVED_POKEDEX") + 1)).toEqual(["ROUTE_103", "RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_BATTLE_WON", "RIVAL_OLDALE_SEND_OFF", "ROUTE_101_AFTER_RIVAL_BATTLE", "LITTLEROOT_AFTER_RIVAL_BATTLE", "RECEIVED_POKEDEX"]);
    expect(["RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_BATTLE_WON", "RIVAL_OLDALE_SEND_OFF", "ROUTE_101_AFTER_RIVAL_BATTLE", "LITTLEROOT_AFTER_RIVAL_BATTLE"].map(id => FRONTIER_MILESTONES.find(m => m.id === id)?.label)).toEqual(["Rival battle starts", "Rival beaten", "Rival sends you back", "Rival waits in Oldale", "Route 101, heading back", "Back in Littleroot"]);
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
    expect(document.body.textContent).not.toContain("exact times");
    expect(document.body.textContent).not.toContain("GYM TRAINER BATTLES");
    expect(document.querySelector('.wb-gym-checkpoints')).toBeNull();
    expect(frontierReferences([trainer,best()]).best?.id).toBe("dea1");
  });
  it("identifies reached, unsupported, pending, censored and excluded milestone outcomes", () => {
    const failed = measured("failed", []), running = measured("running", []), interrupted = measured("interrupted", []); running.status = "live"; interrupted.status = "unresponsive";
    const unknown = run({ id: "old", splits: [] });
    const statuses = [best(), failed, running, interrupted, unknown, run({ id: "probe", excluded: "probe" })].map(r => milestoneStatus(r, "RIVAL_MET"));
    expect(statuses).toEqual(["reached", "not reached", "pending", "censored", "unsupported", "excluded"]);
    const older = measured("older", []), recorded = measured("recorded", []);
    if (recorded.measurement === undefined) throw new Error("measurement");
    recorded.measurement = { ...recorded.measurement, features: [...recorded.measurement.features, "route-101-after-handoff-v1"] };
    expect(milestoneStatus(older, "ROUTE_101_AFTER_HANDOFF")).toBe("unsupported");
    expect(milestoneStatus(recorded, "ROUTE_101_AFTER_HANDOFF")).toBe("not reached");
    const bedroom = measured("bedroom", []);
    if (bedroom.measurement === undefined) throw new Error("measurement");
    bedroom.measurement = { ...bedroom.measurement, features: [...bedroom.measurement.features, "bedroom-exit-v1"] };
    expect(milestoneStatus(older, "PLAYER_BEDROOM_EXITED_AFTER_CLOCK")).toBe("unsupported");
    expect(milestoneStatus(bedroom, "PLAYER_BEDROOM_EXITED_AFTER_CLOCK")).toBe("not reached");
    const rival = measured("rival", []);
    if (rival.measurement === undefined) throw new Error("measurement");
    rival.measurement = { ...rival.measurement, features: [...rival.measurement.features, "route103-rival-splits-v1"] };
    for (const id of ["RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_OLDALE_SEND_OFF", "ROUTE_101_AFTER_RIVAL_BATTLE", "LITTLEROOT_AFTER_RIVAL_BATTLE"]) {
      expect(milestoneStatus(older, id)).toBe("unsupported");
      expect(milestoneStatus(rival, id)).toBe("not reached");
    }
  });
  it("plots a main-menu-save start as a New Game run, tagged, competing for the frontier only on progress then time", () => {
    const menu = measured("menu", [60000, 90000, 120000]);
    if (menu.config === null) throw new Error("config");
    menu.config = { ...menu.config, start: "save_state", resume: "MAIN_MENU" };
    expect(frontierReferences([human(), best(), menu]).best?.id).toBe("dea1");
    document.body.innerHTML = frontierPlot(frontierReferences([human(), best()]), [menu], 900);
    const first = document.querySelector('[data-run="menu"]');
    expect(first).not.toBeNull();
    expect(first?.getAttribute("aria-label")).toContain("started from the main-menu save (text speed FAST), not power-on");
    expect(document.querySelector('polyline[data-series="menu"]')?.getAttribute("stroke-dasharray")).toBeNull();
    expect(document.querySelector('[data-resume="MAIN_MENU"]')).toBeNull();
  });
  it("draws a Clock set resume as a dashed not-from-zero line and keeps it off the agent frontier", () => {
    const resumed = measured("clock", [90000, null, 5000, 120000]);
    if (resumed.config === null) throw new Error("config");
    resumed.config = { ...resumed.config, start: "save_state", resume: "CLOCK_SET" };
    resumed.splits.push({ name: "MOM_RIVAL_INSTRUCTION", elapsedMs: 8000, segmentMs: 3000, seq: 9, turn: 1, inputTokens: 0, outputTokens: 0 });
    resumed.status = "live";
    expect(frontierReferences([human(), best(), resumed]).best?.id).toBe("dea1");
    document.body.innerHTML = frontierPlot(frontierReferences([human(), best()]), [resumed], 900, undefined, [resumed], false);
    expect(document.querySelector('[data-resume-notice="CLOCK_SET"]')?.textContent).toContain("did not start from New game");
    expect(document.querySelector('[data-live-run="clock"]')?.getAttribute("data-resume")).toBe("CLOCK_SET");
    expect(document.querySelector('polyline[data-series="clock"]')?.getAttribute("stroke-dasharray")).toBe("8 5");
    expect(document.querySelector('[data-run="clock"][data-split="PLAYER_NAME_CONFIRMED"]')).toBeNull();
    expect(document.querySelector('[data-run="clock"][data-split="PLAYER_HOUSE_EXITED_AFTER_CLOCK"]')).not.toBeNull();
    expect(document.querySelector('[data-run="clock"]')?.getAttribute("aria-label")).toContain("not from New game");
    expect(document.body.textContent).toContain("NOT FROM ZERO");
    expect(document.querySelector('[data-resume-origin="CLOCK_SET"]')).not.toBeNull();
    expect(readFileSync(join(process.cwd(), "static/style.css"), "utf8")).toContain(".wb-live-run.wb-resumed-run .wb-mark { stroke:var(--wb-run-color); }");
    const liveMark = document.querySelector('[data-live-run="clock"] .wb-mark circle');
    expect(liveMark?.getAttribute("fill")).toBe("#fff");
    expect(liveMark?.getAttribute("stroke")).not.toBe("#fff");
    expect(liveMark?.getAttribute("stroke")).toMatch(/^#|^hsl/);
    resumed.status = "ended";
    resumed.splits.push({ name: "PLAYER_BEDROOM", elapsedMs: 50 * 60000, segmentMs: 0, seq: 10, turn: 1, inputTokens: 0, outputTokens: 0, derived: true });
    document.body.innerHTML = frontierPlot({ human: null, best: null }, [resumed], 900);
    expect(document.querySelector(`[data-model="${resumed.model ?? ""}"]`)).not.toBeNull();
    expect(document.querySelector('[data-run="clock"][data-split="PLAYER_BEDROOM"]')).toBeNull();
    expect(Math.max(...Array.from(document.querySelectorAll("text.wb-axis")).map(t => Number(t.textContent)).filter(Number.isFinite))).toBeLessThan(10);
    const other = measured("other-save", [1000, 2000, 3000]);
    if (other.config === null) throw new Error("config");
    other.config = { ...other.config, start: "save_state", resume: null };
    document.body.innerHTML = frontierPlot(frontierReferences([human(), best()]), [other], 900);
    expect(document.querySelector('[data-series="other-save"]')).toBeNull();
    expect(document.querySelector("[data-resume-notice]")).toBeNull();
  });
  it("shows unavailable persistent references explicitly instead of silently substituting another human", () => {
    document.body.innerHTML = frontierPlot(frontierReferences([measured("other-human", [1], "human")]), [], NaN);
    expect(document.body.textContent).toContain("Human reference unavailable");
    expect(document.body.textContent).toContain("Agent frontier unavailable");
  });
});
describe("data-driven agent frontier", () => {
  const menuStart = (r: WorkbenchRun): WorkbenchRun => { if (r.config === null) throw new Error("config"); r.config = { ...r.config, start: "save_state", resume: "MAIN_MENU" }; return r; };
  const clockStart = (r: WorkbenchRun): WorkbenchRun => { if (r.config === null) throw new Error("config"); r.config = { ...r.config, start: "save_state", resume: "CLOCK_SET" }; return r; };
  const further = (id: string): WorkbenchRun => measured(id, [100000, 150000, 400000, 500000, 900000, 950000, 1000000, 1200000]);
  it("lets a main-menu-save New Game start that went further become the frontier, named and tagged in the legend", () => {
    const menu = menuStart(further("2026-10-16T01-00-00_cook_ab12"));
    const refs = frontierReferences([human(), best(), menu]);
    expect(refs.best?.id).toBe(menu.id);
    document.body.innerHTML = frontierPlot(refs, [], 900);
    const label = document.querySelector('[data-reference="best"]')?.textContent ?? "";
    expect(label).toContain("Agent frontier");
    expect(label).toContain(menu.id);
    expect(label).toContain("main-menu save");
    expect(label).not.toContain("LIVE");
    expect(document.querySelector('[data-reference="best"]')?.getAttribute("title")).toContain(menu.id);
    expect(document.body.textContent).not.toMatch(/fresh[- ]boot/i);
  });
  it("counts live and paused runs by their splits so far, so the gold line moves while they run, drawn once", () => {
    const live = Object.assign(menuStart(further("live-run")), { status: "live" as const });
    const refs = frontierReferences([human(), best(), live]);
    expect(refs.best?.id).toBe("live-run");
    document.body.innerHTML = frontierPlot(refs, [live], 900, undefined, [live]);
    expect(document.querySelectorAll('polyline[data-series="live-run"]')).toHaveLength(1);
    expect(document.querySelector('polyline[data-series="live-run"]')?.getAttribute("stroke")).toBe("#af8915");
    expect(document.querySelector('[data-live-run="live-run"]')).not.toBeNull();
    expect(document.querySelector('[data-live-run="live-run"] .wb-live-head')).not.toBeNull();
    expect(document.querySelector('[data-reference="best"]')?.textContent).toContain("LIVE");
    expect(document.querySelectorAll(".wb-current-key")).toHaveLength(0);
    const paused = Object.assign(further("paused-run"), { status: "paused" as const });
    const pausedRefs = frontierReferences([best(), paused]);
    expect(pausedRefs.best?.id).toBe("paused-run");
    document.body.innerHTML = frontierPlot(pausedRefs, [], 900, undefined, [paused]);
    expect(document.querySelector('[data-reference="best"]')?.textContent).toContain("PAUSED");
    expect(document.querySelector('[data-current-run="paused-run"]')).not.toBeNull();
    expect(document.querySelector('[data-live-run="paused-run"]')).toBeNull();
    expect(document.querySelector('[data-reference="best"]')?.textContent).not.toContain("main-menu save");
  });
  it("ranks the furthest milestone first, then the fastest time to it, then id, across boot and main-menu starts", () => {
    const slowBoot = measured("slow-boot", [1, 2, 3, 4, 5, 6, 7, 2000000]);
    const fastMenu = menuStart(measured("fast-menu", [1, 2, 3, 4, 5, 6, 7, 1500000]));
    expect(frontierReferences([slowBoot, fastMenu]).best?.id).toBe("fast-menu");
    const twin = menuStart(measured("a-twin", [1, 2, 3, 4, 5, 6, 7, 1500000]));
    expect(frontierReferences([slowBoot, fastMenu, twin]).best?.id).toBe("a-twin");
    const evidence = menuStart(further("screenshot-only"));
    const last = evidence.splits[evidence.splits.length - 1]; if (last === undefined) throw new Error("split");
    last.derived = true; last.screenshotEvidence = [{ seq: 9, path: "frames/000009_1.png", sha1: "c".repeat(40) }];
    expect(frontierReferences([slowBoot, fastMenu, evidence]).best?.id).toBe("fast-menu");
    expect(frontierReferences([best(), evidence]).best?.id).toBe("screenshot-only");
  });
  it("never makes a Clock set resume the frontier, even when it is further, faster or live", () => {
    const ended = clockStart(further("clock-ended"));
    const live = Object.assign(clockStart(further("clock-live")), { status: "live" as const });
    expect(frontierReferences([human(), best(), ended, live]).best?.id).toBe("dea1");
    expect(frontierReferences([ended, live]).best).toBeNull();
  });
  it("still excludes probes, synthetic and replay runs, excluded runs, problem runs, humans and other save starts", () => {
    const base = menuStart(further("base"));
    if (base.measurement === undefined || base.config === null) throw new Error("fixture");
    const variants: WorkbenchRun[] = [
      { ...base, id: "probe-feature", measurement: { ...base.measurement, features: [...base.measurement.features, "probe"] } },
      { ...base, id: "synthetic", measurement: { ...base.measurement, features: [...base.measurement.features, "synthetic-run"] } },
      { ...base, id: "replay", measurement: { ...base.measurement, features: [...base.measurement.features, "replay-v1"] } },
      { ...base, id: "excluded", excluded: "Excluded probe session" },
      { ...base, id: "problem", problem: "invalid" },
      { ...base, id: "human-run", measurement: { ...base.measurement, controller: "human" } },
      { ...base, id: "other-save", config: { ...base.config, resume: null } },
      { ...base, id: "no-measurement", measurement: undefined },
    ];
    expect(frontierReferences([best(), ...variants]).best?.id).toBe("dea1");
  });
  it("describes the gold line as the best New Game-start run, not a fresh boot", () => {
    document.body.innerHTML = frontierPlot(frontierReferences([]), [], 900);
    expect(document.body.textContent).toContain("Agent frontier unavailable");
    expect(document.body.textContent).toContain("New Game");
    expect(document.body.textContent).not.toMatch(/fresh[- ]boot/i);
    const page = readFileSync(join(process.cwd(), "static/workbench.html"), "utf8");
    expect(page).not.toMatch(/fresh[- ]boot/i);
    expect(page).toContain("New Game start");
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
    expect(document.body.textContent).toContain("Zoomed to the frontier: New game → Starter, 18 of 45 checkpoints");
    expect(document.body.textContent).toContain("27 later checkpoints hidden");
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
    expect(document.body.textContent).toContain("2 of 45 checkpoints");
  });
  it("ends at the next dense human checkpoint and widens for paused runs, keeping narrow labels honest", () => {
    const dense = human(); dense.splits = FRONTIER_MILESTONES.map((m, i) => ({ name: m.id, elapsedMs: (i + 1) * 1000, segmentMs: 1000, seq: i, turn: 0, inputTokens: 0, outputTokens: 0 }));
    document.body.innerHTML = frontierPlot({ human: dense, best: best() }, [], 2000, undefined, [], true);
    expect(document.body.textContent).toContain("New game → Left rival house, 15 of 45 checkpoints");
    const paused = { ...measured("paused", [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]), status: "paused" as const };
    document.body.innerHTML = frontierPlot({ human: dense, best: best() }, [], 300, undefined, [paused], true);
    expect(document.body.textContent).toContain("New game → Birch rescue, 19 of 45 checkpoints");
    expect(document.body.textContent).toContain("all visible points remain plotted");
  });
  it("labels the checkpoint where lines stop between rival instruction and rival house", () => {
    const names = FRONTIER_MILESTONES.map(m => m.id);
    const leave = names.indexOf("PLAYER_HOUSE_EXITED_AFTER_CLOCK");
    const stopped = measured("stopped", []);
    stopped.splits = names.slice(0, leave + 1).map((name, i) => ({ name, elapsedMs: (i + 1) * 1000, segmentMs: 1000, seq: i, turn: 0, inputTokens: 0, outputTokens: 0 }));
    document.body.innerHTML = frontierPlot({ human: human(), best: best() }, [stopped], 340, undefined, [], true);
    const labels = Array.from(document.querySelectorAll(".wb-frontier-chart text.wb-axis")).map(t => t.textContent);
    expect(labels).toContain("Leave home");
    expect(document.querySelector('[data-run="stopped"][data-split="RIVAL_HOUSE_ENTERED"]')).toBeNull();
    expect(document.querySelector('[data-run="stopped"][data-split="PLAYER_HOUSE_EXITED_AFTER_CLOCK"]')).not.toBeNull();
  });
  it("bridges a checkpoint the run's build never recorded and breaks one it recorded but missed", () => {
    const points = (id: string): number[] => Array.from(document.querySelectorAll(`polyline[data-series="${id}"]`)).map(line => (line.getAttribute("points") ?? "").trim().split(/\s+/).filter(point => point !== "").length);
    const route = (id: string, features: readonly string[]) => {
      const run = measured(id, []);
      if (run.measurement !== undefined) run.measurement = { ...run.measurement, features: [...run.measurement.features, "ram-state-v1", ...features] };
      run.splits = ["RIVAL_BEDROOM_REACHED", "RIVAL_MET", "ROUTE_101", "STARTER_CHOSEN"].map((name, i) => ({ name, elapsedMs: (i + 1) * 1000, segmentMs: 1000, seq: i + 1, turn: 1, inputTokens: 0, outputTokens: 0 }));
      return run;
    };
    document.body.innerHTML = frontierPlot({ human: null, best: null }, [route("older", [])], 900);
    expect(points("older")).toEqual([4]);
    expect(document.querySelector('[data-run="older"][data-split="BIRCH_RESCUE_REQUESTED"]')).toBeNull();
    document.body.innerHTML = frontierPlot({ human: null, best: null }, [route("newer", ["birch-rescue-requested-v1"])], 900);
    expect(points("newer")).toEqual([2, 2]);
  });
  it("connects proved Clock-set checkpoints and keeps a real missing rival house broken", () => {
    const points = (id: string): number[] => Array.from(document.querySelectorAll(`polyline[data-series="${id}"]`)).map(line => (line.getAttribute("points") ?? "").trim().split(/\s+/).filter(point => point !== "").length);
    const resumed = (id: string, names: readonly string[]) => {
      const run = measured(id, []);
      if (run.config === null) throw new Error("config");
      run.config = { ...run.config, start: "save_state", resume: "CLOCK_SET" };
      run.splits = names.map((name, i) => ({ name, elapsedMs: (i + 1) * 1000, segmentMs: 1000, seq: i + 1, turn: 1, inputTokens: 0, outputTokens: 0, derived: true }));
      return run;
    };
    const proved = ["CLOCK_SET", "MOM_RIVAL_INSTRUCTION", "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED", "RIVAL_MET"];
    document.body.innerHTML = frontierPlot({ human: human(), best: best() }, [resumed("proved", proved)], 900);
    expect(points("proved")).toEqual([proved.length]);
    expect(document.querySelector('[data-run="proved"][data-split="CLOCK_SET"]')?.getAttribute("aria-label")).toContain("first observation upper bound");
    const missed = ["CLOCK_SET", "MOM_RIVAL_INSTRUCTION", "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_BEDROOM_REACHED", "RIVAL_MET"];
    document.body.innerHTML = frontierPlot({ human: human(), best: best() }, [resumed("missed", missed)], 900);
    expect(points("missed")).toEqual([3, 2]);
    expect(document.querySelector('[data-run="missed"][data-split="RIVAL_HOUSE_ENTERED"]')).toBeNull();
    const bedroom = (id: string, names: readonly string[]) => {
      const run = measured(id, []);
      run.splits = names.map((name, i) => ({ name, elapsedMs: (i + 1) * 1000, segmentMs: 1000, seq: i + 1, turn: 1, inputTokens: 0, outputTokens: 0 }));
      return run;
    };
    const around = ["PLAYER_HOUSE_ENTERED", "MOM_CLOCK_INSTRUCTION", "PLAYER_BEDROOM", "CLOCK_SET"];
    document.body.innerHTML = frontierPlot({ human: human(), best: best() }, [bedroom("room", around)], 900);
    expect(points("room")).toEqual([around.length]);
    const gap = bedroom("gap", around.filter(name => name !== "PLAYER_BEDROOM")); gap.measurement?.features.push("ram-state-v1");
    document.body.innerHTML = frontierPlot({ human: human(), best: best() }, [gap], 900);
    expect(points("gap")).toEqual([2]);
    expect(document.querySelector('[data-run="gap"][data-split="CLOCK_SET"]')).not.toBeNull();
  });
  it("uses the next checkpoint when the human baseline is missing or has nothing later", () => {
    document.body.innerHTML = frontierPlot({ human: null, best: best() }, [], 2000, undefined, [], true);
    expect(axis()).toContain("Left rival house"); expect(axis()).not.toContain("Sent to Birch");
    const short = measured(HUMAN_REFERENCE, [1000, 2000], "human");
    document.body.innerHTML = frontierPlot({ human: short, best: best() }, [], 2000, undefined, [], true);
    expect(axis()).toContain("Left rival house"); expect(axis()).not.toContain("Sent to Birch");
  });
});

