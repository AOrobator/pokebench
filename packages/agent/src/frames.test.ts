import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_START } from "../test-support/events.js";
import { parseEvent, type RunEvent } from "./events.js";
import { FRAME_CAP_BYTES, FrameCapError, FrameStore } from "./frames.js";
import { RunLog } from "./run-log.js";

const CAP = 1000;

function setup(): { runsRoot: string; notices: string[]; store: FrameStore } {
  const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-frames-"));
  const notices: string[] = [];
  return { runsRoot, notices, store: new FrameStore(runsRoot, CAP, (line) => notices.push(line)) };
}

function b64(bytes: number): string {
  return Buffer.alloc(bytes, 7).toString("base64");
}

function oldFrame(runsRoot: string, run: string, name: string, bytes: number): string {
  mkdirSync(join(runsRoot, run, "frames"), { recursive: true });
  const path = join(runsRoot, run, "frames", name);
  writeFileSync(path, Buffer.alloc(bytes));
  return path;
}

function startedLog(runsRoot: string, runId = "2026-10-11T22-00-00_think-swarm_cccc"): RunLog {
  const log = RunLog.create(runsRoot, runId);
  log.append(RUN_START);
  return log;
}

function events(log: RunLog): RunEvent[] {
  return readFileSync(log.eventsPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => parseEvent(line));
}

describe("FrameStore", () => {
  it("defaults to a 500 MB cap", () => {
    expect(FRAME_CAP_BYTES).toBe(500 * 1024 * 1024);
  });

  it("measures only PNG frames under runs/*/frames", () => {
    const { runsRoot, store } = setup();
    oldFrame(runsRoot, "a", "000001_0.png", 100);
    oldFrame(runsRoot, "b", "000002_0.png", 50);
    writeFileSync(join(runsRoot, "a", "events.jsonl"), "x".repeat(400));
    oldFrame(runsRoot, "b", "notes.txt", 999);
    expect(store.usage()).toBe(150);
  });

  it("refuses to start a run above 75% of the cap", () => {
    const { runsRoot, store } = setup();
    oldFrame(runsRoot, "a", "000001_0.png", 751);
    expect(() => {
      store.assertCanStart();
    }).toThrow(FrameCapError);
    expect(() => {
      store.assertCanStart();
    }).toThrow(/75%.*just runs-prune/);
  });

  it("allows a start at exactly 75%", () => {
    const { runsRoot, store } = setup();
    oldFrame(runsRoot, "a", "000001_0.png", 750);
    expect(() => {
      store.assertCanStart();
    }).not.toThrow();
  });

  it("announces current usage when a run attaches", () => {
    const { runsRoot, notices, store } = setup();
    oldFrame(runsRoot, "a", "000001_0.png", 230);
    const log = startedLog(runsRoot);
    store.attach(log);
    expect(events(log).at(-1)).toMatchObject({ type: "disk_usage", bytes: 230, cap_bytes: CAP, percent: 20 });
    expect(notices).toEqual(["frames on disk: 20% of 1000 B cap (230 B)"]);
  });

  it("saves frames as runs/<id>/frames/<seq>_<i>.png with a sha1", () => {
    const { runsRoot, store } = setup();
    const log = startedLog(runsRoot);
    store.attach(log);
    const ref = store.save(log, 7, 0, b64(10));
    expect(ref.path).toBe("frames/000007_0.png");
    expect(ref.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(readFileSync(join(log.runDir, ref.path))).toEqual(Buffer.alloc(10, 7));
    expect(store.usage()).toBe(10);
  });

  it("reports each new 10% step once, in the log and the terminal", () => {
    const { runsRoot, notices, store } = setup();
    const log = startedLog(runsRoot);
    store.attach(log);
    store.save(log, 1, 0, b64(50));
    store.save(log, 2, 0, b64(60));
    store.save(log, 3, 0, b64(10));
    store.save(log, 4, 0, b64(200));
    const percents = events(log).flatMap((event) => (event.type === "disk_usage" ? [event.percent] : []));
    expect(percents).toEqual([0, 10, 30]);
    expect(notices.slice(1)).toEqual([
      "frames on disk: 10% of 1000 B cap (110 B)",
      "frames on disk: 30% of 1000 B cap (320 B)",
    ]);
  });

  it("evicts the oldest frames across runs when the cap is exceeded", () => {
    const { runsRoot, store } = setup();
    const oldest = oldFrame(runsRoot, "2026-10-01T10-00-00_a", "000001_0.png", 300);
    const older = oldFrame(runsRoot, "2026-10-01T10-00-00_a", "000002_0.png", 300);
    const old = oldFrame(runsRoot, "2026-10-05T10-00-00_b", "000001_0.png", 300);
    const log = startedLog(runsRoot);
    store.attach(log);
    store.save(log, 5, 0, b64(250));
    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(older)).toBe(true);
    expect(existsSync(old)).toBe(true);
    expect(store.usage()).toBe(850);
    expect(events(log).filter((event) => event.type === "frames_evicted")).toEqual([
      expect.objectContaining({ from_run: "2026-10-01T10-00-00_a", files: 1, bytes: 300 }),
    ]);
    const ledger = readFileSync(join(runsRoot, "frames-evictions.jsonl"), "utf8").trim().split("\n");
    expect(ledger.map((line) => JSON.parse(line) as unknown)).toEqual([
      expect.objectContaining({ run: "2026-10-01T10-00-00_a", files: 1, bytes: 300, by_run: log.runId }),
    ]);
  });

  it("evicts the current run's own oldest frames when it alone fills the cap", () => {
    const { runsRoot, store } = setup();
    const log = startedLog(runsRoot);
    store.attach(log);
    const first = store.save(log, 1, 0, b64(600));
    store.save(log, 2, 0, b64(600));
    expect(existsSync(join(log.runDir, first.path))).toBe(false);
    expect(store.usage()).toBe(600);
  });

  it("prunes oldest-first down to a target fraction", () => {
    const { runsRoot, store } = setup();
    oldFrame(runsRoot, "a", "000001_0.png", 400);
    oldFrame(runsRoot, "a", "000002_0.png", 400);
    oldFrame(runsRoot, "b", "000001_0.png", 100);
    expect(store.prune(0.5)).toEqual({ files: 1, bytes: 400 });
    expect(store.usage()).toBe(500);
  });

  it("rejects a prune target outside 0..1", () => {
    expect(() => setup().store.prune(1.5)).toThrow(RangeError);
  });
});

describe("FrameStore edge cases", () => {
  it("treats a missing runs directory as empty", () => {
    expect(new FrameStore(join(tmpdir(), "pokebench-missing-dir-xyz"), CAP, () => undefined).usage()).toBe(0);
  });

  it("skips runs without a frames directory", () => {
    const { runsRoot, store } = setup();
    mkdirSync(join(runsRoot, "no-frames"));
    oldFrame(runsRoot, "with-frames", "000001_0.png", 10);
    expect(store.usage()).toBe(10);
  });

  it("prunes nothing when already under the target", () => {
    const { runsRoot, store } = setup();
    oldFrame(runsRoot, "a", "000001_0.png", 100);
    expect(store.prune(0.5)).toEqual({ files: 0, bytes: 0 });
  });
});
