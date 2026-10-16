# Transition loop detection (F2 of the pre-launch fixes)

Parent: `docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (branch `claude/prelaunch-fixes`), milestone M1, fix F2. Approved by the operator 2026-10-16 12:46 AM EDT. Switch `transition-loop-detection-v1`, default off; the integrator turns it ON in both arms (M6).

## Problem

The deterministic loop guard is blind to door/stairs bounces.
- `semanticState` returns null whenever field controls are locked and no qualified message is open. A door or stairs arrival is locked for the warp/door animation.
- A null fingerprint on either side of a press clears the cycle history (`this.history.length = 0`). In a bounce that happens twice per round trip.
- Evidence: control run `2026-10-15T23-47-41_qwen36-gpu0_2919` bounced in and out of Birch's lab 18 times from T200 to T247 (seq 3097–4239); the last loop_guard event is seq 2752. `2026-10-13T21-52-04_think-fast_d6bb` has 38 map changes after its last milestone and zero guard events.

## Design (ON)

1. A transient lock does not clear the cycle history; the step is skipped. Transient = overworld, started, not in battle, position known, field controls locked, no active UI, no dialogue or message, and the game's global script context is stopped (`resources.script_mode` 0 = SCRIPT_MODE_STOPPED, `script_status` 2 = CONTEXT_SHUTDOWN; pokeemerald `src/script.c` 10–21, read at 0x03000E40/0x03000E38 by `env/pokebench_env/resources.py`). Any other null (dialogue, running script, unknown resources) clears the history as today.
2. Map ping-pong: every completed game call whose state is on a different map from the call's before state (or the last known map) records a `from>to` move. Moves reset when story, party, money, badges, bag or PC items change, and on a new story milestone. When the last moves repeat a 2–4 move pattern `cycleRepeats` (3) times, the guard raises a `cycle` hit through the existing warning → supervisor path.
3. Recovery, thresholds and messages of the existing kinds are unchanged.

OFF: no skip, no map moves; byte-identical to today.

## Milestones

**M1 — F2 transition loop detection**
- [x] RED: 2919 seq 3090–4239 replay fires a cycle within a bounded number of bounces (ON) and stays silent (OFF); synthetic stairs bounce; real MOM conversation (2919 seq 1800–1900) and a script lock produce no new notice; progress resets the ping-pong; production factory honors the switch
- [ ] GREEN: switch registered, LoopDetector + attachLoopGuard + live/decision-probe wiring
- [ ] Wiring-deletion check (red once, restored)
- [ ] Replay receipts on 2919 and d6bb
- [ ] Explainer + FEATURE_EXPLAINERS mapping
- [ ] Gates: test, lint, build, coverage (90), verify-vendor
- [ ] Review: Codex + grok

## Progress Log

- 2026-10-16: Worktree `/private/tmp/pokebench-m1-loop` from main fa09dbe6. Baseline replay (dp-replay.mjs): 2919 last notice T179 seq 2751; d6bb zero notices.

- 2026-10-16: RED committed: transition-loop-detection.test.ts (5 of 12 fail: no notice ON on 2919/stairs/skip; OFF silence, conversation equality and lock-clearing cases pass today) and the live.ts factory test (fails: preset does not know the switch). Fixtures: trimmed 2919 events (seq 3090–4239, 1800–1900), gzipped.

## Surprises

## Multi-Model Review Log
