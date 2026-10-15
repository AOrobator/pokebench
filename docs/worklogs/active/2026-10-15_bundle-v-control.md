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

## Session Log

- 2026-10-15 17:45 EDT: Finals confirmed stopped (`finals-withdrawn.json`; the last trials record "operator stopped the run"; no runner). GPU0 cleared and a twin think-fast started; the bot stack disabled; the lane-B tunnel added. Power analysis and plan B chosen by the operator.

- 2026-10-15 20:30 EDT: M2 traced (table above). Agent RED: Governor tests for `replyFailuresEndRun: false`, preset schema, run_start record, single-model llama-server discovery (7 failing, 95 passing in the four files).

## Surprises

- The first SSH connection attempt returned "No route to host" while ping and llama traffic were fine; the retry seconds later connected. Transient. Don't conclude the host is down from one failure.

## Multi-Model Review Log

## Boy Scout Log
