# Worklog: stale-story-goal-v2

## Problem Statement

`stale-story-goal-v1` keeps PROF. BIRCH's pre-handoff invitation to visit the POKéMON LAB active until the Pokédex is received. The game completes that invitation when the starter handoff advances `VAR_BIRCH_LAB_STATE` to stage 3, then later issues a distinct return-to-the-lab instruction after the Route 103 rival encounter. Current runs therefore receive a false active destination and an away-from-goal supervisor while the correct next step is to find the rival. When v1 does retire a line, `harness-trust-v1` prints `Story goal: none`, which conflates “no active place-bearing instruction” with “no story objective” and repeats the retired destination.

The authorized outcome is a new default-OFF `stale-story-goal-v2` switch. With v1 ON and v2 OFF, bytes and behavior remain today's. With v2 ON, a Birch-lab instruction is a stage-bound episode: a line first observed before stage 3 retires at stage 3; a distinct line first observed at stage 3 or later remains active until Pokédex receipt/stage 5. Retired or absent destination goals are omitted from the trust header and destination guidance; their source dialogue remains in the conversation ledger/history. The away supervisor receives no retired goal. No route, place, character, or next-step foreknowledge is injected.

`input-cuts-v1` is already ON in the bundle arm and OFF in its control arm. It continues to omit duplicate active goals. This branch does not change the fixed bundle, approve an experiment, launch a run, or promote v2.

## Skills Loaded

- `feature-switch`: v2 is independently registered, default OFF, with exact v1 behavior when OFF.
- `feature-explainer`: tracked local HTML, Harness Config mapping, route/card tests, visual verification.
- `experiment-queue`: pending entry only; no queue position, approval, or launch.
- `pokebench-patch-evaluation`: native activation boundary and readiness evidence; no benefit claim.
- `pokebench-game-state`: stage meanings grounded in the pinned pret/pokeemerald source.
- `agent-observability`: prove model-visible output and supervisor behavior through production wiring.
- `feature-worklog`, `execute-worklog`, `close-the-loop`: RED/GREEN commits, gates, review, and delivery receipts.

## Architecture

- Extend story-line state with the Birch lab stage observed when the line becomes durable.
- Add v2 retirement policy without changing v1: pre-stage-3 Birch-lab lines expire at stage 3; stage-3-or-later Birch-lab lines retain v1's Pokédex completion boundary.
- Thread `stale-story-goal-v2` through the production `FeatureSet`; require `stale-story-goal-v1` so v2 refines, rather than silently replaces, the incumbent policy.
- Under v2, omit a trust-header goal line when no active destination exists, including a just-retired episode. Keep ordinary trust facts such as characters and exits.
- Ensure destination guidance and the walk-away supervisor receive only the active episode.
- Register the switch in the feature catalog, presets, viewer default, Harness Config explainer mapping, and a pending experiment entry.

## Invariants

- **INV-1 — Exact OFF arm:** v1 ON + v2 OFF reproduces current goal, retired-line, destination-block, and supervisor output byte for byte. Test with direct and production-factory fixtures.
- **INV-2 — Native boundary:** a Birch-lab line observed before stage 3 is not active at stage 3 or later. Test stages 2→3 and 2→5.
- **INV-3 — Later return survives:** a Birch-lab line first observed at stage 3 remains active through stage 4 and retires only at Pokédex/stage 5. Test issuance at stage 3, replay at stages 3/4/5.
- **INV-4 — No false none:** v2 emits neither `Story goal: none` nor the retired quote in active destination guidance; conversation history remains untouched. Test trust and destination blocks.
- **INV-5 — No false supervision:** walking away from a retired episode records no `story_goal_away`; walking away from a live later episode still can. Test the production recorder seam.
- **INV-6 — No foreknowledge:** v2 derives only from recorded dialogue, resolved place, and native Birch-lab stage; it names no replacement destination. Test exact output.
- **INV-7 — Switch integrity:** new treatment defaults OFF, has a valid dependency, appears last in registry order, and only the candidate arm flips it. Test registry, preset normalization, viewer defaults, and experiment parsing.
- **INV-8 — Discoverability:** the Harness Config card links to a self-contained, locally served explainer. Test card URL and exact-file route; verify desktop and phone rendering.

## Security Review

- No network, subprocess, ROM, save, or memory-write surface is added.
- Input remains schema-validated recorded events and typed `GameStateSnapshot.story`; null/unreadable story state never fabricates completion.
- Historical logs are not rewritten. Existing v1 runs remain attributable to their recorded feature vector.
- The explainer remains local, self-contained, GET-only through the existing allowlist, with zero external requests.
- No measured or live run is modified, restarted, approved, or launched.

