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
- [x] GREEN: switch registered, LoopDetector + attachLoopGuard + live/decision-probe wiring
- [x] Wiring-deletion check (red once, restored)
- [x] Replay receipts on 2919 and d6bb
- [x] Explainer + FEATURE_EXPLAINERS mapping
- [x] Gates: test, lint, build, coverage (90), verify-vendor
- [ ] Review: Codex + grok

## Progress Log

- 2026-10-16: Worktree `/private/tmp/pokebench-m1-loop` from main fa09dbe6. Baseline replay (dp-replay.mjs): 2919 last notice T179 seq 2751; d6bb zero notices.

- 2026-10-16: RED committed: transition-loop-detection.test.ts (5 of 12 fail: no notice ON on 2919/stairs/skip; OFF silence, conversation equality and lock-clearing cases pass today) and the live.ts factory test (fails: preset does not know the switch). Fixtures: trimmed 2919 events (seq 3090–4239, 1800–1900), gzipped.
- 2026-10-16: GREEN. `LoopDetector` gets `transitions` (constructor + `attachLoopGuard` 7th arg), wired from `features["transition-loop-detection-v1"]` in live.ts and decision-probe.ts. Registry: guard, needs null, recorded last; presets/flagFeatures/next-run default false. Explainer docs/explainers/transition-loop-detection-v1.html, mapped in FEATURE_EXPLAINERS.
  - Wiring deletion: dropping the live.ts argument turns the factory test red (1 failed); disabling the skip turns "transient lock is skipped" red. Both restored.
  - Replay (dp-replay with the switch): 2919 OFF last notice T179 seq 2751; ON warning+supervisor T205 seq 3244 (third lab entry), recovered T215, warning T216 seq 3516, supervisor every 6 calls to T246, no stop; pre-T200 notices identical. d6bb OFF none; ON warning T230 seq 2566, stop T236 seq 2626 (run had no supervisor). 60-run sweep: 13 runs gain a ping-pong warning; ad45/817d/2f46 checked by hand, all real bounces.
  - Gates: agent 1281 passed, viewer 786 passed, pytest 1960 passed/2 skipped; build OK; verify-vendor OK; lint OK except mypy mgba._pylib (worktree has no native binding). Coverage: agent lines 99.03 / branches 94.28 / functions 97.87; viewer 97.6 / 90.39 / 93.55; python lines 97.03 / branches 92.57 / functions 100.
  - Not done here by brief: experiments/<id>.json pending entry and bundle-v-control wiring belong to the M6 integrator.
- 2026-10-16: RED (self-review): a press result that still shows the old map mid-door (2919 T185) loses the map change, because the next call's before state is already on the new map. Test: unsettled arrivals.
- 2026-10-16: GREEN: map moves walk last map → before map → after map. Replay now: 2919 ON warning+supervisor T204 seq 3219 (T185 entry + T200–T204), re-brief T210, recovered T215, warning T216 seq 3516, supervisor every 6 calls to T246; pre-T200 notices byte-identical to OFF. d6bb unchanged (T230 seq 2566, stop T236). Explainer receipts updated.
- 2026-10-16: Codex review round 1 BLOCKING: (1) map moves ignored genuine locks, so six alternating results inside a running script, dialogue or menu would warn; (2) stale receipt (the T205 seq 3244 entry above predates the unsettled-arrival fix; the current receipt is T204 seq 3219) and the test did not pin it. RED: scripted map-change tests; the 2919 fixture now starts at seq 2860 (includes the T185 entry) and the test pins T204 seq 3219. grok round 1: LGTM.

## Surprises

- The ping-pong episode recovers once in 2919 (T215): the `A×5` step at the town door reaches a state outside the 16-state visited window, which counts as novel. The next bounce re-warns at T216. Recovery semantics are unchanged by design.

## Multi-Model Review Log
