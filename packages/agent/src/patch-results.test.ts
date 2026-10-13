import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "./events.js";
import { IN_GAME, RUN_START_META } from "../test-support/events.js";
import { comparePatchResults, renderPatchResults, type PatchTrial, type PatchComparison } from "./patch-results.js";

const target = "LITTLEROOT_TOWN";
const time = (ms: number) => new Date(Date.UTC(2026, 9, 13, 0, 0, 0, ms)).toISOString().replace("Z", "-04:00");
function trial(run: string, arm: "incumbent" | "candidate", ms: number | null = 1000): PatchTrial {
  const feature = arm === "candidate" ? ["action-bias-v1"] : [];
  const events: RunEvent[] = [
    { ...structuredClone(RUN_START_META), type: "run_start", v: 1, run, seq: 0, turn: 0, t: time(0), harness_features: feature, isolation: { ...RUN_START_META.isolation, run_data_id: run, server_dir: `runs/${run}/server` } },
    { ...IN_GAME, location: ms === null ? "INSIDE OF TRUCK" : IN_GAME.location, type: "state", v: 1, run, seq: 1, turn: 1, t: time(ms ?? 1000) },
    ...(ms === null ? [] : [{ type: "milestone" as const, v: 1 as const, run, seq: 2, turn: 1, t: time(ms), name: target, kind: "navigation" as const, origin: "observed" as const, evidence: [1], server_timestamp: 0 }]),
    { type: "run_end", v: 1, run, seq: 3, turn: 1, t: time(ms ?? 1000), reason: ms === null ? "budget" : "milestone", furthest_milestone: ms === null ? null : target, turns: 1, wall_ms: ms ?? 1000, tokens: { input: 100, output: 20 }, frames: { bytes: 0, saved: 0 } },
  ];
  return { events, environment: { fingerprint: "e".repeat(64), receipt: "runtime-and-rom.json" }, issues: [] };
}
function input(): PatchComparison {
  return { patchId: "action-bias", target, changedFeature: "action-bias-v1", stage: "screening", speedMarginPercent: 10, completionTolerance: 0,
    incumbent: { preset: "inc-v1", flags: { "action-bias-v1": false }, trials: Array.from({ length: 4 }, (_, i) => trial(`inc-${String(i)}`, "incumbent", 1000 + i * 100)) },
    candidate: { preset: "candidate-v1", flags: { "action-bias-v1": true }, trials: Array.from({ length: 4 }, (_, i) => trial(`new-${String(i)}`, "candidate", 500 + i * 100)) } };
}

function first(p: PatchComparison): PatchTrial {
  const value = p.candidate.trials[0]; if (value === undefined) throw new Error("missing fixture"); return value;
}