## Milestones

**M1 — Stage-bound goal lifecycle**
- [x] Write tests for INV-1 through INV-6; direct lifecycle/trust RED is established, production wiring follows in M2
- [x] COMMIT: `test(story-goal): define stage-bound v2 lifecycle` (`5b28fe9c`, RED)
- [x] Implement stage-at-issue tracking, v2 retirement, empty-header omission, and supervisor/destination behavior
- [x] Gates: agent suite 2531 passed; `just lint` clean; `just build` clean
- [x] COMMIT: `feat(story-goal): add stage-bound v2 lifecycle` (`223b9b93`, GREEN)
- [x] Observability proof on production-shaped recorded events; no gameplay run
- [x] Multi-model review loop until clean

**M2 — Switch registration, explainer, and pending experiment**
- [x] Write tests for INV-7 and INV-8
- [x] COMMIT: `test(story-goal): require v2 registration and explainer` (`e3c9d17c`, RED)
- [x] Register switch/presets/defaults, explainer mapping/page, pending experiment, and readiness row
- [x] Gates: viewer/agent targeted tests, `just experiments-check`, `just pages-check docs/explainers/stale-story-goal-v2.html`
- [x] COMMIT: `docs(story-goal): register v2 experiment and explainer` (`5423e717`, GREEN)
- [x] Browser proof at 1280×900, 1440×900, and 375×812; Harness Config click on isolated viewer
- [x] Multi-model review loop until clean

