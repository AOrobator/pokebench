import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixedLaunchSpec, main, productionFixedHost, servingReceipt, type FixedCliDeps } from "./fixed-cli.js";
import { parseFixedDefinition } from "./fixed-design.js";
import type { FixedRunOptions } from "./fixed-runner.js";
import { CONTROL_BASE_PATH, controlBaseText, draftDefinition, definition, MODEL_PATH, ROM_SHA1, START_SHA1, MENU_SHA1, MENU_START } from "../test-support/fixed.js";
import { Log, START } from "../test-support/events.js";

function setup(over: Partial<FixedCliDeps> = {}) {
  const root = mkdtempSync(join(tmpdir(), "fixed-cli-"));
  const runsRoot = join(root, "runs");
  mkdirSync(join(root, "experiments", "fixed"), { recursive: true });
  const out: string[] = [];
  const err: string[] = [];
  const runs: FixedRunOptions[] = [];
  const deps: FixedCliDeps = {
    root, runsRoot,
    out: (line) => { out.push(line); },
    err: (line) => { err.push(line); },
    randomSeed: () => "feedfacefeedface",
    interactive: false,
    prompt: () => Promise.resolve(""),
    now: () => new Date("2026-10-16T01:00:00.000Z"),
    user: "operator",
    head: () => "0123456789abcdef0123456789abcdef01234567",
    sha1File: (path) => (path === "/roms/pokemon-emerald.gba" ? ROM_SHA1 : path.endsWith("MAIN_MENU.state") ? MENU_SHA1 : START_SHA1),
    rom: "/roms/pokemon-emerald.gba",
    run: (options) => { runs.push(options); return Promise.resolve("finished"); },
    host: () => ({}) as never,
    ...over,
  };
  const path = join(root, "experiments", "fixed", "bundle-v-control.json");
  mkdirSync(join(root, CONTROL_BASE_PATH, ".."), { recursive: true });
  writeFileSync(join(root, CONTROL_BASE_PATH), controlBaseText());
  return { root, runsRoot, deps, out, err, runs, path };
}

describe("fixed-run plan", () => {
  it("freezes a seeded plan into the definition, drawing a seed only when none is recorded", async () => {
    const { deps, out, path } = setup();
    const draft: Partial<ReturnType<typeof draftDefinition>> = draftDefinition();
    delete draft.seed;
    writeFileSync(path, JSON.stringify(draft));
    expect(await main(["plan", "bundle-v-control"], deps)).toBe(0);
    const planned = parseFixedDefinition(readFileSync(path, "utf8")).definition;
    expect(planned.seed).toBe("feedfacefeedface");
    expect(planned.plan).toHaveLength(12);
    expect(out.join("\n")).toContain("planned 12 trials with seed feedfacefeedface");
    expect(await main(["plan", "bundle-v-control", "--seed", "0123456789abcdef"], deps)).toBe(0);
    expect(parseFixedDefinition(readFileSync(path, "utf8")).definition.seed).toBe("0123456789abcdef");
  });

  it("refuses to re-plan once a trial has launched, and rejects a bad seed or draft", async () => {
    const { deps, err, path, runsRoot } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    mkdirSync(join(runsRoot, "experiments", "bundle-v-control"), { recursive: true });
    writeFileSync(join(runsRoot, "experiments", "bundle-v-control", "trials.jsonl"), JSON.stringify({ kind: "launch", slot: 1, lane: "A", phase: "confirmatory", arm: "bundle", run: "r", at: "x", commit: "c", sources: "s", presetSha256: "p", serving: "f" }) + "\n");
    expect(await main(["plan", "bundle-v-control"], deps)).toBe(1);
    expect(err.join("\n")).toContain("the plan is frozen: 1 trial has launched");
    const fresh = setup();
    writeFileSync(fresh.path, JSON.stringify(draftDefinition()));
    expect(await main(["plan", "bundle-v-control", "--seed", "xyz"], fresh.deps)).toBe(1);
    writeFileSync(fresh.path, JSON.stringify({ id: "bundle-v-control" }));
    expect(await main(["plan", "bundle-v-control"], fresh.deps)).toBe(1);
    expect(fresh.err.join("\n")).toMatch(/not a fixed-run draft/);
  });
});

