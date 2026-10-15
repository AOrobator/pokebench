import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent } from "@pokebench/agent/events";
import { StateMilestones, qualifiedNativeMilestone } from "../../agent/src/milestones.js";
import { readNativeRecording } from "./frontier-recording.js";
import { RunView } from "./model.js";
import { Log, START, assistant, state } from "../test-support/events.js";
function write(raw: string): string { const path = join(mkdtempSync(join(tmpdir(), "native-frontier-")), "events.jsonl"); writeFileSync(path, raw); return path; }
describe("bounded native recording reduction", () => {
  it("uses actual recorded native states and preserves active/raw timing without retaining replay history", () => {
    const raw: unknown = JSON.parse(readFileSync(new URL("../test-support/frontier-reference.json", import.meta.url), "utf8"));
    if (typeof raw !== "object" || raw === null || !("human" in raw) || typeof raw.human !== "object" || raw.human === null || !("events" in raw.human) || !Array.isArray(raw.human.events)) throw new Error("fixture");
    const events = (raw.human.events as unknown[]).map(e => parseEvent(JSON.stringify(e))), first = events[0]; if (first === undefined) throw new Error("first");
    const result = readNativeRecording(write(events.map(e => JSON.stringify(e)).join("\n") + "\n"), first.run, qualifiedNativeMilestone);
    expect(result.splits.find(s => s.name === "RIVAL_MET")?.elapsedMs).toBe(317885);
    expect(result.measurement.rawSplits.find(s => s.name === "RIVAL_MET")?.elapsedMs).toBe(371754);
    expect(result.splits.find(s => s.name === "STONE_BADGE")?.elapsedMs).toBe(6645610);
    expect(result.splits.some(s => s.name === "RIVAL_HOUSE_ENTERED")).toBe(true);
    expect(result.splits.some(s => s.name === "RIVAL_BEDROOM_REACHED")).toBe(true);
    expect(result.measurement.pausedMs).toBe(53869); expect(result.measurement.controller).toBe("human");
    expect(result.view.events).toEqual([]); expect(result.view.presses).toEqual([]); expect(result.view.state).toBeNull();
  });
  it("rejects repeated starts, identity/order defects and no start instead of overwriting provenance", () => {
    const log = new Log(); log.add(0, START); log.add(1, { ...START, model: { ...START.model, id: "replacement" } });
    expect(() => readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), log.events[0]?.run ?? "", qualifiedNativeMilestone)).toThrow("order");
    expect(() => readNativeRecording(write(""), "empty", qualifiedNativeMilestone)).toThrow("No complete");
    expect(() => readNativeRecording(write(JSON.stringify(log.events[0]) + "\n"), "wrong", qualifiedNativeMilestone)).toThrow("identity");
    expect(() => readNativeRecording(write(""), "empty", qualifiedNativeMilestone, 0)).toThrow("positive");
  });
});
it("retains token/turn attribution and multi-state heal evidence through compact reduction", () => {
  const log = new Log(); log.add(0, START);
  log.add(100, assistant());
  const counters = (used: number) => ({ pokemon_captures: 0, evolved_pokemon: 0, used_pokecenter: used, saved_game: 0 });
  const baseline = log.add(200, state({ game_stats: counters(0), field_controls_locked: false }));
  const accepted = log.add(300, state({ game_stats: counters(1), field_controls_locked: true }));
  const finished = log.add(400, state({ game_stats: counters(1), field_controls_locked: false, party: [{ species: "TORCHIC", level: 5, hp: 20, max_hp: 20 }] }));
  log.add(500, { type: "milestone", turn: 1, name: "FIRST_POKECENTER_HEAL", kind: "story", origin: "observed", server_timestamp: 1, evidence: [baseline.seq, accepted.seq, finished.seq] });
  const raw = log.events.map(e => JSON.stringify(e)).join("\n") + "\n", result = readNativeRecording(write(raw), baseline.run, qualifiedNativeMilestone);
  expect(result.splits).toMatchObject([{ name: "FIRST_POKECENTER_HEAL", elapsedMs: 500, turn: 1, inputTokens: 500, outputTokens: 100 }]);
  expect(result.measurement.rawSplits[0]?.evidence).toEqual([2, 3, 4]);
  expect(() => readNativeRecording(write(raw), baseline.run, qualifiedNativeMilestone, 2)).toThrow("state bound");
});
it("recovers historical human route and Roxanne gaps from retained native states with honest timing provenance", () => {
  const fixture: {events: unknown[]} = JSON.parse(readFileSync(new URL("../test-support/frontier-gap-reference.json", import.meta.url), "utf8")) as {events: unknown[]};
  const events = fixture.events.map(e => parseEvent(JSON.stringify(e))), first = events[0]; if (first === undefined) throw new Error("fixture");
  const result = readNativeRecording(write(events.map(e => JSON.stringify(e)).join("\n") + "\n"), first.run, qualifiedNativeMilestone);
  for (const name of ["ROUTE_101", "ROUTE_102", "ROUTE_103", "ROUTE_104", "ROXANNE_DEFEATED"]) {
    expect(result.splits.find(s => s.name === name)).toMatchObject({ derived: true });
    expect(result.measurement.rawSplits.find(s => s.name === name)?.evidence).toHaveLength(1);
  }
  expect(result.splits.find(s => s.name === "ROUTE_101")?.elapsedMs).toBe(391340);
  expect(result.view.events).toEqual([]); expect(result.view.state).toBeNull();
});
it("prefers an emitted native route receipt over historical recovery and recomputes segment timing", () => {
  const log = new Log(); log.add(0, START); log.add(100, state());
  const witness = log.add(200, state({location:"ROUTE101",map_id:[0,16]}));
  log.add(210, {type:"milestone",turn:1,name:"ROUTE_101",kind:"navigation",origin:"observed",server_timestamp:1,evidence:[witness.seq]});
  const result = readNativeRecording(write(log.events.map(e=>JSON.stringify(e)).join("\n")+"\n"),witness.run,qualifiedNativeMilestone);
  expect(result.splits).toMatchObject([{name:"ROUTE_101",elapsedMs:210,segmentMs:210,seq:3}]);
  expect(result.splits).toHaveLength(1); expect(result.splits[0]?.derived).toBeUndefined();
});
const clocked = { name_confirmed: true, intro_stage: 7 as const, rival_stage: 0 as const, birch_lab_stage: 0 as const, petalburg_gym_stage: 0 as const, woods_stage: 0 as const, clock_set: true, rival_battle_won: false, pokedex_received: false, running_shoes_received: false, starter_tutorial_complete: false, rustboro_gym_complete: false, stone_badge: false, rock_tomb_received: false };
const quiet = { badges: [] as string[], party: [] as { species: string; level: number; hp: number; max_hp: number }[] };
it("recovers leave-home and rival house from a Clock set save whose log omitted both rows", () => {
  for (const home of ["BRENDANS", "MAYS"] as const) {
    const rival = home === "BRENDANS" ? "MAYS" : "BRENDANS";
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) }, harness_features: ["post-clock-navigation-milestones-v1"] });
    const bedroom = log.add(1000, state({ ...quiet, location: `LITTLEROOT TOWN ${home} HOUSE 2F`, story: clocked }));
    const downstairs = log.add(2000, state({ ...quiet, location: `LITTLEROOT TOWN ${home} HOUSE 1F`, story: clocked }));
    log.add(2200, state({ ...quiet, location: `LITTLEROOT TOWN ${home} HOUSE 1F`, screen: "field_transition", story: clocked }));
    const town = log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: clocked }));
    log.add(3500, state({ ...quiet, location: `LITTLEROOT TOWN ${home} HOUSE 1F`, story: clocked }));
    const rivalHouse = log.add(4000, state({ ...quiet, location: `LITTLEROOT TOWN ${rival} HOUSE 1F`, story: clocked }));
    const result = readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), bedroom.run, qualifiedNativeMilestone);
    expect(result.splits.find(s => s.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK")).toMatchObject({ derived: true, seq: town.seq, elapsedMs: 3000 });
    expect(result.measurement.rawSplits.find(s => s.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK")?.evidence).toEqual([bedroom.seq, downstairs.seq, town.seq]);
    expect(result.splits.find(s => s.name === "CLOCK_SET")).toMatchObject({ derived: true, seq: bedroom.seq, elapsedMs: 1000 });
    expect(result.splits.find(s => s.name === "PLAYER_BEDROOM")).toMatchObject({ derived: true, seq: bedroom.seq, elapsedMs: 1000 });
    expect(result.splits.find(s => s.name === "RIVAL_HOUSE_ENTERED")).toMatchObject({ derived: true, seq: rivalHouse.seq, elapsedMs: 4000 });
    expect(result.measurement.rawSplits.find(s => s.name === "RIVAL_HOUSE_ENTERED")?.evidence).toEqual([bedroom.seq, rivalHouse.seq]);
    const tracker = new StateMilestones({ read: () => Promise.resolve(state({ location: "LITTLEROOT TOWN" }) as never) });
    tracker.initialize("save_state");
    const detected: { name: string; evidence?: readonly number[] }[] = [];
    for (const event of log.events) if (event.type === "state" && "started" in event) detected.push(...tracker.observe(event, event.seq));
    expect(detected.filter(m => m.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK" || m.name === "RIVAL_HOUSE_ENTERED").map(m => [m.name, m.evidence])).toEqual([
      ["PLAYER_HOUSE_EXITED_AFTER_CLOCK", [bedroom.seq, downstairs.seq, town.seq]],
      ["RIVAL_HOUSE_ENTERED", [bedroom.seq, rivalHouse.seq]],
    ]);
  }
});
it("does not recover a rival-house visit that the save already started inside, or a boot run with no pre-clock home", () => {
  const resumed = new Log();
  resumed.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "b".repeat(40) } });
  resumed.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN", story: clocked }));
  resumed.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN MAYS HOUSE 1F", story: clocked }));
  const late = readNativeRecording(write(resumed.events.map(e => JSON.stringify(e)).join("\n") + "\n"), resumed.events[0]?.run ?? "", qualifiedNativeMilestone);
  expect(late.splits.some(s => s.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK" || s.name === "RIVAL_HOUSE_ENTERED")).toBe(false);
  const boot = new Log();
  boot.add(0, START);
  boot.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: clocked }));
  boot.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", story: clocked }));
  boot.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: clocked }));
  boot.add(4000, state({ ...quiet, location: "LITTLEROOT TOWN MAYS HOUSE 1F", story: clocked }));
  const fresh = readNativeRecording(write(boot.events.map(e => JSON.stringify(e)).join("\n") + "\n"), boot.events[0]?.run ?? "", qualifiedNativeMilestone);
  expect(fresh.splits.some(s => s.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK" || s.name === "RIVAL_HOUSE_ENTERED")).toBe(false);
  const probe = new Log();
  probe.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "c".repeat(40) }, harness_features: ["probe"] });
  probe.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: clocked }));
  probe.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", story: clocked }));
  probe.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: clocked }));
  probe.add(4000, state({ ...quiet, location: "LITTLEROOT TOWN MAYS HOUSE 1F", story: clocked }));
  const probed = readNativeRecording(write(probe.events.map(e => JSON.stringify(e)).join("\n") + "\n"), probe.events[0]?.run ?? "", qualifiedNativeMilestone);
  expect(probed.splits.some(s => s.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK" || s.name === "RIVAL_HOUSE_ENTERED")).toBe(false);
});
it("prefers a recorded leave-home receipt over the recovered observation", () => {
  const log = new Log();
  log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "d".repeat(40) } });
  const bedroom = log.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: clocked }));
  const downstairs = log.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", story: clocked }));
  const town = log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: clocked }));
  const mark = log.add(3100, { type: "milestone", turn: 1, name: "PLAYER_HOUSE_EXITED_AFTER_CLOCK", kind: "navigation", origin: "observed", server_timestamp: 1, evidence: [bedroom.seq, downstairs.seq, town.seq] });
  const result = readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), town.run, qualifiedNativeMilestone);
  expect(result.splits.filter(s => s.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK")).toEqual([expect.objectContaining({ seq: mark.seq, elapsedMs: 3100 })]);
  expect(result.splits.find(s => s.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK")?.derived).toBeUndefined();
});
it("recovers a bedroom the transition frame could not grade, and does not treat the rival room as home", () => {
  const beforeClock = { ...clocked, clock_set: false, intro_stage: 5 as const };
  const log = new Log();
  log.add(0, START);
  const transition = log.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", screen: "field_transition", story: beforeClock }));
  log.add(1100, { type: "milestone", turn: 1, name: "PLAYER_BEDROOM", kind: "navigation", origin: "observed", server_timestamp: 1, evidence: [transition.seq] });
  const room = log.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: beforeClock }));
  log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN MAYS HOUSE 2F", story: clocked }));
  const result = readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), room.run, qualifiedNativeMilestone);
  expect(result.splits.filter(s => s.name === "PLAYER_BEDROOM")).toEqual([expect.objectContaining({ derived: true, seq: room.seq, elapsedMs: 2000 })]);
  expect(result.measurement.rawSplits.find(s => s.name === "PLAYER_BEDROOM")?.evidence).toEqual([room.seq]);
});
it("does not recover unsupported modern, resumed, transitioning, battle, or incomplete boss evidence", () => {
  const fixture: {events: unknown[]} = JSON.parse(readFileSync(new URL("../test-support/frontier-gap-reference.json", import.meta.url), "utf8")) as {events: unknown[]};
  const boss = fixture.events.map(e=>parseEvent(JSON.stringify(e))).find(e=>e.type==="state"&&"story" in e&&e.story?.rustboro_gym_complete===true);
  if(boss?.type!=="state"||!("started" in boss)||boss.story==null)throw Error("boss witness");
  const bossStory = boss.story;
  for (const mode of ["modern","resumed","transition","battle","incomplete"] as const) {
    const log=new Log();log.add(0,{...START,...(mode==="modern"?{harness_features:["native-progress-activity-v1"]}:{}),...(mode==="resumed"?{start_state:{kind:"save_state" as const,path:"resume",sha1:"0".repeat(40)}}:{})});log.add(100,state());
    log.add(200,state({story:{...bossStory,stone_badge:mode!=="incomplete"},screen:mode==="transition"?"field_transition":"overworld",in_battle:mode==="battle"}));
    const result=readNativeRecording(write(log.events.map(e=>JSON.stringify(e)).join("\n")+"\n"),log.events[0]?.run??"",qualifiedNativeMilestone);
    expect(result.splits.some(s=>s.name==="ROXANNE_DEFEATED")).toBe(false);
  }
});
it("recovers leaving the rival's house after the rival meeting from a log that predates the split", () => {
  const met = { ...clocked, rival_stage: 3 as const };
  for (const home of ["BRENDANS", "MAYS"] as const) {
    const rival = home === "BRENDANS" ? "MAYS" : "BRENDANS";
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) }, harness_features: ["post-clock-navigation-milestones-v1"] });
    const bedroom = log.add(1000, state({ ...quiet, location: `LITTLEROOT TOWN ${home} HOUSE 2F`, story: clocked }));
    log.add(2000, state({ ...quiet, location: `LITTLEROOT TOWN ${home} HOUSE 1F`, story: clocked }));
    log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: clocked }));
    log.add(4000, state({ ...quiet, location: `LITTLEROOT TOWN ${rival} HOUSE 1F`, story: clocked }));
    log.add(5000, state({ ...quiet, location: `LITTLEROOT TOWN ${rival} HOUSE 2F`, story: met }));
    const downstairs = log.add(6000, state({ ...quiet, location: `LITTLEROOT TOWN ${rival} HOUSE 1F`, story: met }));
    log.add(6200, state({ ...quiet, location: `LITTLEROOT TOWN ${rival} HOUSE 1F`, screen: "field_transition", story: met }));
    const town = log.add(7000, state({ ...quiet, location: "LITTLEROOT TOWN", story: met }));
    log.add(8000, state({ ...quiet, location: `LITTLEROOT TOWN ${home} HOUSE 1F`, story: met }));
    log.add(9000, state({ ...quiet, location: "LITTLEROOT TOWN", story: met }));
    const result = readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), bedroom.run, qualifiedNativeMilestone);
    expect(result.splits.filter(s => s.name === "RIVAL_HOUSE_EXITED")).toMatchObject([{ derived: true, seq: town.seq, elapsedMs: 7000 }]);
    expect(result.measurement.rawSplits.find(s => s.name === "RIVAL_HOUSE_EXITED")?.evidence).toEqual([bedroom.seq, downstairs.seq, town.seq]);
    const tracker = new StateMilestones({ read: () => Promise.resolve(state({ location: "LITTLEROOT TOWN" }) as never) });
    tracker.initialize("save_state");
    const detected: { name: string; evidence?: readonly number[] }[] = [];
    for (const event of log.events) if (event.type === "state" && "started" in event) detected.push(...tracker.observe(event, event.seq));
    expect(detected.filter(m => m.name === "RIVAL_HOUSE_EXITED").map(m => m.evidence)).toEqual([[bedroom.seq, downstairs.seq, town.seq]]);
  }
});
it("does not recover a rival-house exit before the meeting or from the player's own house", () => {
  const met = { ...clocked, rival_stage: 3 as const };
  const log = new Log();
  log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) }, harness_features: ["post-clock-navigation-milestones-v1"] });
  const bedroom = log.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: clocked }));
  log.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN MAYS HOUSE 1F", story: { ...clocked, rival_stage: 2 as const } }));
  log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: { ...clocked, rival_stage: 2 as const } }));
  log.add(4000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", story: met }));
  log.add(5000, state({ ...quiet, location: "LITTLEROOT TOWN", story: met }));
  const result = readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), bedroom.run, qualifiedNativeMilestone);
  expect(result.splits.some(s => s.name === "RIVAL_HOUSE_EXITED")).toBe(false);
});
it("does not recover a rival-house exit for a save whose home already shows the rival met", () => {
  const met = { ...clocked, rival_stage: 3 as const };
  const log = new Log();
  log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/after-rival.state", sha1: "b".repeat(40) }, harness_features: ["post-clock-navigation-milestones-v1"] });
  const first = log.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN MAYS HOUSE 2F", story: met }));
  log.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", story: met }));
  log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: met }));
  const result = readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), first.run, qualifiedNativeMilestone);
  expect(result.splits.some(s => s.name === "RIVAL_HOUSE_EXITED")).toBe(false);
});
const atLab = (lab: number) => ({ ...clocked, rival_stage: 4 as const, birch_lab_stage: lab as 0 });
it("recovers the first Route 101 entry after the Birch handoff from a log that predates the split, matching the tracker", () => {
  const log = new Log();
  log.add(0, START);
  log.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN", map_id: [0, 9], story: atLab(0) }));
  log.add(2000, state({ ...quiet, location: "ROUTE101", map_id: [0, 16], story: atLab(0) }));
  const witness = log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN PROFESSOR BIRCHS LAB", map_id: [1, 4], story: atLab(2) }));
  log.add(4000, state({ ...quiet, location: "LITTLEROOT TOWN PROFESSOR BIRCHS LAB", map_id: [1, 4], story: atLab(3) }));
  const town = log.add(5000, state({ ...quiet, location: "LITTLEROOT TOWN", map_id: [0, 9], story: atLab(3) }));
  log.add(5200, state({ ...quiet, location: "ROUTE101", map_id: [0, 16], screen: "field_transition", story: atLab(3) }));
  const route = log.add(6000, state({ ...quiet, location: "ROUTE101", map_id: [0, 16], story: atLab(3) }));
  log.add(7000, state({ ...quiet, location: "LITTLEROOT TOWN", map_id: [0, 9], story: atLab(3) }));
  log.add(8000, state({ ...quiet, location: "ROUTE101", map_id: [0, 16], story: atLab(3) }));
  const result = readNativeRecording(write(log.events.map(e => JSON.stringify(e)).join("\n") + "\n"), witness.run, qualifiedNativeMilestone);
  expect(result.splits.filter(s => s.name === "ROUTE_101_AFTER_HANDOFF")).toMatchObject([{ derived: true, seq: route.seq, elapsedMs: 6000 }]);
  expect(result.measurement.rawSplits.find(s => s.name === "ROUTE_101_AFTER_HANDOFF")?.evidence).toEqual([witness.seq, town.seq, route.seq]);
  const tracker = new StateMilestones({ read: () => Promise.resolve(state({ location: "LITTLEROOT TOWN" }) as never) });
  const detected: { name: string; evidence?: readonly number[] }[] = [];
  for (const event of log.events) if (event.type === "state" && "started" in event) detected.push(...tracker.observe(event, event.seq));
  expect(detected.filter(m => m.name === "ROUTE_101_AFTER_HANDOFF").map(m => m.evidence)).toEqual([[witness.seq, town.seq, route.seq]]);
  const native = new Log();
  for (const event of log.events) native.events.push(event);
  native.add(6100, { type: "milestone", turn: 1, name: "ROUTE_101_AFTER_HANDOFF", kind: "navigation", origin: "observed", server_timestamp: 1, evidence: [witness.seq, town.seq, route.seq] });
  const receipt = readNativeRecording(write(native.events.map(e => JSON.stringify(e)).join("\n") + "\n"), witness.run, qualifiedNativeMilestone);
  expect(receipt.splits.filter(s => s.name === "ROUTE_101_AFTER_HANDOFF")).toMatchObject([{ seq: native.events.at(-1)?.seq }]);
  expect(receipt.splits.find(s => s.name === "ROUTE_101_AFTER_HANDOFF")?.derived).toBeUndefined();
});
it("does not recover a post-handoff Route 101 entry without a return, a pre-handoff witness, or a connected map", () => {
  const cases: [string, number][][] = [
    [["LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 2], ["LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 3], ["LITTLEROOT TOWN", 3], ["LITTLEROOT TOWN BRENDANS HOUSE 1F", 3], ["LITTLEROOT TOWN", 3]],
    [["ROUTE101", 3], ["LITTLEROOT TOWN", 3], ["ROUTE101", 3]],
    [["LITTLEROOT TOWN", 2], ["LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 3], ["ROUTE101", 3]],
  ];
  for (const rows of cases) {
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) } });
    rows.forEach(([location, lab], i) => log.add(1000 * (i + 1), state({ ...quiet, location, story: atLab(lab) })));
    const view = new RunView();
    for (const event of log.events) view.apply(event);
    expect(view.milestones.some(m => m.name === "ROUTE_101_AFTER_HANDOFF")).toBe(false);
  }
});
