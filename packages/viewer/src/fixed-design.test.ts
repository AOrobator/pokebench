import {recipeText} from "../test-support/recipe-text.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { armFeatures, armPreset, controlBaseProblems, definitionProblems, dryRunDefinition, FixedDesignError, generatePlan, parseFixedDefinition, planOrder, armFeatureBits, soloDefinition, type FixedDefinition } from "./fixed-design.js";
import { CONTROL_BASE_SHA256, controlBaseText, definition, draftDefinition, INCUMBENT_FEATURES, CLOCK_START, MENU_START } from "../test-support/fixed.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

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
  it("turns exactly the bundle switches on in the bundle arm and sets the phase's wall cap and start", () => {
    const def = definition();
    const control = armPreset(def, "confirmatory", "control");
    const bundle = armPreset(def, "cook", "bundle");
    expect(control).toMatchObject({ version: 2, id: "bundle-v-control-confirmatory-control", target: null, limits: { maxTurns: 20000, maxWallMs: 900_000, failureLimit: 3, replyFailuresEndRun: false }, start: CLOCK_START });
    expect(bundle.limits.maxWallMs).toBe(3_600_000);
    // Each phase loads its own pinned save.
    expect(bundle.start).toEqual(MENU_START);
    // A boot phase has no start save: the preset powers on.
    const booted = definition({ phases: [{ id: "confirmatory", perArm: 4, maxWallMs: 900_000, primary: true, start: { kind: "boot" } }] });
    expect("start" in armPreset(booted, "confirmatory", "control")).toBe(false);
    const differing = Object.keys(INCUMBENT_FEATURES).filter((k) => (control.features as Record<string, boolean>)[k] !== (bundle.features as Record<string, boolean>)[k]);
    expect(differing.sort()).toEqual([...def.switches].sort());
    expect(control.features["automatic-running-v1"]).toBe(false);
    expect(bundle.features["automatic-running-v1"]).toBe(true);
    expect(control.features["semantic-navigation-v1"]).toBe(false);
    expect(control.features["deterministic-exploration-v1"]).toBe(false);
    expect(bundle.features["semantic-navigation-v1"]).toBe(true);
    expect(bundle.features["deterministic-exploration-v1"]).toBe(true);
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
    const problems = definitionProblems(definition({ lanes: [lane, { ...lane }], phases: [{ id: "confirmatory", perArm: 3, maxWallMs: 900_000, primary: true, start: CLOCK_START }] }));
    expect(problems).toEqual(expect.arrayContaining([
      "lane ids must be unique",
      "lanes must use distinct game ports",
      "lanes must use distinct model URLs",
      "phase confirmatory: perArm 3 is not a multiple of 2 lanes",
    ]));
    expect(definitionProblems(definition({ phases: [{ id: "a", perArm: 2, maxWallMs: 900_000, primary: true, start: CLOCK_START }, { id: "b", perArm: 2, maxWallMs: 900_000, primary: true, start: CLOCK_START }] }))).toContain("at most one phase may be primary");
    expect(definitionProblems(definition({ phases: [{ id: "a", perArm: 2, maxWallMs: 900_000, primary: true, start: CLOCK_START }, { id: "a", perArm: 2, maxWallMs: 900_000, primary: false, start: CLOCK_START }] }))).toContain("phase ids must be unique");
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

  it("accepts a Mac lane with its own run name and refuses other lane labels or run names", () => {
    const lane = draftDefinition().lanes[0];
    if (lane === undefined) throw new Error("fixture lane");
    const one = (l: object) => JSON.stringify(definition({ lanes: [{ ...lane, ...l }], phases: [{ id: "confirmatory", perArm: 1, maxWallMs: 900_000, primary: true, start: CLOCK_START }] }));
    expect(() => parseFixedDefinition(one({ gpu: "MAC", runName: "glm53-mac" }))).not.toThrow();
    expect(() => parseFixedDefinition(one({ gpu: "CPU" }))).toThrow(/not a fixed-run definition/);
    expect(() => parseFixedDefinition(one({ gpu: "MAC", runName: "GLM 5.3" }))).toThrow(/not a fixed-run definition/);
    for (const bad of ["glm53-mac-", "a--b", "-glm", "a".repeat(41)]) expect(() => parseFixedDefinition(one({ gpu: "MAC", runName: bad }))).toThrow(/not a fixed-run definition/);
    expect(() => parseFixedDefinition(one({ gpu: "MAC", runName: "a".repeat(40) }))).not.toThrow();
    expect(() => parseFixedDefinition(one({ gpu: "MAC" }))).toThrow(/lane A: a MAC lane must name its runs with runName/);
  });

  it("accepts a vLLM lane that declares its slots, vision and an absolute key file, and refuses inconsistent ones", () => {
    const lane = draftDefinition().lanes[0];
    if (lane === undefined) throw new Error("fixture lane");
    const one = (l: object, slots = 2) => definition({ lanes: [{ ...lane, ...l }], serving: { model: "qwen3.8-27b", build: "vllm-0.31.0 /models/q", contextTokens: 262144, slots }, phases: [{ id: "confirmatory", perArm: 1, maxWallMs: 900_000, primary: true, start: CLOCK_START }] });
    const vllm = { server: "vllm", slots: 2, vision: true, apiKeyFile: "/Users/user/.config/pokebench/hyperqwen.key" };
    expect(() => parseFixedDefinition(JSON.stringify(one(vllm)))).not.toThrow();
    expect(definitionProblems(one({ server: "llama" }, 1))).toEqual([]);
    expect(definitionProblems(one({ server: "vllm" }))).toEqual(["lane A: a vllm lane must declare slots and vision"]);
    expect(definitionProblems(one({ ...vllm, slots: 1 }))).toEqual(["lane A: declares 1 slots, the serving plan has 2"]);
    expect(definitionProblems(one({ ...vllm, apiKeyFile: "secrets/key" }))).toEqual(["lane A: apiKeyFile must be an absolute path"]);
    expect(definitionProblems(one({ slots: 2, vision: true }))).toEqual(["lane A: only a vllm lane declares slots and vision"]);
    expect(() => parseFixedDefinition(JSON.stringify(one({ ...vllm, server: "sglang" })))).toThrow(/not a fixed-run definition/);
    expect(() => parseFixedDefinition(JSON.stringify(one({ ...vllm, apiKey: "inline" })))).toThrow(/not a fixed-run definition/);
  });
});