**M3 — Repository gates, frozen review, and landing**
- [x] Sync current `main` into the branch
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage`, `just verify-vendor`, `just experiments-check`, `just experiments-audit`
- [x] Principles self-review PB1–PB13 with zero FAIL
- [ ] Freeze packet and obtain Claude, Grok, and GPT/Codex `VERDICT: LGTM`
- [ ] Fast-forward merge reviewed tree into local `main` if every landing condition remains satisfied
- [ ] Post-land `just test`; coordinate one viewer restart and verify the live build/card/link
- [ ] Evidence-only worklog commit recording review and merge SHA

## Closing the Loop

- **Logic:** RED tests demonstrate the old implementation keeps the pre-handoff line and prints the retired/empty header; GREEN tests cover the factory path and delete/restore guard.
- **Game grounding:** record pret/pokeemerald revision and the scripts that set Birch lab stages 3 and 5 and issue the later return line.
- **Model-visible delivery:** production-shaped result contains no retired/empty goal under v2, contains the later valid goal, and produces no stale away event.
- **Viewer/docs:** page checker, local HTTP 200, opened desktop/phone screenshots, and real Harness Config explainer click on an isolated viewer.
- **Experiment:** pending only, readiness recorded, no queue position or approval, no measured runs.
- **Delivery:** distinguish branch implementation, reviewed/landed source, viewer restart, and live card proof.

## Session Log

- 2026-10-19 ET: Operator approved making the goal behavior v2 and asked whether `input-cuts-v1` is on in the bundle. Confirmed `experiments/fixed/bundle-v-control.json` lists `input-cuts-v1` among bundle switches; it is ON in bundle and OFF in control. Created isolated worktree `codex/stale-story-goal-v2` from clean `main` at `02abda0c`.
- 2026-10-19 ET: Read repository rules and required feature-switch, explainer, experiment, patch-evaluation, game-state, observability, worklog, execution, and close-the-loop skills. No implementation edits made before this worklog approval gate.
- 2026-10-19 ET: Operator approved this worklog. Implementation may begin. M1 keeps the new policy behind direct options; M2 registers and wires the public feature switch so the RED/GREEN commits stay buildable in milestone order.
- 2026-10-19 ET: Initial test command could not start because the fresh worktree had no dependencies. `just setup` installed the pinned workspace dependencies without downloads. Actual M1 RED: agent suite 2528 passed, 3 failed. Failures prove the old code keeps the pre-stage-3 invitation, renders a completed later return line instead of omitting it, and prints the empty `Story goal` header.
- 2026-10-19 ET: M1 RED committed as `5b28fe9c` (`test(story-goal): define stage-bound v2 lifecycle`). The managed worktree was initially detached; attached that commit to new branch `codex/stale-story-goal-v2` before further edits.
- 2026-10-19 ET: M1 GREEN records the native Birch stage attached to each dialogue page's recorded `state_seq`, retires only a pre-stage-3 all-lab episode at stage 3, preserves unknown stages, and lets the v2 presentation omit absent/completed destination goals. Pinned pret/pokeemerald reference is clean at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`; `LittlerootTown_ProfessorBirchsLab_EventScript_AgreeToSeeRival` sets stage 3 after the rival-teaching line, Route 103 supplies the later return-to-LAB line, and `LittlerootTown_ProfessorBirchsLab_EventScript_GivePokedex` sets stage 5.
- 2026-10-19 ET: Delete/restore receipt `m1-destination-block-operand`: removing the completed-v2 block suppression produced 2529 passed / 2 failed, exposing both pre-handoff and post-rival retired lines; restoring it returned 2531/2531 green. Fresh-worktree lint initially lacked `mgba._pylib`; `just build-mgba` installed the pinned local binding, after which lint passed. Build passed with dirty stamp `5b28fe9`.
- 2026-10-19 ET: M1 GREEN committed as `223b9b93` (`feat(story-goal): add stage-bound v2 lifecycle`). M2 now moves the already-tested policy behind the public default-OFF feature switch and requires the production factory, preset, experiment, viewer card, and explainer route to agree.
- 2026-10-19 ET: M2 RED committed as `e3c9d17c` (`test(story-goal): require v2 registration and explainer`). Before implementation, the agent target had 3 failures (missing registry entry, production ignored v2, missing experiment) and the viewer target had 2 failures (missing card mapping and missing served page).
- 2026-10-19 ET: Registered `stale-story-goal-v2` last in the feature catalog, default OFF in presets and Next Run, dependent on v1, and wired it through both story-destination annotation and the production harness-trust factory. Appending the registry entry required deterministic negative-index fixture updates; full suites then passed: agent 161 files / 2534 tests and viewer 85 files / 1195 tests. `input-cuts-v1` remains compatible, and `experiments/fixed/bundle-v-control.json` is byte-for-byte unchanged.
- 2026-10-19 ET: Added the pending-only experiment definition and readiness row; no queue position, approval, launch, measured run, or incumbent promotion occurred. `just experiments-check` reports 118 valid experiments. Added the self-contained explainer, README/card mapping, and exact viewer route tests; `just pages-check docs/explainers/stale-story-goal-v2.html`, build, and `git diff --check` pass.
- 2026-10-19 ET: Browser proof: the explainer rendered cleanly at 1280×900 and 1440×900. The first 375×812 check exposed document overflow from the SVG flow; containing the section and making the flow locally scrollable reduced `documentElement.scrollWidth` from 714 to exactly 375. An isolated viewer on port 18764 showed one `STAGE-BOUND STORY GOAL` Harness Config card; its `READ EXPLAINER` link opened `/explainers/stale-story-goal-v2.html` with title and H1 `Stage-bound story goal`. Temporary viewers and tabs were closed; the long-lived viewer was not restarted.
- 2026-10-19 ET: M2 delete/restore receipt `m2-production-switch-operands`: replacing the production factory's `stageBound` and `omitEmptyGoal` v2 operands with false produced 24 passed / 1 failed in `stale-story-goal.test.ts`, exposing the stale invitation in the v2-on factory path; restoring both operands returned 25/25 green. Viewer targets pass 166/166.
- 2026-10-19 ET: M2 GREEN committed as `5423e717` (`docs(story-goal): register v2 experiment and explainer`). Synced current `main` at `a7be38f6` into the branch with merge commit `0802eb7a`; the incoming fixed-bundle change adds `automatic-running-v1` only and retains `input-cuts-v1` in the bundle arm.
- 2026-10-19 ET: The first post-sync `just test` attempt found the managed worktree's git submodule uninitialized: 12 Python tests failed only because `map_groups.json` was absent. `git submodule update --init env/vendor/continual-harness` restored the pinned `bbab97a` dependency; no source changed. The rerun passed 2534 agent, 1198 viewer, and 2480 Python tests, with 229 documented ROM-dependent skips.
- 2026-10-19 ET: Frozen-gate receipt: `just lint`, `just build`, `just coverage`, `just verify-vendor`, `just experiments-check`, `just experiments-audit`, the v2 page check, and `git diff --check` all pass. Coverage reports agent 98.00% statements / 94.16% branches, viewer 95.43% statements / 91.49% branches, and Python gate 97.47% lines / 93.37% branches / 99.43% functions, all above the 90% floor. The 118 experiment definitions validate and the audit is silent-green.
- 2026-10-19 ET: Review round 1 blocked the frozen `a5301712` packet on a real unknown-state regression and proof gaps. A dialogue page after a null/absent story-state event could inherit an older known Birch stage; the production supervisor test sampled only once; the pre-stage-3 and non-Birch guards lacked direct fixtures; OFF output was only substring-checked; and the two trust operands had only been mutated together.
- 2026-10-19 ET: The repair records explicit null stage boundaries, adds direct current-stage and all-Birch-target guard fixtures, asserts the complete production-shaped OFF string, and drives three production `navigate_to` results through `playGameTools`. The recorder now proves zero `story_goal_away` events for a retired stage-2 invitation and exactly one for a live stage-3 return episode. The focused file passes 28/28.
- 2026-10-19 ET: Independent delete/restore receipts all fail their intended focused assertion: `mutation-unknown-boundary`, `mutation-current-stage`, `mutation-target-guard`, `mutation-destination-wire`, `mutation-stagebound-wire`, `mutation-omit-wire`, and `mutation-supervisor-seam`. Each operand was restored before the next mutation; the final focused rerun and `git diff --check` are green.
- 2026-10-19 ET: Post-repair full tests pass: 2537 agent, 1198 viewer, and 2480 Python tests, with the same 229 ROM-dependent skips. Lint, build, vendor verification, 118 experiment checks, audit, page validation, and diff hygiene pass. Agent coverage is 98.00% statements / 94.17% branches and Python coverage is 97.47% lines / 93.37% branches / 99.43% functions. Viewer coverage retries exposed unrelated timing sensitivity in the unchanged `server-stream.test.ts` (different 5-second timeout/assertion failures across attempts); the ordinary viewer suite is green and the same viewer tree's frozen pre-review coverage receipt remains 95.43% statements / 91.49% branches. No timeout, skip, or gate was weakened.
- 2026-10-19 ET: Round 2 independently verified every round-1 repair but blocked on one residual proof gap: `targets.length===0` had no unresolved-destination fixture or independent deletion receipt, so empty-array `every()` vacuity was not falsified. Added a stage-2 `MYSTERY LAB` line that remains visibly unresolved at stage 3 and independently removed/restored the empty-target guard; the new test failed as intended. Additional independent receipts now cover the remaining original stage-retirement operands: later issue stage (`line.birchLabStage>=3`), unknown issue stage, and unknown current stage. The focused file returns 29/29 green after restoration.
- 2026-10-19 ET: Round 3 found a real mixed-resolution defect missed by the all-empty fixture. `POKéMON LAB, then MYSTERY LAB` resolved one Birch target and one null target, but filtering nulls before the all-Birch predicate retired the whole line at stage 3. Two independent lanes reproduced the exact false `done` goal and null v2 block. The repair passes every `Resolved` entry into the stage policy and requires every one to have a non-null Birch-lab target. V2 now preserves the complete mixed line byte-for-byte with v2 OFF. Replacing only the non-null requirement so unresolved entries count as acceptable makes that exact equality fail (`mutation-partial-resolution`); restoration returns the focused file to 30/30 green.
- 2026-10-19 ET: Post-mixed-resolution gates pass: 2539 agent, 1198 viewer, and 2480 Python tests with the existing 229 ROM-dependent skips; lint, build, vendor verification, page validation, experiment audit, and all 119 current experiment definitions pass. Changed-owner coverage is 98.00% statements / 94.19% branches. No viewer source or timeout changed.

