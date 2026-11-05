// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BASE_MS, START } from "../test-support/events.js";
import { run } from "../test-support/frontier-run.js";
import { createFrontierCache } from "./frontier-cache.js";
import { FRONTIER_MILESTONES, frontierPair, racePlot, saveFrontiers } from "./frontier.js";
import { RunView } from "./model.js";
import { configuration, fromSave } from "./run-config.js";
import { raceHeadline, raceMap, raceOf, raceSide, raceStart } from "./splits-race.js";
import { parseWorkbench, type WorkbenchRun } from "./workbench-data.js";

const SAVE = "c".repeat(40), OTHER = "d".repeat(40), GUIDE = "rq-milestone-guide-v1";
const split = (name: string, seconds: number, i: number): WorkbenchRun["splits"][number] => ({ name, elapsedMs: seconds * 1000, segmentMs: 0, seq: i + 1, turn: i + 1, inputTokens: 0, outputTokens: 0 });
const agent = (id: string, started: string, marks: readonly (readonly [string, number])[], extra: Partial<WorkbenchRun> = {}): WorkbenchRun => {
  const base = run({ id, splits: marks.map(([name, seconds], i) => split(name, seconds, i)) });
  return { ...base, started, measurement: { controller: "agent", features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] }, ...extra };
};
const saved = (id: string, started: string, marks: readonly (readonly [string, number])[], save = SAVE, extra: Partial<WorkbenchRun> = {}): WorkbenchRun => {
  const base = agent(id, started, marks, extra);
  if (base.config === null) throw new Error("fixture");
  return { ...base, config: { ...base.config, start: "save_state", resume: null, saveSha1: save } };
};
const assisted = (source: WorkbenchRun): WorkbenchRun => {
  if (source.config === null) throw new Error("fixture");
  return { ...source, config: { ...source.config, features: [{ id: GUIDE, label: "Guide", on: true }] } };
};
const T1 = "2026-11-05T01:00:00.000-05:00", T2 = "2026-11-05T02:00:00.000-05:00", T3 = "2026-11-05T03:00:00.000-05:00", T4 = "2026-11-05T04:00:00.000-05:00";
const BADGE: readonly (readonly [string, number])[] = [["FORTREE_CITY", 60], ["FEATHER_BADGE", 300]];

describe("what a save run races", () => {
  it("races the fastest earlier run from the same save, whatever file name loaded it", () => {
    const races = saveFrontiers([saved("first", T1, [["FORTREE_CITY", 90]]), saved("best", T2, BADGE), saved("slow", T3, [["FORTREE_CITY", 60], ["FEATHER_BADGE", 900]]), saved("now", T4, [["FORTREE_CITY", 50]])]);
    expect(races.get("now")?.run).toBe("best");
    expect(races.get("slow")?.run).toBe("best");
    expect(races.get("best")?.run).toBe("first");
    expect(races.get("first")).toBeNull();
  });
  it("never races a later run or a run of the same instant", () => {
    const races = saveFrontiers([saved("later", T3, BADGE), saved("now", T2, [["FORTREE_CITY", 50]]), saved("tie", T2, BADGE)]);
    expect(races.get("now")).toBeNull();
    expect(races.get("tie")).toBeNull();
    expect(races.get("later")?.run).toBe("tie");
  });
  it("keeps saves apart and leaves New Game runs out", () => {
    const races = saveFrontiers([saved("other", T1, BADGE, OTHER), agent("boot", T1, BADGE), saved("now", T2, [["FORTREE_CITY", 50]])]);
    expect(races.get("now")).toBeNull();
    expect(races.has("boot")).toBe(false);
  });
  it("counts an aborted run but never an excluded, problem, probe, milestone-free or assisted one", () => {
    const rivals = [saved("excluded", T1, BADGE, SAVE, { excluded: "operator" }), saved("broken", T1, BADGE, SAVE, { problem: "bad log" }), saved("probe", T1, BADGE, SAVE, { excluded: "Excluded probe session" }), saved("idle", T1, []), assisted(saved("helped", T1, BADGE))];
    expect(saveFrontiers([...rivals, saved("now", T2, [])]).get("now")).toBeNull();
    expect(saveFrontiers([...rivals, saved("cut", T1, BADGE, SAVE, { reason: "operator_abort" }), saved("now", T2, [])]).get("now")?.run).toBe("cut");
  });
  it("leaves screenshot-only evidence out of what is raced", () => {
    const base = saved("rival", T1, BADGE), [city, badge] = base.splits;
    if (city === undefined || badge === undefined) throw new Error("fixture");
    const evidence = { ...badge, derived: true as const, screenshotEvidence: [{ seq: 1, path: "frames/000001_1.png", sha1: "e".repeat(40) }] };
    expect(saveFrontiers([{ ...base, splits: [city, evidence] }, saved("now", T2, [])]).get("now")?.milestones.map(m => m.name)).toEqual(["FORTREE_CITY"]);
  });
  it("lets an assisted save run race the unhelped save frontier", () => {
    expect(saveFrontiers([saved("rival", T1, BADGE), assisted(saved("now", T2, []))]).get("now")?.run).toBe("rival");
  });
});

