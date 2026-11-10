# Game clear ends the run (game-clear-completion-v1)

## Problem Statement

Opus run `2026-11-10T13-52-15_opus-drake-continuation_b5a8` confirmed `GAME_CLEAR_CONFIRMED` at turn 54 (2:09:54 PM NY) and kept playing for 64 turns until an operator abort at 2:13 PM:

- The harness ends at a milestone only through `terminationTarget(preset)` = `stopAt ?? target`. Preset `opus-rayquaza-lane` has neither, so the native game clear ended nothing, although CLAUDE.md lists native game completion as a way a run ends.
- The credits (`CB2_StartCreditsSequence`, `CB2_Credits`) and THE END are unknown screens. The readout said `Screen: unknown (callback2 0x081754DD)` and `Interface: unsupported ... Observe and report this coverage error`, so the model called observe 62 times.
- 16 of the run's 18 `harness_bug` native actions are that one coverage error: `diagnostic_kind` keeps `0x` values, so every new credits task list made a new row.

The operator approved the proposal with "continue" (thread message [private message reference], 2026-11-10).

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, pokebench-game-state, close-the-loop, agent-observability, tool-prompt-sync (no tool change), only-operator-ends-a-run rule.

## Architecture

- Server (`env/pokebench_env`): `game_screen.CREDITS_CALLBACKS` classifies the two credits callbacks as `Screen: credits` when the switch is on. `ui_state` reports `credits` or `the_end` (task `Task_CreditsTheEnd1..6` or `Task_CreditsSoftReset` active) as input-not-needed instead of `unsupported`. `rerender.py` threads `game_clear_completion_enabled`. The native action observer (recording only) always classifies them, and dedupes unsupported-screen diagnostics by callback2.
- Agent (`packages/agent`): `GameClearStop` watches for an observed `GAME_CLEAR_CONFIRMED` followed by a `state` event on `credits` (the game's own Hall of Fame save, `Task_Hof_TrySaveData`, runs before `CB2_StartCreditsSequence`). Then live.ts saves `checkpoints/GAME_CLEAR_FINAL.state` + `.json` and stops with run_end reason `completed` and a `target_proof`.

ROM verification (US Emerald, sha1 f3ae0881…): literal pools show `0x08175621` loaded at 0x08174190 (hall of fame exit), `0x081754DD` loaded inside `0x08175621`'s body (0x08175734), and the chain `0x08175A9D→…AE5→…B1D→…B91→…BD9→…C35→0x08175CC9`, each literal sitting in the previous task's pool, matching `Task_CreditsTheEnd1..6 → Task_CreditsSoftReset` in pret credits.c.

## Invariants

- INV-1: Switch OFF reproduces today's readout bytes and run end. Test: OFF fixtures.
- INV-2: The stop needs an *observed* `GAME_CLEAR_CONFIRMED` of this run (not present_at_start, not replayed) and a later credits state. Test: unit cases.
- INV-3: No new stop limit: the only new end is native game completion (CLAUDE.md "Only the operator ends a run"). A run whose preset already stops at the flag is unchanged.
- INV-4: The final save never replaces an earlier checkpoint and records provenance first.

## Security Review

No new network surface; saves go through the existing loopback `/pokebench/checkpoint` route; paths are run-owned.

## Milestones

**M1 — Credits readouts and stop at game clear**
- [x] Write tests (server readout ON/OFF, observer dedupe, GameClearStop, final save, factory wiring): env/tests/env/test_game_clear_completion.py (17), packages/agent/src/game-clear-stop.test.ts (12)
- [x] COMMIT RED: `test(game-clear): pin credits readouts and the game-clear stop` (see git log; tests import modules absent on main)
- [x] Implement
- [x] Cheap checks: ruff/format/mypy on changed Python, tsc + eslint on changed TS; focused pytest 17/17, agent vitest (features, play-preset, harness, opus-rayquaza, game-clear-stop) 137/137, viewer panels + next-run 178/178. Wiring deleted once (rerender line; governor.stop) and both tests went red, then restored.
- [x] COMMIT GREEN: `feat(game-clear): end the run at the credits after an observed game clear` (48e6d2131)
- [x] Gates (coordinator CPU window, head 48e6d2131): just test exit 0 (agent 246 files/3004, viewer 114/1250, env 3083 + gateway 38, all floors, no-I/O proof OK); just lint exit 0 (first try failed only on the missing native mGBA binding in the fresh venv, fixed by symlinking main's build); pnpm -r build exit 0; just verify-vendor OK
- [x] Explainer: docs/explainers/game-clear-completion-v1.html, mapped in FEATURE_EXPLAINERS; pages-check clean
- [x] Review on frozen packet base 7106651 head 48e6d2131 diff sha256 a6426c5f…ad2: Codex gpt-5.6-sol round 1 BLOCKING (gate evidence only), round 2 LGTM; Claude lane (claude -p OAuth expired, so read-only Claude subagent per standing rule) LGTM; fallback subagent (sonnet) LGTM
- ASK USER: show the operator before landing

## Closing the Loop

Rehearsal: replay b5a8's recorded events through GameClearStop; rerender b5a8's credits RAM samples with the switch on.

## Session Log

- Rehearsal: rerender of b5a8 raw RAM (turns 55-117): OFF byte-matches the recorded `Screen: unknown (callback2 0x081754DD)` + coverage error; ON reads `Screen: credits` with `credits` then `the_end`. Replay of b5a8 events through GameClearStop ends at event 3024, turn 60, 2:10:15 PM NY.

- 2026-11-10: forensics on b5a8, ROM address verification, worklog.

## Surprises

- The run's start note said to continue until the Hall of Fame, but the preset never set `stopAt`.

## Multi-Model Review Log

Non-blocking notes kept: (1) the harness_bug dedupe also applies to the clock-owner diagnostic and is not switched (recording only, so harness_bug counts change across this pin); (2) flag and first credits state in one sample would delay the stop to the next credits state (credits last minutes); (3) aborts after completed are ignored, as for milestone; (4) INV-4 wording: a rerun cannot overwrite since each run has its own dir; (5) a live run that reaches the credits is still the outstanding proof.

## Boy Scout Log

- Noticed, not fixed (out of scope): the Hall of Fame readout's controls say "B exits PC" on the post-League Hall of Fame, which is the PC viewer's wording.

## Archive Milestone (user-gated)
- ASK USER: archive
