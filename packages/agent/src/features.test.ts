import { expect, it } from "vitest";
import { ALL_ON, FEATURES, stateOnlyProblems, MEASUREMENT_FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, serverFeatureEnv, type FeatureSet } from "./features.js";

// Literal run_start lists written by live.ts at 0632fc0 with every flag on.
const LEGACY_DEFAULT = ["ram-state-v1", "live-map-v1", "field-control-lock", "naming-cursor-v1", "live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1", "warp-activation-guidance-v1", "clock-milestone-v1", "story-state-v1", "active-ui-ownership-v1", "story-milestones-v2", "new-game-created-v1", "post-clock-navigation-milestones-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "remaining-native-milestones-v1", "deterministic-loop-diagnostics-v1", "deterministic-loop-policy-v1:p6:o3:a3:c3:r2:recovery6", "deterministic-loop-guard-v1", "contextual-interface-docs-v1", "objective-tracking-v1", "repeat-attempt-guard-v1", "native-objective-completion-v1"];
const off = (...ids: (typeof SWITCHABLE_FEATURES)[number][]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });

it("describes every switchable and measurement feature exactly once", () => {
  expect(FEATURES.map((f) => f.id).sort()).toEqual([...SWITCHABLE_FEATURES, ...MEASUREMENT_FEATURES].sort());
  expect(FEATURES.filter((f) => f.switchable).map((f) => f.id)).toEqual([...SWITCHABLE_FEATURES]);
  expect(FEATURES.filter((f) => f.group === "observation")).toHaveLength(17);
  expect(FEATURES.filter((f) => f.group === "guidance")).toHaveLength(24);
  expect(FEATURES.filter((f) => f.group === "guard")).toHaveLength(11);
  for (const f of FEATURES) {
    expect(f.title).not.toBe("");
    if (f.switchable) expect(f.description).toMatch(/ Off: /);
    if (f.needs !== null) expect(SWITCHABLE_FEATURES).toContain(f.needs);
  }
  expect(() => featureInfo("invented" as "ram-state-v1")).toThrow(/unknown feature/);
});

it("retains the legacy information list while adding mandatory raw recording", () => {
  const recorded = [...LEGACY_DEFAULT.slice(0,25), "full-raw-ram-v1", ...LEGACY_DEFAULT.slice(25,26), "birch-rescue-requested-v1", "rival-house-exit-v1", "route-101-after-handoff-v1", ...LEGACY_DEFAULT.slice(26)];
  expect(playHarnessFeatures(off("navigation-evidence-memory-v1","game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-details-v2","dialogue-auto-advance-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","automatic-running-v1","expanded-menu-battle-information-v1","state-only-decisions-v1","named-interactions-v1","world-destinations-v1","bounded-navigation-v1","ledge-hops-v1","one-way-tiles-v1","counter-talk-v1","walkable-floor-v1","full-map-navigation-v1","grass-cost-navigation-v1","elevation-transitions-v1"), null)).toEqual(recorded);
  expect(playHarnessFeatures(off("navigation-evidence-memory-v1","game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-details-v2","dialogue-auto-advance-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","automatic-running-v1","expanded-menu-battle-information-v1","state-only-decisions-v1","named-interactions-v1","world-destinations-v1","bounded-navigation-v1","ledge-hops-v1","one-way-tiles-v1","counter-talk-v1","walkable-floor-v1","full-map-navigation-v1","grass-cost-navigation-v1","elevation-transitions-v1"), "PLAYER_NAME_CONFIRMED")).toEqual([...recorded.slice(0, 30), "native-target-stop-v1", ...recorded.slice(30)]);
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
  expect(dependencyProblems(off("live-map-v1"))).toEqual(["world-coordinate-grid-v1 needs live-map-v1", "bounded-navigation-v1 needs live-map-v1", "warp-activation-guidance-v1 needs live-map-v1", "ledge-hops-v1 needs live-map-v1", "one-way-tiles-v1 needs live-map-v1", "counter-talk-v1 needs live-map-v1", "named-warp-destinations-v1 needs live-map-v1"]);
  expect(dependencyProblems(off("objective-tracking-v1"))).toEqual(["repeat-attempt-guard-v1 needs objective-tracking-v1", "native-objective-completion-v1 needs objective-tracking-v1"]);
  expect(dependencyProblems(off("objective-tracking-v1", "repeat-attempt-guard-v1", "native-objective-completion-v1"))).toEqual([]);
});

it("hands the game server only its own observation switches", () => {
  expect(serverFeatureEnv(ALL_ON)).toEqual({ POKEBENCH_ACTIVE_UI: "1", POKEBENCH_FEATURES_OFF: "" });
  expect(serverFeatureEnv(off("active-ui-ownership-v1", "deterministic-loop-guard-v1", "press-result-v1"))).toEqual({ POKEBENCH_ACTIVE_UI: "0", POKEBENCH_FEATURES_OFF: "" });
  expect(serverFeatureEnv(off("story-state-v1", "live-map-v1", "warp-activation-guidance-v1"))).toEqual({ POKEBENCH_ACTIVE_UI: "1", POKEBENCH_FEATURES_OFF: "live-map-v1,story-state-v1,warp-activation-guidance-v1" });
});

