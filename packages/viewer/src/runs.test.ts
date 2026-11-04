import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RunView } from "./model.js";
import { Log, START, assistant, fullRun, state } from "../test-support/events.js";
import { rivalRam, writeArchive } from "../test-support/raw-ram.js";
import { RECENT_EVENT_BYTES, RECENT_EVENT_TURNS, RunsError, baselineOf, createBaselineReader, listRuns, liveScreenPort, readFrom, readRecentEvents, readHeadEvents, runDir } from "./runs.js";




describe("readRecentEvents", () => {
  it("pins the production snapshot bounds", () => {
    expect(RECENT_EVENT_TURNS).toBe(30);
    expect(RECENT_EVENT_BYTES).toBe(8 * 1024 * 1024);
  });
});

