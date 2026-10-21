import { appendFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProbeError, listProbes, readProbe } from "./probes.js";

const RUN = "2026-10-18T03-30-52_qwen36-gpu1_d3fc";

function root(): string {
  const runs = join(mkdtempSync(join(tmpdir(), "probes-")), "runs");
  mkdirSync(join(runs, "probes"), { recursive: true });
  return runs;
}

// A source run whose turn 206 starts at seq 20 and calls navigate_to; frames before and after that turn.
function sourceRun(runs: string, id = RUN): void {
  const dir = join(runs, id);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const lines = [
    { v: 1, run: id, seq: 1, t: "2026-10-18T03:31:03.000-04:00", type: "turn_start", turn: 205, context: { messages: 1, images: 0, est_tokens: 10 } },
    { v: 1, run: id, seq: 2, t: "2026-10-18T03:31:04.000-04:00", type: "tool_call", turn: 205, id: "a", name: "press_buttons", args: { buttons: ["A"] } },
    { v: 1, run: id, seq: 20, t: "2026-10-18T03:48:16.516-04:00", type: "turn_start", turn: 206, context: { messages: 32, images: 4, est_tokens: 10916 } },
    { v: 1, run: id, seq: 21, t: "2026-10-18T03:48:22.303-04:00", type: "tool_call", turn: 206, id: "b", name: "navigate_to", args: { x: 10, y: 19, map_id: [0, 16], because: "find MAY" } },
    { v: 1, run: id, seq: 30, t: "2026-10-18T03:48:30.000-04:00", type: "turn_start", turn: 207, context: { messages: 33, images: 4, est_tokens: 11000 } },
  ];
  writeFileSync(join(dir, "events.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  for (const name of ["000012_0.png", "000019_0.png", "000025_0.png"]) writeFileSync(join(dir, "frames", name), "png");
}

interface ProbeFiles { manifest?: unknown; lanes?: Record<string, { samples?: string; status?: unknown; provenance?: unknown }> }
const MANIFEST = {
  id: "cited-destination-ablation-20261020", tier: "diagnostic", changedFeature: "cited-destination-v1", maxWallMsPerLane: 3_600_000,
  cases: [
    { id: "case-07", run: RUN, turn: 206, split: "heldout", category: "first milestone drought" },
    { id: "case-01", run: RUN, turn: 205, split: "development", category: "repeated house search" },
  ],
};
function sample(lane: string, c: string, arm: string, i: number, key: string): string {
  return JSON.stringify({ case: c, run: RUN, turn: 206, split: "heldout", arm, sample: i, at: `2026-10-20T23:2${String(i)}:00.000Z`, elapsedMs: 3000 + i, decision: { key, thinking: `think ${lane} ${String(i)}` }, response: { ignored: true } });
}
function probeDir(runs: string, rel: string, files: ProbeFiles): string {
  const dir = join(runs, rel);
  mkdirSync(dir, { recursive: true });
  if (files.manifest !== undefined) writeFileSync(join(dir, "manifest.json"), typeof files.manifest === "string" ? files.manifest : JSON.stringify(files.manifest));
  for (const [lane, f] of Object.entries(files.lanes ?? {})) {
    mkdirSync(join(dir, lane), { recursive: true });
    if (f.samples !== undefined) writeFileSync(join(dir, lane, "samples.jsonl"), f.samples);
    if (f.status !== undefined) writeFileSync(join(dir, lane, "status.json"), JSON.stringify(f.status));
    if (f.provenance !== undefined) writeFileSync(join(dir, lane, "provenance.json"), JSON.stringify(f.provenance));
  }
  return dir;
}
function pointer(runs: string, id: string, body: unknown): void {
  writeFileSync(join(runs, "probes", `${id}.json`), typeof body === "string" ? body : JSON.stringify(body));
}
const GPU0 = {
  samples: `${[sample("gpu0", "case-07", "on", 0, 'navigate_to {"map_id":[0,16],"x":10,"y":19,"because":"again"}'), sample("gpu0", "case-07", "off", 0, 'press_buttons {"buttons":["UP","A"]}')].join("\n")}\n`,
  status: { experiment: "x", lane: "gpu0", pid: 1, fake: false, started: "2026-10-20T23:21:25.439Z", completed: 64, planned: 64, state: "complete", ended: "2026-10-20T23:25:46.292Z" },
  provenance: { source: "fce23d4", model: { id: "/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf" } },
};
const MAC = {
  samples: `${sample("mac", "case-07", "on", 0, "(text only)")}\nnot json\n${JSON.stringify({ case: "case-07" })}\n`,
  status: { lane: "mac", started: "2026-10-20T23:20:15.074Z", completed: 3, planned: 64, state: "running", case: "case-07", split: "heldout", lastResponseAt: "2026-10-20T23:32:11.858Z" },
  provenance: { model: { id: "Qwen3.8-Flash-Next-UD-IQ4_XS" } },
};

describe("the probe list", () => {
  it("lists pointer and folder probes, newest first, with each lane's progress", () => {
    const runs = root();
    probeDir(runs, "launch-receipts/cited", { manifest: MANIFEST, lanes: { gpu0: GPU0, mac: MAC } });
    pointer(runs, "cited-destination-v1", { version: 1, dir: "launch-receipts/cited", title: "Does requiring a destination citation help or hurt loop recovery?" });
    probeDir(runs, "probes/older", { manifest: { ...MANIFEST, id: "older" }, lanes: { gpu0: { ...GPU0, status: { ...GPU0.status, started: "2026-10-19T10:00:00.000Z" } } } });
    expect(listProbes(runs)).toEqual([
      {
        id: "cited-destination-v1", title: "Does requiring a destination citation help or hurt loop recovery?", feature: "cited-destination-v1", started: "2026-10-20T23:20:15.074Z", live: true,
        lanes: [{ id: "gpu0", state: "complete", completed: 64, planned: 64 }, { id: "mac", state: "running", completed: 3, planned: 64 }],
      },
      { id: "older", title: "cited-destination-v1", feature: "cited-destination-v1", started: "2026-10-19T10:00:00.000Z", live: false, lanes: [{ id: "gpu0", state: "complete", completed: 64, planned: 64 }] },
    ]);
  });

  it("skips entries it cannot trust instead of failing the list", () => {
    const runs = root();
    probeDir(runs, "launch-receipts/ok", { manifest: MANIFEST, lanes: { gpu0: GPU0 } });
    pointer(runs, "ok", { version: 1, dir: "launch-receipts/ok" });
    pointer(runs, "escape", { version: 1, dir: "../outside" });
    pointer(runs, "absolute", { version: 1, dir: "/etc" });
    pointer(runs, "bad-json", "{nope");
    pointer(runs, "no-version", { dir: "launch-receipts/ok" });
    pointer(runs, "missing", { version: 1, dir: "launch-receipts/missing" });
    probeDir(runs, "probes/no-manifest", {});
    probeDir(runs, "probes/bad-manifest", { manifest: { id: "x", cases: [{ id: "c", run: RUN, turn: 1, split: "sideways" }] } });
    mkdirSync(join(runs, "elsewhere"), { recursive: true });
    probeDir(runs, "elsewhere/real", { manifest: MANIFEST, lanes: { gpu0: GPU0 } });
    symlinkSync(join(runs, "elsewhere", "real"), join(runs, "probes", "linked"));
    pointer(runs, "Bad Id", { version: 1, dir: "launch-receipts/ok" });
    const outside = mkdtempSync(join(tmpdir(), "probes-outside-"));
    probeDir(outside, "p", { manifest: MANIFEST, lanes: { gpu0: GPU0 } });
    symlinkSync(join(outside, "p"), join(runs, "escape-link"));
    pointer(runs, "through-link", { version: 1, dir: "escape-link" });
    expect(listProbes(runs).map((p) => p.id)).toEqual(["ok"]);
  });

  it("is empty without a probes folder", () => {
    expect(listProbes(join(mkdtempSync(join(tmpdir(), "probes-")), "runs"))).toEqual([]);
  });
});

describe("one probe", () => {
  it("reads cases with their recorded call and frame, lanes with model and ceiling, and every valid sample", async () => {
    const runs = root();
    sourceRun(runs);
    probeDir(runs, "launch-receipts/cited", { manifest: MANIFEST, lanes: { gpu0: GPU0, mac: MAC, empty: {} } });
    pointer(runs, "cited-destination-v1", { version: 1, dir: "launch-receipts/cited", title: "Q?" });
    const probe = await readProbe(runs, "cited-destination-v1");
    expect(probe.id).toBe("cited-destination-v1");
    expect(probe.title).toBe("Q?");
    expect(probe.feature).toBe("cited-destination-v1");
    expect(probe.tier).toBe("diagnostic");
    expect(probe.arms).toEqual(["on", "off"]);
    expect(probe.cases).toEqual([
      { id: "case-07", run: RUN, turn: 206, split: "heldout", title: "first milestone drought", at: "2026-10-18T03:48:16.516-04:00",
        recorded: { tool: "navigate_to", args: { x: 10, y: 19, map_id: [0, 16], because: "find MAY" } }, frame: "000019_0.png" },
      { id: "case-01", run: RUN, turn: 205, split: "development", title: "repeated house search", at: "2026-10-18T03:31:03.000-04:00",
        recorded: { tool: "press_buttons", args: { buttons: ["A"] } }, frame: null },
    ]);
    expect(probe.lanes).toEqual([
      { id: "empty", model: null, state: "unknown", completed: 0, planned: 0, started: null, ended: null, current: null, ceilingMs: 3_600_000 },
      { id: "gpu0", model: "Qwen3.6-35B-A3B-UD-Q4_K_M", state: "complete", completed: 64, planned: 64, started: "2026-10-20T23:21:25.439Z", ended: "2026-10-20T23:25:46.292Z", current: null, ceilingMs: 3_600_000 },
      { id: "mac", model: "Qwen3.8-Flash-Next-UD-IQ4_XS", state: "running", completed: 3, planned: 64, started: "2026-10-20T23:20:15.074Z", ended: null, current: "case-07", ceilingMs: 3_600_000 },
    ]);
    expect(probe.samples).toEqual([
      { lane: "gpu0", case: "case-07", arm: "on", sample: 0, at: "2026-10-20T23:20:00.000Z", elapsedMs: 3000, key: 'navigate_to {"map_id":[0,16],"x":10,"y":19,"because":"again"}', thinking: "think gpu0 0" },
      { lane: "gpu0", case: "case-07", arm: "off", sample: 0, at: "2026-10-20T23:20:00.000Z", elapsedMs: 3000, key: 'press_buttons {"buttons":["UP","A"]}', thinking: "think gpu0 0" },
      { lane: "mac", case: "case-07", arm: "on", sample: 0, at: "2026-10-20T23:20:00.000Z", elapsedMs: 3000, key: "(text only)", thinking: "think mac 0" },
    ]);
    expect(probe.problems).toEqual(["mac/samples.jsonl line 2 is not JSON", "mac/samples.jsonl line 3 is not a sample"]);
  });

  it("names a case whose source run is missing or unsafe as a problem and keeps the rest", async () => {
    const runs = root();
    const manifest = { ...MANIFEST, cases: [{ id: "gone", run: "2026-10-01T00-00-00_gone_0000", turn: 1, split: "heldout" }, { id: "evil", run: "../evil", turn: 1, split: "heldout" }] };
    probeDir(runs, "probes/p", { manifest, lanes: { gpu0: GPU0 } });
    const probe = await readProbe(runs, "p");
    expect(probe.cases.map((c) => [c.id, c.recorded, c.frame, c.title])).toEqual([["gone", null, null, "gone"], ["evil", null, null, "evil"]]);
    expect(probe.problems).toEqual(["case gone: source run 2026-10-01T00-00-00_gone_0000 has no events.jsonl", "case evil: not a run id: \"../evil\""]);
  });

  it("refuses ids that are not one plain segment, and probes that do not exist", async () => {
    const runs = root();
    for (const id of ["..", "../x", "a/b", "", "x y"]) await expect(readProbe(runs, id)).rejects.toThrow(ProbeError);
    await expect(readProbe(runs, "nope")).rejects.toThrow(/no probe nope/);
  });

  it("finds the recorded call again from cache after the log is read once", async () => {
    const runs = root();
    sourceRun(runs);
    probeDir(runs, "probes/p", { manifest: MANIFEST, lanes: { gpu0: GPU0 } });
    const first = await readProbe(runs, "p");
    const second = await readProbe(runs, "p");
    expect(second.cases).toEqual(first.cases);
    appendFileSync(join(runs, RUN, "events.jsonl"), `${JSON.stringify({ v: 1, run: RUN, seq: 31, t: "2026-10-18T03:48:31.000-04:00", type: "tool_call", turn: 207, id: "c", name: "observe", args: {} })}\n`);
    expect((await readProbe(runs, "p")).cases).toEqual(first.cases);
  });
});
