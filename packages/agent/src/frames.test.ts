import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_START } from "../test-support/events.js";
import { parseEvent, type RunEvent } from "./events.js";
import { FRAME_CAP_BYTES, FrameCapError, FrameStore } from "./frames.js";
import { RunLog } from "./run-log.js";








describe("FrameStore", () => {
  it("defaults to a 10 GB cap", () => {
    expect(FRAME_CAP_BYTES).toBe(10 * 1024 * 1024 * 1024);
  });
});

