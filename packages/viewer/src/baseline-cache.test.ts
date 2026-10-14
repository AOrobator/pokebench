import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fullRun } from "../test-support/events.js";
import { baselineOf, createBaselineReader, comparisonsOf } from "./runs.js";

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
  const events = fullRun().events.map((event) => ({ ...event, run: id, ...(event.type === "milestone" && event.name === "PLAYER_NAME_SET" ? { t: new Date(Date.parse(event.t) + offset - 3100).toISOString() } : {}) }));
  const path = join(dir, "events.jsonl");
  fs.writeFileSync(path, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  return path;
}

it("reuses a fully validated unchanged log without reading its contents again", () => {
  const dir = root();
  write(dir, "reference");
  const expected = baselineOf(dir, "reference");
  const read = createBaselineReader(dir);
  const io = vi.spyOn(fs, "readSync");
  expect(read("reference")).toEqual(expected);
  expect(io.mock.calls.length).toBeGreaterThan(0);
  io.mockClear();
  expect(read("reference")).toEqual(expected);
  expect(io).not.toHaveBeenCalled();
});

it("refreshes same-size edits even when the modification time is restored", () => {
  const dir = root();
  const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  expect(read("reference").milestones.at(-1)?.offsetMs).toBe(3100);
  const before = fs.statSync(path);
  const text = fs.readFileSync(path, "utf8");
  fs.writeFileSync(path, text.replace("02:00:03.100", "02:00:04.100"));
  fs.utimesSync(path, before.atime, before.mtime);
  expect(fs.statSync(path).size).toBe(before.size);
  expect(read("reference").milestones.at(-1)?.offsetMs).toBe(4100);
});

it("rejects changed malformed interiors and reuses that rejection until repaired", () => {
  const dir = root();
  const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  read("reference");
  const text = fs.readFileSync(path, "utf8");
  fs.writeFileSync(path, text.replace('"name":"PLAYER_NAME_SET"', '"name":"INVALID_MILESTONE"'));
  expect(() => read("reference")).toThrow(/line 8/);
  const io = vi.spyOn(fs, "readSync");
  expect(() => read("reference")).toThrow(/line 8/);
  expect(io).not.toHaveBeenCalled();
  fs.writeFileSync(path, text);
  expect(read("reference").milestones.at(-1)?.offsetMs).toBe(3100);
});

it("notices replacement, deletion and recreation of the same run path", () => {
  const dir = root();
  const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  read("reference");
  const replacement = write(dir, "replacement", 4100);
  fs.writeFileSync(replacement, fs.readFileSync(replacement, "utf8").replaceAll('"run":"replacement"', '"run":"reference"'));
  fs.renameSync(replacement, path);
  expect(read("reference").milestones.at(-1)?.offsetMs).toBe(4100);
  fs.unlinkSync(path);
  expect(() => read("reference")).toThrow();
  write(dir, "reference", 5100);
  expect(read("reference").milestones.at(-1)?.offsetMs).toBe(5100);
});

it("isolates roots and protects stored splits from caller mutation", () => {
  const a = root(), b = root();
  write(a, "same", 3100); write(b, "same", 4100);
  const readA = createBaselineReader(a), readB = createBaselineReader(b);
  readA("same").milestones.splice(0);
  expect(readA("same").milestones.at(-1)?.offsetMs).toBe(3100);
  expect(readB("same").milestones.at(-1)?.offsetMs).toBe(4100);
});

it("evicts the least recently used entry at the injected small bound", () => {
  const dir = root();
  for (const id of ["a", "b", "c"]) write(dir, id);
  const read = createBaselineReader(dir, 2);
  read("a"); read("b"); read("a"); read("c");
  const io = vi.spyOn(fs, "readSync");
  read("a");
  expect(io).not.toHaveBeenCalled();
  read("b");
  expect(io.mock.calls.length).toBeGreaterThan(0);
});

it("preserves exact comparisons while discovering new completions and changed candidates", () => {
  const dir = root();
  write(dir, "selected"); const path = write(dir, "reference");
  const read = createBaselineReader(dir);
  const comparisons = () => comparisonsOf(dir, "selected", read);
  expect(comparisons()).toEqual(comparisonsOf(dir, "selected"));
  expect(comparisons()).toEqual(comparisonsOf(dir, "selected"));
  write(dir, "new", 2100);
  expect(comparisons().candidates.map((c) => c.run).sort()).toEqual(["new", "reference"]);
  expect(comparisons().best?.run).toBe("new");
  fs.writeFileSync(path, fs.readFileSync(path, "utf8").replace('"name":"PLAYER_NAME_SET"', '"name":"INVALID_MILESTONE"'));
  expect(comparisons().candidates.map((c) => c.run)).toEqual(["new"]);
  expect(comparisons()).toEqual(comparisonsOf(dir, "selected"));
});