describe("on-in-both fixes", () => {
  const withFix = (on: boolean) => definition({ onInBoth: ["fresh-retry-v1"], base: { ...definition().base, features: { ...definition().base.features, "fresh-retry-v1": on } } });
  it("lets exactly the listed on-in-both flags differ from the control base, on in both arms", () => {
    expect(controlBaseProblems(withFix(true), controlBaseText())).toEqual([]);
    expect(controlBaseProblems(definition({ base: { ...definition().base, features: { ...definition().base.features, "fresh-retry-v1": true } } }), controlBaseText())).toEqual(["base feature fresh-retry-v1 is true, the control base has false"]);
    expect(armFeatureBits(withFix(true), "control")["fresh-retry-v1"]).toBe(true);
    expect(armFeatureBits(withFix(true), "bundle")["fresh-retry-v1"]).toBe(true);
    expect(armPreset(withFix(true), "confirmatory", "control").features["fresh-retry-v1"]).toBe(true);
  });
  it("refuses an on-in-both flag that is off in the base, unknown, a bundle switch or also off in both", () => {
    expect(definitionProblems(withFix(false))).toContain("fresh-retry-v1 must be on in both arms");
    expect(definitionProblems(definition({ onInBoth: ["no-such-flag-v1"] }))).toContain("unknown feature no-such-flag-v1");
    expect(definitionProblems(definition({ onInBoth: ["world-destinations-v1"] }))).toContain("world-destinations-v1 is both a bundle switch and on in both arms");
    expect(definitionProblems(definition({ onInBoth: ["milestone-stall-stop-v1"] }))).toContain("milestone-stall-stop-v1 is both off in both arms and on in both arms");
  });
  it("needs the on-in-both list in every definition", () => {
    const noList = Object.fromEntries(Object.entries(definition()).filter(([k]) => k !== "onInBoth"));
    expect(() => parseFixedDefinition(JSON.stringify(noList))).toThrow(FixedDesignError);
  });
});

describe("phase starts", () => {
  it("needs every phase to carry its start (a pinned save or boot) and the definition to pin the ROM", () => {
    expect(() => parseFixedDefinition(JSON.stringify({ ...definition(), phases: definition().phases.map((p) => ({ ...p, start: "save" })) }))).toThrow(FixedDesignError);
    const def = definition();
    const noStart = def.phases.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "start")));
    expect(() => parseFixedDefinition(JSON.stringify({ ...def, phases: noStart }))).toThrow(FixedDesignError);
    const noRom = Object.fromEntries(Object.entries(def).filter(([k]) => k !== "romSha1"));
    expect(() => parseFixedDefinition(JSON.stringify(noRom))).toThrow(FixedDesignError);
  });
});

describe("dryRunDefinition", () => {
  it("plans one trial per arm per lane at the dry-run cap, under its own id and with no replacements", () => {
    const dry = dryRunDefinition(definition(), 120_000);
    expect(dry.id).toBe("bundle-v-control-dryrun-confirmatory");
    expect(dry.phases).toEqual([{ id: "dry-run", perArm: 2, maxWallMs: 120_000, primary: false, start: CLOCK_START }]);
    const boot = dryRunDefinition(definition(), 720_000, "cook");
    expect(boot.id).toBe("bundle-v-control-dryrun-cook");
    expect(boot.phases).toEqual([{ id: "dry-run", perArm: 2, maxWallMs: 720_000, primary: false, start: MENU_START }]);
    expect(() => dryRunDefinition(definition(), 720_000, "nope")).toThrow(FixedDesignError);
    expect(dry.plan).toHaveLength(4);
    expect(dry.replacementReserveMs).toBe(0);
    expect(definitionProblems(dry)).toEqual([]);
  });
});

