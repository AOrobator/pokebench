import { expect, it } from "vitest";
import { ALL_ON, FEATURES, MEASUREMENT_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, serverFeatureEnv, type FeatureSet } from "./features.js";

// Literal run_start lists written by live.ts at 0632fc0 with every flag on.
const LEGACY_DEFAULT = ["ram-state-v1", "live-map-v1", "field-control-lock", "naming-cursor-v1", "live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1", "warp-activation-guidance-v1", "clock-milestone-v1", "story-state-v1", "active-ui-ownership-v1", "story-milestones-v2", "new-game-created-v1", "post-clock-navigation-milestones-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "remaining-native-milestones-v1", "deterministic-loop-diagnostics-v1", "deterministic-loop-policy-v1:p6:o3:a3:c3:r2:recovery6", "deterministic-loop-guard-v1", "contextual-interface-docs-v1", "objective-tracking-v1", "repeat-attempt-guard-v1", "native-objective-completion-v1"];
const off = (...ids: (typeof SWITCHABLE_FEATURES)[number][]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });

it("describes every switchable and measurement feature exactly once", () => {
  expect(FEATURES.map((f) => f.id).sort()).toEqual([...SWITCHABLE_FEATURES, ...MEASUREMENT_FEATURES].sort());
  expect(FEATURES.filter((f) => f.switchable).map((f) => f.id)).toEqual([...SWITCHABLE_FEATURES]);
  expect(FEATURES.filter((f) => f.group === "observation")).toHaveLength(14);
  expect(FEATURES.filter((f) => f.group === "guidance")).toHaveLength(13);
  expect(FEATURES.filter((f) => f.group === "guard")).toHaveLength(6);
  for (const f of FEATURES) {
    expect(f.title).not.toBe("");
    if (f.switchable) expect(f.description).toMatch(/ Off: /);
    if (f.needs !== null) expect(SWITCHABLE_FEATURES).toContain(f.needs);
  }
  expect(() => featureInfo("invented" as "ram-state-v1")).toThrow(/unknown feature/);
});

it("retains the legacy information list while adding mandatory raw recording", () => {
  const recorded = [...LEGACY_DEFAULT.slice(0,25), "full-raw-ram-v1", ...LEGACY_DEFAULT.slice(25)];
  expect(playHarnessFeatures(off("navigation-evidence-memory-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","automatic-running-v1","expanded-menu-battle-information-v1","state-only-decisions-v1","named-interactions-v1","world-destinations-v1","bounded-navigation-v1","ledge-hops-v1","one-way-tiles-v1","full-map-navigation-v1","elevation-transitions-v1"), null)).toEqual(recorded);
  expect(playHarnessFeatures(off("navigation-evidence-memory-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","automatic-running-v1","expanded-menu-battle-information-v1","state-only-decisions-v1","named-interactions-v1","world-destinations-v1","bounded-navigation-v1","ledge-hops-v1","one-way-tiles-v1","full-map-navigation-v1","elevation-transitions-v1"), "PLAYER_NAME_CONFIRMED")).toEqual([...recorded.slice(0, 27), "native-target-stop-v1", ...recorded.slice(27)]);
});

it("drops exactly the switched-off id and round-trips through recorded features", () => {
  for (const id of SWITCHABLE_FEATURES) {
    const list = playHarnessFeatures(off(id), null);
    expect(playHarnessFeatures(ALL_ON,null).filter((item) => !list.includes(item))).toEqual([id]);
    expect(featuresOf(list)).toEqual(off(id));
  }
});

it("reports every unmet dependency", () => {
  expect(dependencyProblems(ALL_ON)).toEqual([]);
  expect(dependencyProblems(off("live-map-v1"))).toEqual(["world-coordinate-grid-v1 needs live-map-v1", "bounded-navigation-v1 needs live-map-v1", "warp-activation-guidance-v1 needs live-map-v1", "ledge-hops-v1 needs live-map-v1", "one-way-tiles-v1 needs live-map-v1"]);
  expect(dependencyProblems(off("objective-tracking-v1"))).toEqual(["repeat-attempt-guard-v1 needs objective-tracking-v1", "native-objective-completion-v1 needs objective-tracking-v1"]);
  expect(dependencyProblems(off("objective-tracking-v1", "repeat-attempt-guard-v1", "native-objective-completion-v1"))).toEqual([]);
});