describe("passive patch comparison", () => {
  it("reports four-per-arm completion and speed, requiring fresh confirmation", () => {
    const r = comparePatchResults(input());
    expect(r.eligible).toBe(true); expect(r.verdict).toBe("improve"); expect(r.recommendation).toBe("confirm");
    expect(r.incumbent.reached).toBe(4); expect(r.incumbent.elapsedMs?.median).toBe(1150); expect(r.candidate.elapsedMs?.median).toBe(650);
    expect(r.trials[0]?.evidence).toEqual([1, 2]);
  });
  it("does not mistake fast failures for a faster speedrun", () => {
    const p = input(); p.candidate.trials = Array.from({ length: 4 }, (_, i) => trial(`fail-${String(i)}`, "candidate", null));
    const r = comparePatchResults(p); expect(r.verdict).toBe("regress"); expect(r.recommendation).toBe("discard"); expect(r.candidate.elapsedMs).toBeNull();
  });
  it("retains incomplete runs without promoting a partial cohort", () => {
    const p = input(); first(p).events = first(p).events.slice(0, -1);
    const r = comparePatchResults(p); expect(r.eligible).toBe(false); expect(r.recommendation).toBe("retain"); expect(r.candidate.incomplete).toBe(1);
  });
  it("rejects historical three-per-arm data and records actual denominators", () => {
    const p = input(); p.incumbent.trials.pop(); const r = comparePatchResults(p);
    expect(r.eligible).toBe(false); expect(r.incumbent.launched).toBe(3); expect(r.problems.join(" ")).toContain("four");
  });
  it.each(["legacy", "present", "missing", "false", "origin"])("does not earn progress from %s evidence", (mode) => {
    const p = input(); const es = first(p).events;
    const m = es.find((e) => e.type === "milestone"); const s = es.find((e) => e.type === "state");
    if (m?.type !== "milestone" || s?.type !== "state" || !("started" in s)) throw new Error("fixture");
    if (mode === "legacy") m.kind = "legacy";
    if (mode === "present") m.origin = "present_at_start";
    if (mode === "missing") m.evidence = [900];
    if (mode === "origin") delete m.origin;
    if (mode === "false") s.location = "INSIDE OF TRUCK";
    const r = comparePatchResults(p); expect(r.candidate.reached).toBe(3); expect(r.eligible).toBe(false);
  });
  it("fails closed on multiple changed flags and a metadata mismatch", () => {
    const p = input(); p.candidate.flags["other"] = true;
    expect(comparePatchResults(p).eligible).toBe(false);
    const q = input(); const e = first(q).events[0]; if (e?.type !== "run_start") throw new Error("fixture"); e.harness.commit = "d".repeat(40);
    expect(comparePatchResults(q).problems.join(" ")).toContain("provenance");
  });
  it("names harness bugs and retains affected trials", () => {
    const p = input(); first(p).issues.push({ kind: "harness_bug", message: "Wrong selected option", evidence: [1], invalidatesComparison: true });
    const r = comparePatchResults(p); expect(r.eligible).toBe(false); expect(r.recommendation).toBe("repair_and_rerun"); expect(r.trials).toHaveLength(8); expect(r.problems.join(" ")).toContain("harness bug");
  });
  it("only recommends keep after a qualified confirmation comparison", () => {
    const p = input(); p.stage = "confirmation"; expect(comparePatchResults(p).recommendation).toBe("keep");
  });
  it("retains incumbent when both arms fail or differences are small", () => {
    const p = input(); p.incumbent.trials = Array.from({ length: 4 }, (_, i) => trial(`old-fail-${String(i)}`, "incumbent", null)); p.candidate.trials = Array.from({ length: 4 }, (_, i) => trial(`new-fail-${String(i)}`, "candidate", null));
    expect(comparePatchResults(p).verdict).toBe("inconclusive");
    const q = input(); q.candidate.trials = Array.from({ length: 4 }, (_, i) => trial(`tie-${String(i)}`, "candidate", 1050 + i * 100)); expect(comparePatchResults(q).recommendation).toBe("retain");
  });
  it("detects slowdown and lower completion even with fast survivors", () => {
    const p = input(); p.candidate.trials = Array.from({ length: 4 }, (_, i) => trial(`slow-${String(i)}`, "candidate", 2000)); expect(comparePatchResults(p).verdict).toBe("regress");
    const q = input(); q.candidate.trials[0] = trial("one-fail", "candidate", null); expect(comparePatchResults(q).verdict).toBe("regress"); q.completionTolerance = 1; expect(comparePatchResults(q).verdict).toBe("inconclusive");
  });
  it("reports missing native event as a harness bug, not model failure", () => {
    const p = input(); first(p).events = first(p).events.filter((e) => e.type !== "milestone");
    const r = comparePatchResults(p); expect(r.trials.find((t) => t.run === "new-0")?.outcome).toBe("unqualified"); expect(r.recommendation).toBe("repair_and_rerun");
  });
  it("rejects stale state proof", () => {
    const p = input(); const es = first(p).events; const old = es.find((e) => e.type === "state"); if (old === undefined) throw new Error("fixture");
    es.splice(2, 0, { ...old, seq: 2, location: "INSIDE OF TRUCK" }); for (const e of es.slice(3)) e.seq++;
    expect(comparePatchResults(p).eligible).toBe(false);
  });
  it.each(["flags", "environment", "prompt", "probe", "dirty", "duplicate", "issue"])("rejects %s provenance without dropping data", (mode) => {
    const p = input(); const t = first(p); const e = t.events[0]; if (e?.type !== "run_start") throw new Error("fixture");
    if (mode === "flags") e.harness_features = [];
    if (mode === "environment") t.environment.fingerprint = "f".repeat(64);
    if (mode === "prompt") e.system_prompt = "changed unexpectedly";
    if (mode === "probe") e.harness_features.push("probe");
    if (mode === "dirty") e.harness.dirty = true;
    if (mode === "duplicate") p.candidate.trials[1] = t;
    if (mode === "issue") t.issues.push({ kind: "infrastructure", message: "Service unavailable", evidence: [999], invalidatesComparison: true });
    const r = comparePatchResults(p); expect(r.eligible).toBe(false); expect(r.trials).toHaveLength(8);
  });
  it("requires valid predeclared margins and a native target", () => {
    const p = input(); p.speedMarginPercent = 0; expect(() => comparePatchResults(p)).toThrow("margins");
    const q = input(); q.target = "GAME_RUNNING"; expect(() => comparePatchResults(q)).toThrow("native");
  });
  it("does not mutate recorded trials or presets", () => {
    const p = input(); const before = JSON.stringify(p); comparePatchResults(p); expect(JSON.stringify(p)).toBe(before);
  });

  it("rejects impossible timing, environment receipt gaps and malformed envelopes", () => {
    const p = input(); const m = first(p).events.find((e) => e.type === "milestone"); if (m === undefined) throw new Error("fixture"); m.t = time(5000); expect(comparePatchResults(p).problems.join(" ")).toContain("timing");
    const q = input(); first(q).environment.receipt = ""; expect(comparePatchResults(q).eligible).toBe(false);
    const r = input(); first(r).events.push({ ...first(r).events[0], seq: 99 } as RunEvent); expect(comparePatchResults(r).problems.join(" ")).toContain("terminal");
    const z = input(); first(z).events = []; expect(() => comparePatchResults(z)).toThrow("run_start");
  });
  it("requires actual truck evidence for first exit", () => {
    const p = input(); p.target = "FIRST_TRUCK_EXIT";
    for (const arm of [p.incumbent, p.candidate]) for (const t of arm.trials) for (const e of t.events) if (e.type === "milestone") { e.name = p.target; e.kind = "story"; }
    expect(comparePatchResults(p).eligible).toBe(false);
    for (const arm of [p.incumbent, p.candidate]) for (const t of arm.trials) {
      const state = t.events.find((e) => e.type === "state"); if (state === undefined) throw new Error("fixture");
      for (const e of t.events.slice(1)) e.seq++;
      t.events.splice(1, 0, { ...state, seq: 1, location: "INSIDE OF TRUCK" });
      const m = t.events.find((e) => e.type === "milestone"); if (m?.type !== "milestone") throw new Error("fixture"); m.evidence = [1, 2];
    }
    expect(comparePatchResults(p).incumbent.reached).toBe(4);
  });
  it("uses completion-first verdict when the incumbent never reached target", () => {
    const p = input(); p.incumbent.trials = Array.from({ length: 4 }, (_, i) => trial(`old-zero-${String(i)}`, "incumbent", null));
    const r = comparePatchResults(p); expect(r.verdict).toBe("improve"); expect(r.timeChangePercent).toBeNull();
  });

  it("does not grade entirely unsupported states as valid target failure", () => {
    const p = input(); const t = first(p); t.events = t.events.filter((e) => e.type !== "milestone");
    for (const e of t.events) if (e.type === "state" && "started" in e) { e.location = null; e.started = false; e.screen = "unknown"; }
    const r = comparePatchResults(p); expect(r.eligible).toBe(false); expect(r.trials.find((x) => x.run === "new-0")?.coverage.unknown).toBe(1); expect(r.trials.find((x) => x.run === "new-0")?.outcome).toBe("unqualified");
  });

  it("requires explicit OFF values instead of relying on defaults", () => {
    const p = input(); p.candidate.flags["undeclared-default"] = false; expect(comparePatchResults(p).eligible).toBe(false);
  });

  it("renders denominators, flags, evidence and harness bugs without promotion claims", () => {
    const p = input(); first(p).issues.push({ kind: "harness_bug", message: "Wrong <screen> | selected\noption", evidence: [1], invalidatesComparison: true });
    const text = renderPatchResults(comparePatchResults(p)); expect(text).toContain("4/4"); expect(text).toContain("HARNESS BUG"); expect(text).toContain("action-bias-v1"); expect(text).toContain("target evidence"); expect(text).not.toContain("<screen>");
    p.candidate.trials = Array.from({ length: 4 }, (_, n) => trial(`budget-${String(n)}`, "candidate", null)); expect(renderPatchResults(comparePatchResults(p))).toContain("not reached");
  });

  it("requires latest referenced state itself to reach the target", () => {
    const p = input(); const es = first(p).events; const old = es.find((e) => e.type === "state"); if (old === undefined) throw new Error("fixture");
    es.splice(2, 0, { ...old, seq: 2, location: "INSIDE OF TRUCK" }); for (const e of es.slice(3)) e.seq++;
    const marker = es.find((e) => e.type === "milestone"); if (marker?.type !== "milestone") throw new Error("fixture"); marker.evidence = [1, 2];
    const r = comparePatchResults(p); expect(r.candidate.reached).toBe(3); expect(r.eligible).toBe(false); expect(r.problems.join(" ")).toContain("expected true, observed false at state #2");
  });
  it("does not reuse latest truck state as an earlier exit baseline", () => {
    const p = input(); p.target = "FIRST_TRUCK_EXIT";
    const es = first(p).events; const state = es.find((e) => e.type === "state"); if (state === undefined) throw new Error("fixture");
    es.splice(2, 0, { ...state, seq: 2, location: "INSIDE OF TRUCK" }); for (const e of es.slice(3)) e.seq++;
    for (const arm of [p.incumbent, p.candidate]) for (const t of arm.trials) for (const e of t.events) if (e.type === "milestone") { e.name = p.target; e.kind = "story"; if (t === first(p)) e.evidence = [1, 2]; }
    expect(comparePatchResults(p).candidate.reached).toBe(0);
  });
  it("rejects an unrelated cross-arm prompt change", () => {
    const p = input(); for (const t of p.candidate.trials) { const e = t.events[0]; if (e?.type !== "run_start") throw new Error("fixture"); e.system_prompt = "Unrelated behavior change"; }
    const r = comparePatchResults(p); expect(r.eligible).toBe(false); expect(r.problems.join(" ")).toContain("Undeclared cross-arm prompt");
  });

  it("accepts only an explicit audited prompt pair tied to this changed factor", () => {
    const p = input(); const incumbent = p.incumbent.trials[0]?.events[0]; if (incumbent?.type !== "run_start") throw new Error("fixture");
    const candidatePrompt = "Declared action-bias wording";
    for (const t of p.candidate.trials) { const e = t.events[0]; if (e?.type !== "run_start") throw new Error("fixture"); e.system_prompt = candidatePrompt; }
    p.allowedPromptChange = { changedFeature: p.changedFeature, incumbentSha256: createHash("sha256").update(incumbent.system_prompt).digest("hex"), candidateSha256: createHash("sha256").update(candidatePrompt).digest("hex"), auditReceipt: "predeclared-prompt-pair.json" };
    const r = comparePatchResults(p); expect(r.eligible).toBe(true); expect(r.configuration.allowedPromptChange).toEqual(p.allowedPromptChange); expect(renderPatchResults(r)).toContain("predeclared-prompt-pair.json");
    p.allowedPromptChange.changedFeature = "unrelated-factor"; expect(comparePatchResults(p).eligible).toBe(false);
    p.allowedPromptChange.changedFeature = p.changedFeature; p.allowedPromptChange.auditReceipt = ""; expect(comparePatchResults(p).eligible).toBe(false);
    p.allowedPromptChange.auditReceipt = "receipt.json"; p.allowedPromptChange.incumbentSha256 = "invalid"; expect(comparePatchResults(p).eligible).toBe(false);
    p.allowedPromptChange.incumbentSha256 = "e".repeat(64); expect(comparePatchResults(p).problems.join(" ")).toContain("audited hash");
    p.allowedPromptChange.incumbentSha256 = createHash("sha256").update(incumbent.system_prompt).digest("hex"); p.allowedPromptChange.candidateSha256 = "f".repeat(64); expect(comparePatchResults(p).problems.join(" ")).toContain("audited hash");
  });

});

