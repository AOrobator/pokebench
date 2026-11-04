import { chmodSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_START, sample } from "../test-support/events.js";
import { parseEvent } from "./events.js";
import { RunLog, RunLogError, easternTimestamp } from "./run-log.js";




describe("easternTimestamp", () => {
  it("formats daylight time with a -04:00 offset", () => {
    expect(easternTimestamp(new Date("2026-10-12T01:40:05.123Z"))).toBe("2026-10-11T21:40:05.123-04:00");
  });

  it("formats standard time with a -05:00 offset", () => {
    expect(easternTimestamp(new Date("2026-12-01T17:00:00.007Z"))).toBe("2026-12-01T12:00:00.007-05:00");
  });
});
