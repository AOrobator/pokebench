# Early talk: auto-talk field-only fix, auto-talk-v3, untalked-people header

Operator approval: The operator 2026-10-22 12:50 PM ET in the "Finding May" thread: "it doesn't make sense to fire auto talk while battling....lets def do 1 and 2 as separate switches. firing auto talk during a battle is a bug that needs to be fixed".

## Problem Statement

The 10/22 holistic frontier report (runs/reports/run-analysis/2026-10-22_holistic-frontier): every run that heard MAY's mother ("MAY went out to ROUTE 103") found MAY within 3–8 min; the others took 11.5–68.6 min. 47c3 left the mother's room at T97 while the ledger said she was last talked to "5 story milestones since".

auto-talk-v1 cannot help: it is a loop breaker (8 identical turns or 3 tool-less replies). Since 10/20 it fired 359 times, talked 37 times (1 story character, 26 people, 10 signs), and 318 fires were not_free no-ops: evolution 157, battle 67, field yes/no 65, shop 22 (tallied from runs/2026-10-2*/events.jsonl). One battle fire sent a SUPERVISOR message into the battle.

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, feature-explainer, agent-observability, close-the-loop, talk-to-codex.

## Architecture

Three bundle-only switches, default off, each its own registry entry and pending experiment.

1. `auto-talk-field-only-v1` (guard, needs auto-talk-v1). While a battle owns the game (the battle screen, or in_battle with no ready non-battle interface), auto-talk does nothing: no auto_talk event, no SUPERVISOR message, and the loop is not marked acted, so it may act once the field is free and the loop still holds. Other non-free screens (a ready post-battle evolution decision, yes/no, shop) record no not_free no-op; field-ownership-feedback-v1, when on, keeps its one note per interface. A walk a wild battle interrupts is still recorded. Off: today's behavior.
2. `auto-talk-v3` (guard, needs auto-talk-v1). Replaces auto-talk's trigger: after `AUTO_TALK_QUIET_TURNS` (10) of the model's turns on the free field of one map with no story milestone (counted from entering the map, the latest story milestone, or the last auto-talk), the harness walks to one person not talked to since the latest story milestone and presses A. Rank: story characters the readout places here, then people talked to earlier in the run (before the milestone), then people never talked to, then signs; nearest first within a rank. Acts only on the free field (no not_free events). Does not need the fixed-point breaker. Message: "SUPERVISOR: Your last 10 turns on this map brought no story milestone, so the harness walked you to <name> at (x,y) and pressed A. It has not chosen where to go next; this is what they said." Off: v1's loop trigger.
3. `untalked-people-header-v1` (observation, needs harness-trust-v1). One line in the "Read from game memory, always true:" header on overworld results: "People on this map you have not talked to since your last story milestone: object 4, sprite WOMAN_4, at (2,4), last talked to on turn 64; object 2, sprite FAT_MAN, at (5,6), not talked to this run." or "...: none." Story characters character-presence names are shown by name. Item balls are not people. Off: header bytes unchanged.

