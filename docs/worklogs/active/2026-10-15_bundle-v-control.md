# Bundle vs fixed control — confirmatory two-arm experiment

## Problem Statement

The full-map-navigation finals were withdrawn by the operator: every arm was dominated by harness bugs (dc0e truck soft-lock, 6684 repeated A×8 dialogue loop, cd66 slow house exits) and 1–2 trials per arm cannot separate anything. The harness-fixes bundle (`claude/bundle-integration`, worklog `2026-10-15_harness-fixes-bundle.md`) fixes those bugs and adds eight default-off switches. This experiment answers one question with decent power: does the eight-switch bundle beat the fixed control?

## Decisions (operator, 2026-10-15)

- Two arms, bundle vs fixed control. The 16-configuration factorial was dropped: per-switch main effects at affordable N have <20% power, and the bundle effect estimated as a sum of eight main effects is ~2.8× noisier than a direct two-arm comparison. Per-switch attribution for readout switches goes to decision-point screening instead.
- Plan B: 64 trials per arm capped at 15 minutes (confirmatory) plus 6 per arm capped at 60 minutes ("let it cook", exploratory, never in the p-value).
- Budget: 48 GPU-hours. 32 confirmatory + 12 cook + 4 reserve for invalid-trial replacements.
- Fixed N. No interim analysis, no early stopping for efficacy or futility, no automatic experiment ejects.
- Both RTX 4090s run trials in parallel, one runner per GPU. The chat bot stays offline for the duration.
- Primary milestone RIVAL_MET; ranking stays furthest-milestone-first.
- Review merge rule (operator directive, the operator, 2026-10-15 ~22:00 EDT): a review finding blocks ONLY if it (1) crashes, throws, or can stop or stall the experiment silently; (2) breaks the pre-registered design: fixed N, balanced blocks per lane, arms differing only in the eight switches, caps, the CLOCK_SET start, milestone-stall-stop off; (3) mishandles invalid trials or lane pause/retry, or misreports status; (4) gets the analysis wrong. Everything else goes to the Deferred list below, one line each, and is not fixed now. One cloud-only review; any re-review covers only the blocker-fix delta.
- Review lanes (operator directive, 2026-10-15 ~20:45 EDT): no local-model review lanes at all, think-swarm included. Review uses cloud lanes only: Codex `gpt-5.6-sol` and grok (Cursor), with opus/fable as fallbacks. Both 4090s stay with the experiment.
- The two battle switches (`expanded-menu-battle-information-v1`, `battle-details-v2`) are out; they get their own experiment from a Birch-rescue save.

## Pre-registration (frozen before the first trial)

- Start: the clock-set save (CLOCK_SET), same checkpoint bytes for every trial.
- Control arm: main after the bundle, decision-point, fade-settle and auto-advance-qualify merges, running the **finals incumbent preset** with all eight bundle switches off and `milestone-stall-stop-v1` off. Control base = `runs/experiments/full-map-navigation/presets/finals-incumbent.json`, preset id `full-map-navigation-finals-incumbent`, sha256 `2a7a2a0fd7cba935ce8631c6ca67770e3cc6833447cc1b3a037e3c46039e0161` (the 504f flag set). It is NOT the checked-in `experiments/full-map-navigation.json` `incumbent` (`navigation-incumbent`).
  - Decision (orchestrator, 2026-10-15; operator may overturn). Reasons: it is what the finals ran; the decision-point supervisor and loop-guard corrections only act with these switches on; with the supervisor off the loop guard ends trials `stuck` before the cap, which violates "only the wall cap ends a trial".
  - The definition records it as `controlBase {path, presetId, sha256}`; every load (`check`, `approve`, `run`, `dry-run`) refuses to proceed unless the preset file's bytes match that sha256, its id matches, and the base equals it in sampling, `maxTurns`, `failureLimit` and every feature outside the eight switches and the off-in-both flags.
  - Flags where the two presets differ (finals incumbent vs checked-in `navigation-incumbent`; "unset" = absent from the preset, default off):

    | Flag | finals incumbent (control base) | checked-in `navigation-incumbent` |
    |---|---|---|
    | `interaction-loop-detection-v1` | true | false |
    | `loop-guard-supervisor-v1` | true | unset |
    | `text-only-supervisor-v1` | true | unset |
    | `deterministic-loop-guard-v1` | true | true |
    | `dialogue-log-v1`, `double-context-window-v1`, `fresh-retry-v1`, `instruction-ledger-v1`, `next-milestone-hint-v1`, `walkable-floor-v1` | false | unset |
    | `game-evidence-priority-v1`, `named-warp-destinations-v1` (bundle switches) | false | unset |
    | `milestone-stall-stop-v1` (off in both) | false | unset |
    | limits | maxTurns 20000, maxWallMs 2700000 (phase caps replace it) | maxTurns 1500, maxWallMs 1800000 |