function evaluationInput(changedFeature="deterministic-loop-guard-v1"):PatchComparison{
 const p=input();p.changedFeature=changedFeature;
 for(const arm of ["incumbent","candidate"] as const){p[arm].flags={[changedFeature]:arm==="candidate"};for(const trial of p[arm].trials){const start=trial.events[0];if(start?.type!=="run_start")throw new Error("fixture");const flags={loopGuard:changedFeature==="deterministic-loop-guard-v1"&&arm==="candidate",activeUi:true,interfaceDocs:true,objectives:true};start.evaluation={preset_id:`${arm}-trial-${trial.events[0]?.run??""}`,target:p.target,failure_limit:3,flags};start.harness_features=["active-ui-ownership-v1","contextual-interface-docs-v1","objective-tracking-v1","native-target-stop-v1",...(arm==="candidate"?[changedFeature]:[])];}}
 return p;
}
it("compares evaluation contracts while ignoring preset identity and only the declared loop flag",()=>{const p=evaluationInput();expect(comparePatchResults(p).eligible).toBe(true);});
it.each(["target","failure","activeUi","interfaceDocs","objectives","loopOtherFactor"])("rejects differing evaluation %s",mode=>{const p=evaluationInput(mode==="loopOtherFactor"?"action-bias-v1":undefined);const start=first(p).events[0];if(start?.type!=="run_start"||start.evaluation===undefined)throw new Error("fixture");if(mode==="target")start.evaluation.target="CLOCK_SET";else if(mode==="failure")start.evaluation.failure_limit=4;else{const key=mode==="loopOtherFactor"?"loopGuard":mode;if(key!=="loopGuard"&&key!=="activeUi"&&key!=="interfaceDocs"&&key!=="objectives")throw new Error("fixture key");start.evaluation.flags[key]=!start.evaluation.flags[key];const feature={loopGuard:"deterministic-loop-guard-v1",activeUi:"active-ui-ownership-v1",interfaceDocs:"contextual-interface-docs-v1",objectives:"objective-tracking-v1"}[key];start.harness_features=start.evaluation.flags[key]?[...start.harness_features,feature]:start.harness_features.filter(value=>value!==feature);}expect(comparePatchResults(p).eligible).toBe(false);});
it.each(["loopGuard","activeUi","interfaceDocs","objectives"] as const)("rejects recorded evaluation %s contradicting actual features",key=>{const p=evaluationInput();for(const arm of ["incumbent","candidate"] as const)for(const trial of p[arm].trials){const start=trial.events[0];if(start?.type!=="run_start"||start.evaluation===undefined)throw new Error("fixture");start.evaluation.flags[key]=!start.evaluation.flags[key];}expect(comparePatchResults(p).eligible).toBe(false);});
it("requires comparison target to match the common evaluation target",()=>{const p=evaluationInput();for(const arm of ["incumbent","candidate"] as const)for(const trial of p[arm].trials){const start=trial.events[0];if(start?.type!=="run_start"||start.evaluation===undefined)throw new Error("fixture");start.evaluation.target="CLOCK_SET";}expect(comparePatchResults(p).eligible).toBe(false);});

