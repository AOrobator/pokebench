// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { REQUIRED_FRONTIER_MILESTONES } from "@pokebench/agent/milestones";
import { run } from "../test-support/frontier-run.js";
import { frontierLegend } from "./frontier-legend.js";
import { ASSISTED_COLOR, HUMAN_REFERENCE, FRONTIER_MILESTONES, checkpointResume, frontierPair, frontierReferences, frontierLabel, frontierPlot, frontierSplits, frontierVersions, invalidTrial, milestoneStatus } from "./frontier.js";
import { runDetails } from "./workbench-view.js";
import type { WorkbenchRun } from "./workbench-data.js";
import { customLane } from "./custom-lane.js";
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
  it("shares the exact required milestone axis with automatic checkpoint capture", () => {
    expect(FRONTIER_MILESTONES.filter(milestone => !milestone.id.startsWith("RUSTBORO_GYM_TRAINER_")).map((milestone) => milestone.id)).toEqual(REQUIRED_FRONTIER_MILESTONES);
  });
  it("early Route116 and Rusturf visits cannot outrank a gym-one finish or become restore points",()=>{
    const finisher=measured("gym-finished",[1000]);
    finisher.splits.push({name:"ROCK_TOMB_RECEIVED",elapsedMs:9000,segmentMs:0,seq:99,turn:9,inputTokens:0,outputTokens:0});
    const early=measured("early-visits",[500]);
    for(const name of ["ROUTE_116","RUSTURF_TUNNEL"]) {
      early.splits.push({name,elapsedMs:800,segmentMs:0,seq:2,turn:2,inputTokens:0,outputTokens:0});
      expect(REQUIRED_FRONTIER_MILESTONES).not.toContain(name);
      expect(FRONTIER_MILESTONES.map(m=>m.id)).not.toContain(name);
    }
    expect(frontierReferences([early,finisher]).best?.id).toBe("gym-finished");
  });
  it("selects progress before speed and keeps one actual run, with stable ties", () => {
    const fast = measured("early", [1000, 2000, 3000]);
    const slow = measured("later-slow", [5000, 6000, 7000, 8000, 1500000]);
    const picked = frontierReferences([slow, best(), human(), fast]);
    expect(picked.human?.id).toBe(HUMAN_REFERENCE); expect(picked.best?.id).toBe("dea1");
    expect(picked.best?.splits[0]?.elapsedMs).toBe(153477);
    expect(frontierReferences([best(), measured("aaa", [153477, 200600, 496944, 579200, 1301593, 1328664, 1477567])]).best?.id).toBe("aaa");
  });
  it("gives a run's splits the agent frontier to race: the frontier graph's run, never itself or a screenshot-only split", () => {
    const frontier = best();
    const first = frontier.splits[0]; if (first === undefined) throw new Error("fixture split");
    frontier.splits = [{ ...first, derived: true }, ...frontier.splits.slice(1), { name: "STONE_BADGE", elapsedMs: 9_999_999, segmentMs: 0, seq: 99, turn: 9, inputTokens: 0, outputTokens: 0, derived: true, screenshotEvidence: [] }];
    const runs = [measured("slow", [5000, 6000]), frontier, human()];
    const splits = frontierSplits(runs, "slow");
    expect(splits?.run).toBe("dea1");
    expect(splits?.milestones[0]).toEqual({ name: "PLAYER_NAME_CONFIRMED", offsetMs: 153477, derived: true });
    expect(splits?.milestones[1]).toEqual({ name: "FIRST_TRUCK_EXIT", offsetMs: 200600 });
    expect(splits?.milestones.map(m => m.name)).not.toContain("STONE_BADGE");
    expect(frontierSplits(runs, "dea1")?.run).toBe("slow");
    const config = frontier.config; if (config === null) throw new Error("fixture config");
    expect(frontierSplits([...runs, { ...measured("resumed", [1]), config: { ...config, start: "save_state", resume: "ROUTE_103" } }], "resumed")).toBeNull();
    expect(frontierSplits([], "slow")).toBeNull();
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
  it("colors harness versions distinctly, shares color within a version and identifies each color in a legend", () => {
    const a = { ...best(), id: "model-a-1", model: "Alpha" }, a2 = { ...best(), id: "model-a-2", model: "Alpha" };
    const b = { ...best(), id: "model-b", model: "Beta" }, refs = { human: human(), best: a }, versions = frontierVersions([a, a2, b]);
    document.body.innerHTML = frontierPlot(refs, [a, a2, b], 640, versions) + frontierLegend(refs, [a, a2, b], versions, { isolated: null, legendOpen: true, marksOpen: true, howOpen: false, changed: new Set(), all: new Set(), expanded: new Set() });
    const first = document.querySelector('[data-run="model-a-1"]')?.getAttribute("fill"), second = document.querySelector('[data-run="model-a-2"]')?.getAttribute("fill"), other = document.querySelector('[data-run="model-b"]')?.getAttribute("fill");
    expect(first).toBe("#af8915"); expect(second).not.toBe(other);
    expect(document.querySelector('[data-run="model-a-1"]')?.getAttribute("stroke")).toBe("#af8915");
    const alpha = versions.byRun.get("model-a-2"), beta = versions.byRun.get("model-b");
    expect(document.querySelector(`[data-ver="${alpha?.id ?? ""}"]`)?.textContent).toContain("alpha · configuration v1");
    expect(document.querySelector(`[data-ver="${beta?.id ?? ""}"]`)?.textContent).toContain("beta · configuration v1");
    expect(document.querySelector(`[data-ver="${alpha?.id ?? ""}"]`)?.getAttribute("style")).toContain(second);
    for (const id of ["model-a-1", "model-a-2", "model-b", HUMAN_REFERENCE]) {
      expect(document.querySelector(`[data-series="${id}"]`)?.getAttribute("stroke")).toBe(document.querySelector(`[data-run="${id}"]`)?.getAttribute("fill"));
    }
    expect(document.querySelector('[data-reference="human"]')?.textContent).toContain("Human baseline");
    expect(document.querySelector('[data-reference="best"]')?.textContent).toContain("Agent frontier");
    expect(document.querySelector('[data-reference="best"] svg g')?.getAttribute("fill")).toBe("#af8915");
    expect(document.querySelector('[data-reference="human"] svg g')?.getAttribute("fill")).toBe("#304f7a");
  });
  it("keeps version colors stable across filtering, reordered snapshots and newly recorded versions", () => {
    const a = { ...best(), model: "Zulu" }, b = { ...best(), id: "alpha", model: "Alpha" }, unknown = { ...best(), id: "nobody", model: null };
    const first = frontierVersions([a, b, unknown]), kept = new Map(first.versions.map(v => [v.key, v.color]));
    const updated = frontierVersions([{ ...best(), id: "newer", model: "A newly recorded model", started: "2026-10-12T00:00:00.000-04:00" }, b, a, unknown], kept);
    expect(updated.byRun.get("dea1")?.color).toBe(first.byRun.get("dea1")?.color); expect(updated.byRun.get("alpha")?.color).toBe(first.byRun.get("alpha")?.color);
    document.body.innerHTML = frontierPlot({ human: null, best: a }, [{ ...a, id: "filtered-overlay" }], 640, frontierVersions([a, { ...a, id: "filtered-overlay" }], kept));
    expect(document.querySelector('[data-run="filtered-overlay"]')?.getAttribute("fill")).toBe(first.byRun.get("dea1")?.color);
    const many = frontierVersions(Array.from({ length: 12 }, (_, i) => ({ ...best(), id: `m${String(i)}`, model: `Model ${String(i)}` })));
    expect(new Set(many.versions.map(v => v.color)).size).toBe(12); expect(first.byRun.get("nobody")?.model).toBe("Model not recorded");
  });
  it("includes the full required progression instead of skipping the human run's middle and finish", () => {
    const names = FRONTIER_MILESTONES.map(m => m.id);
    for (const name of ["NEW_GAME_CREATED", "LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "MOM_CLOCK_INSTRUCTION", "PLAYER_BEDROOM", "MOM_RIVAL_INSTRUCTION", "ROUTE_101", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "OLDALE_TOWN", "ROUTE_103", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "ROUTE_102", "PETALBURG_CITY", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "ROUTE_104", "PETALBURG_WOODS", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_CITY", "ROXANNE_DEFEATED", "RUSTBORO_GYM_COMPLETE", "ROCK_TOMB_RECEIVED"]) expect(names).toContain(name);
    expect(names.some(name => /^(?!RUSTBORO_GYM_TRAINER_).*TRAINER|FIRST_POKEMON|EVOLUTION|HEAL|ROUTE_115/.test(name))).toBe(false);
    const recorded = human(); recorded.splits = names.map((name, i) => ({ name, elapsedMs: i * 1000, segmentMs: 1000, seq: i, turn: 0, inputTokens: 0, outputTokens: 0 }));
    document.body.innerHTML = frontierPlot({human: recorded, best: null}, [], 340);
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(names.length);
  });
  it("plots gym trainer victories and ranks the newly reached gym frontier", () => {
    const trainer = { ...best(), id: "two-gym-wins" };
    trainer.splits.push({name:"RUSTBORO_CITY_GYM",elapsedMs:1500,segmentMs:500,seq:19,turn:2,inputTokens:0,outputTokens:0});
    for (const [i, name] of ["RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED"].entries()) trainer.splits.push({name,elapsedMs:2000+i*1000,segmentMs:1000,seq:20+i,turn:2,inputTokens:0,outputTokens:0});
    expect(frontierReferences([trainer,best()]).best?.id).toBe("two-gym-wins");
    document.body.innerHTML=frontierPlot({human:human(),best:trainer},[],900);
    for (const name of ["RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED"]) expect(document.querySelector(`[data-run="two-gym-wins"][data-split="${name}"]`)).not.toBeNull();
    const names = FRONTIER_MILESTONES.map(m => m.id);
    expect(names.slice(names.indexOf("RUSTBORO_CITY_GYM"), names.indexOf("ROXANNE_DEFEATED")+1)).toEqual(["RUSTBORO_CITY_GYM", "RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED", "RUSTBORO_GYM_TRAINER_MARC_DEFEATED", "ROXANNE_FIRST_INTERACTION", "ROXANNE_DEFEATED"]);
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
  it("keeps a later save origin visible before its first post-save split arrives", () => {
    const saved = measured("waiting", [null, null, 20]);
    if (saved.config === null) throw new Error("config");
    saved.config = { ...saved.config, start: "save_state", resume: "PETALBURG_CITY" };
    saved.status = "live";
    document.body.innerHTML = frontierPlot({ human: null, best: null }, [], 900, undefined, [saved], true);
    expect(document.querySelector('[data-resume-origin="PETALBURG_CITY"]')).not.toBeNull();
    expect(document.querySelector('.wb-current-key')?.textContent).toContain("waiting for first story checkpoint");
    expect(document.querySelector('[data-run="waiting"]')).toBeNull();
  });
  it.each(["PETALBURG_CITY", "RUSTBORO_CITY"])("plots %s starts from their own checkpoint with explicit provenance", checkpoint => {
    const resumed = measured("later-save", [9000000, null, 5000]);
    if (resumed.config === null) throw new Error("config");
    resumed.config = { ...resumed.config, start: "save_state", resume: checkpoint };
    resumed.splits.push(...[checkpoint, checkpoint === "PETALBURG_CITY" ? "DAD_FIRST_MEETING" : "RUSTBORO_CITY_GYM"].map((name, i) => ({ name, elapsedMs: 10000 + i * 5000, segmentMs: 0, seq: 20 + i, turn: 1, inputTokens: 0, outputTokens: 0 })));
    expect(frontierReferences([best(), resumed]).best?.id).toBe("dea1");
    document.body.innerHTML = frontierPlot(frontierReferences([best()]), [resumed], 900);
    expect(document.querySelector(`[data-resume="${checkpoint}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-resume-origin="${checkpoint}"]`)).not.toBeNull();
    expect(document.querySelector("[data-resume-notice]")).toBeNull();
    expect(document.querySelector('[data-run="later-save"][data-split="CLOCK_SET"]')).toBeNull();
    expect(document.querySelector('[data-run="later-save"][data-split="PLAYER_NAME_CONFIRMED"]')).toBeNull();
    expect(document.querySelector('[data-series="later-save"]')?.getAttribute("stroke-dasharray")).toBe("8 5");
    expect(document.querySelector('[data-run="later-save"]')?.getAttribute("aria-label")).toContain("minutes since the save loaded");
  });
  it("shows unavailable persistent references explicitly instead of silently substituting another human", () => {
    document.body.innerHTML = frontierPlot(frontierReferences([measured("other-human", [1], "human")]), [], NaN);
    expect(document.body.textContent).toContain("Human reference unavailable");
    expect(document.body.textContent).toContain("Agent frontier unavailable");
  });
});
const legendState = { isolated: null, legendOpen: false, marksOpen: true, howOpen: false, changed: new Set<string>(), all: new Set<string>(), expanded: new Set<string>() };
const legendOf = (refs: ReturnType<typeof frontierReferences>, status: "live" | "paused" | null = null): string => frontierLegend(refs, [], frontierVersions(refs.best === null ? [] : [refs.best]), legendState, status);
describe("data-driven agent frontier", () => {
  const menuStart = (r: WorkbenchRun): WorkbenchRun => { if (r.config === null) throw new Error("config"); r.config = { ...r.config, start: "save_state", resume: "MAIN_MENU" }; return r; };
  const clockStart = (r: WorkbenchRun): WorkbenchRun => { if (r.config === null) throw new Error("config"); r.config = { ...r.config, start: "save_state", resume: "CLOCK_SET" }; return r; };
  const further = (id: string): WorkbenchRun => measured(id, [100000, 150000, 400000, 500000, 900000, 950000, 1000000, 1200000]);
  it("lets a main-menu-save New Game start that went further become the frontier, named and tagged in the legend", () => {
    const menu = menuStart(further("2026-10-16T01-00-00_cook_ab12"));
    const refs = frontierReferences([human(), best(), menu]);
    expect(refs.best?.id).toBe(menu.id);
    document.body.innerHTML = frontierPlot(refs, [], 900) + legendOf(refs);
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
    document.body.innerHTML = frontierPlot(refs, [live], 900, undefined, [], false, "live") + legendOf(refs, "live");
    const lines = Array.from(document.querySelectorAll('polyline[data-series="live-run"]'));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every(line => line.getAttribute("stroke") === "#af8915")).toBe(true);
    expect(document.querySelectorAll('[data-run="live-run"][data-split="STARTER_CHOSEN"]')).toHaveLength(1);
    expect(document.querySelector('[data-live-run="live-run"]')).not.toBeNull();
    expect(document.querySelector('[data-live-run="live-run"] .wb-live-head')).not.toBeNull();
    expect(document.querySelector('[data-reference="best"]')?.textContent).toContain("LIVE");
    expect(document.querySelectorAll(".wb-current-key")).toHaveLength(0);
    // Live state comes only from the verified status passed in, never from the run's stored status or the filtered current set.
    document.body.innerHTML = frontierPlot(refs, [live], 900, undefined, [live], false, null) + legendOf(refs);
    expect(document.querySelector('[data-reference="best"]')?.textContent).not.toMatch(/LIVE|PAUSED/);
    expect(document.querySelector("[data-live-run], [data-current-run], .wb-live-head, .wb-current-key")).toBeNull();
    expect(document.querySelector('[data-reference="best"]')?.textContent).toContain("live-run");
    const paused = Object.assign(further("paused-run"), { status: "paused" as const });
    const pausedRefs = frontierReferences([best(), paused]);
    expect(pausedRefs.best?.id).toBe("paused-run");
    document.body.innerHTML = frontierPlot(pausedRefs, [], 900, undefined, [], false, "paused") + legendOf(pausedRefs, "paused");
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
      Object.fromEntries(Object.entries({ ...base, id: "no-measurement" }).filter(([key]) => key !== "measurement")) as unknown as WorkbenchRun,
    ];
    expect(frontierReferences([best(), ...variants]).best?.id).toBe("dea1");
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
    expect(document.body.textContent).toContain("Zoomed to the frontier: New game → Starter, 18 of 203 checkpoints");
    expect(document.body.textContent).toContain("185 later checkpoints hidden");
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
    expect(document.body.textContent).toContain("49 of 203 checkpoints");
    document.body.innerHTML = frontierPlot({ human: human(), best: null }, [], 2000, undefined, [], true);
    expect(axis()).toContain("New game"); expect(axis()).toContain("Name"); expect(axis()).not.toContain("Truck exit");
    expect(document.body.textContent).toContain("2 of 203 checkpoints");
  });
  it("ends at the next dense human checkpoint and widens for paused runs, keeping narrow labels honest", () => {
    const dense = human(); dense.splits = FRONTIER_MILESTONES.map((m, i) => ({ name: m.id, elapsedMs: (i + 1) * 1000, segmentMs: 1000, seq: i, turn: 0, inputTokens: 0, outputTokens: 0 }));
    document.body.innerHTML = frontierPlot({ human: dense, best: best() }, [], 2000, undefined, [], true);
    expect(document.body.textContent).toContain("New game → Left rival house, 15 of 203 checkpoints");
    const paused = { ...measured("paused", [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]), status: "paused" as const };
    document.body.innerHTML = frontierPlot({ human: dense, best: best() }, [], 300, undefined, [paused], true);
    expect(document.body.textContent).toContain("New game → Birch rescue, 19 of 203 checkpoints");
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
    document.body.innerHTML = frontierPlot({ human: null, best: null }, [{ ...route("invalid-older", []), flag: "Invalid fixed-run trial: crash" }], 900);
    expect(points("invalid-older")).toEqual([4]);
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
describe("invalid fixed-run trials", () => {
  const invalid = (id: string, reason: string): WorkbenchRun => {
    const r = measured(id, [100000, 150000, 400000, 500000, 900000, 950000, 1000000, 1200000]);
    if (r.config === null) throw new Error("config");
    r.config = { ...r.config, start: "save_state", resume: "MAIN_MENU" };
    return { ...r, cohort: "experiment:bundle-cook-4h@08287126ff77", flag: `Invalid fixed-run trial: ${reason}` };
  };
  // Operator rule (the operator 2026-10-27): a flagged trial is drawn dotted for attention but still counts.
  it("plots a flagged trial's story progress as a dotted, labelled line that still competes for the frontier", () => {
    const crashed = invalid("2026-10-19T20-12-11_qwen36-gpu1_86ac", "emulator or game server crash");
    expect(crashed.excluded).toBeNull();
    expect(frontierReferences([human(), best(), crashed]).best?.id).toBe(crashed.id);
    const refs = frontierReferences([human(), best()]);
    expect(refs.best?.id).toBe("dea1");
    document.body.innerHTML = frontierPlot(refs, [crashed], 900);
    const line = document.querySelector(`polyline[data-series="${crashed.id}"]`);
    expect(line).not.toBeNull();
    expect(line?.getAttribute("stroke-dasharray")).toBe("2 4");
    const series = line?.closest(".wb-series");
    expect(series?.classList.contains("wb-invalid-run")).toBe(true);
    expect(series?.getAttribute("data-invalid")).toBe("emulator or game server crash");
    expect(document.querySelector(`[data-run="${crashed.id}"][data-split="RIVAL_MET"]`)?.getAttribute("aria-label")).toContain("flagged: emulator or game server crash");
    expect(document.querySelector("[data-invalid-notice]")).toBeNull();
  });
  it("gives invalid trials a version color and a legend count, and explains the dotted line", () => {
    const crashed = invalid("crashed", "emulator or game server crash");
    const versions = frontierVersions([crashed]);
    expect(versions.byRun.has("crashed")).toBe(true);
    document.body.innerHTML = frontierLegend({ human: null, best: null }, [crashed], versions, legendState);
    expect(document.querySelector(".wb-ver-grid")).not.toBeNull();
    expect(document.querySelector("[data-bar=marks]")?.textContent).toContain("Dotted line");
    expect(document.querySelector("[data-bar=marks]")?.textContent).toContain("still counts");
    expect(document.querySelector("[data-bar=marks]")?.textContent).not.toContain("never counts as the agent frontier");
  });
  it("keeps only operator exclusions off the chart and a resumed invalid trial's dashes as before", () => {
    const probe = { ...invalid("probe", "x"), excluded: "Excluded probe session" };
    const operator = { ...invalid("operator", "x"), excluded: "Operator exclusion: wrong ROM" };
    const problem = { ...invalid("problem", "x"), problem: "invalid" };
    document.body.innerHTML = frontierPlot(frontierReferences([human(), best()]), [probe, operator, problem], 900);
    expect(document.querySelector('[data-series="operator"]')).toBeNull();
    expect(document.querySelector('[data-series="probe"]')?.closest(".wb-series")?.classList.contains("wb-probe-run")).toBe(true);
    expect(document.querySelector('polyline[data-series="problem"]')?.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(document.querySelector("[data-invalid-notice]")).toBeNull();
    const resumed = invalid("resumed-invalid", "model/gateway error");
    if (resumed.config === null) throw new Error("config");
    resumed.config = { ...resumed.config, resume: "CLOCK_SET" };
    expect(frontierReferences([resumed]).best).toBeNull();
    document.body.innerHTML = frontierPlot({ human: null, best: null }, [resumed], 900);
    expect(document.querySelector('polyline[data-series="resumed-invalid"]')?.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(document.querySelector('[data-series="resumed-invalid"]')?.closest(".wb-series")?.getAttribute("data-resume")).toBe("CLOCK_SET");
    expect(document.querySelector('[data-resume-origin="CLOCK_SET"]')).not.toBeNull();
  });
});

describe("recorded comparison coverage", () => {
  it.each(["Infrastructure outcome: launcher_error", "Launcher outcome: operator stopped the run"])("keeps %s as a labelled flag and still lets it lead the frontier", flag => {
    const excluded = flag;
    const stopped = { ...measured("stopped", [1000, 2000, 3000]), flag };
    expect(frontierReferences([stopped]).best?.id).toBe("stopped");
    const refs = frontierReferences([]);
    document.body.innerHTML = frontierPlot(refs, [stopped], 900);
    expect(document.querySelectorAll('[data-run="stopped"]')).toHaveLength(3);
    expect(document.querySelector('polyline[data-series="stopped"]')?.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(document.querySelector('[data-run="stopped"]')?.getAttribute("aria-label")).toContain(excluded);
  });
  it("accounts for every selected recording, deduplicates current runs and explains unplottable progress with replay links", () => {
    const plotted = measured("plotted", [1000]);
    const empty = measured("empty", []);
    const probe = { ...plotted, id: "probe", excluded: "Excluded probe session" };
    const broken = { ...plotted, id: "broken", problem: "invalid event <schema>" };
    const unknown = { ...plotted, id: "unknown", config: null };
    const excluded = { ...plotted, id: "excluded", excluded: "Operator exclusion: wrong ROM" };
    const brokenEmpty = { ...empty, id: "broken-empty", problem: "invalid event <schema>" };
    document.body.innerHTML = frontierPlot({ human: null, best: null }, [plotted, empty, probe, broken, unknown, excluded, brokenEmpty], 900, undefined, [plotted]);
    const coverage = document.querySelector('[data-frontier-coverage]');
    expect(coverage?.textContent).toContain("7 selected recordings · 4 plotted · 3 unavailable");
    expect(coverage?.textContent).toContain("No recorded story checkpoints");
    expect(coverage?.textContent).toContain("probe session");
    expect(coverage?.textContent).toContain("Operator exclusion: wrong ROM");
    expect(coverage?.textContent).toContain("invalid event <schema>");
    expect(coverage?.textContent).toContain("start unknown");
    expect(coverage?.querySelectorAll('a[href^="/#replay="]')).toHaveLength(7);
    expect(document.querySelectorAll('[data-run="excluded"], [data-run="broken-empty"], [data-run="empty"]')).toHaveLength(0);
  });
});

it("always plots extreme ended overlays and never exposes a time-outlier hide path", () => {
  const normal = Array.from({ length: 20 }, (_, i) => measured(`population-${String(i)}`, [null, null, null, null, null, null, null, null, null, 120000]));
  const extreme = measured("early-extreme", [12000000]);
  const refs = { human: null, best: null };
  for (const zoom of [true, false]) {
    const html = frontierPlot(refs, [extreme, ...normal], 900, null, [], zoom);
    expect(html).toContain('data-run="early-extreme"');
    expect(html).not.toContain("data-hidden-outliers");
    expect(html).not.toContain("time outlier");
  }
});

describe("operator-stopped frontier", () => {
  it.each(["operator_abort", "operator_stop"])("keeps %s earned splits, labels the frontier and censors missing milestones", reason => {
    const stopped = { ...best(), reason };
    expect(frontierReferences([stopped]).best?.id).toBe(stopped.id);
    expect(milestoneStatus(stopped, "RIVAL_MET")).toBe("reached");
    expect(milestoneStatus(stopped, "STARTER_CHOSEN")).toBe("censored");
    expect(frontierLabel(stopped, null, frontierVersions([stopped]))).toContain(reason === "operator_abort" ? "ended by operator abort" : "ended by operator stop");
    expect(invalidTrial(stopped)).toBeNull();
    document.body.innerHTML = frontierPlot(frontierReferences([stopped]), [stopped], 900);
    expect(document.body.textContent).toContain(`Ended by operator ${reason === "operator_abort" ? "abort" : "stop"} (${reason})`);
  });
  it("lets a run whose process died without run_end lead the frontier: how it ended never removes it", () => {
    const died = { ...best(), id: "died", status: "unresponsive" as const, reason: null };
    expect(frontierReferences([died]).best?.id).toBe("died");
  });
  it("keeps an operator-excluded run off the chart and names the operator's reason", () => {
    const excluded = { ...best(), id: "excluded", excluded: "Operator exclusion: wrong ROM" };
    expect(frontierReferences([excluded]).best).toBeNull();
    expect(invalidTrial(excluded)).toBeNull();
    expect(milestoneStatus(excluded, "RIVAL_MET")).toBe("excluded");
  });
});

it("thins dense phone labels while retaining every recorded point and checkpoint details",()=>{
 const dense=human();dense.splits=FRONTIER_MILESTONES.map((m,i)=>({name:m.id,elapsedMs:(i+1)*1000,segmentMs:1000,seq:i,turn:0,inputTokens:0,outputTokens:0}));
 document.body.innerHTML=frontierPlot({human:dense,best:null},[],375);
 const labels=[...document.querySelectorAll('text[transform]')].map(n=>Number(n.getAttribute('transform')?.match(/translate\(([0-9.]+)/)?.[1]));
 expect(labels.length).toBeLessThan(16);for(let i=1;i<labels.length;i++)expect((labels[i]??0)-(labels[i-1]??0)).toBeGreaterThanOrEqual(25);
 for(const m of FRONTIER_MILESTONES)expect(document.querySelector(`[data-split="${m.id}"]`)).not.toBeNull();
});

describe("custom lanes are shown as heavily assisted", () => {
  const config = (features: { id: string; label: string; on: boolean | null }[] = []): WorkbenchRun["config"] => ({ source: "a", dirty: false, vendor: "b", pi: "c", preset: null, target: null, thinking: "medium", maxTokens: 1, maxTurns: null, maxWallMs: null, failureLimit: null, context: 1, vision: true, start: "boot", tools: [], features });
  const fastest = (id: string, extra: Partial<WorkbenchRun>): WorkbenchRun => ({ ...measured(id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), config: config(), ...extra });
  const benchmark = (): WorkbenchRun => ({ ...best(), config: config() });
  const lanes: readonly [string, Partial<WorkbenchRun>, string][] = [
    ["edited", { model: "qwen3.8-27b-edit-e1-a" }, "weight-edited model"],
    ["labelled", { experiment: { id: "custom-hints", arm: "a", trial: 1, of: 1 } }, "custom experiment"],
    ["knowing", { config: config([{ id: "story-route-plan-v1", label: "STORY ROUTE PLAN", on: true }]) }, "story-route-plan-v1 is on"],
  ];
  const plotted = (runs: readonly WorkbenchRun[], overlays: readonly WorkbenchRun[] = runs, current: readonly WorkbenchRun[] = []): void => { document.body.innerHTML = frontierPlot(frontierReferences(runs), overlays, 900, null, current); };
  it.each(lanes)("%s run takes best overall, never best unhelped, and is drawn marked", (id, extra, why) => {
    const custom = fastest(id, extra), plain = benchmark();
    expect(customLane(custom)).toBe(why);
    const refs = frontierReferences([plain, custom]);
    expect(refs.best?.id).toBe(plain.id);
    expect(refs.overall?.id).toBe(id);
    plotted([plain, custom]);
    const series = document.querySelector<SVGGElement>(`.wb-series[data-assisted]:has(.wb-mark[data-run="${id}"])`);
    expect(series?.dataset.assisted).toBe(why);
    expect(series?.querySelector("polyline")?.getAttribute("stroke")).toBe(ASSISTED_COLOR);
    expect(series?.querySelector("polyline")?.getAttribute("stroke-width")).toBe("3");
    expect(series?.querySelector(".wb-mark path")?.getAttribute("fill")).toBe("#fff");
    expect(series?.querySelector("circle")).toBeNull();
    expect(series?.querySelector(".wb-mark")?.getAttribute("aria-label")).toContain(`heavily assisted: ${why}`);
    const row = document.querySelector("[data-frontier-coverage]")?.textContent ?? "";
    expect(row).toContain(`heavily assisted: ${why}`);
    expect(row).toContain("1 assisted");
    expect(document.querySelector(`[data-frontier-coverage] a[href="/#replay=${id}"]`)).not.toBeNull();
    expect(document.body.textContent).toContain("never pooled with experiment cohorts");
  });
  it.each(lanes)("%s run leaves the race and the harness versions as they were", (id, extra) => {
    const custom = fastest(id, extra), plain = benchmark(), second: WorkbenchRun = { ...measured("second", [1000]), config: config() };
    expect(frontierPair([plain, second, custom])).toEqual(frontierPair([plain, second]));
    expect(frontierSplits([plain, custom], plain.id)).toBeNull();
    expect(frontierVersions([plain, custom]).byRun.has(id)).toBe(false);
  });
  it("a benchmark run ahead of every assisted run stays best overall, with no flag on the behind run's chart being wrong", () => {
    const plain = benchmark(), helped: WorkbenchRun = { ...measured("helped", [9, 10]), model: "x-edit-1", config: config() };
    const refs = frontierReferences([plain, helped]);
    expect(refs.overall?.id).toBe(plain.id);
    expect(refs.best?.id).toBe(plain.id);
    plotted([plain, helped]);
    expect(document.querySelectorAll("[data-assisted-flag]")).toHaveLength(1);
    expect(document.querySelector("[data-assisted-flag]")?.getAttribute("data-assisted-flag")).toBe("helped");
  });
  it("the best overall assisted run is drawn even when the overlay filter leaves it out", () => {
    const plain = benchmark(), helped = fastest("helped", { model: "x-edit-1" });
    plotted([plain, helped], []);
    expect(document.querySelector('.wb-mark[data-run="helped"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-assisted-flag="helped"]')).toHaveLength(1);
  });
  it("draws one flag, at the head of the furthest assisted run, and keeps it inside the chart", () => {
    const further = fastest("further", { model: "x-edit-1" }), nearer: WorkbenchRun = { ...measured("nearer", [1, 2]), model: "x-edit-2", config: config() };
    plotted([benchmark(), nearer, further]);
    expect([...document.querySelectorAll("[data-assisted-flag]")].map(f => f.getAttribute("data-assisted-flag"))).toEqual(["further"]);
    expect(document.querySelector("[data-assisted-flag]")?.textContent).toBe("HEAVILY ASSISTED");
    const rect = document.querySelector("[data-assisted-flag] rect");
    expect(Number(rect?.getAttribute("x"))).toBeGreaterThanOrEqual(0);
    expect(Number(rect?.getAttribute("y")) + 17).toBeLessThanOrEqual(490);
  });
  it("turns the flag upward when the head sits too low for it", () => {
    const low: WorkbenchRun = { ...measured("low", [1, 1000]), model: "x-edit-1", config: config() }, far = measured("far", [1, 2, 3, 4, 5, 6, 7, 8, 9, 3600000]);
    plotted([{ ...far, config: config() }, low]);
    const rect = document.querySelector('[data-assisted-flag="low"] rect');
    expect(Number(rect?.getAttribute("y"))).toBeLessThan(470);
  });
  it("a flagged or checkpoint custom run is shown as assisted and keeps its dotted or dashed line", () => {
    const flagged = fastest("flagged", { model: "x-edit-1", flag: "Invalid fixed-run trial: crashed" });
    expect(invalidTrial(flagged)).toBe("crashed");
    const base = config(); if (base === null) throw new Error("config");
    const resumed = fastest("resumed", { model: "x-edit-1", config: { ...base, start: "save", resume: "CLOCK_SET" } });
    const refs = frontierReferences([benchmark(), resumed]);
    expect(refs.overall?.id).toBe("dea1");
    expect(refs.best?.id).toBe("dea1");
    expect(checkpointResume(resumed)).toBe(true);
    plotted([benchmark(), flagged, resumed]);
    const line = (id: string): Element | null => document.querySelector(`polyline[data-series="${id}"]`);
    expect(line("flagged")?.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(line("resumed")?.getAttribute("stroke-dasharray")).toBe("8 5");
    expect(line("resumed")?.getAttribute("stroke")).toBe(ASSISTED_COLOR);
  });
  it("a checkpoint resume can carry the flag, and takes it when it is the furthest assisted run", () => {
    const base = config(); if (base === null) throw new Error("config");
    const resumed = fastest("resumed", { model: "x-edit-1", config: { ...base, start: "save", resume: "CLOCK_SET" } });
    plotted([benchmark(), resumed]);
    expect([...document.querySelectorAll("[data-assisted-flag]")].map(f => f.getAttribute("data-assisted-flag"))).toEqual(["resumed"]);
    const boot: WorkbenchRun = { ...measured("boot", [1, 2]), model: "x-edit-2", config: base };
    plotted([benchmark(), resumed, boot]);
    expect([...document.querySelectorAll("[data-assisted-flag]")].map(f => f.getAttribute("data-assisted-flag"))).toEqual(["resumed"]);
  });
  it("a live assisted run keeps its pulse, turns violet and says so in the live key", () => {
    const live = fastest("helped", { model: "x-edit-1", status: "live" });
    plotted([benchmark(), live], [], [live]);
    expect(document.querySelector('[data-live-run="helped"]')?.hasAttribute("data-assisted")).toBe(true);
    expect(document.querySelector('[data-live-run="helped"] polyline')?.getAttribute("stroke")).toBe(ASSISTED_COLOR);
    expect(document.querySelector(".wb-current-keys")?.textContent).toContain("HEAVILY ASSISTED");
    expect(document.querySelector(".wb-current-key i")?.getAttribute("style")).toContain(ASSISTED_COLOR);
  });
  it("a chart with no assisted run stays as it was", () => {
    plotted([benchmark()]);
    expect(document.querySelector("[data-assisted]")).toBeNull();
    expect(document.querySelector("[data-assisted-flag]")).toBeNull();
    expect(document.body.textContent).not.toContain("assisted");
  });
  it("names the assistance in the run details drawer, and only for an assisted run", () => {
    expect(runDetails(fastest("helped", { model: "x-edit-1" }), null)).toContain("HEAVILY ASSISTED");
    expect(runDetails(benchmark(), null)).not.toContain("HEAVILY ASSISTED");
  });
  it("leaves benchmark runs alone: a switch that is off, a recorded-unknown switch, or an id merely containing edit", () => {
    for (const run of [benchmark(), fastest("off", { config: config([{ id: "story-route-plan-v1", label: "", on: false }]) }), fastest("unknown", { config: config([{ id: "next-milestone-hint-v1", label: "", on: null }]) }), fastest("credit", { model: "credited-model" }), fastest("slash", { model: "vendor/edit/model" }), fastest("under", { model: "qwen_edit_control" }), fastest("none", { model: null, config: null })]) expect(customLane(run)).toBeNull();
  });
});