Story milestone = kind story, origin not present_at_start, not in MEASUREMENT_ONLY_MILESTONES (the stall gate's rule).

## Invariants

- INV-1 OFF parity: each switch off leaves prompts, tool results, events and walks byte-identical (tests per switch).
- INV-2 With field-only on: no harness action, auto_talk event or message while a battle owns the game, and no not_free no-op elsewhere (field-ownership-feedback-v1's one note per interface stays). With v3 on: the quiet trigger counts and acts only on the free field.
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
- [x] Claude, GPT and fallback (Grok stand-in) LGTM on the frozen packet
- [x] land-join, ff-only merge 352b81f45, evidence commit, land-done, just viewer-main

## Closing the Loop

Unit and factory tests; a recorded-state replay of auto-talk on a battle state; explainer pages served at 127.0.0.1:8791 and listed in viewer Reports (headless checks only, per the operator's no-focus rule).

## Session Log
- COMMIT: `feat(agent): auto-talk field-only, auto-talk-v3 and untalked-people header switches` (23a7c304b)
- GREEN gates (2026-10-22): vitest agent 4542 passed, viewer 1694 passed (two timing flakes, serial-comparison hung-child and live-human, passed on rerun); pytest 3959 passed, 1 failed (test_view production main, needs the mGBA binding absent from this worktree's venv; Python unchanged). Coverage: agent lines 99.22 / branches 93.37 / functions 97.97; viewer 97.96 / 91.43 / 94.43; Python 97.30 / 93.35 / 99.76 (floor 90). Lint: tsc + eslint clean both packages, ruff clean, mypy clean with the main venv. Build OK.
- Delete-once checks: removing untalkedPeople from play-wiring turned the factory test red; removing the field-only battle return and the v3 breaker bypass in auto-talk.ts turned their tests red; all restored.
- COMMIT: `test(agent): RED auto-talk field-only, auto-talk-v3 and untalked-people header` (8d5c4a16f)
- 2026-10-22 RED: 18 failing, 5 passing (OFF baselines) across the three new test files. One RED commit for all three switches.

## Surprises
- Appending three switches moves every positional registry assertion (.at(-N), .slice(-N)); 70+ test files updated mechanically, LEGACY_ALL_ON gets the three ids OFF, and incumbent-key filters exclude them.
- This worktree's env/.venv has no mGBA binding (just build-mgba is once per clone): mypy's mgba._pylib import and tests/env/test_view.py's production-server start fail here. No Python changed on this branch; mypy passes with the main checkout's venv.

## Multi-Model Review Log
- Round 4 (ad3deabe…0736): Claude LGTM, fallback LGTM; GPT BLOCKING because main gained 1e1bc7a7e between sync and seal (packet reverted another worklog). Took the landing slot, re-synced.
- Round 5 (packet 1fc2226e…7da3a, 1e1bc7a7e..352b81f45): Claude CLI LGTM, Codex GPT (gpt-5.6-sol) LGTM, fallback Sonnet reviewer LGTM (Grok lane: Cursor out of usage; The operator "land without grok", 2026-10-22 10:47 AM ET).
- LANDED: git merge --ff-only 352b81f45 on local main (2026-10-22, NY time ~1:55 PM). just test on main: vitest agent 4546, viewer 1701, pytest 3961 passed.
- Round 3 (packet f9405bab…34e2, a0c3d6138..1081f2056): Claude CLI LGTM (follow-ups: v3 walks still cite "the fixed-point breaker's auto-talk" in navigate's because argument; unused acted under v3 — deferred, model-invisible). Fallback (Sonnet) LGTM. Codex GPT (gpt-5.6-sol) BLOCKING: the three pending experiments pinned source.commit 23a7c304b, before the header fix. Triage: Fix. Pinned all three to 1081f2056.
- Round 2 (packet 696547ca…770f6, a0c3d6138..f08ade79b): Claude CLI LGTM (follow-ups: worklog Architecture/INV-2 text stale, now updated). Fallback reviewer (Sonnet subagent, standing in for Grok per the operator "land without grok", 2026-10-22 10:47 AM ET) LGTM, with a non-blocking note that the header may not count harness auto-talks. Checked against recorded runs: auto-talk presses record dialogue_auto_advance but no tool_result (34 vs 0 in runs/2026-10-2*), so the header's ledger never committed them. Triage: Fix. PeopleLedger(countAutoTalk) counts auto_talk talked events for the header only (people-ledger-v1 unchanged); RED test added, delete-once proven. Codex CLI GPT lane errored (default model gpt-6.1-sol unsupported on the ChatGPT account); rerun pinned to -m gpt-5.6-sol on the round-3 packet.
- Round 1 (packet 0531dfa1…f0dab, a0c3d6138..9f99dd7c4; principles 10 PASS / 3 N/A / 0 FAIL):
  - Claude CLI (~/.claude-review, plan mode): BLOCKING, one finding: no test covers the in_battle + ready non-battle interface exception (post-battle evolution decision). Triage: Fix (a guard with no red test). Added the evolution-decision test (delete-once: dropping the ready clause turns it red) and pinned the interrupted-walk not_free record the reviewer listed as hardening. Speculation (retried request double-counts quiet turns) rebutted: no failure shown; transform runs once per model request.
  - Cursor Grok (cursor-grok-4.5-high) and Cursor GPT (gpt-5.6-sol-xhigh): not run, Cursor "You're out of usage" (ActionRequiredError). GPT lane switches to isolated Codex CLI (standing harness switch). Grok has no other harness: lane blocked, so no self-merge without the operator's word.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive
