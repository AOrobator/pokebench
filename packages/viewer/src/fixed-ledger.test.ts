import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendLedger, classifyTrial, FixedLedgerError, nextFor, progress, queueState, readLedger, type FixedLedgerEntry, type FixedOutcome } from "./fixed-ledger.js";
import { definition, MODEL_PATH, START_SHA1 } from "../test-support/fixed.js";
import { Log, START } from "../test-support/events.js";

const def = definition();
const at = "2026-10-16T00:00:00.000Z";
const commit = "0123456789abcdef0123456789abcdef01234567";
function launch(slot: number, prior: readonly FixedLedgerEntry[] = []): FixedLedgerEntry {
  const s = queueState(def, prior).slots.find((q) => q.slot === slot);
  if (s === undefined) throw new Error(`no slot ${String(slot)}`);
  return { kind: "launch", slot, lane: s.lane, phase: s.phase, arm: s.arm, run: `run-${String(slot)}`, at, commit, sources: "s", presetSha256: "p", serving: "f", ...(s.replaces === null ? {} : { replaces: s.replaces }) };
}
function outcome(slot: number, valid: boolean): FixedLedgerEntry {
  return { kind: "outcome", slot, run: `run-${String(slot)}`, at, valid, reason: valid ? "wall cap" : "model/gateway error: model error: HTTP 502", endReason: valid ? "budget" : "model_error", primaryReached: false, primaryMs: null, furthest: null, furthestDepth: -1, furthestMs: null, wallMs: 900_000, turns: 100 };
}
function finishAll(entries: FixedLedgerEntry[], phase: string, lane?: string): void {
  for (const s of queueState(def, entries).slots.filter((q) => q.replaces === null && q.phase === phase && (lane === undefined || q.lane === lane))) {
    if (!entries.some((e) => e.kind === "launch" && e.slot === s.slot)) entries.push(launch(s.slot, entries), outcome(s.slot, true));
  }
}

describe("queueState and nextFor", () => {
  it("serves each lane its planned trials in plan order", () => {
    const first = nextFor(def, queueState(def, []), "A");
    expect(first).toEqual({ kind: "slot", slot: { ...def.plan.find((s) => s.lane === "A"), replaces: null } });
  });

  it("appends a replacement of the same arm on the same lane after the phase's planned trials, and charges its cap to the reserve", () => {
    const firstA = def.plan.find((s) => s.lane === "A" && s.phase === "confirmatory");
    if (firstA === undefined) throw new Error("fixture");
    const entries: FixedLedgerEntry[] = [launch(firstA.slot), outcome(firstA.slot, false)];
    const state = queueState(def, entries);
    const replacement = state.slots.find((s) => s.replaces === firstA.slot);
    expect(replacement).toEqual({ slot: def.plan.length + 1, phase: "confirmatory", block: null, lane: "A", arm: firstA.arm, replaces: firstA.slot });
    const laneA = state.slots.filter((s) => s.lane === "A").map((s) => s.slot);
    const lastPlannedA = def.plan.filter((s) => s.lane === "A" && s.phase === "confirmatory").at(-1)?.slot ?? 0;
    expect(laneA.indexOf(def.plan.length + 1)).toBe(laneA.indexOf(lastPlannedA) + 1);
    finishAll(entries, "confirmatory", "A");
    expect(nextFor(def, queueState(def, entries), "A")).toEqual({ kind: "slot", slot: replacement });
    entries.push(launch(def.plan.length + 1, entries));
    expect(queueState(def, entries).reserveUsedMs).toBe(900_000);
  });

  it("holds cook trials until every confirmatory trial on both lanes has an outcome", () => {
    const entries: FixedLedgerEntry[] = [];
    finishAll(entries, "confirmatory", "A");
    const step = nextFor(def, queueState(def, entries), "A");
    expect(step).toEqual({ kind: "wait", reason: "cook trials start once all 8 confirmatory trials have finished (4 still to run)" });
    finishAll(entries, "confirmatory", "B");
    expect(nextFor(def, queueState(def, entries), "A")).toMatchObject({ kind: "slot", slot: { phase: "cook", lane: "A" } });
  });

  it("pauses a lane at a replacement the reserve cannot cover, and reports done once everything ran", () => {
    const entries: FixedLedgerEntry[] = [];
    finishAll(entries, "confirmatory");
    finishAll(entries, "cook");
    expect(nextFor(def, queueState(def, entries), "A")).toEqual({ kind: "done" });
    const cookA = def.plan.find((s) => s.lane === "A" && s.phase === "cook");
    if (cookA === undefined) throw new Error("fixture");
    const failed = entries.map((e) => (e.kind === "outcome" && e.slot === cookA.slot ? outcome(cookA.slot, false) : e));
    expect(nextFor(def, queueState(def, failed), "A")).toEqual({ kind: "blocked", reason: "replacement reserve used up: a cook replacement needs 1.00 GPU-h but 0.50 of 0.50 GPU-h remain (1 invalid trial so far); waiting for the operator" });
    expect(nextFor(def, queueState(def, failed), "B")).toEqual({ kind: "done" });
  });

  it("counts valid, invalid and running trials, and lists the invalid ones", () => {
    const [a, b, c] = def.plan;
    if (a === undefined || b === undefined || c === undefined) throw new Error("fixture");
    const entries = [launch(a.slot), outcome(a.slot, true), launch(b.slot), outcome(b.slot, false), launch(c.slot)];
    const p = progress(def, queueState(def, entries));
    expect(p).toMatchObject({ total: 12, valid: 1, invalid: 1, running: [c.slot], reserveUsedMs: 0, reserveMs: 1_800_000 });
    expect(p.invalidTrials).toEqual([{ slot: b.slot, lane: b.lane, arm: b.arm, phase: b.phase, run: `run-${String(b.slot)}`, reason: "model/gateway error: model error: HTTP 502" }]);
    expect(p.lanes).toEqual({ A: { valid: expect.any(Number) as number, total: 6 }, B: { valid: expect.any(Number) as number, total: 6 } });
  });
});

