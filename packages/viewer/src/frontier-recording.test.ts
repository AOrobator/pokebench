import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent } from "@pokebench/agent/events";
import { qualifiedNativeMilestone } from "../../agent/src/milestones.js";
import { readNativeRecording } from "./frontier-recording.js";
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