- Bundle arm: the same build bytes, switches on: `named-warp-destinations-v1`, `world-destinations-v1`, `game-evidence-priority-v1`, `character-presence-v1`, `navigation-refusal-reasons-v1`, `transition-press-result-v1`, `stall-briefing-v1`, `dialogue-auto-advance-v1`. Every other flag identical between arms.
- Corrections (bundle fixes, fade-settle, qualification fixes) are in both arms.
- Confirmatory trials: maxWallMs 900000 (15 min). Cook trials: maxWallMs 3600000 (60 min).
- The only thing that ends a trial is its wall cap. `milestone-stall-stop-v1` is off in both arms.
- Primary outcome: RIVAL_MET reached within the trial (binary). Test: two-sided Fisher exact, α = 0.05; p is reported against 0.10 as well.
- Secondary outcomes: time to RIVAL_MET (right-censored at the cap; log-rank), furthest milestone ranked depth-first then time (Mann–Whitney). Reported per GPU as well as pooled.
- Power at a 50% control rate (16/32 in the 2×2 cohort from CLOCK_SET): 80% for +25 pts at α = 0.05; 59% for +20; 35% for +15. Scripts: `~/.hermes/cache/scratch/pb_power.py`, `pb_power2.py`.
- 15-minute cap rationale: all 16 RIVAL_MET times in the 2×2 cohort fell in 6.8–13.9 min.
- Order: randomized balanced blocks with a recorded seed. Each block of four gives each GPU one bundle and one control trial. All 128 confirmatory trials run before the 12 cook trials.
- Invalid trial = infrastructure failure (model/gateway error, emulator or server crash, checkpoint load failure), never model behavior. An invalid trial is recorded with its reason, kept in the record, and replaced by a trial of the same arm on the same GPU appended to the end of the queue. Replacements draw from the 4 GPU-h reserve; every invalid trial is reported.
- The runner never halts the experiment on its own. If a lane cannot serve, that runner pauses, writes the reason to the status file shown in the viewer, and retries; the other runner continues.

## Compute

| Lane | GPU | Model path |
|---|---|---|
| A | GPU1 | Direct tunnel to llama-server |
| B | GPU0 | Direct tunnel to llama-server |

- Both: llama.cpp `b10236-1464c62d8` (image `ghcr.io/ggml-org/llama.cpp@sha256:fd68d130…`), `/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf` + `mmproj-F16.gguf`, ctx 65536, `--parallel 1`, q4_0 KV, `--reasoning-budget 1024`, identical argv.
- Measured 2026-10-15 17:48: generation 182.5 / 182.4 tok/s (GPU1) vs 180.9 / 182.4 tok/s (GPU0), temperature 0, 200 tokens.
- Both lanes must reach the model the same way (same proxy path), so latency differences come only from the GPUs.

### Compute isolation and restoration

Unrelated workloads and their automatic recovery were paused to reserve compute. A host reboot could reclaim one lane, which would cause the runner to pause that lane. Pre-experiment state was recorded for restoration afterward. Private service names, schedules and recovery commands are omitted.

