import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { fingerprint, harnessVersions, orderedVersions, shortModelName, switchLabel, versionColor } from "./frontier-versions.js";
import type { WorkbenchRun } from "./workbench-data.js";
const SWITCHES = ["live-map-v1", "loop-guard-v1", "ram-state-v1", "dialogue-auto-advance-v1", "walkable-floor-v1"] as const;
const TITLES: Readonly<Record<string, string>> = { "live-map-v1": "LIVE MAP", "loop-guard-v1": "LOOP GUARD", "ram-state-v1": "RAM GAME-STATE READOUT", "dialogue-auto-advance-v1": "DIALOGUE AUTO-ADVANCE", "walkable-floor-v1": "WALKABLE FLOOR" };
function trial(id: string, started: string, on: readonly string[], options: { arm?: string | null; model?: string | null; preset?: string | null; source?: string; unknown?: boolean } = {}): WorkbenchRun {
  const base = run({ id, started, arm: options.arm === undefined ? null : options.arm, model: options.model === undefined ? "Qwen/Qwen3.6-35B-A3B-FP8" : options.model });
  const config = base.config; if (config === null) throw new Error("fixture config");
  return { ...base, config: { ...config, preset: options.preset === undefined ? "bundle-v-control" : options.preset, source: options.source ?? "a".repeat(40), features: SWITCHES.map(f => ({ id: f, label: TITLES[f] ?? f, on: on.includes(f) ? true : options.unknown === true ? null : false })) } };
}
const at = (hour: number): string => `2026-10-16T${String(hour).padStart(2, "0")}:00:00.000-04:00`;
describe("harness versions", () => {
  it("reads switch titles in sentence case, keeping acronyms", () => {
    expect(switchLabel("RAM GAME-STATE READOUT")).toBe("RAM game-state readout");
    expect(switchLabel("NPCS + OBJECTS")).toBe("NPCs + objects");
    expect(switchLabel("BATTLE DETAILS V2")).toBe("Battle details v2");
    expect(switchLabel("LOW-HP TRAINER WARNING")).toBe("Low-HP trainer warning");
    expect(switchLabel("NPC-AWARE ROUTES")).toBe("NPC-aware routes");
    expect(switchLabel("Already readable UI")).toBe("Already readable UI");
    expect(switchLabel("")).toBe("");
  });
  it("derives short model names from the id by rule, never from a table", () => {
    expect(shortModelName("Qwen/Qwen3.6-35B-A3B-FP8")).toBe("qwen36");
    expect(shortModelName("Qwen3.8-Flash-Next-UD-IQ4_XS")).toBe("qwen38-flash-next");
    expect(shortModelName("think-fast")).toBe("think-fast");
    expect(shortModelName("gemma-3-27b-it")).toBe("gemma3");
    expect(shortModelName("models/llama-3.1-8b-instruct.gguf")).toBe("llama31");
    expect(shortModelName("Q4")).toBe("q4");
    expect(shortModelName("---")).toBe("---");
  });
  it("fingerprints a switch set independently of order", () => {
    expect(fingerprint(["b", "a"])).toBe(fingerprint(["a", "b"]));
    expect(fingerprint(["a"])).not.toBe(fingerprint(["a", "b"]));
    expect(fingerprint([])).toMatch(/^[0-9a-f]{4}$/);
  });
  it("groups by model and the exact set of switches on, whatever the preset or build", () => {
    const runs = [
      trial("c1", at(1), ["ram-state-v1"], { arm: "control", preset: "a", source: "1".repeat(40) }),
      trial("c1b", at(2), ["ram-state-v1"], { arm: "control", preset: "b", source: "2".repeat(40) }),
      trial("other-model", at(3), ["ram-state-v1"], { arm: "control", model: "think-fast" }),
      trial("c2", at(4), ["ram-state-v1", "live-map-v1"], { arm: "control" }),
    ];
    const { versions, byRun } = harnessVersions(runs);
    expect(versions).toHaveLength(3);
    expect(byRun.get("c1")).toBe(byRun.get("c1b"));
    expect(byRun.get("c1")?.runs).toEqual(["c1", "c1b"]);
    expect(byRun.get("c1")?.builds).toEqual(["1111111", "2222222"]);
    expect(byRun.get("other-model")?.name).toBe("think-fast · configuration v1");
    expect(byRun.get("c2")?.name).toBe("qwen36 · configuration v2");
    expect(byRun.get("c1")?.id).toMatch(/^hv-[0-9a-f]{8}$/);
    expect(byRun.get("c1")?.id).not.toBe(byRun.get("other-model")?.id);
    expect(byRun.get("c2")?.on.map(f => f.label)).toEqual(["Live map", "RAM game-state readout"]);
  });
  it("numbers versions per model and arm by their first run, naming each by its earliest run's arm", () => {
    const runs = [
      trial("b2", at(5), ["ram-state-v1", "live-map-v1", "loop-guard-v1"], { arm: "bundle" }),
      trial("b1", at(3), ["ram-state-v1", "live-map-v1"], { arm: "bundle" }),
      trial("b1-control", at(6), ["ram-state-v1", "live-map-v1"], { arm: "control" }),
      trial("c1", at(1), ["ram-state-v1"], { arm: "control" }),
      trial("preset", at(2), ["dialogue-auto-advance-v1"], { preset: "objectives-on" }),
      trial("bare", at(2), ["walkable-floor-v1"], { preset: null }),
      { ...trial("undated", "", ["loop-guard-v1"], { arm: "bundle" }) },
    ];
    const { byRun } = harnessVersions(runs);
    expect(["c1", "b1", "b2", "undated"].map(id => byRun.get(id)?.name)).toEqual(["qwen36 · configuration v1", "qwen36 · configuration v4", "qwen36 · configuration v5", "qwen36 · configuration v6"]);
    expect(byRun.get("b1-control")?.name).toBe("qwen36 · configuration v4");
    expect(byRun.get("preset")?.name).toBe("qwen36 · configuration v3");
    expect(byRun.get("bare")?.name).toBe("qwen36 · configuration v2");
    expect(byRun.get("undated")?.first).toBe(Infinity);
    expect(byRun.get("c1")?.first).toBe(Date.parse(at(1)));
  });
  it("compares each version with the previous one of its arm, and bundle v1 with control v1", () => {
    const runs = [
      trial("c1", at(1), ["ram-state-v1", "dialogue-auto-advance-v1"], { arm: "control" }),
      trial("c2", at(2), ["ram-state-v1"], { arm: "control" }),
      trial("b1", at(3), ["ram-state-v1", "dialogue-auto-advance-v1", "live-map-v1"], { arm: "bundle" }),
      trial("b2", at(4), ["ram-state-v1", "live-map-v1", "loop-guard-v1", "walkable-floor-v1"], { arm: "bundle" }),
      trial("x1", at(5), ["loop-guard-v1"], { preset: "lonely" }),
    ];
    const { byRun } = harnessVersions(runs);
    expect(byRun.get("c1")).toMatchObject({ previous: null, added: [], removed: [] });
    expect(byRun.get("c2")?.previous).toBe("qwen36 · configuration v1");
    expect(byRun.get("c2")?.removed.map(f => f.id)).toEqual(["dialogue-auto-advance-v1"]);
    expect(byRun.get("b1")?.previous).toBe("qwen36 · configuration v2");
    expect(byRun.get("b1")?.added.map(f => f.id)).toEqual(["dialogue-auto-advance-v1", "live-map-v1"]);
    expect(byRun.get("b2")?.previous).toBe("qwen36 · configuration v3");
    expect(byRun.get("b2")?.added.map(f => f.label)).toEqual(["Loop guard", "Walkable floor"]);
    expect(byRun.get("b2")?.removed.map(f => f.id)).toEqual(["dialogue-auto-advance-v1"]);
    expect(byRun.get("x1")?.previous).toBe("qwen36 · configuration v4");
    expect(harnessVersions([runs[4] as WorkbenchRun]).byRun.get("x1")).toMatchObject({ previous: null, added: [], removed: [] });
  });
  it("counts null as not on, and groups runs with no switch map as legacy", () => {
    const partial = trial("partial", at(1), ["ram-state-v1"], { arm: "control", unknown: true });
    const known = trial("known", at(2), ["ram-state-v1"], { arm: "control" });
    const old = trial("old", at(0), [], { unknown: true, preset: null, model: null });
    const none = { ...trial("none", at(0), []), config: null };
    const { byRun, versions } = harnessVersions([partial, known, old, none]);
    expect(byRun.get("partial")).toBe(byRun.get("known"));
    expect(byRun.get("old")).toMatchObject({ name: "Model not recorded · legacy configuration", number: null, family: "legacy", previous: null, on: [], builds: ["aaaaaaa"] });
    expect(byRun.get("none")).toMatchObject({ name: "qwen36 · legacy configuration", number: null, family: "legacy", builds: [] });
    expect(versions.filter(v => v.family === "legacy")).toHaveLength(2);
  });
  it("colors bundle warm and control cool in first-run order, other arms by hue, and never recolors a known version", () => {
    const runs = [
      trial("c1", at(1), ["ram-state-v1"], { arm: "control" }), trial("c2", at(2), ["live-map-v1"], { arm: "control" }),
      trial("b1", at(3), ["loop-guard-v1"], { arm: "bundle" }), trial("b2", at(4), ["walkable-floor-v1"], { arm: "bundle" }),
      trial("o1", at(5), ["dialogue-auto-advance-v1"], { arm: "probe-arm" }), { ...trial("l1", at(0), []), config: null },
    ];
    const first = harnessVersions(runs);
    expect(["c1", "c2", "b1", "b2"].map(id => first.byRun.get(id)?.color)).toEqual(["#2583bd", "#208b71", "#c25464", "#c16b27"]);
    expect(first.byRun.get("o1")?.color).toBe(versionColor("other", "probe-arm", 0));
    expect(first.byRun.get("o1")?.color).toMatch(/^hsl\(\d+ 45% 38%\)$/);
    expect(first.byRun.get("l1")?.color).toMatch(/^hsl\(\d+ 10% \d+%\)$/);
    const kept = new Map(first.versions.map(v => [v.key, v.color]));
    const earlier = trial("b0", at(0), ["ram-state-v1", "loop-guard-v1"], { arm: "bundle" });
    const again = harnessVersions([earlier, ...runs], kept);
    expect(again.byRun.get("b1")?.color).toBe(first.byRun.get("b1")?.color);
    expect(again.byRun.get("b1")?.name).toBe("qwen36 · configuration v4");
    expect(again.byRun.get("b0")?.color).toBe(versionColor("bundle", "bundle", 2));
    const many = Array.from({ length: 12 }, (_, i) => versionColor("bundle", "bundle", i)).concat(Array.from({ length: 12 }, (_, i) => versionColor("control", "control", i)));
    expect(new Set(many).size).toBe(24);
    expect(many).not.toContain("#af8915"); expect(many).not.toContain("#304f7a");
  });
  it("orders versions bundle, control, other arms, then legacy, each by number", () => {
    const runs = [
      { ...trial("l1", at(0), []), config: null }, trial("o1", at(1), ["loop-guard-v1"], { preset: "zeta" }), trial("o2", at(1), ["live-map-v1"], { preset: "alpha" }),
      trial("c1", at(2), ["ram-state-v1"], { arm: "control" }), trial("b2", at(4), ["walkable-floor-v1"], { arm: "bundle" }), trial("b1", at(3), ["live-map-v1", "ram-state-v1"], { arm: "bundle" }),
    ];
    expect(orderedVersions(harnessVersions(runs).versions).map(v => v.name)).toEqual(["qwen36 · configuration v4", "qwen36 · configuration v5", "qwen36 · configuration v3", "qwen36 · configuration v2", "qwen36 · configuration v1", "qwen36 · legacy configuration"]);
  });
});
