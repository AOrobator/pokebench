# ping-pong-fixed-point-v1: the same call bouncing between two interface states counts as a fixed point

## Problem Statement

Whole-map cook bundle run `runs/2026-10-20T19-58-04_qwen36-gpu0_ef9f` (read-only). From turn 131 (8:06 PM New York) the model called `press {buttons:["RIGHT","A"]}` every turn through turn 145+. Each result alternated between the clock confirmation (`clock_confirmation`, NO highlighted) and the clock adjustment (`clock_adjustment`): A on the confirmation's NO returns to the adjustment, RIGHT then A in the adjustment opens the confirmation again. The loop guard's `cycle` note (turn 99, 8:03 PM) and the `interface_dwell` stall briefing (turn 127, 8:06 PM) and the `milestone_drought` briefing (turn 139) were ignored.

duplicate-turn-collapse-v1 (on in both arms) did not act, for three reasons found in `fixed-point-breaker.ts` and `same-plan.ts` `planState`:

1. Its run needs every turn to leave the *same* state; these alternate A, B, A, B.
2. Its state fingerprint (`planState`) is null for any screen other than the overworld or a ready battle, so the `clock` screen never qualifies at all.
3. The fingerprint includes the interface's `value`; each RIGHT advances the clock two minutes (10:58, 11:00, 11:02 …), so no two results are equal even by phase.
4. Its group key includes the turn's thinking and text; the model's thinking alternates between two near-identical drafts that differ in details (hashes all differ), so even identical-state turns would not match.

Operator approval: The operator, 2026-10-21 00:08 UTC (8:08 PM ET): "lets do those fixes and put them in the bundle" (relayed by the coordinator). Switch `ping-pong-fixed-point-v1`, guard, bundle arm only, default off.

## Skills Loaded

feature-switch, agent-observability, feature-explainer, feature-worklog, experiment-queue (pending entry), close-the-loop (gates), multi-model-review (cloud lanes only).

## Architecture

- `FixedPointBreaker` (`packages/agent/src/fixed-point-breaker.ts`) keeps a second per-tool-call state fingerprint, `pingPongState`, only when the switch is on: `planState`'s fields with the interface's `value` left out, and qualifying any started screen whose readout shows a ready, non-diagnostic interface (so `clock`, menus, etc. qualify). Overworld and battle keep their current qualification rules.
- Stage 1 (collapse, acts under duplicate-turn-collapse-v1 or fixed-point-breaker-v1): with the switch on, a second pass finds runs of 3 or more consecutive tool-calling turns whose tool calls are identical (names and arguments, thinking and text ignored) and whose results alternate between exactly two distinct `pingPongState`s (A, B, A …). All but the newest are left out. Recorded as `loop_breaker` stage 1 with new trigger `ping_pong`. Today's identical-turn pass is unchanged and runs first.
- Stage 2 (note, fixed-point-breaker-v1 only): a ping-pong streak counted like today's streak; from the 4th turn the request ends with a ping-pong note ("… made the same press call and the game state went back and forth between the same two states after them."). Recorded as stage 2 `ping_pong`.
- Stage 3 (auto-talk) reads `fixedPoint()`, which stays the identical-state streak: auto-talk acts only on the free field and its message says "the game state stayed the same", which would be false here.
- fresh-retry-v1 is about replies with no tool call; ping-pong turns all call a tool, so it is unaffected.
- Viewer: Activity History label for the `ping_pong` trigger; nothing on the timeline (loop_breaker never reaches it).

## Invariants

- INV-1 OFF is byte-identical: no ping-pong fingerprint, same collapse, same notes, same events. Test: OFF cases equal today's output on the ef9f slice and on unit rigs.
- INV-2 Fires at the same run length as today's rule (3 turns for the collapse, 4 for the note).
- INV-3 Three distinct states, a different call, or a real state change (position, phase, selection, party, story) breaks the run.
- INV-4 Timeline closed: no new mark, lane, label or color.

## Security Review

No new inputs, subprocesses, network or file access. The note is harness-authored text about recorded calls and states.

## Milestones

**M1 — ping-pong-fixed-point-v1**
- [x] Write tests (detector units; ef9f evidence replay via the decision probe; registry; experiment entry; viewer label). Agent `src/ping-pong-fixed-point.test.ts` (22 tests; 11 red: `pingPongState`/`pingPongNote` do not exist, nothing collapses, no registry entry, no experiment file). Viewer `src/ping-pong-fixed-point.test.ts` (1 test; red: no `ping_pong` label). The decision probe cannot build battle-text-auto-advance-v1's press tool or gym-heal-warning-v1's recorder from its inert ports (existing probe limit), so the probe test turns both off in both arms.
- [x] COMMIT (RED): `test: ping-pong-fixed-point-v1 detector, stage 2 and ef9f replay (RED)` (sha in next entry)
- [ ] Implement; schema; registry; presets; viewer label; deletion check
- [ ] Gates: build, lint, test, coverage
- [ ] COMMIT (GREEN)
- [ ] Explainer, FEATURE_EXPLAINERS, pending experiment, readiness row, bundle arms, fixed-cli check
- [ ] Multi-model review loop (principles, Claude, Grok, GPT/Codex)

## Closing the Loop

Tests for code; the explainer checked with `just pages-check`; viewer behavior by mounted tests. No runs launched.

## Session Log

- 2026-10-20 ~8:20 PM ET: discovery; fixture `packages/agent/src/fixtures/ping-pong-ef9f.jsonl.gz` made from ef9f turns 125–140 plus run_start.

## Surprises

- Today's fingerprint never qualifies the clock screen, and the clock value moves every cycle, so "the same fingerprint today's rule uses" could never fire on ef9f. The ping-pong fingerprint drops the interface value and qualifies ready interfaces (decision recorded above; flagged to the coordinator).
- Turns 102–126 of ef9f were 25 identical `press RIGHT,A,DOWN,A` turns with byte-identical thinking, each leaving `clock_adjustment` with the clock 2 minutes later. That is a single-state loop the collapse also misses (null fingerprint on the clock screen, moving value); out of scope for this switch (it is not a two-state ping-pong).

## Multi-Model Review Log

Local inference reviewers are never used (operator decision 2026-10-16).

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog.