it("keeps the objective record from outliving the RAM readout", () => {
  expect(dependencyProblems(off("navigation-evidence-memory-v1","game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-details-v2","dialogue-auto-advance-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","automatic-running-v1","expanded-menu-battle-information-v1", "state-only-decisions-v1", "named-interactions-v1", "world-destinations-v1", "bounded-navigation-v1", "ledge-hops-v1", "one-way-tiles-v1","counter-talk-v1","walkable-floor-v1","full-map-navigation-v1","grass-cost-navigation-v1", "ram-state-v1", "live-map-v1", "live-player-position-v1", "world-coordinate-grid-v1", "live-object-sprites-v1", "world-targets-v1", "active-field-message-buffer-v1", "naming-cursor-v1", "story-state-v1", "coordinate-script-conditions-v1", "active-ui-ownership-v1", "press-result-v1", "field-control-lock", "warp-activation-guidance-v1"))).toEqual(["objective-tracking-v1 needs ram-state-v1"]);
});

it("records and delivers the independently switchable interaction-name treatment",()=>{
 expect(playHarnessFeatures(ALL_ON,null)).toContain("named-interactions-v1");
 expect(playHarnessFeatures(off("named-interactions-v1"),null)).not.toContain("named-interactions-v1");
 expect(serverFeatureEnv(off("named-interactions-v1")).POKEBENCH_FEATURES_OFF).toBe("named-interactions-v1");
 expect(dependencyProblems(off("world-targets-v1"))).toContain("named-interactions-v1 needs world-targets-v1");
});

it("registers whole-map navigation as a navigation-dependent server treatment recorded last",()=>{
 expect(featureInfo("full-map-navigation-v1")).toMatchObject({group:"guidance",needs:"bounded-navigation-v1",switchable:true});
 expect(playHarnessFeatures(ALL_ON,null).at(-19)).toBe("full-map-navigation-v1");
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
 expect(playHarnessFeatures(ALL_ON,null).at(-17)).toBe("elevation-transitions-v1");
 expect(serverFeatureEnv(off("elevation-transitions-v1")).POKEBENCH_FEATURES_OFF).toBe("");
 expect(dependencyProblems(off("bounded-navigation-v1","full-map-navigation-v1","grass-cost-navigation-v1","navigation-refusal-reasons-v1"))).toEqual([]);
});

it("records counter talk as a server-side map treatment that needs the live map",()=>{
 expect(featureInfo("counter-talk-v1")).toMatchObject({group:"guidance",needs:"live-map-v1",switchable:true});
 expect(featureInfo("counter-talk-v1").description).toMatch(/talk across/);
 expect(playHarnessFeatures(ALL_ON,null)).toContain("counter-talk-v1");
 expect(serverFeatureEnv(off("counter-talk-v1")).POKEBENCH_FEATURES_OFF).toBe("counter-talk-v1");
});

it("records walkable floor as an agent-side navigate_to treatment that drafts can leave on while navigation is off",()=>{
 expect(featureInfo("walkable-floor-v1")).toMatchObject({group:"guidance",needs:null,switchable:true});
 expect(featureInfo("walkable-floor-v1").description).toMatch(/sand/);
 expect(playHarnessFeatures(ALL_ON,null)).toContain("walkable-floor-v1");
 expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("");
 expect(serverFeatureEnv(off("walkable-floor-v1")).POKEBENCH_FEATURES_OFF).toBe("");
 expect(dependencyProblems(off("bounded-navigation-v1")).join()).not.toContain("walkable-floor-v1");
});

it("records grass cost as an agent-side planner treatment that needs bounded navigation",()=>{
 expect(featureInfo("grass-cost-navigation-v1")).toMatchObject({group:"guidance",needs:"bounded-navigation-v1",switchable:true});
 expect(dependencyProblems(off("bounded-navigation-v1"))).toContain("grass-cost-navigation-v1 needs bounded-navigation-v1");
 expect(playHarnessFeatures(ALL_ON,null).at(-18)).toBe("grass-cost-navigation-v1");
 expect(serverFeatureEnv(off("grass-cost-navigation-v1")).POKEBENCH_FEATURES_OFF).toBe("");
});

it("registers game evidence priority as standalone prompt guidance",()=>{
  expect(featureInfo("game-evidence-priority-v1")).toMatchObject({group:"guidance",needs:null,switchable:true});
  expect(playHarnessFeatures(ALL_ON,null).at(-16)).toBe("game-evidence-priority-v1");
  expect(serverFeatureEnv(off("game-evidence-priority-v1")).POKEBENCH_FEATURES_OFF).toBe("");
});

it("registers fresh retry as an agent-side guard recorded fourth to last",()=>{
 expect(featureInfo("fresh-retry-v1")).toMatchObject({group:"guard",needs:null,switchable:true});
 expect(featureInfo("fresh-retry-v1").description).toContain(" Off: ");
 expect(playHarnessFeatures(ALL_ON,null).at(-10)).toBe("fresh-retry-v1");
 expect(serverFeatureEnv(off("fresh-retry-v1")).POKEBENCH_FEATURES_OFF).toBe("");
});

