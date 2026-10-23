# Navigation cycle stop

## Authorized outcome and frozen scope

Human authorization relayed by coordinator on 2026-10-23: “implement the minimal cycle-stop fix and truthful feedback, put it behind a switch ON in the bundle, and finish tests, reviews, and landing. Keep current runs untouched.”

Stop a repeated internal local-navigation step within one model-selected navigate_to call. Independent `navigation-cycle-stop-v1`, default OFF, applicable bundle arms ON. OFF preserves input, status and prompt bytes. No planner redesign, automatic destination, muddy-slope repair, gameplay restart, inference or autoresearch change.

## Evidence and mechanism

GLM run `2026-10-22T20-40-54_glm53-mac_0d5d`, source `5bec91dc`, shipyard turns 1031/1032, results 117276/117886: RIGHT,LEFT four times per call, ending (15,3), followed by “call navigate_to again”. Archived raw snapshots reproduced the planner reversal at (15,3)/(16,3). Requested (6,5) is a solid tile outside the planning window. The observation window recenters on every step. Fixture preserves recorded pre-press states, raw references, native buttons, and outer result lines. Matching ROM SHA-1 f3ae088181bf583e55daf962a92bb46f4f1d07b7; game reference 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

## Invariants

- INV-1 OFF has byte-identical eight native attempts, result, tools and prompt.
- INV-2 ON stops before repeating an already attempted directional step at the same position/facing/local terrain/planned route/trigger state in this call, with truthful feedback and final observation.
- INV-3 Progress, turn-only input, changed geometry, map changes, locks, and later calls do not inherit stale cycle state. Full/visited navigation retains its existing convergence owner.
- INV-4 Registry/default/metadata/production wiring, bundle-only activation and explainer link agree.

## Milestone

- [x] RED recorded production-factory regressions
- [x] GREEN minimal guarded stop and switch wiring
- [ ] Deletion/restoration proof, normal gates, offline recorder delivery
- [ ] Frozen principles review, Claude/Grok/GPT independent verdicts, synthesis
- [ ] Landing board, FF merge, main tests, evidence, viewer-only refresh coordinated

## Evaluation and readiness

Activates on local navigation calls, no story milestone prerequisite. The recorded cycle is a deterministic correctness regression; no gameplay benefit measured or inference launch authorized. Merged/configured bundle state is distinct from a later run_start activation receipt.

## Session log

- Own managed worktree created from main; branch codex/navigation-cycle-stop. Current runs and services untouched.

- RED: focused recorded replay 5 tests: 3 pass (OFF and pinned planner), 2 fail (ON still makes eight alternating attempts). Initial fixture conversion retained event type and was corrected before accepting RED evidence. Receipt /tmp/navigation-cycle-red-2.log.

- RED commit `30faad23c`. First GREEN attempt found moving off-route NPC changed the whole grid object list in turn1032; identity now compares terrain plus the actual planned path. NPC occupancy remains authoritative in the planner, and an occupancy change that changes the route produces a different identity.

- GREEN focused regressions: 14 pass; production factory ON stops both recorded cycles after 2 attempts, OFF preserves exact eight inputs/status. Registry subset 133 pass. Initial full agent gate now 3936 pass; viewer gate exposed four old recipe suffix assertions, mechanically updated. Build passes. First lint found owned venv lacked mGBA; linked the already built canonical Python binding into the owned venv, no service or source change. Full gates pending.
- Standard bundle recipe set: bundle-v-control, bundle-v-control-2h, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, gym-rustboro-torchic, gym-rustboro-torchic-healed. Base false, switches entry true only in bundle; no source-pin rewrite.

- Synced landed move-learn-offer-identity-v1 main c69ad74a5 before review; retained its independent switch, tests and bundle settings. Mechanical registry suffix assertions rebuilt from current main plus one appended navigation switch. No active run pin changed.
