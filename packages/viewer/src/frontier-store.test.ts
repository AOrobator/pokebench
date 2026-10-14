import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent } from "@pokebench/agent/events";
import { workbenchSnapshot } from "./workbench-store.js";
import { parseWorkbench } from "./workbench-data.js";
import { fullRun } from "../test-support/events.js";
import { frontierReferences } from "./frontier.js";
const fixtures: unknown = JSON.parse(readFileSync(new URL("../test-support/frontier-reference.json", import.meta.url), "utf8"));
function fixture(name: string): unknown[] {
  if (typeof fixtures !== "object" || fixtures === null || !(name in fixtures)) throw new Error("missing fixture");
  const value: unknown = Reflect.get(fixtures, name);
  if (typeof value !== "object" || value === null || !("events" in value) || !Array.isArray(value.events)) throw new Error("missing events");
  return value.events as unknown[];
}
describe("recorded reference ingestion", () => {
  it("carries native pause-adjusted human and actual dea1 splits through snapshot validation to graph selection", async () => {
    const root = mkdtempSync(join(tmpdir(), "frontier-native-"));
    const hashes = new Map<string, string>();
    for (const name of ["human", "agent"]) {
      const events = fixture(name).map(e => parseEvent(JSON.stringify(e))), first = events[0];
      if (first?.type !== "run_start") throw new Error("fixture start");
      const directory = join(root, ...(name === "human" ? ["human"] : []), first.run);
      mkdirSync(directory, { recursive: true });
      const bytes = events.map(e => JSON.stringify(e)).join("\n") + "\n";
      hashes.set(first.run, createHash("sha256").update(bytes).digest("hex"));
      writeFileSync(join(directory, "events.jsonl"), bytes);
    }
    const data = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.parse("2026-10-14T13:00:00Z")));
    const refs = frontierReferences(data.runs);
    expect(refs.human?.splits.find(s => s.name === "RIVAL_MET")?.elapsedMs).toBe(317885);
    expect(refs.human?.measurement?.pausedMs).toBe(53869);
    expect(refs.human?.measurement?.rawSplits.find(s => s.name === "RIVAL_MET")).toMatchObject({ elapsedMs: 371754 });
    expect(refs.human?.measurement?.logSha256).toBe(hashes.get(refs.human?.id ?? ""));
    expect(refs.human?.splits.find(s => s.name === "STONE_BADGE")?.elapsedMs).toBe(6645610);
    expect(refs.best?.id).toBe("2026-10-14T00-25-06_think-fast_dea1");
    expect(refs.best?.splits.find(s => s.name === "RIVAL_MET")?.elapsedMs).toBe(1477567);
    expect(refs.best?.config?.preset).toBe("navigation-full-astar");
    expect(refs.best?.config?.source).toBe("256bf2347bd75d8db1645bda5e9f0149f640e1cc");
    expect(refs.best?.measurement?.features).toContain("story-milestones-v2");
    expect(refs.best?.measurement?.rawSplits.find(s => s.name === "RIVAL_MET")?.evidence.length).toBe(1);
    expect(() => parseWorkbench({ ...data, runs: data.runs.map(r => ({ ...r, measurement: { ...r.measurement, logSha256: "bad" } })) })).toThrow();
  });
});
it("accepts the common baseline's typed raw RAM references in new recordings without inventing historical archives", async () => {
  const root = mkdtempSync(join(tmpdir(), "frontier-raw-schema-")), id = "raw_schema_compatibility";
  const log = fullRun();
  const events = log.events.map(event => ({ ...event, run: id,
    ...(event.type === "run_start" ? { harness_features: [...event.harness_features, "full-raw-ram-v1"] } : {}),
    ...(event.type === "state" && "started" in event ? { raw_ram: { v: 1, sequence: 0, frame: 100, path: "raw-ram/00000000.json.gz", sha256: "a".repeat(64) } } : {}),
  }));
  mkdirSync(join(root, id)); const bytes = events.map(event => JSON.stringify(event)).join("\n") + "\n"; writeFileSync(join(root, id, "events.jsonl"), bytes);
  const data = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now()));
  expect(data.runs).toHaveLength(1); expect(data.runs[0]).toMatchObject({ id, status: "ended", problem: null });
  expect(data.runs[0]?.measurement?.features).toContain("full-raw-ram-v1");
  expect(data.runs[0]?.measurement?.logSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
});