## Principles Self-Review

| Principle | Verdict | Evidence |
|---|---|---|
| PB1 | PASS | Completion is keyed only to recorded native `birch_lab_stage` and Pokédex evidence, never model narration. |
| PB2 | N/A | No gameplay run was launched, excluded, or summarized. |
| PB3 | PASS | Archive recurrence is labeled non-causal; the pending experiment makes no benefit claim. |
| PB4 | PASS | V2 is a named, default-OFF feature in run metadata; OFF preserves v1, and vendor verification is green. |
| PB5 | PASS | The pending candidate flips only `stale-story-goal-v2`; the fixed bundle is not modified by this branch. |
| PB6 | N/A | This bounded presentation/lifecycle change does not alter context budgets or compaction. |
| PB7 | PASS | No live result is claimed; tests use recorded events with native state sequences. |
| PB8 | N/A | No model-call retry, schema, or fallback behavior changes. |
| PB9 | PASS | The operator approved the worklog and v2 scope; experiment launch and archive remain explicit checkpoints. |
| PB10 | PASS | No skips, xfails, gate weakening, coverage carve-outs, or hook bypasses; all required gates pass. |
| PB11 | PASS | Stage semantics were checked against pinned pret/pokeemerald; the pinned continual-harness submodule is verified clean. |
| PB12 | PASS | No ROM or protected path was read; ROM-dependent tests stayed in their existing documented skip state. |
| PB13 | PASS | RED/GREEN commits, seven independent delete/restore proofs, worklog, gates, browser proof, and pending experiment evidence are present; review round 1 findings are recorded and a cumulative round 2 follows. |

