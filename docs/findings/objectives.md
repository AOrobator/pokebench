# Objective tracking evidence

Scope: user-approved objective tools, persistent viewer record, grounded refs, automatic attempted-action history, after-pruning reminders and guarded repeated no-progress presses. Goal alignment and screenshot interpretations remain model-authored: source refs prove source existence, not semantic correctness. `completed` checks the declared typed condition against a fresh state; `reported_complete` is an unverified visual report. Neither status awards game milestones.

Production composition lives in objective-tools.ts; live.ts has one enabled/ablated assembly call. Same recorder owner publishes objective deltas and state evidence. Added state requests reuse StateWatcher parsing/15s timeout with a run-abort-combining fetch adapter. A post-refresh abort cannot commit objective completion. Blank retry text grants no retry. Unknown/menu/editor/locked/missing-position unchanged states are unavailable, not navigation failures. After fingerprint equality, before/after control values agree, so only one control guard is needed.

R1 code/tests b62fe51 passed 282 agent/130 viewer tests; Claude approved, other lanes required caller/operand evidence. R2 test-first commits7efbb62 and417221f cover production assembly, pinned model-loop context after pruning, cancellation, actual App streaming/replay, blank decision/retry, fresh refs, material-state changes and conservative outcomes. Fixture states validate against the event schema. The model-loop fixture has21 tiny prior turns, one in-memory model response, no network/filesystem/process work; it verifies the real default pruning integration, not a cap-refusal contract. All other loops contain2–6 states and fake HTTP; the existing separate recorder adapter writes one small temporary log. No new shared globals, sleeps, retries, skipped tests or limits/exclude changes.

Performed single-operand/caller deletions in an isolated mutation worktree, preserving the implementation checkout. Source hashes and full stdout at /tmp/pokebench-objectives-r2-mutations; each row below was executed, not inferred by reading. All restored tests pass. Source-state fingerprints exclude timestamps/play time; naming progress fixture uses actual naming shape and unavailable world fields. The duplicate after-control predicate was removed rather than falsely claiming it could independently reject after equality.

| Mutation | Observed failing test |
|---|---|
| no_objective | src/objective-tools.test.ts > injects coherent observation evidence, records attempts and prevents the third action |
| inactive_objective | src/objectives.test.ts > checks badges, scalar conditions and unique objective identities |
| blank_decision | src/objectives.test.ts > rejects a whitespace-only next decision even with an active objective |
| threshold | src/objective-tools.test.ts > injects coherent observation evidence, records attempts and prevents the third action |
| retry_permission | src/objectives.test.ts > requires grounded reassessment and consumes it after one attempt |
| completion_kind | src/objectives.test.ts > verifies positive completion from fresh state and rejects stale or visual claims |
| completion_no_state | src/objectives.test.ts > isolates absent current state from valid observation evidence |
| completion_latest_ref | src/objectives.test.ts > verifies positive completion from fresh state and rejects stale or visual claims |
| completion_matches | src/objective-tools.test.ts > refreshes completion evidence and rejects a cached successful condition |
| reported_state_gate | src/objectives.test.ts > verifies positive completion from fresh state and rejects stale or visual claims |
| retry_absent_attempt | src/objectives.test.ts > requires grounded reassessment and consumes it after one attempt |
| retry_old_evidence | src/objectives.test.ts > requires grounded reassessment and consumes it after one attempt |
| retry_blank_reason | src/objectives.test.ts > does not treat a blank retry explanation as reassessment |
| empty_evidence | src/objectives.test.ts > requires actual evidence and ignores elapsed time for repeated-failure matching |
| unknown_evidence | src/objective-tools.test.ts > offers validated objective tools and separates completion from reports |
| signature_screen | src/objectives.test.ts > permits a changed action or material state after matching failures |
| signature_map | src/objectives.test.ts > permits a changed action or material state after matching failures |
| signature_position | src/objectives.test.ts > permits a changed action or material state after matching failures |
| signature_facing | src/objectives.test.ts > permits a changed action or material state after matching failures |
| signature_controls | src/objectives.test.ts > permits a changed action or material state after matching failures |
| signature_ui | src/objectives.test.ts > records a naming editor change as progress instead of failed movement |
| signature_world | src/objectives.test.ts > permits a changed action or material state after matching failures |
| elapsed_time | src/objectives.test.ts > requires actual evidence and ignores elapsed time for repeated-failure matching |
| unavailable_screen | src/objectives.test.ts > does not count locked input or editor animation as failure |
| unavailable_position | src/objectives.test.ts > isolates conservative unavailable-input outcomes |
| unavailable_controls | src/objectives.test.ts > does not count locked input or editor animation as failure |
| movement_x | src/objectives.test.ts > isolates conservative unavailable-input outcomes |
| movement_y | src/objectives.test.ts > records movement, turns, state progress and possible cycles distinctly |
| movement_map | src/objectives.test.ts > records movement, turns, state progress and possible cycles distinctly |
| turn | src/objectives.test.ts > records movement, turns, state progress and possible cycles distinctly |
| state_progress | src/objectives.test.ts > records movement, turns, state progress and possible cycles distinctly |
| caller_guard | src/objective-tools.test.ts > injects coherent observation evidence, records attempts and prevents the third action |
| completion_refresh | src/objective-tools.test.ts > refreshes completion evidence and rejects a cached successful condition |
| prepress_cancellation | src/objective-tools.test.ts > cancels in-flight pre-press and completion state reads without sending a game action |
| completion_cancellation | src/objective-tools.test.ts > cancels in-flight pre-press and completion state reads without sending a game action |
| factory_observer | src/objective-tools.test.ts > composes recorder evidence, game guarding, completion refresh and context in the production owner |
| factory_writer | src/objective-tools.test.ts > composes recorder evidence, game guarding, completion refresh and context in the production owner |
| factory_reminder | src/objective-tools.test.ts > composes recorder evidence, game guarding, completion refresh and context in the production owner |
| factory_completion | src/objective-tools.test.ts > composes recorder evidence, game guarding, completion refresh and context in the production owner |
| viewer_caller | src/app.test.ts > shows streamed objective history live and reconstructs it when replay seeks |