describe("fixed-run check, approve, run, dry-run", () => {
  it("checks the definition and its start save, then needs an interactive approval of this exact definition to run", async () => {
    const { deps, out, err, runs, path, runsRoot } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["check", "bundle-v-control"], deps)).toBe(0);
    expect(out.join("\n")).toMatch(/confirmatory: 4 control \+ 4 bundle, 900000 ms cap/);
    expect(out.join("\n")).toContain("approval: none");
    expect(out.join("\n")).toMatch(/control base: full-map-navigation-finals-incumbent \(runs\/experiments\/full-map-navigation\/presets\/finals-incumbent\.json, sha256 [0-9a-f]{64}\) matches outside the switches/);
    expect(await main(["run", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toBe("bundle-v-control is not approved; run `just fixed-run approve bundle-v-control` in a terminal");
    expect(await main(["approve", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toBe("approval needs an interactive terminal");
    const typed = { ...deps, interactive: true, prompt: () => Promise.resolve("bundle-v-control") };
    expect(await main(["approve", "bundle-v-control"], typed)).toBe(0);
    const approval = JSON.parse(readFileSync(join(runsRoot, "experiments", "bundle-v-control", "approval.json"), "utf8")) as Record<string, string>;
    expect(approval).toMatchObject({ experiment: "bundle-v-control", approvedBy: "operator", approvedAt: "2026-10-16T01:00:00.000Z", commit: "0123456789abcdef0123456789abcdef01234567" });
    expect(await main(["approve", "bundle-v-control"], { ...deps, interactive: true, prompt: () => Promise.resolve("no") })).toBe(1);
    expect(await main(["run", "bundle-v-control"], deps)).toBe(0);
    expect(runs[0]).toMatchObject({ definitionSha256: approval["definitionSha256"], dryRun: false });
    writeFileSync(path, JSON.stringify({ ...definition(), title: "edited" }));
    expect(await main(["run", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toBe("the definition changed since it was approved; approve it again");
  });

  it("checks every phase's start save and lists each phase's start", async () => {
    const { deps, out, err, path } = setup({ sha1File: (p) => (p === "/roms/pokemon-emerald.gba" ? ROM_SHA1 : p.endsWith("MAIN_MENU.state") ? "e".repeat(40) : START_SHA1) });
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["check", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toBe(`start save runs/launch-receipts/fast-text/MAIN_MENU.state has sha1 ${"e".repeat(40)}, the definition records ${MENU_SHA1}`);
    const ok = setup();
    writeFileSync(ok.path, JSON.stringify(definition()));
    expect(await main(["check", "bundle-v-control"], ok.deps)).toBe(0);
    expect(ok.out.join("\n")).toContain(`confirmatory: 4 control + 4 bundle, 900000 ms cap, primary, start runs/launch-receipts/fast-text/CLOCK_SET.state (sha1 ${START_SHA1.slice(0, 12)})`);
    expect(ok.out.join("\n")).toContain(`cook: 2 control + 2 bundle, 3600000 ms cap, exploratory, start runs/launch-receipts/fast-text/MAIN_MENU.state (sha1 ${MENU_SHA1.slice(0, 12)})`);
  });

  it("refuses a start save whose bytes differ from the recorded sha1", async () => {
    const { deps, err, path } = setup({ sha1File: () => "f".repeat(40) });
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["check", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toMatch(/start save .* has sha1 f{40}, the definition records 51007c05/);
    expect(await main(["dry-run", "bundle-v-control"], deps)).toBe(1);
  });

  it("refuses to load when the control base preset is missing or has drifted", async () => {
    const { deps, err, path, root } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    writeFileSync(join(root, CONTROL_BASE_PATH), controlBaseText(undefined, { note: "edited" }));
    expect(await main(["check", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toMatch(/control base runs\/experiments\/full-map-navigation\/presets\/finals-incumbent\.json has sha256 [0-9a-f]{64}, the definition records/);
    expect(await main(["run", "bundle-v-control"], deps)).toBe(1);
    rmSync(join(root, CONTROL_BASE_PATH));
    expect(await main(["check", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toBe(`control base ${CONTROL_BASE_PATH} is missing`);
  });

  it("refuses to run or dry-run without a readable POKEBENCH_ROM, before any trial launches", async () => {
    for (const command of [["run", "bundle-v-control"], ["dry-run", "bundle-v-control"]]) {
      const unset = setup({ rom: undefined });
      writeFileSync(unset.path, JSON.stringify(definition()));
      expect(await main(command, unset.deps)).toBe(1);
      expect(unset.runs).toEqual([]);
      expect(unset.err.join("\n")).toContain("POKEBENCH_ROM is not set");
      const missing = setup({ sha1File: (path) => (path === "/roms/pokemon-emerald.gba" ? null : START_SHA1) });
      writeFileSync(missing.path, JSON.stringify(definition()));
      expect(await main(command, missing.deps)).toBe(1);
      expect(missing.runs).toEqual([]);
      expect(missing.err.join("\n")).toContain("cannot read POKEBENCH_ROM /roms/pokemon-emerald.gba");
    }
  });
  it("refuses to run or dry-run with a ROM whose bytes differ from the definition's", async () => {
    for (const command of [["run", "bundle-v-control"], ["dry-run", "bundle-v-control"]]) {
      const other = setup({ sha1File: (path) => (path === "/roms/pokemon-emerald.gba" ? "0".repeat(40) : START_SHA1) });
      writeFileSync(other.path, JSON.stringify(definition()));
      expect(await main(command, other.deps)).toBe(1);
      expect(other.runs).toEqual([]);
      expect(other.err.join("\n")).toContain(`POKEBENCH_ROM /roms/pokemon-emerald.gba has sha1 ${"0".repeat(40)}, the definition records ${ROM_SHA1}`);
    }
  });

  it("dry-runs a chosen phase with that phase's start", async () => {
    const { deps, runs, path } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["dry-run", "bundle-v-control", "--phase", "cook", "--wall-ms", "720000"], deps)).toBe(0);
    expect(runs[0]?.def).toMatchObject({ id: "bundle-v-control-dryrun-cook", phases: [{ id: "dry-run", maxWallMs: 720_000, start: MENU_START }] });
    expect(await main(["dry-run", "bundle-v-control", "--phase", "nope"], deps)).toBe(1);
  });

  it("dry-runs one trial per arm per lane under its own id, with no approval", async () => {
    const { deps, runs, path } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["dry-run", "bundle-v-control", "--wall-ms", "120000"], deps)).toBe(0);
    expect(runs[0]?.def.id).toBe("bundle-v-control-dryrun-confirmatory");
    expect(runs[0]?.def.phases[0]?.maxWallMs).toBe(120_000);
    expect(runs[0]?.dryRun).toBe(true);
    expect(await main(["dry-run", "bundle-v-control", "--wall-ms", "x"], deps)).toBe(1);
  });

  it("prints usage for an unknown command or a missing definition", async () => {
    const { deps, err } = setup();
    expect(await main(["launch"], deps)).toBe(2);
    expect(err.join("\n")).toContain("usage: fixed-run");
    expect(await main(["check", "nope"], deps)).toBe(1);
    expect(err.at(-1)).toMatch(/no definition .*nope\.json/);
  });
});

describe("fixed-run status and analyze", () => {
  it("prints the status file, or says there is none", async () => {
    const { deps, out, err, path, runsRoot } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["status", "bundle-v-control"], deps)).toBe(1);
    expect(err.at(-1)).toBe("bundle-v-control has no status yet");
    mkdirSync(join(runsRoot, "experiments", "bundle-v-control"), { recursive: true });
    writeFileSync(join(runsRoot, "experiments", "bundle-v-control", "status.json"), JSON.stringify({ kind: "fixed-run", version: 1, experiment: "bundle-v-control", title: "B", definitionSha256: "d".repeat(64), pid: 1, updatedAt: "x", state: "running", total: 12, valid: 3, invalid: 1, invalidTrials: [], reserve: { usedMs: 0, totalMs: 1 }, lanes: [{ id: "A", gpu: "GPU1", port: 8071, state: "paused", reason: "why", slot: null, arm: null, phase: null, run: null, since: "x", retryAt: "y", lastError: "e", valid: 1, total: 6 }], lastError: "e" }));
    expect(await main(["status", "bundle-v-control"], deps)).toBe(0);
    expect(out.join("\n")).toContain("bundle-v-control running: 3 / 12 done, 1 invalid");
    expect(out.join("\n")).toContain("lane A (GPU1, :8071) paused: why; retry y");
  });

  it("analyzes the ledger's primary phase, or a named phase", async () => {
    const { deps, out, path, runsRoot } = setup();
    const def = definition();
    writeFileSync(path, JSON.stringify(def));
    mkdirSync(join(runsRoot, "experiments", "bundle-v-control"), { recursive: true });
    const s = def.plan[0];
    if (s === undefined) throw new Error("fixture");
    writeFileSync(join(runsRoot, "experiments", "bundle-v-control", "trials.jsonl"), [
      { kind: "launch", slot: s.slot, lane: s.lane, phase: s.phase, arm: s.arm, run: "r1", at: "x", commit: "c", sources: "s", presetSha256: "p", serving: "f" },
      { kind: "outcome", slot: s.slot, run: "r1", at: "x", valid: true, reason: "wall cap", endReason: "budget", primaryReached: true, primaryMs: 5, furthest: "RIVAL_MET", furthestDepth: 9, furthestMs: 5, wallMs: 900_000, turns: 3 },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n");
    expect(await main(["analyze", "bundle-v-control"], deps)).toBe(0);
    expect(out.join("\n")).toContain("# bundle-v-control confirmatory");
    expect(await main(["analyze", "bundle-v-control", "--phase", "cook"], deps)).toBe(0);
    expect(out.join("\n")).toContain("# bundle-v-control cook (exploratory)");
    expect(await main(["analyze", "bundle-v-control", "--phase", "nope"], deps)).toBe(1);
  });

  it("analyzes a cohort receipt's two named arms from their run events", async () => {
    const { deps, out, runsRoot, root } = setup();
    const receipt = join(root, "receipt");
    mkdirSync(receipt, { recursive: true });
    const rows: unknown[] = [];
    for (const [i, arm, reached] of [[1, "control", false], [2, "both", true], [3, "whole", true], [4, "both", false]] as const) {
      const run = `2026-10-14T18-0${String(i)}-00_think-fast_000${String(i)}`;
      rows.push({ type: "launch", trial: String(i), arm }, { type: "outcome", trial: String(i), arm, run, exit: 0 });
      const log = new Log();
      log.add(0, { ...START, model: { ...START.model, id: "think-fast" } });
      if (reached) log.add(60_000, { type: "milestone", turn: 3, name: "RIVAL_MET", server_timestamp: 1 });
      log.add(1_800_000, { type: "run_end", turn: 9, reason: "budget", furthest_milestone: null, turns: 9, wall_ms: 1_800_000, tokens: { input: 1, output: 1 }, frames: { saved: 0, bytes: 0 } });
      mkdirSync(join(runsRoot, run), { recursive: true });
      writeFileSync(join(runsRoot, run, "events.jsonl"), log.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    }
    rows.push({ type: "outcome", trial: "5", arm: "control", run: "2026-10-14T18-09-00_think-fast_gone", exit: 1 });
    writeFileSync(join(receipt, "trials.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    expect(await main(["analyze-receipt", receipt, "control", "both", "--cap-ms", "1800000"], deps)).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("| pooled | 1/2 (50%) | 0/1 (0%) |");
    expect(text).toContain("| 5 | A | control | 2026-10-14T18-09-00_think-fast_gone | no run_start");
    expect(await main(["analyze-receipt", receipt, "control"], deps)).toBe(2);
  });
});

describe("production host pieces", () => {
  it("reads a llama-server's identity from /props, /v1/models and /health", async () => {
    const props = { model_path: MODEL_PATH, build_info: "b10236-1464c62d8", total_slots: 1, modalities: { vision: true }, default_generation_settings: { n_ctx: 65536 }, chat_template: "T" };
    const models = { models: [{ model: MODEL_PATH, capabilities: ["completion", "multimodal"] }], data: [{ id: MODEL_PATH, meta: { n_ctx: 65536 } }] };
    const fetchFn = vi.fn<typeof fetch>((url) => {
      const u = url as string;
      if (u.endsWith("/health")) return Promise.resolve(new Response(JSON.stringify({ status: "ok" })));
      return Promise.resolve(new Response(JSON.stringify(u.endsWith("/props") ? props : models)));
    });
    const receipt = await servingReceipt("http://127.0.0.1:8091", fetchFn);
    expect(receipt).toMatchObject({ model: MODEL_PATH, build: "b10236-1464c62d8", contextTokens: 65536, slots: 1, vision: true });
    expect(receipt.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((await servingReceipt("http://127.0.0.1:8098", fetchFn)).fingerprint).toBe(receipt.fingerprint);
    await expect(servingReceipt("http://x", vi.fn<typeof fetch>().mockResolvedValue(new Response("loading", { status: 503 })))).rejects.toThrow("http://x/health answered HTTP 503");
    await expect(servingReceipt("http://x", vi.fn<typeof fetch>().mockResolvedValue(new Response("{}")))).rejects.toThrow("http://x/props is not a llama-server /props payload");
  });

  it("launches each trial from the pinned experiment checkout, writing to the main runs root", () => {
    const commit = "f3f4b3b7".padEnd(40, "0");
    const spec = fixedLaunchSpec({ root: "/repo", runsRoot: "/repo/runs", node: "/bin/node", env: { PATH: "/bin", POKEBENCH_ROM: "/rom.gba", POKEBENCH_RUNS_ROOT: "/elsewhere", POKEBENCH_RUN_ID: "stale" } }, commit, { POKEBENCH_RUN_ID: "r1" });
    expect(spec.argv).toEqual([`/private/tmp/pokebench-fixed-${commit.slice(0, 12)}/packages/agent/dist/live.js`, "play"]);
    expect(spec.command).toBe("/bin/node");
    // Relative preset paths (the start save) resolve against the main checkout.
    expect(spec.cwd).toBe("/repo");
    expect(spec.env).toEqual({ PATH: "/bin", POKEBENCH_ROM: "/rom.gba", POKEBENCH_RUNS_ROOT: "/repo/runs", POKEBENCH_RUN_ID: "r1" });
  });

  it("knows a bound port, a live pid, and writes no file of its own", async () => {
    const host = productionFixedHost({ root: "/nowhere", runsRoot: "/nowhere/runs", git: () => "", fetchFn: fetch, node: process.execPath, env: {}, log: () => undefined });
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    expect(await host.portInUse(port)).toBe(true);
    await new Promise<void>((r) => server.close(() => { r(); }));
    expect(await host.portInUse(port)).toBe(false);
    expect(host.alive(process.pid)).toBe(true);
    expect(host.runId({ id: "A", gpu: "GPU1", gamePort: 8071, modelUrl: "http://127.0.0.1:8091" })).toMatch(/_qwen36-gpu1_[0-9a-z]+$/);
    expect(existsSync("/nowhere")).toBe(false);
  });
});
