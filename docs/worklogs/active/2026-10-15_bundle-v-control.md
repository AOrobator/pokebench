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
- Control arm: main after the bundle, decision-point, fade-settle and auto-advance-qualify merges, all eight bundle switches off.
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

## Session Log

- 2026-10-15 17:45 EDT: Finals confirmed stopped (`finals-withdrawn.json`; the last trials record "operator stopped the run"; no runner). GPU0 cleared and a twin think-fast started; the bot stack disabled; the lane-B tunnel added. Power analysis and plan B chosen by the operator.

- 2026-10-15 20:30 EDT: M2 traced (table above). Agent RED: Governor tests for `replyFailuresEndRun: false`, preset schema, run_start record, single-model llama-server discovery (7 failing, 95 passing in the four files).
- 2026-10-15 20:50 EDT: Agent GREEN: `limits.replyFailuresEndRun` (Governor, preset schema, `run_start.evaluation.reply_failures_end_run`, `schemas/events.v1.json` regenerated), single-model llama-server discovery in `discoverLocal`. Agent vitest 70 files / 1090 tests pass; agent tsc and eslint clean. The RED live-objectives test was narrowed to the run_start record: the mocked run has ended by the time a test can drive its Governor, and harness.test covers the Governor behavior.
- 2026-10-15 21:40 EDT: Viewer RED: tests for the fixed-run driver (`fixed-design`, `fixed-ledger`, `fixed-runner`, `fixed-status`, `fixed-analysis`, `fixed-cli`), the queue-view status card and `/api/experiments` `fixedRuns`. All six new test files fail to import; 3 tests fail in the queue-view and server-experiments files; 12 pass.
- 2026-10-15 22:00 EDT: Operator merge rule recorded (Decisions). 22:15 EDT: operator burn-in (~3 h, both lanes, 15-min fixed-control trials from CLOCK_SET, worktree /private/tmp/pokebench-burnin, status ~/.hermes/cache/scratch/burnin/status.json, runs under runs/burnin-2026-10-15/) is running: M3 probes kept to three short requests per lane; M4 waits for the operator to stop it; its report's model_error evidence goes to M2.
- 2026-10-15 22:35 EDT: Viewer RED was `feaefc3`. Viewer GREEN: `fixed-design`, `fixed-ledger`, `fixed-runner`, `fixed-status`, `fixed-analysis`, `fixed-cli`, the queue-view card, `/api/experiments` `fixedRuns`, `just fixed-run`, the draft definition. Gates: `just test` agent 70 files / 1090, viewer 58 / 735, env 1877 passed; `just lint` 0; `just build` 0; `just coverage` agent 97.5 / 93.88 / 98.15 / 98.88, viewer 95.31 / 90.55 / 94.13 / 97.9 (stmts / branches / funcs / lines); `just verify-vendor` OK.

## Deferred

(Non-blocking review findings under the operator merge rule, one line each.)

## Surprises

- The first SSH connection attempt returned "No route to host" while ping and llama traffic were fine; the retry seconds later connected. Transient. Don't conclude the host is down from one failure.

## Multi-Model Review Log

## Boy Scout Log
