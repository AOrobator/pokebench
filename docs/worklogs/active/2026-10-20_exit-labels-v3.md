# Exit labels v3: distinguish exits and terrain sections

## Authorized outcome
The operator approved the investigated design: “ok build the switch and put it in the bundle”. One milestone delivers a default-OFF versioned observation upgrade, exact OFF invariance, section-aware physical exit identities used consistently by readout and agent summaries, tracked explainer, pending experiment and bundle membership. No measured runs are authorized. Existing running cohorts remain frozen.

## Boundary
Production owners: new env/pokebench_env/map_sections.py; existing exit-labels/game-state/rerender/readout/live-map formatters; typed event state and shared agent exit-label helper; harness-trust, untaken-exits and supervisor label consumers; switch registries/presets/viewer defaults and explainer mapping; fixed bundle definitions and pending experiment. No gameplay execution, objectives, route selection, exit-history accounting, new tools, or supervisor thresholds change. Keep v2 intact as comparison. Labels describe terrain; temporary objects/scripts are not guaranteed passable. Preserve one-way direction. No handwritten story route or location aliases.

## M1 Deliver and verify
- [x] RED: real archived Route104/Woods observations plus small adversarial geometry cases; commit failing tests.
- [x] GREEN: one section/exit description owner, production wiring, exact OFF behavior.
- [x] Registry, default OFF, pending experiment, future bundle only, explainer.
- [x] Tests, lint, build, coverage >=90%, vendor, experiment checks, raw RAM replay and wiring deletion/restoration.
- [ ] Principles and independent cloud reviews on frozen packet; local fast-forward landing only with required approvals.
- [ ] Main tests, viewer refresh and real explainer click, bundle configuration proof. Do not restart gameplay.

## Evidence and open questions
Run 97a0 state 13625 / result 13626 / turn377 identifies Woods entrances at (10,38)/(11,38); result14514 states the mistaken same-map-loop belief. Raw archive6007 hashes and ROM identity validated in the investigation. ROM731ad5bf is clean. Direction matters: the eastern Route104 landing can reach the southern area, but not vice versa. V2 ignores runtime destination objects and metatile changes, so topology must be qualified rather than advertised as a guaranteed route. Stage unknown/dynamic/unreadable maps remain explicitly unknown.

## Session
- Started from main24648e12 in an isolated managed worktree. User approval covers implementation, bundle integration and normal repository landing requirements.

- RED observed: collection fails because map_sections does not exist. Frozen SHA256 receipts of v2 ON state/readout were captured before implementation for both existing ROM-backed b300 archives.

- Implementation uses iterative strongly connected terrain sections, explicit physical warp labels, typed exit_sections and shared text consumers. OFF frozen hashes pass. Real ROM tests cover distinct Route104/Woods returns, one-way east-to-south reach, same-map Gym rooms, warp boundaries, water/elevation, unknown/dynamic destinations and recursion-sized floors. 11 focused Python tests and 6 shared-consumer TS tests pass.
- Archived97a0 turn377 reparsed with production read_state/render: OFF0.026s/16868 chars, ON0.047s/22668 chars in one local sample; no throughput claim. Receipts at main runs/exit-labels-v3/97a0-turn377-{on,off}.{txt,json}. No gameplay observations/actions were requested.
- Agent coverage run:3037 tests pass. Viewer1496 pass with one frozen-incumbent exclusion needing the new bundle switch; corrected. Full gates pending final main sync. Initial Python invocation omitted ROM and skipped ROM-backed tests; root invocation interrupted during collection; only the corrected just/explicit-ROM invocation will count.
- COMMIT: test RED843ce9cc. GREEN candidate follows; review and landing remain pending.

- Integration: current main landed field-move-gates-v1 while this feature was being built. Preserve it and reuse its existing FloodRules in v3; extract the existing destination-rule construction into exit_labels.destination_rules so both versions use one gate owner. Current-map rules use live obstacle state; destination rules retain on-load flag semantics. This prevents section labels from bypassing the newly landed obstacle truth. Section anchors are stable while moving; terrain or gate-state changes can rederive sections.

- Main sync kept field-move gate corrections, gated destination rules, and all unavailable-exit warnings in v3 descriptions. Main e9584cf0 is the merge parent; initial after-sync checks identified only registry roster/count assertions and a corrected test assumption, not an OFF-output change.

- Bundle definitions validate against unchanged control-base hashes: v3 OFF control / ON bundle in bundle-v-control (248 planned slots) and bundle-cook-1h (4 slots); existing field gates stay ON in bundle. New pending incumbent is normalized from that bundle with only v3 OFF. No approval or launch files were written.
- Readiness production reader: recent fallback4/4 reached PLAYER_NAME_CONFIRMED, not enough comparable configurations; Oct15 think-fast2f46/6684/dc0e/17a0. Pending, unqueued.
- Mutation receipts: factory disabled→3 native failures; restored13 passed. Header section operand disabled→shared-consumer failure; restored6 passed. All logs retained in worktree runs/exit-labels-v3.
- Browser: isolated schema-valid offline UI fixture displayed the v3 ON card and its explainer text. Full-catalog preview was closed after slow loading. Explainer click-through was not confirmed: browser kernel reset and IAB became unavailable. HTTP local preview200 and tracked-card/byte-serving tests are separate evidence; no successful live click claimed. Feature explainer copied to main runs/mockups/exit-labels-v3 for a reviewable local link.
- Earlier coverage showed live-human import timeout and resulting mock spill; focused unchanged test6/6 passed after stopping the heavy preview. Separate later viewer timeout failures retained. No test limits, retries or exclusions changed. A missed default-OFF assignment after the field-gate conflict was repaired and now has a dedicated generic-default regression test.

