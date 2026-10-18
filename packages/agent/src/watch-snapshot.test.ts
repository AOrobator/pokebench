import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkEvent, type RunEvent } from "./events.js";
import { RUN_START_META } from "../test-support/events.js";
import { formatWatch, parseWatch, WatchWriter, type WatchSnapshot } from "./watch-snapshot.js";

const at = (seq: number, iso: string, body: Record<string, unknown>): RunEvent => checkEvent({ v: 1, run: "r", seq, t: iso, turn: 0, ...body });

describe("watch snapshot", () => {
  it("round-trips milestones, party and location, and keeps the first split", () => {
    const snapshot: WatchSnapshot = {
      milestones: [{ name: "CLOCK_SET", offsetMs: 1000, origin: "observed", derived: true }, { name: "GAME_RUNNING", offsetMs: 0, origin: "present_at_start" }],
      party: [{ species: "TORCHIC", level: 7, hp: 20, max_hp: 22 }],
      location: "OLDALE TOWN",
      map_id: [0, 10],
    };
    const text = `${formatWatch(snapshot).trimEnd()}\n{"v":1,"kind":"milestone","seq":9,"name":"CLOCK_SET","offsetMs":9999,"origin":"observed"}\n`;
    expect(parseWatch(`${text}{"torn"`)).toEqual(snapshot);
  });

  it("subtracts a pause that was already open and skips an unchanged party", () => {
    const root = mkdtempSync(join(tmpdir(), "pokebench-watch-"));
    const writer = new WatchWriter(join(root, "watch.jsonl"));
    const start = "2026-10-17T16:00:00.000Z";
    writer.observe(at(0, start, { type: "run_start", ...RUN_START_META }));
    writer.observe(at(1, "2026-10-17T16:00:10.000Z", { type: "operator_control", action: "pause", status: "applied", request: 1 }));
    writer.observe(at(2, "2026-10-17T16:00:15.000Z", { type: "operator_control", action: "resume", status: "applied", request: 2 }));
    writer.observe(at(3, "2026-10-17T16:00:16.000Z", { type: "milestone", name: "ROUTE_101", server_timestamp: 16 }));
    const state = { type: "state", screen: "overworld", started: true, name: "RED", location: "ROUTE 101", map_id: [0, 16], position: { x: 1, y: 2 }, facing: "down", in_battle: false, party: [{ species: "TORCHIC", level: 5, hp: 18, max_hp: 20 }], money: 0, badges: [] as string[], play_time_s: 16 };
    writer.observe(at(4, "2026-10-17T16:00:16.000Z", state));
    writer.observe(at(5, "2026-10-17T16:00:17.000Z", { ...state, party: [{ species: "TORCHIC", level: 5, hp: 18, max_hp: 20 }] }));
    writer.observe(at(6, "2026-10-17T16:00:18.000Z", { ...state, location: "OLDALE TOWN", map_id: [0, 10], party: [{ species: "TORCHIC", level: 6, hp: 22, max_hp: 24 }] }));
    expect(parseWatch(readFileSync(join(root, "watch.jsonl"), "utf8"))).toEqual({
      milestones: [{ name: "ROUTE_101", offsetMs: 11_000, origin: "observed" }],
      party: [{ species: "TORCHIC", level: 6, hp: 22, max_hp: 24 }],
      location: "OLDALE TOWN",
      map_id: [0, 10],
    });
  });
});