describe("the frontier answer", () => {
  const ranked = (runs: readonly WorkbenchRun[], read: () => Promise<readonly WorkbenchRun[]> = () => Promise.resolve(runs)) => createFrontierCache({ read, now: () => 0, waitMs: 50 });
  it("answers a save run with its save frontier, marked as one", async () => {
    const cache = ranked([agent("boot", T1, BADGE), saved("rival", T1, BADGE), saved("now", T2, [])]);
    expect(await cache.answer("now", true)).toMatchObject({ state: "ready", save: true, frontier: { run: "rival" } });
  });
  it("says where a save run starts, which only the complete runs know", async () => {
    const origin = { milestone: "FORTREE_CITY", save: "x.state", sourceRun: null, sourceTurn: null };
    const cache = ranked([saved("rival", T1, BADGE), saved("now", T2, [], SAVE, { origin })]);
    expect(await cache.answer("now", true)).toMatchObject({ start: "FORTREE_CITY" });
    expect(await cache.answer("rival", true)).not.toHaveProperty("start");
  });
  it("answers a save run nothing earlier shares with no frontier, never the New Game one", async () => {
    expect(await ranked([agent("boot", T1, BADGE), saved("now", T2, [])]).answer("now", true)).toEqual({ state: "ready", frontier: null, save: true });
  });
  it("keeps asking while the run is not ranked yet", async () => {
    expect(await ranked([agent("boot", T1, BADGE)]).answer("new", true)).toEqual({ state: "loading", frontier: null });
    expect(await createFrontierCache({ read: () => new Promise(() => undefined), now: () => 0, waitMs: 1 }).answer("new", true)).toEqual({ state: "loading", frontier: null });
  });
  it("answers an assisted New Game run with the benchmark frontier", async () => {
    const helped = assisted(agent("helped", T2, [["FORTREE_CITY", 10], ["FEATHER_BADGE", 20]]));
    expect(await ranked([agent("boot", T1, BADGE), helped]).answer("helped", false)).toMatchObject({ frontier: { run: "boot" } });
  });
  it("never makes an assisted run the gold frontier, however far it got", () => {
    const pair = frontierPair([assisted(agent("helped", T2, [["FORTREE_CITY", 10], ["FEATHER_BADGE", 20]])), agent("boot", T1, BADGE)]);
    expect([pair.best?.run, pair.runnerUp]).toEqual(["boot", null]);
  });
});

describe("recording which save a run loaded", () => {
  const header = (start: typeof START): Parameters<typeof configuration>[0] => ({ v: 1, run: "now", seq: 0, t: T1, ...start });
  const state = (path: string): Parameters<typeof configuration>[0] => header({ ...START, start_state: { kind: "save_state", path, sha1: SAVE } });
  it("records an arbitrary or named save and treats the main menu as New Game", () => {
    expect(configuration(state("x/PAUSED_BEFORE_RESTART.state")).saveSha1).toBe(SAVE);
    expect(configuration(state("x/ROUTE_101.state")).saveSha1).toBe(SAVE);
    expect(configuration(state("x/MAIN_MENU.state")).saveSha1).toBeUndefined();
    expect(configuration(header(START)).saveSha1).toBeUndefined();
    expect([fromSave(state("x/ROUTE_101.state")), fromSave(state("x/MAIN_MENU.state")), fromSave(header(START))]).toEqual([true, false, false]);
  });
  it("crosses the wire validated", () => {
    const data = (saveSha1: unknown): unknown => ({ version: 1, at: 0, milestones: [], problems: [], runs: [{ ...saved("now", T1, []), config: { ...saved("now", T1, []).config, saveSha1 } }] });
    expect(parseWorkbench(data(SAVE)).runs[0]?.config?.saveSha1).toBe(SAVE);
    expect(() => parseWorkbench(data(7))).toThrow();
  });
});

describe("where the race starts", () => {
  const view = (path: string): RunView => Object.assign(new RunView(), { start: { ...START, start_state: { kind: "save_state", path, sha1: SAVE } }, startMs: BASE_MS });
  it("places an arbitrary save from its provenance, and a checkpoint name wins", () => {
    expect(raceStart(view("x/PAUSED_BEFORE_RESTART.state"), "FORTREE_CITY")).toBe(FRONTIER_MILESTONES.findIndex(m => m.id === "FORTREE_CITY"));
    expect(raceStart(view("x/CLOCK_SET.state"), "FORTREE_CITY")).toBe(FRONTIER_MILESTONES.findIndex(m => m.id === "CLOCK_SET"));
    expect(raceStart(view("x/PAUSED_BEFORE_RESTART.state"), "NOT_A_MILESTONE")).toBeNull();
    expect(raceStart(view("x/PAUSED_BEFORE_RESTART.state"), null)).toBeNull();
  });
  it("races a save of unknown position and opens at its next badge when the origin knows it", () => {
    const front = { run: "x_9f4c", milestones: [{ name: "FEATHER_BADGE", offsetMs: 300000 }] };
    const race = raceOf([{ name: "FEATHER_BADGE", at: 200 }], front, 250, null);
    expect([race.compared, race.gap, race.rows[0]?.kind]).toEqual([true, -100, "up"]);
    const fortree = FRONTIER_MILESTONES.findIndex(m => m.id === "FORTREE_CITY");
    expect(raceOf([], front, 1, fortree).legs.find(l => l.current)?.badge).toBe("FEATHER");
  });
});