it("registers named warp destinations as a default-off server readout treatment recorded third to last",()=>{
 expect(featureInfo("named-warp-destinations-v1")).toMatchObject({group:"observation",needs:"live-map-v1",switchable:true});
 expect(featureInfo("named-warp-destinations-v1").description).toContain(" Off: ");
 expect(featureInfo("named-warp-destinations-v1").description).toMatch(/map 1\/2/);
 expect(featureInfo("named-warp-destinations-v1").description).toContain("LITTLEROOT TOWN (dynamic warp; map 0/9)");
 expect(featureInfo("named-warp-destinations-v1").description).not.toContain("Unknown and dynamic destinations keep their ID");
 expect(playHarnessFeatures(ALL_ON,null).at(-9)).toBe("named-warp-destinations-v1");
 expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("");
 expect(serverFeatureEnv(off("named-warp-destinations-v1")).POKEBENCH_FEATURES_OFF).toBe("named-warp-destinations-v1");
 expect(dependencyProblems(off("live-map-v1"))).toContain("named-warp-destinations-v1 needs live-map-v1");
});

it("registers the milestone stall stop as a default-off agent-side guard recorded second to last",()=>{
 expect(featureInfo("milestone-stall-stop-v1")).toMatchObject({group:"guard",needs:null,switchable:true});
 expect(featureInfo("milestone-stall-stop-v1").description).toContain(" Off: ");
 expect(featureInfo("milestone-stall-stop-v1").description).toMatch(/10 minutes/);
 expect(playHarnessFeatures(ALL_ON,null).at(-8)).toBe("milestone-stall-stop-v1");
 expect(playHarnessFeatures(off("milestone-stall-stop-v1"),null)).not.toContain("milestone-stall-stop-v1");
 expect(serverFeatureEnv(off("milestone-stall-stop-v1")).POKEBENCH_FEATURES_OFF).toBe("");
});

it("registers the post-handoff Route 101 split as a measured feature recorded after the rival-house exit",()=>{
 expect(featureInfo("route-101-after-handoff-v1")).toMatchObject({switchable:false,needs:null});
 expect(featureInfo("route-101-after-handoff-v1").description).toMatch(/Route 101/);
 const recorded=playHarnessFeatures(ALL_ON,null);
 expect(recorded.indexOf("route-101-after-handoff-v1")).toBe(recorded.indexOf("rival-house-exit-v1")+1);
});

it("registers the rival-house exit split as a measured feature recorded with the Birch send-off",()=>{
 expect(featureInfo("rival-house-exit-v1")).toMatchObject({switchable:false,needs:null});
 expect(featureInfo("rival-house-exit-v1").description).toMatch(/rival/);
 const recorded=playHarnessFeatures(ALL_ON,null);
 expect(recorded.indexOf("rival-house-exit-v1")).toBe(recorded.indexOf("birch-rescue-requested-v1")+1);
});

it("registers the text-only supervisor as a default-off guard recorded last",()=>{
 expect(featureInfo("text-only-supervisor-v1")).toMatchObject({group:"guard",needs:null,switchable:true});
 expect(featureInfo("text-only-supervisor-v1").description).toContain(" Off: ");
 expect(playHarnessFeatures(ALL_ON,null).at(-7)).toBe("text-only-supervisor-v1");
 expect(playHarnessFeatures({...ALL_ON,"text-only-supervisor-v1":false},null)).not.toContain("text-only-supervisor-v1");
});

it("keeps the text-only supervisor out of state-only decisions, which deliver no follow-up messages",()=>{
 expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires text-only-supervisor-v1 OFF");
});

it("registers battle details v2 as a default-off server readout treatment that needs the expanded battle information, recorded last",()=>{
 expect(featureInfo("battle-details-v2")).toMatchObject({group:"observation",needs:"expanded-menu-battle-information-v1",switchable:true});
 expect(featureInfo("battle-details-v2").description).toContain(" Off: ");
 expect(featureInfo("battle-details-v2").description).toMatch(/PROF\. BIRCH/);
 // The RUN odds formula was dropped (runTries unread, u8 wrap): the card promises only the speed check.
 expect(featureInfo("battle-details-v2").description).not.toMatch(/formula/);
 expect(featureInfo("battle-details-v2").description).toContain("RUN also says whether escape is guaranteed by speed (the odds are not computed).");
 expect(playHarnessFeatures(ALL_ON,null).at(-2)).toBe("battle-details-v2");
 expect(playHarnessFeatures(off("battle-details-v2"),null)).not.toContain("battle-details-v2");
 expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("");
 expect(serverFeatureEnv(off("battle-details-v2")).POKEBENCH_FEATURES_OFF).toBe("battle-details-v2");
 expect(SERVER_FEATURES.at(-1)).toBe("battle-details-v2");
 expect(dependencyProblems(off("expanded-menu-battle-information-v1"))).toContain("battle-details-v2 needs expanded-menu-battle-information-v1");
});