## Surprises

- `input-cuts-v1` intentionally excludes `goal.done===true` from duplicate suppression, and a dedicated regression test preserves `Story goal: none…`. V2 must change that behavior explicitly rather than assuming input cuts already does it.

## Multi-Model Review Log

- Round 1 frozen packet: base `a7be38f6`, head `a5301712`, SHA-256 `979bc414986e596faf005fa35a3b142c6b7d0b99f252f06ea4e50e3d3d58bcf0`, 249422 bytes / 1885 lines / 67 files.
- Claude CLI was logged out; Cursor Claude Opus, Claude Sonnet, and GPT 5.6 Sol were account-limited; local think-fast and think-swarm rejected the canonical 76098-token packet against their 65536-token context. These are availability receipts, not approvals.
- External Grok 4.7 and isolated GPT, Sol-fallback, and Astra-fallback reviewers all returned `VERDICT: BLOCKING`. Accepted blockers: preserve unknown stage boundaries; prove the production supervisor over a real three-position sequence; add current-stage and all-Birch guard fixtures; assert complete OFF output; mutate destination wiring, each trust operand, the new boundary/guards, and supervisor seam independently. No reviewer found a scope-expansion or security defect. Reduced vendor diversity is explicit.
- Round 1 repair is complete locally; full gates and cumulative round 2 review remain pending.
- Round 2 packet: head `a8311945`, SHA-256 `3869d805802d0b4fc176c40c5197976aa183f594f8839cef092d016beda00a5a`, 256016 bytes / 1945 lines. Astra and Sol fallback lanes independently returned `VERDICT: BLOCKING` only for the empty-target operand-level evidence gap; both classified the unchanged viewer coverage timing issue as a non-blocking hardening follow-up and found no security defect or scope expansion. The gap is repaired for round 3.
- Round 3 packet: head `4b8121dd`, SHA-256 `0ec7af444aba633f575232190818314026de7064dae3d792d9ced1e79ebc0331`, 257551 bytes / 1955 lines. Sol first returned LGTM, then reversed to `VERDICT: BLOCKING` after the GPT lane identified the mixed resolved/unresolved defect and Sol reproduced it independently. GPT also returned BLOCKING on the same defect. Astra returned LGTM before receiving that late concrete edge. No reviewer found a security defect or scope expansion. The defect is repaired for round 4.
- Round 4 packet: head `5dcef59f`, SHA-256 `990e91d85a9a123499dbe96a324b10e2c649b402ea106c24be85123c30e21b75`. Astra, Sol, GPT fallback, and external Grok all returned `VERDICT: LGTM`; the primary GPT lane was unavailable from capacity and is not counted as approval. Reviewers exercised 100 lifecycle combinations and 20 base-versus-candidate production comparisons without finding another behavior defect. The only suggestions were non-blocking viewer timing hardening and clearer all-resolved explainer wording; the wording is incorporated.
- During the review window, canonical `main` advanced to `d4f3d9cc` with `battle-effective-damage-v1`, `visited-terrain-navigation-v1`, and viewer work. The first ordinary merge exposed broad append-order conflicts, was aborted without source loss, and a current-main-preferred merge produced `03696e4f`. The v2 core registration/default/wiring was then reapplied after the two newer switches, preserving append-only order and every incoming main change.
- Post-merge integration updated only deterministic registry-order and historical-default fixtures plus the four core registration/default/wiring files. Full gates pass on the integrated tree: 2552 agent tests, 1210 viewer tests, and 2492 Python tests with the existing 229 ROM-dependent skips; repository lint, build, vendor verification, page validation, all 120 experiment checks, audit, and diff hygiene are green. `input-cuts-v1` remains true in both pending v2 experiment arms, while `stale-story-goal-v2` is false in the incumbent and true only in the candidate. No experiment was queued, approved, or launched.

## Boy Scout Log

- None. Scope excludes unrelated cleanup.

## Archive Milestone

- [ ] ASK USER: approve archiving only after landing and live proof.