- Full verified coverage run: agent3052, viewer1509, Python3483 pass, zero skips. Agent statement/branch/function coverage97.12/92.91/97.56; viewer95.25/91.06/94.18; Python lines97.20/branches92.82/functions100. Lint (both TS, ruff format/check, mypy104 files) passes. Logs: coverage-default-verified.log and lint-default-verified.log. Final source sync/build and frozen cloud reviews follow.

- Pending experiment pins the complete implementation c854592366ae9f2172a50a3bffd1b107566e0298 (no queue/approval).

- Frozen round1: GPT independent LGTM; Astra fallback LGTM; Sol fallback BLOCKING with concrete two-tile barred-edge warp landing. Fix accepted: unique neighboring region must also permit the emergence step, with elevation/directional/gate rules. Cursor Grok stopped deliberately before completion when packet needed repair; no verdict claimed. Claude CLI unauthenticated; Cursor Opus and Sonnet usage limits, no review. Two distinct fallback models used per skill, reduced diversity, no self-merge authorization.
- Frozen-tip gates passed8046 tests (3052 agent,1511 viewer,3483 Python), zero skips; lint/build pass. Browser recovered: actual v3 feature-card link opened exact explainer URL on candidate viewer and screenshot visually inspected. Supersedes earlier failed browser attempt. Offline UI fixture only, no gameplay/experiment.

- Round1 fix GREEN: warp emergence checks directional edges/elevation and existing gate walls/forced steps before accepting its sole neighboring region. Colliding door origin remains supported. RED1failed/8passed/5ROMskips (not gate evidence), then explicit-ROM14/14 passed. New full gates follow current-main sync.

- Round2 preparation synced main97046aa6, updated pending implementation pin to complete repaired tree, and reruns all gates. Claude remains unavailable; final landing requires operator exception, even if fallback reviews approve.

## Round2 final review and operator checkpoint
- Frozen implementation b90141334d587a75c8471882797dee0df56b7346 against main97046aa658156e52dfff2ac5bcf8d289cdf0c6fb; exact binary diff52925473c5f4578cb178c5a3e21063c41c5171764d3616e5fe92bcb72b7a68f9. Full coverage8033 tests (3052 agent,1497 viewer,3484 Python), zero skipped, all per-metric floors>=90. Lint/build/vendor/pages pass. Browser card actual click verified earlier; affected browser assets unchanged by repair.
- GPT independent LGTM: native14 and TS6 independently pass. Sol fallback LGTM: original reproduction corrected, ordinary doorway preserved. Astra fallback LGTM: native14 zero skipped. All three verified exact HEAD/diff and clean tree.
- Claude unavailable: dedicated CLI unauthenticated, Cursor Opus+Sonnet usage limits. Fallback models gpt-6-sol and gpt-6-astra, reduced vendor diversity; do not substitute for Claude landing approval.
- Grok4.5 VERDICT: BLOCKING, exit0/stderr empty, own ask-mode rejected git digest/status commands; implementing agent verifies unchanged frozen packet. Fix accepted as concrete: read_exit_sections uses here.section(position) rather than landing(position) for current player tile. On native b30018814 Woods(17,38), current says unknown while landing resolves region(32,4), so arrival observations lose same/different-section relation. Reproduced locally without gameplay. No further source edits after round2.
- Non-blocking items: source pin8389c731 includes the complete repair/main sync before metadata-only b9014133, so no stale implementation pin; offset matching predates diff, follow-up; readoutNames section string concern remains follow-up without reproduced downstream failure.
- Secondary Grok4.7 deliberately stopped after primary blocker, no review verdict claimed. Review logs/synthesis retained under runs/exit-labels-v3/review. Owned offline preview stopped and task-created browser tabs closed; shared viewer/game untouched.
- STOP: execute-worklog round cap requires operator choose land as is, fix only the listed current-on-warp bug, or drop. Recommended fix only that bug with native regression and final gates/review. Any merge still requires explicit exception for unavailable Claude lane. Main untouched by this feature; pending experiment remains unqueued, no measured run launched.

## Authorized final correction
Operator answered "yes" to fixing only the current-on-warp gap, rerunning checks and merging once GPT/Grok approve, with the unavailable-Claude exception. This clears the round2 STOP for that bounded correction. Added native Woods arrival assertions for established current section and same-section return relation; RED follows. No other source scope authorized or added.

- Arrival RED:1failed/13passed with explicit ROM. GREEN: current region uses existing conservative landing(position) owner, preserving regular floor behavior and unknown ambiguous/blocked landings. Native14/14 pass; Woods arrival now names its section and same-section returns. No other production change.

- Synced latest main d004be2d. Resolved append-only registry/bundle/default and roster conflicts by retaining main story-battle-heal-gate-v1 plus exit-labels-v3, both existing behaviors. Retained both explainer/server tests and documentation entries. Source arrival fix remains one-line reuse of landing owner; full gates follow.

- Pending experiment repinned to complete repaired/main-synced7f52d098 tree; new incumbent retains main bundle story-battle-heal-gate-v1 ON with v3 OFF, so only v3 flips. Pending, unqueued. Final gates and GPT/Grok review follow; operator Claude exception recorded above.

- Combined-main checks exposed duplicate insertion index edits merged only once by git:61 then17 registry-position assertions failed (retained logs). Corrected deterministic expectations from current main plus v3, distinguishing legacy OFF feature lists from current ALL_ON. Historic story-heal pending entry is unchanged; its test accounts for newly added future bundle v3 key. Agent3089/3089 now pass. No behavior, gate, timeout, retry or exclusions changed.