describe("readLedger and appendLedger", () => {
  it("round-trips entries and rejects a malformed line by number", () => {
    const dir = mkdtempSync(join(tmpdir(), "fixed-ledger-"));
    const path = join(dir, "trials.jsonl");
    expect(readLedger(path)).toEqual([]);
    const slot = def.plan[0]?.slot ?? 1;
    appendLedger(path, launch(slot));
    appendLedger(path, { kind: "started", slot, run: `run-${String(slot)}`, pid: 42, at });
    expect(readLedger(path)).toHaveLength(2);
    writeFileSync(path, '{"kind":"launch"}\n', { flag: "a" });
    expect(() => readLedger(path)).toThrow(new FixedLedgerError(`${path}:3 is not a fixed-run ledger entry`));
  });
});

describe("classifyTrial", () => {
  const expectation = { presetId: "bundle-v-control-confirmatory-bundle", maxWallMs: 900_000, startSha1: START_SHA1, port: 8071, model: MODEL_PATH, primary: "RIVAL_MET" };
  const unlabelledStart = { ...START, model: { ...START.model, id: MODEL_PATH }, start_state: { kind: "save_state" as const, path: "x", sha1: START_SHA1 }, budgets: { max_turns: 20000, max_wall_ms: 900_000 }, isolation: { ...START.isolation, port: 8071 } };
  const goodStart = { ...unlabelledStart, evaluation: { preset_id: expectation.presetId, target: null, failure_limit: 3, reply_failures_end_run: false, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false } } };
  const end = { type: "run_end" as const, turn: 9, furthest_milestone: null, turns: 9, wall_ms: 900_000, tokens: { input: 1, output: 1 }, frames: { saved: 0, bytes: 0 } };
  function text(build: (log: Log) => void): string {
    const log = new Log();
    build(log);
    return log.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }
  function classify(build: (log: Log) => void, exit: number | null = 0): FixedOutcome {
    return classifyTrial(text(build), expectation, exit);
  }

  it("is valid at the wall cap, with the milestones reached after the start and the furthest by milestone order", () => {
    const o = classify((log) => {
      log.add(0, goodStart);
      log.add(1000, { type: "milestone", turn: 1, name: "CLOCK_SET", server_timestamp: 0, origin: "present_at_start" });
      log.add(60_000, { type: "milestone", turn: 5, name: "RIVAL_HOUSE_ENTERED", server_timestamp: 1 });
      log.add(120_000, { type: "milestone", turn: 7, name: "RIVAL_MET", server_timestamp: 2 });
      log.add(900_000, { ...end, reason: "budget", furthest_milestone: "RIVAL_MET" });
    });
    expect(o).toEqual({ valid: true, reason: "wall cap", endReason: "budget", primaryReached: true, primaryMs: 120_000, furthest: "RIVAL_MET", furthestDepth: expect.any(Number) as number, furthestMs: 120_000, wallMs: 900_000, turns: 9 });
    expect(o.furthestDepth).toBeGreaterThan(0);
  });

  it("is invalid for infrastructure failures, with the reason", () => {
    expect(classifyTrial(null, expectation, 1)).toMatchObject({ valid: false, reason: "no run_start: the run never began (exit 1); a server, emulator or checkpoint load failure", endReason: null });
    expect(classify((log) => { log.add(0, goodStart); }, null)).toMatchObject({ valid: false, reason: "no run_end: the play process died mid-run (exit signal)" });
    expect(classify((log) => {
      log.add(0, goodStart);
      log.add(10, { type: "retry", turn: 1, reason: "model error: HTTP 502 Bad Gateway", attempt: 3, limit: 3 });
      log.add(20, { ...end, reason: "model_error" });
    })).toMatchObject({ valid: false, reason: "model/gateway error: model error: HTTP 502 Bad Gateway", endReason: "model_error" });
    expect(classify((log) => { log.add(0, goodStart); log.add(20, { ...end, reason: "crash" }); })).toMatchObject({ valid: false, reason: "emulator or game server crash" });
    expect(classify((log) => { log.add(0, goodStart); log.add(20, { ...end, reason: "operator_stop" }); })).toMatchObject({ valid: false, reason: "the operator stopped the trial (operator_stop)" });
  });

  it("is invalid when the run did not run the planned configuration", () => {
    const wrong = classify((log) => { log.add(0, { ...goodStart, isolation: { ...goodStart.isolation, port: 9000 }, model: { ...goodStart.model, id: "other" } }); log.add(20, { ...end, reason: "budget" }); });
    expect(wrong).toMatchObject({ valid: false, reason: "run_start does not match the plan: port 9000 (planned 8071); model other (planned /models/q.gguf)" });
    const lenient = classify((log) => { log.add(0, { ...goodStart, evaluation: { ...goodStart.evaluation, reply_failures_end_run: true }, budgets: { max_wall_ms: 1 }, start_state: { kind: "boot" } }); log.add(20, { ...end, reason: "budget" }); });
    expect(lenient.reason).toBe(`run_start does not match the plan: preset limits do not keep reply failures from ending the run; wall cap 1 ms (planned 900000); start boot (planned save_state ${START_SHA1})`);
    const unlabelled = classify((log) => { log.add(0, unlabelledStart); log.add(20, { ...end, reason: "budget" }); });
    expect(unlabelled.reason).toMatch(/preset none \(planned bundle-v-control-confirmatory-bundle\)/);
  });

  it("keeps model behavior valid: a model_error from reply failures, and stops before the cap", () => {
    expect(classify((log) => {
      log.add(0, goodStart);
      log.add(10, { type: "retry", turn: 1, reason: "text-only reply (no tool call)", attempt: 3, limit: 3 });
      log.add(20, { ...end, reason: "model_error" });
    })).toMatchObject({ valid: true, reason: "model behavior: text-only reply (no tool call)" });
    expect(classify((log) => { log.add(0, goodStart); log.add(20, { ...end, reason: "stalled", wall_ms: 400_000 }); })).toMatchObject({ valid: true, reason: "ended stalled before the wall cap" });
    expect(classify((log) => { log.add(0, goodStart); log.add(20, { ...end, reason: "budget", wall_ms: 400_000, turns: 20000 }); })).toMatchObject({ valid: true, reason: "turn cap (20000 turns) before the wall cap" });
  });

  it("tolerates unparseable lines in the middle of a log", () => {
    const body = text((log) => { log.add(0, goodStart); });
    const o = classifyTrial(`${body}not json\n${JSON.stringify({ ...end, reason: "budget", v: 1, run: "x", seq: 9, t: "2026-10-11T22:15:00.000-04:00" })}\n`, expectation, 0);
    expect(o).toMatchObject({ valid: true, wallMs: 900_000 });
  });
});