Representative failures: threshold removal resolves the third press instead of rejecting Reassess, and allows an extra action POST; removing factory context makes model input omit HARNESS OBJECTIVE RECORD; removing prepress/completion abort propagation produces `expected false to be true` for the captured fetch signal; removing App objective rendering yields `expected empty string to contain Set clock`; removing completion predicate accepts the cached successful condition despite the refreshed empty party. Test logs preserve exact expected/actual payloads. These are focused mutation checks, not claims of exhaustive mutation coverage.

Current TS gates: agent292 tests, statements98.63/branches92.10/functions97.76/lines99.28; viewer131 tests,97.51/92.53/98.14/98.23. Both lint/build pass. Python unchanged in this branch: own230 tests,99.42/96.15/100; ROM SHA and vendor pin verified. Native runtime reuses the matching pinned mGBA0.10.5 generated binding from canonical checkout, copied into this isolated virtualenv; no ROM/save copies. Provenance /tmp/pokebench-objectives-native-provenance.json.

No landed/main or model-result claim at this checkpoint. Combined world integration and fresh model runs follow completed review. One combined run per model is an anecdote, not an improvement/causal comparison. Prior recorded think-swarm budget300 and Qwen operator-abort130 both stopped at PLAYER_BEDROOM with no starter milestone.

## Final review test corrections (prepared; review pending)

GPT R2 required actual `live.ts` default/ablation caller coverage, the existing state-owner timeout operand, and the post-refresh abort race. Added tests exercise the actual play entrypoint over the same `withRun`/RunLog/RunRecorder owners and a test-owned memory filesystem adapter for two modes; only the model stream and external host are replaced. They compare runtime tools/context with recorded tools/prompt/features. Timeout tests capture the existing `AbortSignal.timeout(15_000)` value and drive a test-owned deadline controller while the run stays live (no sleep or production-deadline wait). Post-refresh race aborts immediately before a matching refresh resolves and requires rejection, active status and unchanged objective-update count.

Four performed mutations in `/tmp/pokebench-objectives-final-mutations/results.json` all fail their named tests: invert live default/ablation predicate; omit live objective assembly; remove timeout signal operand; omit post-refresh abort guard. Restored focused tests pass. These are test-only corrections; no production owner or runtime behavior added. The initial live test incorrectly read context after the log closed; corrected the test to capture it during the model-loop callback, before run_end. Preserve this fixture failure separately from intentional mutant failures. No main landing or model-performance claim.
