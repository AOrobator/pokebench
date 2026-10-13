import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Log, START, assistant, state } from "../test-support/events.js";
import { workbenchSnapshot } from "./workbench-store.js";
import { parseWorkbench } from "./workbench-data.js";
const root = (): string => mkdtempSync(join(tmpdir(), "workbench-"));
function write(r: string, id: string, log: Log): string {
  mkdirSync(join(r, id)); const p = join(r, id, "events.jsonl");
  writeFileSync(p, log.events.map(e => JSON.stringify({ ...e, run: id })).join("\n") + "\n"); return p;
}
function named(origin: "observed" | "present_at_start" = "observed", evidence = true): Log {
  const l = new Log(); l.add(0, START); l.add(1000, assistant());
  const s = l.add(3000, state({ story: { name_confirmed: true, intro_stage: null, rival_stage: null, birch_lab_stage: null, petalburg_gym_stage: null, woods_stage: null, clock_set: null, rival_battle_won: null, pokedex_received: null, running_shoes_received: null, starter_tutorial_complete: null, rustboro_gym_complete: null, stone_badge: null, rock_tomb_received: null } }));
  l.add(4000, { type: "milestone", turn: 1, name: "PLAYER_NAME_CONFIRMED", kind: "story", origin, server_timestamp: 4, evidence: evidence ? [s.seq] : [] }); return l;
}
describe("read-only workbench snapshot", () => {
  it("uses the native owner/evidence, and retains earned time/turn/token attribution", async () => {
    const r = root(); write(r, "native", named()); const d = parseWorkbench(await workbenchSnapshot(r, async () => true, { state: "idle" }, 2000000000000));
    expect(d.runs[0]?.splits).toMatchObject([{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 4000, segmentMs: 4000, seq: 3, turn: 1, inputTokens: 500, outputTokens: 100 }]);
    expect(d.runs[0]?.status).toBe("live"); expect(d.runs[0]?.config?.source).toBe(START.harness.commit);
    expect(d.runs[0]?.config?.features.find(f => f.id === "naming-cursor-v1")?.on).toBeNull();
    expect(JSON.stringify(d)).not.toContain('"system_prompt"');
  });
  it("excludes present-at-start, missing/invalid evidence and probes from earned splits", async () => {
    const r = root(); write(r, "present", named("present_at_start")); write(r, "unqualified", named("observed", false)); const p = named(); const first = p.events[0]; if (first?.type !== "run_start") throw new Error("fixture start missing"); p.events[0] = { ...first, harness_features: ["probe"] }; write(r, "probe", p);
    const d = await workbenchSnapshot(r, async () => false, { state: "idle" }, 2000000000000);
    expect(d.runs).toHaveLength(3); expect(d.runs.every(x => x.splits.length === 0)).toBe(true);
    expect(d.runs.find(x => x.id === "probe")?.excluded).toContain("probe");
  });
  it("shows malformed logs instead of silently grading or hiding them", async () => {
    const r = root(), p = write(r, "broken", named()); appendFileSync(p, '{"bad":true}\n');
    const d = await workbenchSnapshot(r, async () => true, { state: "idle" }, 2000000000000); expect(d.runs[0]?.status).toBe("invalid"); expect(d.runs[0]?.problem).toBeTruthy(); expect(d.runs[0]?.splits).toEqual([]);
  });
  it("reflects cached log append changes and refuses to label an unhealthy unended run live", async () => {
    const r = root(), p = write(r, "r", named()); expect((await workbenchSnapshot(r, async () => false, { state: "idle" }, 2000000000000)).runs[0]?.status).toBe("unresponsive");
    appendFileSync(p, JSON.stringify({ v: 1, run: "r", seq: 4, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "milestone", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }) + "\n");
    const d = await workbenchSnapshot(r, async () => true, { state: "queued", runId: "new-run", waitingFor: "lease" }, 2000000000000); expect(d.runs[0]?.status).toBe("ended"); expect(d.queue).toMatchObject([{ id: "new-run", status: "queued", reason: "lease" }]);
  });
  it("validates the browser boundary and missing-root empty state", async () => {
    const d = await workbenchSnapshot(join(root(), "absent"), async () => false, { state: "idle" }, 42); expect(parseWorkbench(d).runs).toEqual([]); expect(() => parseWorkbench({ ...d, at: -1 })).toThrow("Invalid workbench"); expect(() => parseWorkbench({ ...d, runs: [{ id: "fake" }] })).toThrow();
  });
});