it("requires native target instrumentation in evaluation records",()=>{const p=evaluationInput();for(const arm of ["incumbent","candidate"] as const)for(const trial of p[arm].trials){const start=trial.events[0];if(start?.type!=="run_start")throw new Error("fixture");start.harness_features=start.harness_features.filter(feature=>feature!=="native-target-stop-v1");}expect(comparePatchResults(p).eligible).toBe(false);});
it.each(["activeUi","interfaceDocs","objectives"] as const)("ignores only declared evaluation factor %s",key=>{const features={activeUi:"active-ui-ownership-v1",interfaceDocs:"contextual-interface-docs-v1",objectives:"objective-tracking-v1"};const p=evaluationInput(features[key]);for(const arm of ["incumbent","candidate"] as const)for(const trial of p[arm].trials){const start=trial.events[0];if(start?.type!=="run_start"||start.evaluation===undefined)throw new Error("fixture");start.evaluation.flags[key]=arm==="candidate";if(arm==="incumbent")start.harness_features=start.harness_features.filter(feature=>feature!==features[key]);}expect(comparePatchResults(p).eligible).toBe(true);});

it.each([[599999,true],[600000,true],[600001,false]] as const)("grades evaluation target at %sms against the recorded cap",(at,reached)=>{
 const p=evaluationInput();for(const arm of ["incumbent","candidate"] as const)for(const trial of p[arm].trials){const start=trial.events[0];if(start?.type!=="run_start")throw new Error("fixture");start.budgets.max_wall_ms=600000;}
 const es=first(p).events;for(const event of es)if(event.type==="state"||event.type==="milestone")event.t=time(at);const end=es.at(-1);if(end?.type!=="run_end")throw new Error("fixture");end.t=time(601000);end.wall_ms=601000;end.reason=reached?"model_error":"budget";
 const result=comparePatchResults(p);expect(result.eligible).toBe(true);expect(result.trials.find(trial=>trial.run==="new-0")).toMatchObject({outcome:reached?"reached":"not_reached",elapsedMs:reached?at:null,evidence:[1,2],coverage:{positive:1,negative:0,unknown:0}});expect(result.recommendation).not.toBe("repair_and_rerun");
});
it("rejects a target-stop completion claim whose native evidence is past the evaluation cap",()=>{
 const p=evaluationInput();for(const arm of ["incumbent","candidate"] as const)for(const trial of p[arm].trials){const start=trial.events[0];if(start?.type!=="run_start")throw new Error("fixture");start.budgets.max_wall_ms=600000;}
 const es=first(p).events;for(const event of es)if(event.type==="state"||event.type==="milestone")event.t=time(600001);const end=es.at(-1);if(end?.type!=="run_end")throw new Error("fixture");end.t=time(601000);end.wall_ms=601000;end.target_proof={name:target,milestone_seq:2,state_evidence:[1]};
 const result=comparePatchResults(p);expect(result.eligible).toBe(false);expect(result.problems.join(" ")).toContain("target stop exceeds evaluation wall cap");
});