it("hands the game server only its own observation switches", () => {
  expect(serverFeatureEnv(ALL_ON)).toEqual({ POKEBENCH_ACTIVE_UI: "1", POKEBENCH_FEATURES_OFF: "" });
  expect(serverFeatureEnv(off("active-ui-ownership-v1", "deterministic-loop-guard-v1", "press-result-v1"))).toEqual({ POKEBENCH_ACTIVE_UI: "0", POKEBENCH_FEATURES_OFF: "" });
  expect(serverFeatureEnv(off("story-state-v1", "live-map-v1", "warp-activation-guidance-v1"))).toEqual({ POKEBENCH_ACTIVE_UI: "1", POKEBENCH_FEATURES_OFF: "live-map-v1,story-state-v1,warp-activation-guidance-v1" });
});

it("keeps the objective record from outliving the RAM readout", () => {
  expect(dependencyProblems(off("navigation-evidence-memory-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","automatic-running-v1","expanded-menu-battle-information-v1", "state-only-decisions-v1", "named-interactions-v1", "world-destinations-v1", "bounded-navigation-v1", "ledge-hops-v1", "one-way-tiles-v1","full-map-navigation-v1", "ram-state-v1", "live-map-v1", "live-player-position-v1", "world-coordinate-grid-v1", "live-object-sprites-v1", "world-targets-v1", "active-field-message-buffer-v1", "naming-cursor-v1", "story-state-v1", "coordinate-script-conditions-v1", "active-ui-ownership-v1", "press-result-v1", "field-control-lock", "warp-activation-guidance-v1"))).toEqual(["objective-tracking-v1 needs ram-state-v1"]);
});

it("records and delivers the independently switchable interaction-name treatment",()=>{
 expect(playHarnessFeatures(ALL_ON,null)).toContain("named-interactions-v1");
 expect(playHarnessFeatures(off("named-interactions-v1"),null)).not.toContain("named-interactions-v1");
 expect(serverFeatureEnv(off("named-interactions-v1")).POKEBENCH_FEATURES_OFF).toBe("named-interactions-v1");
 expect(dependencyProblems(off("world-targets-v1"))).toContain("named-interactions-v1 needs world-targets-v1");
});

it("registers whole-map navigation as a navigation-dependent server treatment recorded last",()=>{
 expect(featureInfo("full-map-navigation-v1")).toMatchObject({group:"guidance",needs:"bounded-navigation-v1",switchable:true});
 expect(playHarnessFeatures(ALL_ON,null).at(-2)).toBe("full-map-navigation-v1");
 expect(serverFeatureEnv(off("full-map-navigation-v1")).POKEBENCH_FEATURES_OFF).toBe("full-map-navigation-v1");
 expect(dependencyProblems(off("bounded-navigation-v1"))).toContain("full-map-navigation-v1 needs bounded-navigation-v1");
});

it("records ledge hops as a server-side map treatment that needs the live map",()=>{
 expect(featureInfo("ledge-hops-v1")).toMatchObject({group:"guidance",needs:"live-map-v1",switchable:true});
 expect(featureInfo("ledge-hops-v1").description).toMatch(/one-way/);
 expect(playHarnessFeatures(ALL_ON,null)).toContain("ledge-hops-v1");
 expect(serverFeatureEnv(off("ledge-hops-v1")).POKEBENCH_FEATURES_OFF).toBe("ledge-hops-v1");
});

it("records one-way tiles as a server-side map treatment that needs the live map",()=>{
 expect(featureInfo("one-way-tiles-v1")).toMatchObject({group:"guidance",needs:"live-map-v1",switchable:true});
 expect(featureInfo("one-way-tiles-v1").description).toMatch(/walled side/);
 expect(playHarnessFeatures(ALL_ON,null)).toContain("one-way-tiles-v1");
 expect(serverFeatureEnv(off("one-way-tiles-v1")).POKEBENCH_FEATURES_OFF).toBe("one-way-tiles-v1");
});

it("registers the elevation transitions switch as a planner-only guidance feature",()=>{
 expect(featureInfo("elevation-transitions-v1")).toMatchObject({group:"guidance",needs:null,switchable:true});
 expect(featureInfo("elevation-transitions-v1").description).toMatch(/stairs/);
 expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe("elevation-transitions-v1");
 expect(serverFeatureEnv(off("elevation-transitions-v1")).POKEBENCH_FEATURES_OFF).toBe("");
 expect(dependencyProblems(off("bounded-navigation-v1","full-map-navigation-v1"))).toEqual([]);
});
