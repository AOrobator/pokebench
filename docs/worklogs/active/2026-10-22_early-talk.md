# Early talk: auto-talk field-only fix, auto-talk-v3, untalked-people header

Operator approval: The operator 2026-10-22 12:50 PM ET in the "Finding May" thread: "it doesn't make sense to fire auto talk while battling....lets def do 1 and 2 as separate switches. firing auto talk during a battle is a bug that needs to be fixed".

## Problem Statement

The 10/22 holistic frontier report (runs/reports/run-analysis/2026-10-22_holistic-frontier): every run that heard MAY's mother ("MAY went out to ROUTE 103") found MAY within 3–8 min; the others took 11.5–68.6 min. 47c3 left the mother's room at T97 while the ledger said she was last talked to "5 story milestones since".

auto-talk-v1 cannot help: it is a loop breaker (8 identical turns or 3 tool-less replies). Since 10/20 it fired 359 times, talked 37 times (1 story character, 26 people, 10 signs), and 318 fires were not_free no-ops: evolution 157, battle 67, field yes/no 65, shop 22 (tallied from runs/2026-10-2*/events.jsonl). One battle fire sent a SUPERVISOR message into the battle.

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, feature-explainer, agent-observability, close-the-loop, talk-to-codex.

## Architecture

Three bundle-only switches, default off, each its own registry entry and pending experiment.

1. `auto-talk-field-only-v1` (guard, needs auto-talk-v1). While a battle or a non-field screen (battle, evolution, any screen other than overworld, or in_battle) owns the game, auto-talk does nothing: no auto_talk event, no SUPERVISOR message, and the loop is not marked acted, so it may act once the field is free and the loop still holds. Overworld interfaces (yes/no, shop) keep today's field-ownership-feedback-v1 behavior. Off: today's behavior.
2. `auto-talk-v3` (guard, needs auto-talk-v1). Replaces auto-talk's trigger: after `AUTO_TALK_QUIET_TURNS` (10) of the model's turns on the free field of one map with no story milestone (counted from entering the map, the latest story milestone, or the last auto-talk), the harness walks to one person not talked to since the latest story milestone and presses A. Rank: story characters the readout places here, then people talked to earlier in the run (before the milestone), then people never talked to, then signs; nearest first within a rank. Acts only on the free field (no not_free events). Does not need the fixed-point breaker. Message: "SUPERVISOR: Your last 10 turns on this map brought no story milestone, so the harness walked you to <name> at (x,y) and pressed A. It has not chosen where to go next; this is what they said." Off: v1's loop trigger.
3. `untalked-people-header-v1` (observation, needs harness-trust-v1). One line in the "Read from game memory, always true:" header on overworld results: "People on this map you have not talked to since your last story milestone: object 4, sprite WOMAN_4, at (2,4), last talked to on turn 64; object 2, sprite FAT_MAN, at (5,6), not talked to this run." or "...: none." Story characters character-presence names are shown by name. Item balls are not people. Off: header bytes unchanged.

Story milestone = kind story, origin not present_at_start, not in MEASUREMENT_ONLY_MILESTONES (the stall gate's rule).

## Invariants

- INV-1 OFF parity: each switch off leaves prompts, tool results, events and walks byte-identical (tests per switch).
- INV-2 No harness action or auto_talk event while a battle or a non-field screen owns the game when field-only or v3 is on.
- INV-3 No walkthrough: no text names a person, place or step the game has not shown; names come from the game's object list and character-presence.
- INV-4 Production wiring honors each switch (factory tests; delete-wiring-once check).

## Security Review

No subprocesses, paths or network changes. Harness-chosen walks reuse navigate_to and press, recorded as auto_talk events.

## Milestones

**M1 — auto-talk-field-only-v1**
- [x] RED tests (auto-talk-field-only.test.ts: 4 fail, 2 OFF baselines pass)
- [x] GREEN + registry/presets/defaults
**M2 — auto-talk-v3**
- [x] RED tests (auto-talk-v3.test.ts)
- [x] GREEN + wiring
**M3 — untalked-people-header-v1**
- [x] RED tests (untalked-people-header.test.ts)
- [x] GREEN + wiring
**M4 — explainers, pending experiments, readiness rows**
- [x] Explainers (Emerald theme, pages-check clean), FEATURE_EXPLAINERS, experiments/*.json, readiness.md
- [x] Gates: just test, just lint, just build, just coverage (90)
**M5 — review and land**
- [ ] Claude, Grok, GPT lanes LGTM on the frozen packet
- [ ] land-join, ff-only merge, just viewer-main, evidence commit, land-done

## Closing the Loop

Unit and factory tests; a recorded-state replay of auto-talk on a battle state; explainer pages served at 127.0.0.1:8791 and listed in viewer Reports (headless checks only, per the operator's no-focus rule).

## Session Log
- GREEN gates (2026-10-22): vitest agent 4542 passed, viewer 1694 passed (two timing flakes, serial-comparison hung-child and live-human, passed on rerun); pytest 3959 passed, 1 failed (test_view production main, needs the mGBA binding absent from this worktree's venv; Python unchanged). Coverage: agent lines 99.22 / branches 93.37 / functions 97.97; viewer 97.96 / 91.43 / 94.43; Python 97.30 / 93.35 / 99.76 (floor 90). Lint: tsc + eslint clean both packages, ruff clean, mypy clean with the main venv. Build OK.
- Delete-once checks: removing untalkedPeople from play-wiring turned the factory test red; removing the field-only battle return and the v3 breaker bypass in auto-talk.ts turned their tests red; all restored.
- COMMIT: `test(agent): RED auto-talk field-only, auto-talk-v3 and untalked-people header` (8d5c4a16f)
- 2026-10-22 RED: 18 failing, 5 passing (OFF baselines) across the three new test files. One RED commit for all three switches.

## Surprises
- Appending three switches moves every positional registry assertion (.at(-N), .slice(-N)); 70+ test files updated mechanically, LEGACY_ALL_ON gets the three ids OFF, and incumbent-key filters exclude them.
- This worktree's env/.venv has no mGBA binding (just build-mgba is once per clone): mypy's mgba._pylib import and tests/env/test_view.py's production-server start fail here. No Python changed on this branch; mypy passes with the main checkout's venv.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive
