import { describe, expect, it } from "vitest";
import { armPreset, definitionProblems, dryRunDefinition, FixedDesignError, generatePlan, parseFixedDefinition, planOrder } from "./fixed-design.js";
import { definition, draftDefinition, INCUMBENT_FEATURES } from "../test-support/fixed.js";

describe("generatePlan", () => {
  it("gives every block of four one bundle and one control trial per lane, phases in order", () => {
    const plan = generatePlan(draftDefinition());
    expect(plan.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(plan.map((s) => s.phase)).toEqual([...Array<string>(8).fill("confirmatory"), ...Array<string>(4).fill("cook")]);
    for (const block of [1, 2, 3]) {
      const cells = plan.filter((s) => s.block === block).map((s) => `${s.lane}-${s.arm}`).sort();
      expect(cells).toEqual(["A-bundle", "A-control", "B-bundle", "B-control"]);
    }
  });

  it("is a pure function of the seed, and different seeds shuffle differently", () => {
    expect(generatePlan(draftDefinition())).toEqual(generatePlan(draftDefinition()));
    const orders = new Set(["0", "1", "2", "3", "4", "5", "6", "7"].map((s) => generatePlan(draftDefinition({ seed: s.repeat(16) })).map((t) => `${t.lane}${t.arm}`).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("orders a lane's trials by plan order", () => {
    const def = definition();
    expect(planOrder(def, "A").every((s) => s.lane === "A")).toBe(true);
    expect(planOrder(def, "A").map((s) => s.slot)).toEqual(def.plan.filter((s) => s.lane === "A").map((s) => s.slot));
  });
});

describe("armPreset", () => {
  it("turns exactly the bundle switches on in the bundle arm and sets the phase's wall cap and the shared start", () => {
    const def = definition();
    const control = armPreset(def, "confirmatory", "control");
    const bundle = armPreset(def, "cook", "bundle");
    expect(control).toMatchObject({ version: 2, id: "bundle-v-control-confirmatory-control", target: null, limits: { maxTurns: 20000, maxWallMs: 900_000, failureLimit: 3, replyFailuresEndRun: false }, start: def.start });
    expect(bundle.limits.maxWallMs).toBe(3_600_000);
    const differing = Object.keys(INCUMBENT_FEATURES).filter((k) => (control.features as Record<string, boolean>)[k] !== (bundle.features as Record<string, boolean>)[k]);
    expect(differing.sort()).toEqual([...def.switches].sort());
    expect((bundle.features as Record<string, boolean>)["milestone-stall-stop-v1"]).toBe(false);
  });

  it("rejects an unknown phase", () => {
    expect(() => armPreset(definition(), "nope", "control")).toThrow(FixedDesignError);
  });
});

describe("definitionProblems", () => {
  it("accepts the fixture", () => {
    expect(definitionProblems(definition())).toEqual([]);
  });

  it("names a plan that does not match its seed", () => {
    const def = definition();
    const swapped = def.plan.map((s, i) => (i === 0 ? { ...s, arm: s.arm === "bundle" ? "control" as const : "bundle" as const } : s));
    expect(definitionProblems({ ...def, plan: swapped })).toContain("plan does not match seed 00c0ffee00c0ffee: regenerate it with `just fixed-run plan`");
  });

  it("names a switch that is on in the base, an off-in-both switch that is on or bundled, and unknown features", () => {
    const def = definition({ base: { ...draftDefinition().base, features: { ...INCUMBENT_FEATURES, "world-destinations-v1": true, "milestone-stall-stop-v1": true } }, offInBoth: ["milestone-stall-stop-v1", "game-evidence-priority-v1"] });
    const problems = definitionProblems(def);
    expect(problems).toContain("bundle switch world-destinations-v1 must be off in the base (control) features");
    expect(problems).toContain("milestone-stall-stop-v1 must be off in both arms");
    expect(problems).toContain("game-evidence-priority-v1 is both a bundle switch and off in both arms");
    expect(definitionProblems(definition({ switches: ["no-such-switch-v1"] })).join("\n")).toMatch(/no-such-switch-v1/);
  });

  it("names lanes that share a port, a model URL or an id, and a per-arm count that lanes cannot split", () => {
    const lane = draftDefinition().lanes[0];
    if (lane === undefined) throw new Error("fixture lane");
    const problems = definitionProblems(definition({ lanes: [lane, { ...lane }], phases: [{ id: "confirmatory", perArm: 3, maxWallMs: 900_000, primary: true }] }));
    expect(problems).toEqual(expect.arrayContaining([
      "lane ids must be unique",
      "lanes must use distinct game ports",
      "lanes must use distinct model URLs",
      "phase confirmatory: perArm 3 is not a multiple of 2 lanes",
    ]));
    expect(definitionProblems(definition({ phases: [{ id: "a", perArm: 2, maxWallMs: 900_000, primary: true }, { id: "b", perArm: 2, maxWallMs: 900_000, primary: true }] }))).toContain("at most one phase may be primary");
    expect(definitionProblems(definition({ phases: [{ id: "a", perArm: 2, maxWallMs: 900_000, primary: true }, { id: "a", perArm: 2, maxWallMs: 900_000, primary: false }] }))).toContain("phase ids must be unique");
    expect(definitionProblems(definition({ primaryMilestone: "NOT_A_MILESTONE" }))).toContain("unknown primary milestone NOT_A_MILESTONE");
    expect(definitionProblems(definition({ lanes: [{ ...lane, modelUrl: "http://10.0.0.1:8091/" }] }))).toContain("lane A: modelUrl must be http://127.0.0.1:<port> with no path");
  });
});

describe("parseFixedDefinition", () => {
  it("parses a valid file and returns its sha256", () => {
    const text = JSON.stringify(definition());
    const parsed = parseFixedDefinition(text);
    expect(parsed.definition.id).toBe("bundle-v-control");
    expect(parsed.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects malformed JSON, schema violations and problems, listing them", () => {
    expect(() => parseFixedDefinition("{")).toThrow(FixedDesignError);
    expect(() => parseFixedDefinition(JSON.stringify({ ...definition(), extra: 1 }))).toThrow(/not a fixed-run definition/);
    expect(() => parseFixedDefinition(JSON.stringify(definition({ primaryMilestone: "NOPE" })))).toThrow(/unknown primary milestone NOPE/);
  });
});

describe("dryRunDefinition", () => {
  it("plans one trial per arm per lane at the dry-run cap, under its own id and with no replacements", () => {
    const dry = dryRunDefinition(definition(), 120_000);
    expect(dry.id).toBe("bundle-v-control-dryrun");
    expect(dry.phases).toEqual([{ id: "dry-run", perArm: 2, maxWallMs: 120_000, primary: false }]);
    expect(dry.plan).toHaveLength(4);
    expect(dry.replacementReserveMs).toBe(0);
    expect(definitionProblems(dry)).toEqual([]);
  });
});

describe("trial-ending features", () => {
  it("refuses a diagnostic loop guard, whose stop notice still ends a trial stuck", () => {
    const def = definition({ base: { ...definition().base, features: { ...definition().base.features, "deterministic-loop-guard-v1": false } } });
    expect(definitionProblems(def)).toContain("deterministic-loop-guard-v1 and loop-guard-supervisor-v1 must both be on: otherwise the loop guard can end a trial stuck before its wall cap");
  });

  it("refuses an enforced loop guard without its supervisor, which would end trials stuck", () => {
    const def = definition({ base: { ...definition().base, features: { ...definition().base.features, "loop-guard-supervisor-v1": false } } });
    expect(definitionProblems(def)).toContain("deterministic-loop-guard-v1 and loop-guard-supervisor-v1 must both be on: otherwise the loop guard can end a trial stuck before its wall cap");
  });
});