it("keeps historical no-evaluation grading unchanged and rejects missing evaluation caps",()=>{
 const old=input();for(const arm of ["incumbent","candidate"] as const)for(const trial of old[arm].trials){const start=trial.events[0];if(start?.type!=="run_start")throw new Error("fixture");start.budgets.max_wall_ms=100;}
 expect(comparePatchResults(old).eligible).toBe(true);expect(comparePatchResults(old).candidate.reached).toBe(4);
 const current=evaluationInput();for(const arm of ["incumbent","candidate"] as const)for(const trial of current[arm].trials){const start=trial.events[0];if(start?.type!=="run_start")throw new Error("fixture");delete start.budgets.max_wall_ms;}
 expect(comparePatchResults(current).eligible).toBe(false);
});

it.each(["incumbent", "candidate"] as const)("excludes a human controller spoofing model provenance from the %s patch arm", arm => {
  const p = input();
  const trial = p[arm].trials[0];
  const start = trial?.events[0];
  if (trial === undefined || start?.type !== "run_start") throw new Error("fixture");
  // Keep the same model, sampling, features and native milestone proof: controller identity owns eligibility.
  start.controller = { kind: "human", name: "Operator", rom_sha1: "c".repeat(40), input_policy: "frame-held-v1", sample_ms: 100, nominal_fps: 59.7275 };
  const result = comparePatchResults(p);
  expect(result.eligible).toBe(false);
  expect(result.problems).toContain(`${start.run}: human session is not a benchmark trial`);
  expect(result[arm]).toMatchObject({ launched: 4, reached: 3, elapsedMs: { count: 3 }, targetTurns: { count: 3 } });
  expect(result.trials.find(t => t.run === start.run)).toMatchObject({ outcome: "unqualified", elapsedMs: null, targetTurn: null, evidence: [] });
  expect(result.trials).toHaveLength(8);
  expect(result.recommendation).toBe("retain");
});

it("retains human trial diagnostics without producing model arm timing distributions", () => {
  const p = input();
  for (const arm of [p.incumbent, p.candidate]) for (const trial of arm.trials) {
    const start = trial.events[0];
    if (start?.type !== "run_start") throw new Error("fixture");
    start.controller = { kind: "human", name: "Operator", rom_sha1: "c".repeat(40), input_policy: "frame-held-v1", sample_ms: 100, nominal_fps: 59.7275 };
  }
  const result = comparePatchResults(p);
  expect(result.eligible).toBe(false);
  expect(result.incumbent).toMatchObject({ launched: 4, reached: 0, elapsedMs: null, targetTurns: null });
  expect(result.candidate).toMatchObject({ launched: 4, reached: 0, elapsedMs: null, targetTurns: null });
  expect(result.timeChangePercent).toBeNull();
  expect(result.trials.every(t => t.outcome === "unqualified" && t.coverage.positive === 1)).toBe(true);
});
