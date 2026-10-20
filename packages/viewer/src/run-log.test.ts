import { closeSync, ftruncateSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_LOG_MAX_BYTES, fileLines, linesOf } from "./run-log.js";
import { reduceWorkbenchLog } from "./workbench-reader.js";
import { readNativeRecording } from "./frontier-recording.js";

describe("run logs too long for one string", () => {
  it("reads a file line by line across chunk boundaries, multibyte text included, and again on each pass", () => {
    const path = join(mkdtempSync(join(tmpdir(), "pokebench-run-log-")), "events.jsonl");
    const lines = ["{\"a\":1}", "", "{\"name\":\"POKéMON\"}", "x".repeat(37), "last without newline"];
    writeFileSync(path, lines.join("\n"));
    const read = fileLines(path, 7);
    expect([...read]).toEqual(lines);
    expect([...read]).toEqual(lines);
    writeFileSync(path, "one\n");
    expect([...fileLines(path)]).toEqual(["one"]);
    writeFileSync(path, "");
    expect([...fileLines(path)]).toEqual([]);
  });

  it("splits a whole text and passes a line stream through", () => {
    expect([...linesOf("a\nb\n")]).toEqual(["a", "b", ""]);
    const stream = ["a", "b"];
    expect(linesOf(stream)).toBe(stream);
  });

  it("bounds a run log well above a six-hour run's 1.2 GB", () => {
    expect(RUN_LOG_MAX_BYTES).toBeGreaterThanOrEqual(8 * 1024 ** 3);
    expect(Number.isSafeInteger(RUN_LOG_MAX_BYTES)).toBe(true);
  });

  it("rejects a non-positive chunk size", () => {
    expect(() => [...fileLines("/nonexistent", 0)]).toThrow(/chunk/);
  });

  it("streams a log past the old 512 MiB bound in the workbench and frontier readers", () => {
    const path = join(mkdtempSync(join(tmpdir(), "pokebench-run-log-")), "events.jsonl");
    const fd = openSync(path, "w");
    ftruncateSync(fd, 600 * 1024 * 1024);
    closeSync(fd);
    expect(() => reduceWorkbenchLog(path, () => undefined)).toThrow("streaming line bound");
    expect(() => readNativeRecording(path, "r", () => true)).toThrow("streaming line bound");
  });
});
