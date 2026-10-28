import {fileURLToPath} from "node:url";
import {readFixedDefinition} from "./fixed-definition.js";
import {recipeText} from "../test-support/recipe-text.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixedLaunchSpec, main, productionFixedHost, servingReceipt, type FixedCliDeps } from "./fixed-cli.js";
import { armFeatures, parseFixedDefinition, type FixedLane } from "./fixed-design.js";
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

  it("runs a checked definition with no approval file", async () => {
    const { deps, err, runs, path, runsRoot } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["run", "bundle-v-control"], deps), err.join("\n")).toBe(0);
    expect(existsSync(join(runsRoot, "experiments", "bundle-v-control", "approval.json"))).toBe(false);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ definitionSha256: parseFixedDefinition(JSON.stringify(definition())).sha256, dryRun: false });
  });

  it("lists a vLLM lane's declared slots, vision and key file path in check", async () => {
    const { deps, out, path } = setup();
    const [a, b] = definition().lanes;
    if (a === undefined || b === undefined) throw new Error("fixture lanes");
    writeFileSync(path, JSON.stringify(definition({ lanes: [{ ...a, server: "vllm", slots: 1, vision: true, apiKeyFile: "/keys/hyperqwen.key" }, b] })));
    expect(await main(["check", "bundle-v-control"], deps)).toBe(0);
    expect(out).toContain("lane A: GPU1, game port 8071, model http://127.0.0.1:8091 (vllm, 1 slots, vision true), key file /keys/hyperqwen.key");
    expect(out).toContain("lane B: GPU0, game port 8072, model http://127.0.0.1:8098");
  });

  it("checks every phase's start save and lists each phase's start", async () => {
    const { deps, err, path } = setup({ sha1File: (p) => (p === "/roms/pokemon-emerald.gba" ? ROM_SHA1 : p.endsWith("MAIN_MENU.state") ? "e".repeat(40) : START_SHA1) });
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
      const other = setup({ sha1File: (path) => (path === "/roms/pokemon-emerald.gba" ? "0".repeat(40) : path.endsWith("MAIN_MENU.state") ? MENU_SHA1 : START_SHA1) });
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

  it("refuses a second dry run while the first ledger is in place and names the archive folder", async () => {
    const { deps, runs, err, path, runsRoot } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    mkdirSync(join(runsRoot, "experiments", "bundle-v-control-dryrun-cook"), { recursive: true });
    writeFileSync(join(runsRoot, "experiments", "bundle-v-control-dryrun-cook", "trials.jsonl"), "");
    expect(await main(["dry-run", "bundle-v-control", "--phase", "cook"], deps)).toBe(1);
    expect(runs).toEqual([]);
    expect(err.at(-1)).toBe("bundle-v-control-dryrun-cook already has a ledger; move runs/experiments/bundle-v-control-dryrun-cook to runs/dryruns/<name> first (the viewer still lists it there)");
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

  it("reruns one arm on one lane of an approved experiment as an exploratory sibling at the experiment's pinned commit", async () => {
    const { deps, out, err, runs, path, runsRoot } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["rerun", "bundle-v-control", "--arm", "bundle", "--lane", "B"], deps)).toBe(1);
    expect(err.at(-1)).toBe("bundle-v-control is not approved; run `just fixed-run approve bundle-v-control` in a terminal");
    expect(await main(["approve", "bundle-v-control"], { ...deps, interactive: true, prompt: () => Promise.resolve("bundle-v-control") })).toBe(0);
    expect(await main(["rerun", "bundle-v-control", "--arm", "bundle", "--lane", "B", "--phase", "cook"], deps)).toBe(0);
    expect(runs[0]).toMatchObject({ dryRun: true, commit: "0123456789abcdef0123456789abcdef01234567", def: { id: "bundle-v-control-solo-bundle-b-1", lanes: [{ id: "B" }], plan: [{ lane: "B", arm: "bundle", phase: "cook" }] } });
    expect(out).toContain("bundle-v-control-solo-bundle-b-1: exploratory bundle trial on lane B (GPU0), cook, commit 0123456789ab");
    // A second rerun takes the next number; the paired experiment's first launch pins the commit.
    mkdirSync(join(runsRoot, "experiments", "bundle-v-control-solo-bundle-b-1"), { recursive: true });
    writeFileSync(join(runsRoot, "experiments", "bundle-v-control", "trials.jsonl"), JSON.stringify({ kind: "launch", slot: 1, lane: "A", phase: "confirmatory", arm: "bundle", run: "r", at: "x", commit: "e".repeat(40), sources: "s", presetSha256: "p", serving: "f" }) + "\n");
    expect(await main(["rerun", "bundle-v-control", "--arm", "bundle", "--lane", "B"], deps)).toBe(0);
    expect(runs[1]).toMatchObject({ commit: "e".repeat(40), def: { id: "bundle-v-control-solo-bundle-b-2", phases: [{ id: "confirmatory", singleArm: "bundle" }] } });
  });

  it("refuses a rerun with a bad arm, lane or phase, a changed definition, or no ROM", async () => {
    const { deps, err, path, runs } = setup();
    writeFileSync(path, JSON.stringify(definition()));
    expect(await main(["approve", "bundle-v-control"], { ...deps, interactive: true, prompt: () => Promise.resolve("bundle-v-control") })).toBe(0);
    expect(await main(["rerun", "bundle-v-control", "--arm", "both", "--lane", "B"], deps)).toBe(1);
    expect(err.at(-1)).toBe("--arm must be one of control, bundle");
    expect(await main(["rerun", "bundle-v-control", "--arm", "bundle"], deps)).toBe(1);
    expect(err.at(-1)).toBe("--lane must be one of A, B");
    expect(await main(["rerun", "bundle-v-control", "--arm", "bundle", "--lane", "B", "--phase", "nope"], deps)).toBe(1);
    expect(err.at(-1)).toBe("no phase nope; phases: confirmatory, cook");
    expect(await main(["rerun", "bundle-v-control", "--arm", "bundle", "--lane", "B"], { ...deps, rom: undefined })).toBe(1);
    writeFileSync(path, JSON.stringify({ ...definition(), title: "edited" }));
    expect(await main(["rerun", "bundle-v-control", "--arm", "bundle", "--lane", "B"], deps)).toBe(1);
    expect(err.at(-1)).toBe("the definition changed since it was approved; approve it again");
    expect(runs).toHaveLength(0);
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

  it("renders the actual JIT definition as a descriptive frontier screen through the CLI",async()=>{
    const {deps,out,path,runsRoot}=setup();
    const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/jit-10m.json",import.meta.url),"utf8")).definition;
    expect(def).toMatchObject({primaryOutcome:"frontier",replacementReserveMs:0});
    writeFileSync(join(path,"..","jit-10m.json"),JSON.stringify(def));
    const dir=join(runsRoot,"experiments",def.id);mkdirSync(dir,{recursive:true});
    const entries=def.plan.slice(0,4).flatMap((slot,i)=>[
      {kind:"launch",slot:slot.slot,lane:slot.lane,phase:slot.phase,arm:slot.arm,run:`r${String(i)}`,at:"x",commit:"c",sources:"s",presetSha256:"p",serving:"f"},
      {kind:"outcome",slot:slot.slot,run:`r${String(i)}`,at:"x",valid:i!==2,reason:i===0?"ended stuck before the wall cap":i===1?"retained terminal error: model_error":i===2?"no run_start":"wall cap",endReason:i===0?"stuck":i===1?"model_error":i===2?null:"budget",primaryReached:false,primaryMs:null,furthest:"CLOCK_SET",furthestDepth:7,furthestMs:50000,wallMs:i===3?600000:50000,turns:3},
    ]);
    writeFileSync(join(dir,"trials.jsonl"),entries.map(e=>JSON.stringify(e)).join("\n")+"\n");
    expect(await main(["analyze",def.id],deps)).toBe(0);
    const text=out.join("\n");
    expect(text).toContain("Primary: furthest required-story milestone within the cap, ties by earlier arrival.");
    expect(text.indexOf("## Primary frontier")).toBeLessThan(text.indexOf("## Secondary: RIVAL_MET"));
    expect(text).toContain("P(bundle ranks above control), ties count half");
    expect(text).toContain("Descriptive screen; no confirmatory thresholds or promotion.");
    expect(text).toContain("stuck");expect(text).toContain("model_error");
    expect(text).toContain("Zero replacement reserve: a trial that never began is recorded and not automatically replaced.");
    expect(text).not.toContain("p <");expect(text).not.toContain("primary milestone");
    expect(text).not.toContain("only the wall cap");expect(text).not.toContain("kept in the record and replaced");
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
    mkdirSync(join(runsRoot, "exclusions"));
    writeFileSync(join(runsRoot, "exclusions", "r1.json"), JSON.stringify({ version: 1, run: "r1", reason: "wrong ROM", by: "The operator", at: "2026-10-27T20:00:00.000Z" }));
    out.length = 0;
    expect(await main(["analyze", "bundle-v-control"], deps)).toBe(0);
    expect(out.join("\n")).toContain("| r1 | wrong ROM |");
  });

  it("says which trials' depth it could not re-grade, and never reads a log outside runs/", async () => {
    const { deps, err, path, runsRoot } = setup();
    const def = definition();
    writeFileSync(path, JSON.stringify(def));
    mkdirSync(join(runsRoot, "experiments", "bundle-v-control"), { recursive: true });
    const s = def.plan[0];
    if (s === undefined) throw new Error("fixture");
    writeFileSync(join(runsRoot, "experiments", "bundle-v-control", "trials.jsonl"), [
      { kind: "launch", slot: s.slot, lane: s.lane, phase: s.phase, arm: s.arm, run: "../gone", at: "x", commit: "c", sources: "s", presetSha256: "p", serving: "f" },
      { kind: "outcome", slot: s.slot, run: "../gone", at: "x", valid: true, reason: "wall cap", endReason: "budget", primaryReached: true, primaryMs: 5, furthest: "FIRST_POKECENTER_HEAL", furthestDepth: 37, furthestMs: 5, wallMs: 900_000, turns: 3 },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n");
    // A complete log just outside runs/ must not be read through the ledger's run id.
    mkdirSync(join(runsRoot, "..", "gone"), { recursive: true });
    writeFileSync(join(runsRoot, "..", "gone", "events.jsonl"), [{ v: 1, run: "../gone", seq: 1, turn: 0, t: "2026-10-16T10:00:00.000-04:00", type: "run_start" }, { v: 1, run: "../gone", seq: 2, turn: 0, t: "2026-10-16T10:00:01.000-04:00", type: "run_end" }].map((e) => JSON.stringify(e)).join("\n") + "\n");
    expect(await main(["analyze", "bundle-v-control"], deps)).toBe(0);
    expect(err).toContain("depth not re-graded (no usable log, stored furthest is an optional activity): ../gone");
  });

  it("analyzes a cohort receipt's two named arms from their run events", async () => {
    const { deps, out, err, runsRoot, root } = setup();
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
    const aborted = "2026-10-14T18-06-00_think-fast_0006", abortLog = new Log();
    abortLog.add(0, { ...START, model: { ...START.model, id: "think-fast" } });
    abortLog.add(60_000, { type: "milestone", turn: 3, name: "RIVAL_MET", server_timestamp: 1 });
    abortLog.add(90_000, { type: "run_end", turn: 4, reason: "operator_abort", furthest_milestone: "RIVAL_MET", turns: 4, wall_ms: 90_000, tokens: { input: 1, output: 1 }, frames: { saved: 0, bytes: 0 } });
    mkdirSync(join(runsRoot, aborted)); writeFileSync(join(runsRoot, aborted, "events.jsonl"), abortLog.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    rows.push({ type: "outcome", trial: "6", arm: "both", run: aborted, exit: 0 });
    mkdirSync(join(runsRoot, "exclusions")); writeFileSync(join(runsRoot, "exclusions", "broken.json"), "{");
    writeFileSync(join(receipt, "trials.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    expect(await main(["analyze-receipt", receipt, "control", "both", "--cap-ms", "1800000"], deps)).toBe(0);
    const text = out.join("\n");
    // Every trial that ran counts, the aborted trial 6 included; the never-started trial 5 has no observation and is listed.
    expect(text).toContain("| pooled | 2/3 (67%) | 0/1 (0%) |");
    expect(text).toContain("| 5 | A | control | 2026-10-14T18-09-00_think-fast_gone | not reached | unavailable | no run_start");
    expect(text).toContain("| 6 | A | bundle | 2026-10-14T18-06-00_think-fast_0006 | ended by the operator (operator_abort); progress before it counts |");
    expect(err.join("\n")).toContain("broken.json");
    expect(await main(["analyze-receipt", receipt, "control"], deps)).toBe(2);
  });
});

const llamaLane = (modelUrl: string): FixedLane => ({ id: "A", gpu: "GPU0", gamePort: 8071, modelUrl });
const VLLM_KEY = "vllm-test-key-not-real";
function vllmLane(modelUrl = "http://127.0.0.1:18020", key: string | null = `${VLLM_KEY}\n`): FixedLane {
  const keyDir = mkdtempSync(join(tmpdir(), "vllm-key-"));
  const apiKeyFile = join(keyDir, "hyperqwen.key");
  if (key !== null) writeFileSync(apiKeyFile, key);
  return { id: "A", gpu: "GPU0", gamePort: 8071, modelUrl, server: "vllm", slots: 2, vision: true, apiKeyFile };
}
const VLLM_MODELS = { object: "list", data: [{ id: "qwen3.8-27b", object: "model", created: 1, owned_by: "vllm", root: "/data/models/Qwen3.8-27B", parent: null, max_model_len: 262144, permission: [] }] };
function vllmFetch(models: unknown = VLLM_MODELS, status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>((url) => {
    const u = url as string;
    if (u.endsWith("/health")) return Promise.resolve(new Response(""));
    if (u.endsWith("/version")) return Promise.resolve(new Response(JSON.stringify({ version: "0.31.0" })));
    return Promise.resolve(new Response(JSON.stringify(models), { status }));
  });
}

describe("vLLM serving receipt", () => {
  it("reads the served id, root and context from authenticated /v1/models, the version from /version, and slots and vision from the lane", async () => {
    const fetchFn = vllmFetch();
    const receipt = await servingReceipt(vllmLane(), fetchFn);
    expect(receipt).toMatchObject({ model: "qwen3.8-27b", build: "vllm-0.31.0 /data/models/Qwen3.8-27B", contextTokens: 262144, slots: 2, vision: true });
    expect(receipt.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:18020/v1/models", expect.objectContaining({ headers: { accept: "application/json", authorization: `Bearer ${VLLM_KEY}` } }));
    for (const [url, init] of fetchFn.mock.calls) if (!(url as string).endsWith("/v1/models")) expect(JSON.stringify(init ?? {})).not.toContain(VLLM_KEY);
    expect(JSON.stringify(receipt)).not.toContain(VLLM_KEY);
    expect((await servingReceipt({ ...vllmLane(), vision: false }, vllmFetch())).fingerprint).not.toBe(receipt.fingerprint);
  });

  it("refuses a vLLM lane that rejects the key, lists no single model, or has no readable key, never echoing the key", async () => {
    const lane = vllmLane();
    const refusals = [
      servingReceipt(lane, vllmFetch({ error: "Unauthorized" }, 401)),
      servingReceipt(lane, vllmFetch({ data: [] })),
      servingReceipt(lane, vllmFetch({ data: [VLLM_MODELS.data[0], { ...VLLM_MODELS.data[0], id: "other" }] })),
      servingReceipt(lane, vi.fn<typeof fetch>((url) => (url as string).endsWith("/v1/models") ? Promise.reject(new TypeError(`bad header ${JSON.stringify(`Bearer ${VLLM_KEY}`)}`)) : vllmFetch()(url))),
      servingReceipt(lane, vi.fn<typeof fetch>((url) => (url as string).endsWith("/v1/models") ? Promise.reject(new TypeError("fetch failed", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) })) : vllmFetch()(url))),
      servingReceipt(lane, vi.fn<typeof fetch>((url) => Promise.resolve(new Response((url as string).endsWith("/version") ? "{}" : JSON.stringify(VLLM_MODELS))))),
      servingReceipt(vllmLane(undefined, null), vllmFetch()),
      servingReceipt(vllmLane(undefined, " \n"), vllmFetch()),
      servingReceipt({ ...lane, modelUrl: "http://x" }, vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 503 }))),
    ];
    const messages = await Promise.all(refusals.map((p) => p.then(() => "resolved", (error: unknown) => String(error))));
    expect(messages).toEqual([
      expect.stringContaining("http://127.0.0.1:18020/v1/models answered HTTP 401"),
      expect.stringContaining("is not a vLLM /v1/models payload serving one model"),
      expect.stringContaining("is not a vLLM /v1/models payload serving one model"),
      "Error: GET http://127.0.0.1:18020/v1/models failed: TypeError",
      "Error: GET http://127.0.0.1:18020/v1/models failed: TypeError (ECONNREFUSED)",
      expect.stringContaining("http://127.0.0.1:18020/version is not a vLLM version payload"),
      expect.stringContaining("cannot read the api key file"),
      expect.stringContaining("is empty"),
      expect.stringContaining("http://x/health answered HTTP 503"),
    ]);
    for (const m of messages) expect(m).not.toContain(VLLM_KEY);
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
    const receipt = await servingReceipt(llamaLane("http://127.0.0.1:8091"), fetchFn);
    expect(receipt).toMatchObject({ model: MODEL_PATH, build: "b10236-1464c62d8", contextTokens: 65536, slots: 1, vision: true });
    expect(receipt.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((await servingReceipt(llamaLane("http://127.0.0.1:8098"), fetchFn)).fingerprint).toBe(receipt.fingerprint);
    await expect(servingReceipt(llamaLane("http://x"), vi.fn<typeof fetch>().mockResolvedValue(new Response("loading", { status: 503 })))).rejects.toThrow("http://x/health answered HTTP 503");
    await expect(servingReceipt(llamaLane("http://x"), vi.fn<typeof fetch>().mockResolvedValue(new Response("{}")))).rejects.toThrow("http://x/props is not a llama-server /props payload");
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
    expect(host.runId({ id: "M", gpu: "MAC", gamePort: 8077, modelUrl: "http://127.0.0.1:8099", runName: "glm53-mac" })).toMatch(/_glm53-mac_[0-9a-z]+$/);
    expect(host.runId({ id: "M", gpu: "MAC", gamePort: 8077, modelUrl: "http://127.0.0.1:8099", runName: "a".repeat(40) })).toMatch(new RegExp(`_${"a".repeat(40)}_[0-9a-z]+$`));
    expect(existsSync("/nowhere")).toBe(false);
  });
});

describe("exploratory current-main feature recipe", () => {
  const sourceRoot=fileURLToPath(new URL("../../../",import.meta.url));
  it.each([
    ["bundle-v-control-2h", "bundle", "B", "86400000", false],
    ["bundle-v-control-2h", "control", "B", "86400000", false],
    ["glm53-flash-4h", "bundle", "A", "604800000", true],
    ["glm53-flash-4h", "control", "A", "604800000", true],
  ] as const)("materializes approved whiteout recipe for %s %s through a fake runner", async (id, arm, lane, cap, recipe) => {
    const f = setup();
    const hashes = new Map([[f.deps.rom ?? "", ROM_SHA1]]);
    try {
      mkdirSync(join(f.root,"experiments/feature-configs"),{recursive:true});
      writeFileSync(join(f.root,"experiments/feature-configs/current.json"),readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url)));
      for (const name of ["bundle-v-control-2h", "bundle-v-control", "glm53-flash-4h"]) {
        const text = readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8");
        const def = readFixedDefinition(sourceRoot,name).definition;
        for (const phase of def.phases) if (phase.start.kind === "save_state") hashes.set(join(f.root, phase.start.path), phase.start.sha1);
        writeFileSync(join(f.root, "experiments/fixed", `${name}.json`), text);
        const base = join(f.root, def.controlBase.path);
        mkdirSync(join(base, ".."), { recursive: true });
        writeFileSync(base, readFileSync(new URL(`../../../${def.controlBase.path}`, import.meta.url)));
      }
      const args = ["dry-run", id, "--phase", "cook", "--wall-ms", cap, "--arm", arm, "--lane", lane, ...(recipe ? ["--feature-recipe", "bundle-v-control"] : [])];
      expect(await main(args, { ...f.deps, sha1File: path => hashes.get(path) ?? null }), f.err.join("\n")).toBe(0);
      expect(f.runs).toHaveLength(1);
      const captured = f.runs[0];
      if (captured === undefined) throw new Error("fake runner must capture one trial");
      expect(captured.dryRun).toBe(true);
      expect(captured.def.plan.map(slot => ({ arm: slot.arm, lane: slot.lane }))).toEqual([{ arm, lane }]);
      expect(captured.def.phases.map(phase => phase.maxWallMs)).toEqual([Number(cap)]);
      expect(armFeatures(captured.def, arm)["whiteout-outcomes-v2"]).toBe(true);
      expect(armFeatures(captured.def, arm)["briefing-battle-outcomes-v1"]).toBe(true);
      expect(armFeatures(captured.def, arm)["battle-loss-recap-v1"]).toBe(true);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  it("materializes the donor's exact arms while retaining the model lane, start and cap", async () => {
    const f = setup();
    const donor = definition();
    const modelBaseText=controlBaseText()+"\n";
    const modelBasePath="runs/model-control-base.json";
    mkdirSync(join(f.root,"runs"),{recursive:true});writeFileSync(join(f.root,modelBasePath),modelBaseText);
    const model = definition({ id: "glm-four-hour", bundleMaxTokens:8192, controlBase:{...donor.controlBase,path:modelBasePath,sha256:createHash("sha256").update(modelBaseText).digest("hex")},base:{...donor.base,features:{...donor.base.features,"counter-talk-v1":true}},onInBoth:["counter-talk-v1"],offInBoth:[...donor.offInBoth,"full-map-navigation-v1"],switches: donor.switches.filter(id=>id!=="navigation-cycle-stop-v1"&&id!=="world-destinations-v1"), lanes: [{id:"A",gpu:"MAC",gamePort:8077,modelUrl:"http://127.0.0.1:8099",runName:"glm53-mac"}], serving: {...donor.serving, model:"/models/other.gguf",contextTokens:262144}, phases: [{id:"cook",perArm:1,maxWallMs:14_400_000,primary:false,start:MENU_START}] });
    writeFileSync(f.path, JSON.stringify(donor));
    writeFileSync(join(f.root,"experiments/fixed/glm-four-hour.json"), JSON.stringify(model));
    expect(await main(["dry-run","glm-four-hour","--phase","cook","--wall-ms","14400000","--feature-recipe","bundle-v-control"],f.deps)).toBe(0);
    const effective = f.runs[0]?.def;
    expect(effective).toMatchObject({base:donor.base,controlBase:donor.controlBase,switches:donor.switches,offInBoth:donor.offInBoth,onInBoth:donor.onInBoth,lanes:model.lanes,serving:model.serving,bundleMaxTokens:8192});
    expect(effective?.phases).toEqual([{id:"dry-run",perArm:1,maxWallMs:14_400_000,primary:false,start:MENU_START}]);
    expect(effective?.plan.map(s=>s.arm).sort()).toEqual(["bundle","control"]);
    expect(JSON.parse(readFileSync(join(f.runsRoot,"experiments/glm-four-hour-dryrun-cook/feature-recipe.json"),"utf8"))).toMatchObject({id:"bundle-v-control",commit:f.deps.head(),definition:effective});
    const futureBase=controlBaseText(undefined,{target:"RIVAL_MET",sampling:{thinkingLevel:"high",maxTokens:1024},limits:{maxTurns:100,failureLimit:3}});
    const futurePath="runs/future-control-base.json";writeFileSync(join(f.root,futurePath),futureBase);
    const future={...donor,controlBase:{...donor.controlBase,path:futurePath,sha256:createHash("sha256").update(futureBase).digest("hex")},base:{...donor.base,target:"RIVAL_MET",sampling:{thinkingLevel:"high",maxTokens:1024},limits:{...donor.base.limits,maxTurns:100}}};
    writeFileSync(f.path,JSON.stringify(future));
    expect(await main(["dry-run","glm-four-hour","--phase","cook","--wall-ms","14400000","--feature-recipe","bundle-v-control"],f.deps)).toBe(1);
    expect(f.err.at(-1)).toContain("base target");
    expect(f.err.at(-1)).toContain("base sampling differs from the control base");
    expect(f.err.at(-1)).toContain("base limits.maxTurns");expect(f.runs).toHaveLength(1);

  });
  it("uses changed canonical flags on the next invocation and refuses an invalid donor", async () => {
    const f = setup();
    const donor = definition();
    writeFileSync(f.path,JSON.stringify(donor));
    expect(await main(["dry-run","bundle-v-control","--feature-recipe","bundle-v-control"],f.deps)).toBe(0);
    const changed = {...donor,switches:[...donor.switches,"full-map-navigation-v1"]};
    writeFileSync(f.path,JSON.stringify(changed));
    expect(await main(["dry-run","bundle-v-control","--feature-recipe","bundle-v-control"],f.deps)).toBe(0);
    expect(f.runs[1]?.def.switches).toEqual(changed.switches);
    expect(f.runs[0]?.def.switches).toEqual(donor.switches);
    expect(await main(["dry-run","bundle-v-control","--feature-recipe","missing"],f.deps)).toBe(1);
    expect(await main(["dry-run","bundle-v-control","--feature-recipe"],f.deps)).toBe(1);
    const differentRom={...changed,romSha1:"0".repeat(40)};
    writeFileSync(join(f.root,"experiments/fixed/other-rom.json"),JSON.stringify(differentRom));
    expect(await main(["dry-run","bundle-v-control","--feature-recipe","other-rom"],f.deps)).toBe(1);
    expect(f.err.at(-1)).toBe("feature recipe ROM differs from the model definition");
    expect(f.runs).toHaveLength(2);
  });
});

it("runs one exploratory lane/arm with the current definition, without altering paired dry runs",async()=>{
 const {deps,path,runs}=setup();writeFileSync(path,JSON.stringify(definition()));
 expect(await main(["dry-run","bundle-v-control","--phase","cook","--arm","bundle","--lane","A"],deps)).toBe(0);
 expect(runs[0]).toMatchObject({dryRun:true,def:{lanes:[{id:"A"}],plan:[{lane:"A",arm:"bundle"}]}});
 expect(runs[0]?.def.plan).toHaveLength(1);
 for(const flags of [["--arm","bundle"],["--lane","A"],["--arm","bad","--lane","A"],["--arm","bundle","--lane","missing"]])expect(await main(["dry-run","bundle-v-control",...flags],deps)).toBe(1);
 expect(runs).toHaveLength(1);
});

describe("shared current feature config",()=>{
 function shared(){
  const f=setup(),full=definition();
  const {controlBase,switches,offInBoth,onInBoth,base,...protocol}=full;
  const {features,...baseProtocol}=base;
  const config={version:1,id:"current",romSha1:full.romSha1,controlBase,features,switches,offInBoth,onInBoth};
  const source={...protocol,base:baseProtocol,featureRecipe:"current"};
  mkdirSync(join(f.root,"experiments/feature-configs"),{recursive:true});
  const configPath=join(f.root,"experiments/feature-configs/current.json");
  writeFileSync(configPath,JSON.stringify(config));writeFileSync(f.path,JSON.stringify(source));
  return {...f,source,config,configPath};
 }
 it("plans without copying feature maps back into the protocol",async()=>{
  const f=shared();try{
   expect(await main(["plan","bundle-v-control"],f.deps),f.err.join("\n")).toBe(0);
   const source=JSON.parse(readFileSync(f.path,"utf8")) as {featureRecipe:string;base:{features?:unknown}};
   expect(source.featureRecipe).toBe("current");expect(source.base.features).toBeUndefined();
  }finally{rmSync(f.root,{recursive:true,force:true});}
 });
 it("invalidates an approval when only the shared config changes",async()=>{
  const f=shared();try{
   expect(await main(["approve","bundle-v-control"],{...f.deps,interactive:true,prompt:()=>Promise.resolve("bundle-v-control")}),f.err.join("\n")).toBe(0);
   writeFileSync(f.configPath,JSON.stringify(f.config,null,2));
   expect(await main(["run","bundle-v-control"],f.deps)).toBe(1);
   expect(f.err.at(-1)).toContain("definition changed since it was approved");expect(f.runs).toEqual([]);
  }finally{rmSync(f.root,{recursive:true,force:true});}
 });
 it("future launches materialize current features and save their source receipt",async()=>{
  const f=shared();try{
   expect(await main(["dry-run","bundle-v-control","--phase","cook","--wall-ms","120000"],f.deps),f.err.join("\n")).toBe(0);
   expect(f.runs).toHaveLength(1);expect(f.runs[0]?.def.base.features).toEqual(f.config.features);
   const receipt=JSON.parse(readFileSync(join(f.runsRoot,"experiments/bundle-v-control-dryrun-cook/feature-recipe.json"),"utf8")) as {id:string;sha256:string;definition:unknown};
   expect(receipt.id).toBe("current");expect(receipt.sha256).toBe(createHash("sha256").update(JSON.stringify(f.config)).digest("hex"));
   expect(parseFixedDefinition(JSON.stringify(receipt.definition)).definition).toEqual(f.runs[0]?.def);
  }finally{rmSync(f.root,{recursive:true,force:true});}
 });
});

it("keeps archived recipe analysis available while refusing a new archived launch",async()=>{
 const f=setup();try{
  mkdirSync(join(f.root,"experiments/archive/fixed"),{recursive:true});
  writeFileSync(join(f.root,"experiments/archive/fixed/bundle-v-control.json"),JSON.stringify(definition()));
  expect(await main(["analyze","bundle-v-control"],f.deps),f.err.join("\n")).toBe(0);
  expect(await main(["run","bundle-v-control"],f.deps)).toBe(1);
  expect(f.err.at(-1)).toContain("no definition");expect(f.runs).toEqual([]);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
