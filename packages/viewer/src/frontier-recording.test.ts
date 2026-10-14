import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent } from "@pokebench/agent/events";
import { qualifiedNativeMilestone } from "../../agent/src/milestones.js";
import { readNativeRecording } from "./frontier-recording.js";
import { Log, START } from "../test-support/events.js";
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
