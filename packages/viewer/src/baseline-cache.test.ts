import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fullRun, tAt } from "../test-support/events.js";
import { baselineOf, createBaselineReader, comparisonsOf } from "./runs.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function root(): string {
  const path = fs.mkdtempSync(join(tmpdir(), "baseline-cache-"));
  roots.push(path);
  return path;
}
function write(root: string, id: string, offset = 3100): string {
  const dir = join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const events = fullRun().events.map((event) => ({ ...event, run: id, ...(event.type === "milestone" && event.name === "PLAYER_NAME_SET" ? { t: tAt(offset) } : {}) }));
  const path = join(dir, "events.jsonl");
  fs.writeFileSync(path, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  return path;
}

it("reuses a fully validated unchanged log without reading its contents again", async () => {
  const dir = root();
  write(dir, "reference");
  const expected = baselineOf(dir, "reference");
  const read = createBaselineReader(dir);
  const io = vi.spyOn(fs, "readSync");
  expect((await read("reference"))).toEqual(expected);
  expect(io.mock.calls.length).toBeGreaterThan(0);
  io.mockClear();
  expect((await read("reference"))).toEqual(expected);
  expect(io).not.toHaveBeenCalled();
});

it("refreshes same-size edits even when the modification time is restored", async () => {
  const dir = root();
  const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  const stat = fs.statSync;
  const initial = stat(path, { bigint: true });
  vi.spyOn(fs, "statSync").mockImplementation((...args) => {
    const result = stat(...args);
    if (result !== undefined) Reflect.set(result, "mtimeNs", initial.mtimeNs);
    return result;
  });
  expect((await read("reference")).milestones.at(-1)?.offsetMs).toBe(3100);
  const before = fs.statSync(path);
  const text = fs.readFileSync(path, "utf8");
  fs.writeFileSync(path, text.replace("22:00:03.100", "22:00:04.100"));
  fs.utimesSync(path, before.atime, before.mtime);
  expect(fs.statSync(path).size).toBe(before.size);
  expect((await read("reference")).milestones.at(-1)?.offsetMs).toBe(4100);
});

it("rejects changed malformed interiors and reuses that rejection until repaired", async () => {
  const dir = root();
  const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  await read("reference");
  const text = fs.readFileSync(path, "utf8");
  fs.writeFileSync(path, text.replace('"name":"PLAYER_NAME_SET"', '"name":42'));
  await expect(read("reference")).rejects.toThrow(/line 8/);
  const io = vi.spyOn(fs, "readSync");
  await expect(read("reference")).rejects.toThrow(/line 8/);
  expect(io).not.toHaveBeenCalled();
  fs.writeFileSync(path, text);
  expect((await read("reference")).milestones.at(-1)?.offsetMs).toBe(3100);
});

it("notices replacement, deletion and recreation of the same run path", async () => {
  const dir = root();
  const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  await read("reference");
  const replacement = write(dir, "replacement", 4100);
  fs.writeFileSync(replacement, fs.readFileSync(replacement, "utf8").replaceAll('"run":"replacement"', '"run":"reference"'));
  fs.renameSync(replacement, path);
  expect((await read("reference")).milestones.at(-1)?.offsetMs).toBe(4100);
  fs.unlinkSync(path);
  await expect(read("reference")).rejects.toThrow();
  write(dir, "reference", 5100);
  expect((await read("reference")).milestones.at(-1)?.offsetMs).toBe(5100);
});

it("isolates roots and protects stored splits from caller mutation", async () => {
  const a = root(), b = root();
  write(a, "same", 3100); write(b, "same", 4100);
  const readA = createBaselineReader(a), readB = createBaselineReader(b);
  Reflect.set((await readA("same")), "milestones", []);
  expect((await readA("same")).milestones.at(-1)?.offsetMs).toBe(3100);
  expect((await readB("same")).milestones.at(-1)?.offsetMs).toBe(4100);
});

it("preserves exact comparisons while discovering new completions and changed candidates", async () => {
  const dir = root();
  write(dir, "selected"); const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  const comparisons = () => comparisonsOf(dir, "selected", read);
  expect((await comparisons())).toEqual((await comparisonsOf(dir, "selected")));
  expect((await comparisons())).toEqual((await comparisonsOf(dir, "selected")));
  write(dir, "new", 2100);
  expect((await comparisons()).candidates.map((c) => c.run).sort()).toEqual(["new", "reference"]);
  fs.writeFileSync(path, fs.readFileSync(path, "utf8").replace('"name":"PLAYER_NAME_SET"', '"name":42'));
  expect((await comparisons()).candidates.map((c) => c.run)).toEqual(["new"]);
  expect((await comparisons())).toEqual((await comparisonsOf(dir, "selected")));
});

it("does not retain a validation result when its file changes during the read", async () => {
  const dir = root();
  const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  const stat = fs.statSync;
  let checks = 0;
  const initial = stat(path, { bigint: true });
  vi.spyOn(fs, "statSync").mockImplementation((...args) => {
    checks += 1;
    if (checks === 2) write(dir, "reference", 4100);
    return checks > 2 ? initial : stat(...args);
  });
  expect((await read("reference")).milestones.at(-1)?.offsetMs).toBe(3100);
  // Simulate the initial fingerprint reappearing: retaining the raced result would now return stale splits.
  const io = vi.spyOn(fs, "readSync");
  expect((await read("reference")).milestones.at(-1)?.offsetMs).toBe(4100);
  expect(io.mock.calls.length).toBeGreaterThan(0);
  expect(fs.existsSync(path)).toBe(true);
});