describe("soloDefinition", () => {
  it("plans one exploratory trial of one arm on one lane at the phase's start and cap, under its own id, with no replacements", () => {
    const def = definition();
    const solo = soloDefinition(def, "bundle", "B", "cook", 2);
    expect(solo).toMatchObject({ id: "bundle-v-control-solo-bundle-b-2", title: "Bundle vs fixed control (exploratory: bundle only, lane B, cook, #2)", replacementReserveMs: 0, lanes: [def.lanes[1]] });
    expect(solo.phases).toEqual([{ id: "cook", perArm: 1, maxWallMs: 3_600_000, primary: false, start: MENU_START, singleArm: "bundle" }]);
    expect(solo.plan).toEqual([{ slot: 1, phase: "cook", block: 1, lane: "B", arm: "bundle" }]);
    expect(definitionProblems(solo)).toEqual([]);
    expect(armPreset(solo, "cook", "bundle").features).toEqual(armPreset(def, "cook", "bundle").features);
    expect(soloDefinition(def, "control", "A", "confirmatory", 1).plan).toEqual([{ slot: 1, phase: "confirmatory", block: 1, lane: "A", arm: "control" }]);
  });

  it("refuses an unknown lane or phase, an id too long to name, and a single-arm phase that is paired, primary or multi-lane", () => {
    const def = definition();
    expect(() => soloDefinition(def, "bundle", "C", "cook", 1)).toThrow("no lane C; lanes: A, B");
    expect(() => soloDefinition(def, "bundle", "B", "nope", 1)).toThrow("no phase nope");
    expect(() => soloDefinition({ ...def, id: "x".repeat(70) }, "bundle", "B", "cook", 1)).toThrow(/is not a valid experiment id/);
    const solo = soloDefinition(def, "bundle", "B", "cook", 1);
    const phase = solo.phases[0];
    if (phase === undefined) throw new Error("fixture");
    for (const bad of [{ ...phase, primary: true }, { ...phase, perArm: 2 }, { ...phase, singlePair: true }]) expect(definitionProblems({ ...solo, phases: [bad] })).toContain("phase cook: singleArm requires one exploratory trial on one lane");
    expect(definitionProblems({ ...solo, lanes: def.lanes, plan: generatePlan({ ...solo, lanes: def.lanes }) })).toContain("phase cook: singleArm requires one exploratory trial on one lane");
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

describe("controlBaseProblems", () => {
  it("accepts a control base that reproduces the recorded preset outside the switches and off-in-both flags", () => {
    expect(controlBaseProblems(definition(), controlBaseText())).toEqual([]);
    // A switch or off-in-both flag the preset sets differently, or lacks, is the design, not drift.
    const preset = { ...INCUMBENT_FEATURES, "milestone-stall-stop-v1": true } as Record<string, boolean>;
    delete preset["world-destinations-v1"];
    const text = controlBaseText(preset);
    const def = definition({ controlBase: { ...definition().controlBase, sha256: sha(text) } });
    expect(controlBaseProblems(def, text)).toEqual([]);
  });

  it("refuses preset bytes whose sha256 differs from the recorded one", () => {
    const text = controlBaseText({ ...INCUMBENT_FEATURES }, { note: "edited" });
    expect(controlBaseProblems(definition(), text)).toContain(`control base ${definition().controlBase.path} has sha256 ${sha(text)}, the definition records ${CONTROL_BASE_SHA256}`);
  });

  it("refuses a base whose flags, sampling, limits or preset id drift from the control base", () => {
    const text = controlBaseText({ ...INCUMBENT_FEATURES, "interaction-loop-detection-v1": false, "text-only-supervisor-v1": false }, { id: "navigation-incumbent", sampling: { thinkingLevel: "high", maxTokens: 4096 }, limits: { maxTurns: 1500, failureLimit: 3 } });
    const def = definition({ controlBase: { ...definition().controlBase, sha256: sha(text) } });
    const problems = controlBaseProblems(def, text);
    expect(problems).toContain("control base preset id is navigation-incumbent, the definition records full-map-navigation-finals-incumbent");
    expect(problems).toContain("base feature interaction-loop-detection-v1 is true, the control base has false");
    expect(problems).toContain("base feature text-only-supervisor-v1 is true, the control base has false");
    expect(problems).toContain("base sampling differs from the control base");
    expect(problems).toContain("base limits.maxTurns is 20000, the control base has 1500");
    const missing = { ...INCUMBENT_FEATURES } as Record<string, boolean>;
    delete missing["ram-state-v1"];
    const gone = controlBaseText(missing);
    expect(controlBaseProblems(definition({ controlBase: { ...definition().controlBase, sha256: sha(gone) } }), gone)).toContain("base feature ram-state-v1 is true, the control base has unset");
  });

  it("refuses a control base that is not a JSON preset", () => {
    const def = definition({ controlBase: { ...definition().controlBase, sha256: sha("nope") } });
    expect(controlBaseProblems(def, "nope")[0]).toMatch(/^control base .* is not a preset/);
  });
});

it("preserves a shared native target in both diagnostic arms and rejects a misleading target",()=>{
 const original=definition();
 const def={...original,primaryMilestone:"STARTER_CHOSEN",base:{...original.base,target:"STARTER_CHOSEN"}};
 expect(parseFixedDefinition(JSON.stringify(def)).definition.base.target).toBe("STARTER_CHOSEN");
 for(const arm of ["control","bundle"] as const)expect(armPreset(def,"confirmatory",arm).target).toBe("STARTER_CHOSEN");
 expect(definitionProblems({...def,base:{...def.base,target:"RIVAL_MET"}})).toContain("base stopping target must equal primaryMilestone");
});

it("stops the starter diagnostic without replacing its broad play goal",()=>{
 const old=definition();const def={...old,primaryMilestone:"STARTER_CHOSEN",base:{...old.base,stopAt:"STARTER_CHOSEN"}};
 expect(parseFixedDefinition(JSON.stringify(def)).definition.base.stopAt).toBe("STARTER_CHOSEN");
 for(const arm of ["control","bundle"] as const)expect(armPreset(def,"confirmatory",arm)).toMatchObject({target:null,stopAt:"STARTER_CHOSEN"});
 expect(definitionProblems({...def,base:{...def.base,stopAt:"STONE_BADGE"}})).toContain("base stopping target must equal primaryMilestone");
});

it("freezes a byte-pinned prompt-only starter diagnostic with sixteen balanced slots",()=>{
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/starter-decision-salience.json",import.meta.url),"utf8")).definition;
 const base=recipeText(new URL("../../../experiments/fixed/control-bases/starter-decision-salience-control.json",import.meta.url),"utf8");
 expect(controlBaseProblems(def,base)).toEqual([]);expect(def.switches).toEqual(["starter-decision-salience-v1"]);expect(def.plan).toHaveLength(16);
 expect(def.phases).toMatchObject([{perArm:8,primary:false,maxWallMs:300_000,start:{kind:"save_state",sha1:"0c34433cc305ea5de6fa69aa4a5612bf434a5714"}}]);
 expect(def.base.target).toBeNull();expect(def.base.stopAt).toBe("STARTER_CHOSEN");
});

it("preserves historical navigation treatments and their newer maintained control baseline",()=>{
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
  const def=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
  expect(definitionProblems(def)).toEqual([]);
  for(const phase of def.phases){
   const control=armPreset(def,phase.id,"control"),bundle=armPreset(def,phase.id,"bundle");
   for(const id of ["navigation-tool-use-guard-v1","semantic-current-map-feedback-v1"] as const){
    if(name==="bundle-v-control")expect(def.switches).not.toContain(id);else expect(def.switches).toContain(id);expect(control.features[id]).toBe(name==="bundle-v-control");expect(bundle.features[id]).toBe(true);
   }
  }
 }
});

it("preserves historical field-dialogue treatment and its newer maintained control baseline",()=>{
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
  const raw=recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8");
  const def=parseFixedDefinition(raw).definition;
  expect(definitionProblems(def)).toEqual([]);
  if(name==="bundle-v-control")expect(def.switches).not.toContain("pending-field-dialogue-v1");else expect(def.switches).toContain("pending-field-dialogue-v1");
  for(const phase of def.phases){
   expect(armPreset(def,phase.id,"control").features["pending-field-dialogue-v1"]).toBe(name==="bundle-v-control");
   expect(armPreset(def,phase.id,"bundle").features["pending-field-dialogue-v1"]).toBe(true);
  }
  expect(controlBaseProblems(def,recipeText(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 }
});

it("enables menu refusal recovery only in evolving bundle arms",()=>{
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"]){
  const def=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
  expect(definitionProblems(def)).toEqual([]);
  expect(def.switches).toContain("menu-refusal-recovery-v1");
  for(const phase of def.phases){
   expect(armPreset(def,phase.id,"control").features["menu-refusal-recovery-v1"]).toBe(false);
   expect(armPreset(def,phase.id,"bundle").features["menu-refusal-recovery-v1"]).toBe(true);
  }
  expect(controlBaseProblems(def,recipeText(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 }
});

it("operator promotion enables only the reminder in both canonical comparison arms",()=>{
 for(const name of ["bundle-v-control","bundle-v-control-2h","whole-map-pair-2h","whole-map-cook-1h","bundle-cook-1h"]){
  const d=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;expect(definitionProblems(d)).toEqual([]);
  for(const arm of ["control","bundle"] as const)expect(armFeatures(d,arm)["move-learn-goal-reminder-v1"],`${name}/${arm}`).toBe(true);
  const current=name==="bundle-v-control"||name==="bundle-v-control-2h";
  for(const id of ["move-learn-settle-v1","move-learn-question-v1","move-learn-comparison-v1","move-learn-tool-v1","move-learn-early-comparison-v1"]){
   // the operator 2026-10-27: the current recipe promotes move-learn-settle-v1 and move-learn-tool-v1 to both arms.
   const both=current&&(id==="move-learn-settle-v1"||id==="move-learn-tool-v1");
   expect(d.switches.includes(id),`${name}/${id}`).toBe(!both);expect(armFeatures(d,"control")[id],`${name}/${id}`).toBe(both);expect(armFeatures(d,"bundle")[id]).toBe(true);
  }
 }
});

it("Rustboro checkpoint definitions enable the reminder in both arms",()=>{for(const name of ["gym-rustboro-torchic","gym-rustboro-torchic-healed"]){const d=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;expect(definitionProblems(d)).toEqual([]);expect(d.onInBoth).toContain("move-learn-goal-reminder-v1");for(const arm of ["control","bundle"] as const)expect(armFeatures(d,arm)["move-learn-goal-reminder-v1"],`${name}/${arm}`).toBe(true);}});

it("normal bundle recipes enable named declines while control retains its previous contract",()=>{
 for(const name of ["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","gym-rustboro-torchic","gym-rustboro-torchic-healed"]){
  const d=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
  expect(definitionProblems(d),name).toEqual([]);
  expect(armFeatures(d,"bundle")["move-learn-offer-identity-v1"],name).toBe(true);
  expect(armFeatures(d,"bundle")["move-learn-tool-v1"],name).toBe(true);
  expect(armFeatures(d,"control")["move-learn-offer-identity-v1"],name).toBe(false);
 }
});


it.each(["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","gym-rustboro-torchic","gym-rustboro-torchic-healed"])("future %s bundle credits earned campaign progress; current recipes credit it in control too",name=>{
 const control=name==="bundle-v-control"||name==="bundle-v-control-2h";
 const d=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
 expect(definitionProblems(d),name).toEqual([]);
 expect(armFeatures(d,"bundle")["campaign-progress-clock-v1"],`${name}/bundle`).toBe(true);
 expect(armFeatures(d,"control")["campaign-progress-clock-v1"],`${name}/control`).toBe(control);
 for(const phase of d.phases){
  expect(armPreset(d,phase.id,"bundle").features["campaign-progress-clock-v1"],`${name}/${phase.id}/bundle preset`).toBe(true);
  expect(armPreset(d,phase.id,"control").features["campaign-progress-clock-v1"],`${name}/${phase.id}/control preset`).toBe(control);
 }
});

it("enables navigation cycle stopping only in the seven evolving bundle arms",()=>{
 const id="navigation-cycle-stop-v1";
 for(const name of ["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","gym-rustboro-torchic","gym-rustboro-torchic-healed"]){
  const d=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
  expect(definitionProblems(d),name).toEqual([]);expect(d.base.features[id]).toBe(false);expect(d.switches.filter(s=>s===id)).toEqual([id]);
  expect(armFeatures(d,"control")[id],name).toBe(false);expect(armFeatures(d,"bundle")[id],name).toBe(true);
  expect(controlBaseProblems(d,recipeText(new URL(`../../../${d.controlBase.path}`,import.meta.url),"utf8")),name).toEqual([]);
 }
});

it("allows an explicit bundle reply cap without changing shared sampling or control provenance",()=>{
 const original=definition();
 const def=parseFixedDefinition(JSON.stringify({...original,bundleMaxTokens:8192})).definition;
 expect(controlBaseProblems(def,controlBaseText())).toEqual([]);
 expect(armPreset(def,"cook","control").sampling).toEqual(original.base.sampling);
 expect(armPreset(def,"cook","bundle").sampling).toEqual({...original.base.sampling,maxTokens:8192});
 expect(armPreset(original,"cook","bundle").sampling).toEqual(original.base.sampling);
 for(const invalid of [0,-1,1.5,"8192"])expect(()=>parseFixedDefinition(JSON.stringify({...original,bundleMaxTokens:invalid}))).toThrow();
});

it("enables truthful cut-off feedback in both arms and the larger reply budget only for GLM bundles",()=>{
 const names=["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","bundle-v-control-2h","whole-map-pair-2h","random-starter-2h","gym-rustboro-torchic","gym-rustboro-torchic-healed","glm53-flash-1h","glm53-flash-2h","glm53-flash-4h"];
 for(const name of names){
  const {definition:def}=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
  expect(definitionProblems(def),name).toEqual([]);
  expect(controlBaseProblems(def,recipeText(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8")),name).toEqual([]);
  expect(def.onInBoth,name).toContain("cut-off-reply-feedback-v1");
  expect(def.switches,name).not.toContain("cut-off-reply-feedback-v1");
  for(const phase of def.phases)for(const arm of ["control","bundle"] as const){
   const preset=armPreset(def,phase.id,arm);
   expect(preset.features["cut-off-reply-feedback-v1"],`${name}/${arm}`).toBe(true);
   expect(preset.sampling.maxTokens,`${name}/${arm}`).toBe(name.startsWith("glm53-")&&arm==="bundle"?8192:4096);
  }
 }
});

// Frozen before the allocation extension: every currently tracked legacy plan, including singleton modes.
const legacyAllocationFiles = [
 "experiments/archive/fixed/bundle-cook-1h.json",
 "experiments/archive/fixed/whole-map-cook-1h.json",
 "experiments/archive/fixed/whole-map-pair-2h.json",
 "experiments/fixed/bundle-cook-4h.json",
 "experiments/fixed/bundle-cook-6h-v2.json",
 "experiments/fixed/bundle-cook-6h.json",
 "experiments/fixed/bundle-v-control-2h.json",
 "experiments/fixed/bundle-v-control.json",
 "experiments/fixed/glm53-24h-visibility-v2.json",
 "experiments/fixed/glm53-flash-1h.json",
 "experiments/fixed/glm53-flash-2h.json",
 "experiments/fixed/glm53-flash-4h.json",
 "experiments/fixed/gym-rustboro-torchic-healed.json",
 "experiments/fixed/gym-rustboro-torchic.json",
 "experiments/fixed/hyperqwen-control-3h.json",
 "experiments/fixed/jit-10m.json",
 "experiments/fixed/jit-v2-10m.json",
 "experiments/fixed/jit-v2-cache-20m.json",
 "experiments/fixed/jit-v2-pair-10m.json",
 "experiments/fixed/qwen36-24h-visibility-off.json",
 "experiments/fixed/random-starter-2h.json",
 "experiments/fixed/rusturf-native-note-pilot16-20261029.json",
 "experiments/fixed/starter-decision-salience.json",
 "experiments/fixed/whole-map-pair-1h-v2.json",
 "experiments/fixed/whole-map-pair-1h-v3.json",
 "experiments/fixed/whole-map-pair-1h-v4.json",
 "experiments/fixed/whole-map-pair-1h-v5.json",
 "experiments/fixed/whole-map-pair-1h-v6.json",
 "experiments/fixed/whole-map-pair-1h-v7.json",
 "experiments/fixed/whole-map-pair-1h-v8.json",
 "experiments/fixed/whole-map-pair-1h.json"
];
function unequalDraft(control:number,bundle:number): ReturnType<typeof draftDefinition> {
 const base=draftDefinition();
 return {...base, phases:[{id:"confirmatory",armCounts:{control,bundle},maxWallMs:900_000,primary:true,start:CLOCK_START}]};
}
describe("exclusive unequal arm allocation",()=>{
 it("preserves all 31 existing legacy plans byte for byte",()=>{
  const records=legacyAllocationFiles.map(name=>{const def=JSON.parse(readFileSync(new URL(`../../../${name}`,import.meta.url),"utf8")) as Pick<FixedDefinition,"seed"|"phases"|"lanes"> & {plan:unknown};const plan=generatePlan(def);expect(JSON.stringify(plan)).toBe(JSON.stringify(def.plan));return[name,plan];});
  expect(sha(JSON.stringify(records))).toBe("c441200c3d6dc4458078cc1175f059afc764050240ff7ed19f8191a8aa0a9f1a");
 });
 it.each([16,32,48,100])("allocates 100 candidate plus %i controls evenly per GPU across proportional strata",control=>{
  for(const swapped of[false,true]){
   const counts=swapped?{control:100,bundle:control}:{control,bundle:100},draft=unequalDraft(counts.control,counts.bundle),plan=generatePlan(draft);
   expect(plan).toHaveLength(100+control);expect(plan.map(s=>s.slot)).toEqual(Array.from({length:plan.length},(_,i)=>i+1));
   expect(parseFixedDefinition(JSON.stringify({...draft,plan})).definition.plan).toEqual(plan);
   for(const lane of draft.lanes){const order=plan.filter(s=>s.lane===lane.id);for(const arm of["control","bundle"] as const)expect(order.filter(s=>s.arm===arm)).toHaveLength(counts[arm]/2);
    const minority=counts.control<=counts.bundle?"control":"bundle",majority=minority==="control"?"bundle":"control",blocks=[...new Set(order.map(s=>s.block))];expect(blocks).toHaveLength(Math.min(counts.control,counts.bundle)/2);
    const majorities=blocks.map(block=>{const cells=order.filter(s=>s.block===block);expect(cells.filter(s=>s.arm===minority)).toHaveLength(1);return cells.filter(s=>s.arm===majority).length;});expect(Math.max(...majorities)-Math.min(...majorities)).toBeLessThanOrEqual(1); for(let k=1;k<=majorities.length;k++)expect(majorities.slice(0,k).reduce((a,b)=>a+b,0)).toBe(Math.floor(k*Math.max(counts.control,counts.bundle)/2/majorities.length));
    const first=order.findIndex(s=>s.arm===minority),last=order.findLastIndex(s=>s.arm===minority),bound=Math.ceil(Math.max(counts.control,counts.bundle)/Math.min(counts.control,counts.bundle));expect(first).toBeLessThanOrEqual(bound);expect(order.length-1-last).toBeLessThanOrEqual(bound);
   }
  }
 });
 it("reproduces the seed and changes within-stratum order across seeds",()=>{const d=unequalDraft(16,100);expect(generatePlan(d)).toEqual(generatePlan(d));expect(generatePlan({...d,seed:"1".repeat(16)})).not.toEqual(generatePlan(d));});
 it.each([0,-2,1.5,Number.MAX_SAFE_INTEGER+1,Infinity,NaN,3,514])("rejects invalid control count %s before allocating positions",control=>{const d=unequalDraft(control,100);expect(()=>generatePlan(d)).toThrow();expect(()=>parseFixedDefinition(JSON.stringify({...d,plan:[]}))).toThrow();});
 it.each([{perArm:16},{singlePair:false},{singleArm:"bundle" as const},{armCounts:{control:16,bundle:100,other:2}}])("rejects mixed modes or unknown count keys %j",extra=>{const d=unequalDraft(16,100),plan=generatePlan(d),basePhase=d.phases[0];if(basePhase===undefined)throw new Error("fixture phase missing");const phase={...basePhase,...extra};expect(()=>generatePlan({...d,phases:[phase]})).toThrow();expect(()=>parseFixedDefinition(JSON.stringify({...d,phases:[phase],plan}))).toThrow();});
 it("accepts the finite512-position boundary and rejects missing count modes",()=>{expect(generatePlan(unequalDraft(256,256))).toHaveLength(512);const d=unequalDraft(16,100),phase={id:"confirmatory",maxWallMs:900_000,primary:true,start:CLOCK_START};expect(()=>generatePlan({...d,phases:[phase]})).toThrow(/exactly one/);expect(()=>parseFixedDefinition(JSON.stringify({...d,phases:[phase],plan:[]}))).toThrow(/exactly one/);});
 it("fails closed on a missing arm and an altered generated plan",()=>{const d=unequalDraft(16,100),plan=generatePlan(d);expect(()=>parseFixedDefinition(JSON.stringify({...d,phases:[{...d.phases[0],armCounts:{bundle:100}}],plan}))).toThrow();expect(()=>parseFixedDefinition(JSON.stringify({...d,plan:plan.slice(1)}))).toThrow(/plan does not match seed/);});
});