describe("what the race page says", () => {
  const rival = { run: "2026-11-05T12-30-45_astra_9f4c", milestones: [{ name: "FORTREE_CITY", offsetMs: 60000 }, { name: "FEATHER_BADGE", offsetMs: 300000 }] };
  const race = raceOf([{ name: "FORTREE_CITY", at: 40 }], rival, 50, 1);
  it("names the save frontier and that both clocks start at their own load", () => {
    const html = raceHeadline(race, "…ee2a", 50, false, raceSide(rival, true, null));
    expect(html).toContain("…ee2a is 0:00:20 ahead of the SAVE FRONTIER …9f4c!");
    expect(raceHeadline(raceOf([{ name: "FORTREE_CITY", at: 40 }], rival, 70, 1), "r", 70, false, raceSide(rival, true, null))).toContain("the SAVE FRONTIER …9f4c had reached");
    expect(html).toContain(rival.run);
    expect(html).toContain("own start");
    expect(html).not.toContain("the FRONTIER");
    expect(raceHeadline(raceOf([{ name: "FORTREE_CITY", at: 40 }], rival, 400, 1), "r", 400, false, raceSide(rival, true, null))).toContain("past the SAVE FRONTIER …9f4c's last milestone");
    expect(raceHeadline(raceOf([{ name: "ROUTE_101", at: 1 }], rival, 2, 1), "r", 2, false, raceSide(rival, true, null))).toContain("No shared milestones with the SAVE FRONTIER …9f4c yet.");
  });
  it("says why a save run has no race", () => {
    const html = raceHeadline(raceOf([{ name: "FORTREE_CITY", at: 40 }], null, 50, null), "…ee2a", 50, false, raceSide(null, true, null));
    expect(html).toContain("No earlier unassisted run from this save has recorded a milestone");
    expect(html).not.toContain("no frontier comparison");
  });
  it("says a run is heavily assisted before anything else, even without a race", () => {
    const html = raceHeadline(race, "…0952", 50, false, raceSide(rival, false, `${GUIDE} is on`));
    expect(html).toContain("HEAVILY ASSISTED");
    expect(html).toContain(`${GUIDE} is on`);
    expect(html).toContain("ASSISTED …0952 is 0:00:20 ahead of the FRONTIER!");
    expect(html.indexOf("HEAVILY ASSISTED")).toBeLessThan(html.indexOf("race-lead"));
    expect(raceHeadline(raceOf([], null, 1, -1), "…0952", 1, false, raceSide(null, false, "custom experiment"))).toContain("HEAVILY ASSISTED");
    expect(raceHeadline(race, "…5f0f", 50, false, raceSide(rival, false, null))).not.toContain("ASSISTED");
  });
  it("escapes what it names", () => {
    const html = raceHeadline(race, "r", 50, false, raceSide({ ...rival, run: "<b>" }, true, "<i>"));
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
  });
  it("labels the opponent on the map", () => {
    const map = [{ name: "Fortree", key: "FORTREE", x: 10, y: 10 }];
    const html = raceMap(map, null, raceOf([], rival, 100, 1), "r", raceSide(rival, true, null).name);
    expect(html).toContain("SAVE FRONTIER …9f4c");
    expect(raceMap(map, null, raceOf([], rival, 100, 1), "r")).toContain(">FRONTIER<");
  });
});

describe("the race graph", () => {
  const rival = { run: "rival_9f4c", milestones: [{ name: "FORTREE_CITY", offsetMs: 60000 }] };
  it("draws the frontier as an unhelped benchmark run when an assisted run races it", () => {
    document.body.innerHTML = racePlot(rival, assisted(agent("helped", T1, BADGE)), 900);
    const line = document.querySelector('[data-run="rival_9f4c"][data-split="FORTREE_CITY"]');
    expect(line?.getAttribute("aria-label")).not.toContain("heavily assisted");
    expect(document.querySelector('[data-run="helped"]')?.getAttribute("aria-label")).toContain("heavily assisted");
  });
  it("draws both lines for a save run", () => {
    document.body.innerHTML = racePlot(rival, saved("now", T2, BADGE), 900);
    expect(document.querySelector('[data-run="rival_9f4c"][data-split="FORTREE_CITY"]')).not.toBeNull();
    expect(document.querySelector('[data-run="now"][data-split="FEATHER_BADGE"]')).not.toBeNull();
  });
});