## Launch dependencies

- [ ] `claude/bundle-integration` merged to main (sa-0-dc354d39), with the merge SHA recorded.
- [ ] `claude/decision-point-screening` merged (sa-1-8ce3580d).
- [ ] `claude/fade-settle` merged (sa-0-5f3acb7a).
- [ ] `claude/auto-advance-qualify` merged (sa-1-97c6ff75): real-ROM proof of no lost pages, no B on YES/NO, correct cutscene-lock handling.
- [ ] `just build` on main after the last merge.

## Milestones

- [ ] M1 Driver: two-arm fixed-N experiment definition plus a two-lane parallel runner (one game server port and one model endpoint per lane), balanced-block order with a seed, invalid-trial replacement, a pause-with-reason status file, no early stopping. RED/GREEN, gates, multi-model review, merge.
- [ ] M2 Model-error cause: find why 5 of 32 trials in the 2×2 cohort ended `model_error`, and fix or classify it before launch.
- [ ] M3 Lane qualification: serving/environment receipts for both lanes; prove both use the same proxy path, model, argv and build.
- [ ] M4 Dry run on main's built bytes: one 2-minute trial per arm per lane; both runners concurrently; verify events, preset flags, caps and status reporting; delete the dry-run trials from the cohort.
- [ ] M5 Ready to launch: report to the operator. The operator launches.
- [ ] M6 Analysis script (pre-registered tests above) and report after the cohort completes.

## M2 finding: the 2×2 `model_error` ends were model behavior

All 5 `model_error` ends in the 2×2 cohort (`factorial-2x2-think-fast-*`, 32 graded trials) were three consecutive text-only replies, not model or gateway failures:

| Run | Arm | Wall | Turns | Furthest | Retries in the run | Last three |
|---|---|---|---|---|---|---|
| `2026-10-14T19-30-06_think-fast_26e0` | both | 29.0 min | 270 | MOM_RIVAL_INSTRUCTION | 4 text-only | turns 268–270, text-only 1/2/3 |
| `2026-10-14T19-59-09_think-fast_0c89` | memory | 13.7 min | 219 | RIVAL_MET | 3 text-only | turns 217–219, text-only 1/2/3 |
| `2026-10-15T00-26-27_think-fast_fb9b` | neither | 15.7 min | 335 | MOM_RIVAL_INSTRUCTION | 5 text-only | turns 333–335, text-only 1/2/3 |
| `2026-10-15T00-13-22_think-fast_a08c` | both | 13.0 min | 209 | MOM_RIVAL_INSTRUCTION | 3 text-only | turns 207–209, text-only 1/2/3 |
| `2026-10-15T06-43-00_think-fast_952f` | whole-map | 29.7 min | 600 | MOM_RIVAL_INSTRUCTION | 3 text-only | turns 598–600, text-only 1/2/3 |

- None of the five has a `model error:` retry. Each reply streamed normally and ended `stop`. The reasoning was a degenerate repetition (0c89 enumerates "(8,1) is clear … (8,84) is clear" in two consecutive turns; 952f repeats one paragraph about the Twin), and the reply carried no tool call.
- The 2×2 presets had `text-only-supervisor-v1` off, so the Governor's `failureLimit` (3) ended the run at the third text-only reply in a row. The end reason `model_error` is shared by API errors and reply failures (`Governor.fail`), which is why these looked like infrastructure failures.
- Classification under the invalid-trial rule: model behavior, so **valid** trials. They are not replaced.
- Fix for this experiment (harness, RED/GREEN): an optional preset limit `limits.replyFailuresEndRun: false`. Text-only, cut-off (`max_tokens`) and invalid-tool-call streaks then never end the run (the nudge and the text-only supervisor notes still go out, and the count restarts). Three consecutive model errors still end it `model_error`. `run_start.evaluation.reply_failures_end_run` records the setting. Both arms set it, so the wall cap is the only behavioral end, and a `model_error` end is always an infrastructure failure (invalid, replaced).

