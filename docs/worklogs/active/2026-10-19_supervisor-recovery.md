# Whole-map supervisor recovery

## Authorization and scope
Operator approved implementing ineffective-navigation-v2, supervisor-briefing-v2, reachable-story-guidance-v1 and text-only-supervisor-v2. All four must be ON in experiments/fixed/bundle-v-control.json bundle and OFF in control. Globally omitted switches default OFF. Preserve current recorded runs and frozen campaign checkouts; no measured launch or experiment approval.

## Ownership and invariants
- LoopDetector owns episode lifecycle and typed loop_guard events. Failed-navigation detection uses observed outcomes, not reasoning similarity; excludes battle, menus, locked/transition/unknown states, successful partial navigation and changing conditions.
- SupervisorBriefing owns focused messages using only already delivered game evidence, with bounded alternatives and recent attempts; full raw history remains unchanged.
- HarnessTrust owns the prominent goal and walk-away guidance. Reachability qualifies local exits; missing/malformed reach evidence must remain unknown, not a claim of accessibility. No autonomous route choice or input.
- Governor owns text-only retry policy. Warnings must reflect replyFailuresEndRun; budgets and stop behavior stay unchanged.
- Each new switch OFF preserves pre-change model input/actions exactly. Existing switches stay intact.

## Milestones
1. Worklog and isolated checkout; RED behavior/factory/arm tests.
2. Implement four switches, registry/defaults, bundle/control, focused tests and OFF parity.
3. Explain mechanisms, register four pending experiments (no queue position), readiness bookkeeping.
4. Full tests/lint/build/coverage/vendor, adversarial wiring deletion/restoration, schema-valid recorded replay and local viewer/explainer proof as applicable.
5. Principles PB1-PB13 self-review, frozen packet and Claude/Grok/GPT independent cloud reviews; max two blocker-producing rounds before operator checkpoint. Land locally only when the repository gate permits it.
6. Post-landing tests/live viewer verification; record merge SHA and limitations. **After the reviewed change has landed on main and needed evidence has been preserved, delete this feature branch and archive/remove its worktree. Do not clean up an unlanded branch or lose review/evidence artifacts.**

## Load-bearing choices
Detection: bounded recent no-progress attempts across distinct navigation coordinates; a turn/small move alone does not discharge that episode. Qualifying interaction, sustained displacement, changed relevant world conditions or native story progress can recover. Thresholds and exact qualifiers will be documented with tests. Existing successful navigation and other loop kinds retain their contracts.
Reachability: current-map reach labels qualify local goal ways; do not invent a multi-map walkthrough or claim shortest-path distances. Existing flood is optimistic and is not the navigation solver.
Text-only: no new termination policy; unlimited-reply configurations keep their current budget semantics.

## Evidence
Audit run: 2026-10-19T16-13-42-353Z_qwen36-gpu0_petalburg2h-r6-whole-map, pin b419848eb9f0. Route104 T184-236: 53 navigation calls without trying listed woods entrance. T408-491: 84 text-only replies, no tool call; third-note stop claim contradicts replyFailuresEndRun=false. Three sampled frames/raw archives validated and positions reparsed. No causal performance claim.

## Session log
- Created isolated managed checkout from main 63b6236f, branch codex/supervisor-recovery; unrelated dirty viewer work is untouched.
- Worklog written before implementation. Required skills: feature-switch, agent-observability, feature-explainer, experiment-queue and execute-worklog review contract.

## Multi-Model Review Log
Pending implementation and gates; no review or landing claimed.

- RED: navigation outcome detector import missing; bundle/default test fails undefined vs false. Exact log runs/supervisor-recovery/red.log.

- GREEN implementation: registered four default-OFF switches; fixed arm builder and regression tests prove all four ON in bundle and OFF in control. Existing switches retained. Historical all-on fixtures now explicitly hold the four new treatments OFF; registry offset expectations account for append-only growth. The generic feature round-trip property test still covers every current switch, including the four additions.
- Production proof: retained source-pinned whole-map T194–200 fixture (no reasoning) triggers a new ineffective warning across changed coordinates; the actual pinned pi loop receives the focused briefing before its next decision. Live-entrypoint tests cover enabled/disabled reply stopping, recorded note text and short post-limit reminder. Factory tests cover reachable header ON/OFF and exact legacy OFF bytes. New loop notices validate against the existing schema; no event-contract change.
- Mutations: eight separate wiring/operand deletions each caused assertion failures (navigation-factory, navigation-recovery, focused-loop, focused-text-only, reachable-factory, reachable-local-edge, text-only-live-policy, text-only-live-reminder). Every source restored; unique logs and mutations.json retained under runs/supervisor-recovery. Restoration suite passing, final full gates below.
- Coverage qualification: one preexisting unchanged people-id-cards-delivery test exceeded its 5-second timeout under concurrent lint+coverage; isolated coverage run passed all 8 tests (subset coverage percentage intentionally fails the global floor and is not a gate). Full coverage passed without changing tests, timeouts, concurrency settings or floors. First Python run lacked ROM and skipped native fixtures; rerun with the actual external ROM passed 2724 Python tests, zero skips. Agent 2581 and viewer 1236 passed; metrics before the final focused-interface assertion: agent lines 99.27/branches93.90/functions98.19%; viewer lines97.72/branches91.37/functions93.98%; Python lines97.12/branches92.85/functions100%.
- Explainability: four tracked self-contained pages, mappings, exact-byte server tests and pending standalone registrations. Real browser on isolated port8797, explicitly synthetic UI fixture: clicked each new Harness Config card link and opened the correct page. Desktop/phone screenshots under runs/supervisor-recovery; pages-check passes. No source/model/server of a measured run was changed; no GPU inference or experiment approval/launch.
- Review scope remains four treatments plus registry/presets/bundle, tests and documentation. Topology-only cross-map walk-away warnings are suppressed under reachable-story-guidance-v1 because a map graph cannot qualify the disconnected current component; local distance warnings require foot-qualified exits. Reachability is an optimistic flood, not a navigation guarantee.

- Final GREEN gates: final-build.log, final-test.log, final-coverage.log, final-verify-vendor.log and final-experiments-check.log all exit 0; final-gates.json records commands/durations. lint-final.log passes TS/ESLint and Python ruff/mypy. Configured external ROM; no skipped tests. All source restored after mutations. Worktree and branch cleanup remains required only after reviewed main landing and evidence preservation.