## M1 driver: `just fixed-run`

- Definition `experiments/fixed/bundle-v-control.json` (a subdirectory, so the experiment queue's `experiments/*.json` loader never sees it). Seed `b70b39b399e5bbae`, drawn 2026-10-15 22:20 EDT. 64 + 6 per arm, two lanes, so 32 confirmatory blocks and 3 cook blocks of four; 140 planned trials. The plan is frozen with `just fixed-run plan bundle-v-control` once `claude/bundle-integration` is in main (this branch's preset schema does not know the five new bundle switches yet); `plan` reuses the recorded seed and refuses once any trial has launched. Every load regenerates the plan from the seed and refuses a mismatch.
- Arms: `base.features` = the full-map-navigation finals incumbent with all eight switches, `milestone-stall-stop-v1`, `battle-details-v2` and `expanded-menu-battle-information-v1` off; the bundle arm turns the eight switches on and changes nothing else (`armPreset`). The definition check refuses a switch that is on in the base, an `offInBoth` flag that is on, an unknown feature, and an enforced loop guard without its supervisor (the only other behavioral end, `stuck`). Limits: maxTurns 20000, failureLimit 3, `replyFailuresEndRun: false` (schema-fixed); sampling medium / 4096. Start: CLOCK_SET `runs/launch-receipts/rival-push-checkpoint/CLOCK_SET.state`, sha1 `51007c05068f4059f7d97c34541e29a93bedd80b` (checked against the bytes at `check`, `run` and `dry-run`).
- Lanes A and B used separate game servers and symmetric direct tunnels to llama-server to avoid introducing a gateway hop in only one arm. Each trial gets an endpoint file `{base_url: <lane>/v1}` (`POKEBENCH_ENDPOINT_FILE`), so the agent's single-model discovery reads the model path id, n_ctx and vision from that lane's own `/v1/models`.
- Runner (`runFixed`): one process holds the gameplay lease and runs both lanes concurrently. Each lane plays its own planned slots in order; confirmatory before cook across both lanes (a lane whose confirmatory slots are done waits for the other lane's). Before each trial: build check (serialized across lanes), `/health` + `/props` receipt (model path, build, n_ctx, slots, vision must match `serving`), game port free. Any failure pauses only that lane with the reason in `runs/experiments/<id>/status.json`, then retries with backoff 30 s, 1, 2, 5, 10 min (10 min thereafter). Nothing ends the experiment: no interim analysis, no stopping rule; the reserve exhausting pauses the lane "waiting for the operator". Ctrl-C/SIGTERM only stops new trials; running trials are detached, play to their wall cap and are adopted by the next runner.
- Ledger `runs/experiments/<id>/trials.jsonl`: launch (slot, lane, phase, arm, run, commit, source identity, preset sha256, serving fingerprint, replaces), started (pid), outcome. Invalid = infrastructure only: no run_start (server/emulator/checkpoint), no run_end (process died), run_start not matching the plan (preset, cap, start sha1, port, model), `crash`, `model_error` whose last retry is `model error:` (API/gateway), operator stop. Each invalid trial is kept and a replacement of the same arm on the same lane is appended to the end of its phase, charged at the phase cap against the 4 GPU-h reserve (`replacementReserveMs` 14400000).
- `runner.json` names a running trial while either lane plays (so merges into main wait); the viewer's experiment panel shows a card per fixed run: n done / 140, invalid count, reserve, each lane's state/reason/retry time/last error, the invalid list, and a loud "RUNNER NOT RUNNING" when the pid is gone before the end.
- Commands: `just fixed-run check|plan|approve|run|dry-run|status|analyze <id>` and `analyze-receipt <dir> <control-arm> <treatment-arm> --cap-ms <ms>`. `approve` is interactive (types the id) and binds the definition sha256; `run` refuses without it or after any edit.

## Trial end conditions with this definition (grok b, verified against `4b5b8bf`)

Every way a preset run ends, with `target: null` and both arms' flags:

| End | Code | Can it fire? |
|---|---|---|
| `budget` (wall cap) | `live.ts` `BudgetTimer`, `harness.ts` Governor `active >= maxWallMs` | Yes: the intended end. |
| `budget` (turn cap) | `harness.ts` `this.turns >= maxTurns` | In principle at 20000 turns; operator-rejected as unreachable (no run near 1500). Reported by the classifier as "turn cap before the wall cap". |
| `milestone` | `live.ts` `NativeTargetStop`, only when `target !== null` | No: the definition schema fixes `target: null`. |
| `stalled` | `play-wiring.ts` `stallStop`, only with `milestone-stall-stop-v1` | No: off in both arms (`offInBoth`, checked). |
| `stuck` | `loop-detection.ts` `notice("stop")` → `harness.ts` `attachLoopGuard` aborts | Only without a supervisor: line ~402 sends the supervisor briefing instead when `loop-guard-supervisor-v1` is on and the mode is enforced (`deterministic-loop-guard-v1`). Both are on in both arms; the definition check now refuses either off. |
| `model_error` | `harness.ts` Governor `fail` | Only for consecutive model/gateway errors: `replyFailuresEndRun: false` resets text-only/cut-off/invalid streaks. Invalid (infrastructure). |
| `crash`, `operator_abort` | `live.ts` | Infrastructure or operator: invalid. |
| Stall briefing, dialogue auto-advance, text-only supervisor | `play-wiring.ts` | Notes only; never end a run. |

Any valid trial that still ends before the wall cap is listed in a WARNING table at the top of the analysis.

## Bundle activation milestones at CLOCK_SET (`4b5b8bf`)

- `character-presence-v1` activates at PLAYER_NAME_CONFIRMED and `stall-briefing-v1` at NEW_GAME_CREATED; both precede CLOCK_SET in `MILESTONE_ORDER`, so both are active from the first turn of every bundle trial. All eight, from `experiments/<switch>.json` `activationMilestone` against `milestones.ts` order (CLOCK_SET = index 8): dialogue-auto-advance, game-evidence-priority, stall-briefing at NEW_GAME_CREATED (1); character-presence, navigation-refusal-reasons, world-destinations at PLAYER_NAME_CONFIRMED (2); named-warp-destinations at FIRST_TRUCK_EXIT (4); transition-press-result at PLAYER_HOUSE_ENTERED (7). None is gated on a milestone at run time; the activation milestone is grading metadata, and milestones already reached in the save arrive as `present_at_start`.

## M3 lane receipts (2026-10-15 ~22:25 EDT, three short requests per lane)

| | Lane A (GPU1) | Lane B (GPU0) |
|---|---|---|
| `/health` | 200 | 200 |
| `/props` model_path / alias | `/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf` (alias = path) | same |
| build_info | `b10236-1464c62d8` | same |
| total_slots / n_ctx | 1 / 65536 | 1 / 65536 |
| modalities | vision true, video true, audio false | same |
| chat_template sha256 | `55d4931433fe…` | `55d4931433fe…` |
| default sampling params sha256 | `257d326ca7b9c7eb…` | `257d326ca7b9c7eb…` |
| `/v1/chat/completions` (8 tokens) | 200 in 0.24 s, `system_fingerprint` b10236-1464c62d8 | 200 in 0.12 s, same |
| Tunnel | Direct tunnel | Direct tunnel, same options |

- Server argv identity rests on the operator's compute record above (identical argv, image digest); the `/props` fields and default sampling params hash agree. The GPU host was not touched.

## M6 analysis

- `packages/viewer/src/fixed-analysis.ts`: two-sided Fisher exact (all tables no more likely than observed, relative tolerance 1e-7), log-rank (ties, censored at the cap), Mann-Whitney U with tie and continuity corrections on a depth-then-time score; pooled and per lane, valid trials only, plus the invalid list. Unit tests match scipy `fisher_exact`, `mannwhitneyu(method="asymptotic")` and lifelines `logrank_test` to 9 digits.
- Smoke on the 2×2 cohort (`analyze-receipt runs/launch-receipts/navigation-factorial-think-fast-n4 control both --cap-ms 1800000`): RIVAL_MET both 4/8 vs control 3/8, Fisher p = 1.000 (scipy agrees); log-rank χ² 0.312, p 0.577; Mann-Whitney U 38, p 0.564. The 4/8 and 3/8 match a raw grep of the run events.

## Principles Adherence (driver review, `6635285..bbf3873`)

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | Outcomes come from the run's own milestone events (`classifyTrial`), never from agent claims. |
| PB2 | PASS | Every trial, invalid ones included, stays in the ledger and the report; misses are censored at the cap, not dropped. |
| PB3 | PASS | Fixed N = 64 per arm confirmatory, pre-registered tests; cook is labeled exploratory. |
| PB4 | PASS | Arms differ only in the eight switches (`armPreset`, checked by `definitionProblems`); same build, start bytes, model, sampling, caps. |
| PB5 | PASS | One change (the bundle) with the hypothesis in the worklog. |
| PB6 | PASS | 15-min and 60-min caps; runner adopts long trials across restarts; the wall cap is the only behavioral end (`replyFailuresEndRun: false`, loop-guard supervisor required). |
| PB7 | PASS | No run_start/run_end ⇒ invalid with reason; every launch has a ledger line before spawn. |
| PB8 | PASS | Reply failures are counted (retry events) and bounded by the cap, not silently ending runs; M2 reclassified the five 2×2 ends with evidence. |
| PB9 | PASS | Lane problems pause with a written reason and retry; reserve exhaustion waits for the operator; nothing guesses. |
| PB10 | PASS | All gates run in full; coverage ≥ 90 per metric on both stacks; no skipped tests. |
| PB11 | PASS | llama.cpp build, model path, slots, ctx and vision are read live from `/props` before every trial. |
| PB12 | N/A | No macOS privacy-protected resources touched. |
| PB13 | PASS | Analysis is run on the 2×2 cohort's real runs and cross-checked against a raw grep and scipy. |

## Session Log

- 2026-10-15 17:45 EDT: Finals confirmed stopped (`finals-withdrawn.json`; the last trials record "operator stopped the run"; no runner). GPU0 cleared and a twin think-fast started; the bot stack disabled; the lane-B tunnel added. Power analysis and plan B chosen by the operator.

- 2026-10-15 20:30 EDT: M2 traced (table above). Agent RED: Governor tests for `replyFailuresEndRun: false`, preset schema, run_start record, single-model llama-server discovery (7 failing, 95 passing in the four files).
- 2026-10-15 20:50 EDT: Agent GREEN: `limits.replyFailuresEndRun` (Governor, preset schema, `run_start.evaluation.reply_failures_end_run`, `schemas/events.v1.json` regenerated), single-model llama-server discovery in `discoverLocal`. Agent vitest 70 files / 1090 tests pass; agent tsc and eslint clean. The RED live-objectives test was narrowed to the run_start record: the mocked run has ended by the time a test can drive its Governor, and harness.test covers the Governor behavior.
- 2026-10-15 21:40 EDT: Viewer RED: tests for the fixed-run driver (`fixed-design`, `fixed-ledger`, `fixed-runner`, `fixed-status`, `fixed-analysis`, `fixed-cli`), the queue-view status card and `/api/experiments` `fixedRuns`. All six new test files fail to import; 3 tests fail in the queue-view and server-experiments files; 12 pass.
- 2026-10-15 22:00 EDT: Operator merge rule recorded (Decisions). 22:15 EDT: operator burn-in (~3 h, both lanes, 15-min fixed-control trials from CLOCK_SET, worktree /private/tmp/pokebench-burnin, status ~/.hermes/cache/scratch/burnin/status.json, runs under runs/burnin-2026-10-15/) is running: M3 probes kept to three short requests per lane; M4 waits for the operator to stop it; its report's model_error evidence goes to M2.
- 2026-10-15 22:35 EDT: Viewer RED was `feaefc3`. Viewer GREEN: `fixed-design`, `fixed-ledger`, `fixed-runner`, `fixed-status`, `fixed-analysis`, `fixed-cli`, the queue-view card, `/api/experiments` `fixedRuns`, `just fixed-run`, the draft definition. Gates: `just test` agent 70 files / 1090, viewer 58 / 735, env 1877 passed; `just lint` 0; `just build` 0; `just coverage` agent 97.5 / 93.88 / 98.15 / 98.88, viewer 95.31 / 90.55 / 94.13 / 97.9 (stmts / branches / funcs / lines); `just verify-vendor` OK.
- 2026-10-15 22:50 EDT: Cloud review of `5340c08..761e8a6` (diff sha256 `0374e9e8…`). Codex gpt-5.6-sol: BLOCKING, three findings; grok (Cursor): LGTM with notes, triaged by the operator. Operator dispositions: Codex 2 (maxTurns 20000) rejected by operator decision; fix Codex 1, Codex 3 and grok (a), (b), (c). RED for Codex 1 and 3 (ledger: no milestone after the wall cap counts; analysis: Fisher counts a late primary as a miss; runner: one pinned commit for every build check and launch).
- 2026-10-15 23:05 EDT: Merged main (bundle 4b5b8bf and decision-point screening 954d74f) into the branch. RED for grok (a) a lane survives an unexpected I/O throw, (b) the definition requires both loop-guard switches on and the analysis prints a WARNING table of valid trials that ended before the wall cap, (c) run_start records `evaluation.features` and the classifier checks the eight switches and the off-in-both flags against the arm.
- 2026-10-15 18:58 EDT: GREEN for the five blockers (RED `19f3784`, `8ea1018`): ledger drops milestones after the wall cap; Fisher counts a late primary as a miss; one pinned commit per run; lanes survive unexpected I/O throws (pause, write status, retry); definition requires both loop-guard switches; analysis WARNING table for valid trials ending before the cap; run_start `evaluation.features` checked against the arm. Plan re-frozen with seed `b70b39b399e5bbae`.
- 2026-10-15 19:00 EDT: Control base pinned to the finals incumbent (Pre-registration). RED: `controlBaseProblems` (sha256, preset id, sampling, limits, every non-switch flag) and CLI refusal when the preset is missing or drifted (12 failing in fixed-design/fixed-cli).
- 2026-10-15 19:01 EDT: GREEN: `controlBase` in the schema and definition; `controlBaseProblems` in fixed-design; every CLI load checks it; `check` prints the matched control base. Verified the real definition against the real `finals-incumbent.json` (definition sha256 `b98add43…`, pre-merge).
- 2026-10-15 19:06 EDT: Gates at `4cdb29a` (main `1bb327e` already merged, nothing new on main): `just test` agent 80 files / 1251, viewer 58 / 759, env 1962 passed; `just lint` 0; `just build` 0; `just coverage` agent 97.59 / 94.14 / 97.85 / 99.02, viewer 95.34 / 90.5 / 94.19 / 97.89, env lines 97.03 / branches 92.57 / functions 100 (stmts / branches / funcs / lines); `just verify-vendor` OK. Scoped cloud re-review of `19f3784` + `a0092a1..4cdb29a` (docs and definition JSON excluded; diff sha256 `850e0276…`) started: Codex gpt-5.6-sol and grok (Cursor).
- 2026-10-15 19:40 EDT: Re-review of `19f3784` + `a0092a1..4cdb29a`: Codex `VERDICT: BLOCKING` (2), grok `VERDICT: LGTM`. Operator triage: BLOCK Codex 1 (started-record I/O in the spawn listener escapes every catch and can kill the runner; with it, grok's residual: a throw inside `pause()` rejects `Promise.all` and drops the lease while the other lane runs; rule 1) and Codex 2 (the cap classifier must use paused-time-excluded elapsed time like the production `BudgetTimer`; rules 2/4). Merged main `3c4c26f` (auto-advance `0d589f1`). RED: three failing tests in fixed-runner/fixed-ledger.
- 2026-10-15 19:50 EDT: GREEN: the started callback sets the child first and catches its ledger/runner-file writes (reason in `lastError` and the lane); every runner log line goes through a non-throwing `say`, so `pause()` and status writes cannot reject a lane loop; `classifyTrial` subtracts applied `paused_ms` before comparing a milestone with the cap and reports unpaused `primaryMs`/`furthestMs`.
- 2026-10-15 20:00 EDT: Gates at `219f7c9` + test-type fix: `just test` agent 80 / 1263, viewer 58 / 762, env 1962; `just lint` 0 (after adding `turn` to the pause fixture events); `just build` 0; `just coverage` agent 97.61 / 94.19 / 97.85 / 99.02, viewer 95.35 / 90.54 / 94.19 / 97.89, env 97.03 / 92.57 / 100; `just verify-vendor` OK. Delta re-review `cc6372d..219f7c9` (sha256 `faca790f…`) running: Codex gpt-5.6-sol, grok.
- 2026-10-15 19:26 EDT: Delta re-review `cc6372d..219f7c9`: grok `VERDICT: LGTM` (both blockers cleared; non-blocking: bare `host.log`/post-exit `writeRunner` in `play`/`record` now only cost a backoff; a lost `started` pid degrades only restart adoption; open pauses lack `paused_ms`). Codex `VERDICT: BLOCKING` on one item only: the pause fixtures omitted `turn` (TS2345, `just lint` exit 2), already fixed test-only in `f17700b` with `just lint` 0; not an operator-rule blocker. Merging into main.
- 2026-10-15 19:28 EDT: Merged into main at `4ce5e7a` (`--no-ff`; main was `3c4c26f`, quiet, no runner.json). `just build` 0. `just fixed-run check bundle-v-control` from `~/dev/pokebench` passes against the real `finals-incumbent.json`; definition sha256 `b98add435a0ed044d57cd91c2ec3af1cefc93061041da18de2e21d75a9a981f5`, approval none. Not dry-run, approved or launched (burn-in on both GPUs).

## Deferred

(Non-blocking review findings under the operator merge rule, one line each.)

- Codex: the runner records each lane's serving fingerprint but neither compares fingerprints across lanes nor reads `/v1/models`; M3 supplies that assurance.
- grok: the `/v1/models` probe wording.
- grok: no backoff before a replacement trial.
- grok: `operator_stop` treated as invalid.
- **Rejected by operator decision (Codex 2, maxTurns 20000 as an early end):** no run has come near 1500 turns, so a 20000-turn cap cannot bind within 15 or 60 minutes. Not fixed.
- grok: `plan` / `analyze` load without the control-base gate; the launch paths (`check`, `approve`, `run`, `dry-run`) gate it.
- grok: `controlBaseProblems` compares sampling by `JSON.stringify` without sorting keys; a key-order change fails closed.
- grok: analysis re-caps the primary but not `furthest*` for ledger rows written before the classifier fix; no such rows exist.
- Codex/grok: the review bundle lacked `finals-incumbent.json` (it lives under gitignored `runs/`); `check` from `~/dev/pokebench` re-hashes it.
- grok: `play`/`record` bare `host.log` and post-exit `writeRunner` throws cost the lane one backoff after a recorded trial.
- grok: a failed `started` append leaves no pid, so only a mid-trial runner restart adopts without it.
- grok: an open pause (no `paused_ms` yet) is not subtracted; completed trials always close it.
- Codex: the two new runner tests run the full 12-trial fixture; a smaller plan would be faster.

## Surprises

- The first SSH connection attempt returned "No route to host" while ping and llama traffic were fine; the retry seconds later connected. Transient. Don't conclude the host is down from one failure.

## Multi-Model Review Log

## Boy Scout Log
