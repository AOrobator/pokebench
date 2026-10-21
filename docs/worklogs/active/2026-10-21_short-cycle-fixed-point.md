# short-cycle-fixed-point-v1: 2-4 turn cycles of the same calls and states count as a fixed point

(First built as `ping-pong-fixed-point-v1`; renamed before landing when the coordinator widened the scope to short cycles. Branch `claude/ping-pong-fixed-point` keeps its name.)

## Problem Statement

duplicate-turn-collapse-v1 (on in both arms) leaves out of each request a run of 3 or more identical turns: the same thinking, text and tool calls, each leaving the same `planState`. Two bundle runs looped without ever producing such a run (both read-only):

- `runs/2026-10-20T19-58-04_qwen36-gpu0_ef9f`, from turn 131 (8:06 PM New York): `press {buttons:["RIGHT","A"]}` every turn. Each result alternated between the clock confirmation (`clock_confirmation`, NO highlighted) and the clock adjustment (`clock_adjustment`). The loop guard's `cycle` note (turn 99, 8:03 PM), the `interface_dwell` stall briefing (turn 127, 8:06 PM) and the `milestone_drought` briefing (turn 139) were ignored.
- `runs/2026-10-20T20-26-22_qwen36-gpu1_97a0` (still being written when read), from turn 116 (8:35 PM New York): `navigate_to_target` warp (14,8) on LITTLEROOT TOWN into PROF. BIRCH'S HOUSE, then warp (2,8) back out, turns 116-122; then from turn 120 a 3-turn rotation through 132: in, the same call again (staying in the house), out. Map-cycle and cycle loop-guard notes fired and were ignored.

Why the existing collapse never acted (from `fixed-point-breaker.ts` and `same-plan.ts` `planState`):

1. Its run needs every turn to leave the same state; these repeat with period 2 or 3.
2. Its group key includes thinking and text; in ef9f the six bounce turns 131-136 have six different thinking texts, in 97a0 turns 116/118/120/122 have three and 117/119/121 two.
3. `planState` is null for any screen other than the overworld or a ready battle, so ef9f's `clock` screen never qualifies.
4. `planState` includes the interface's `value`; each ef9f cycle moved the clock 2 minutes (10:58, 11:00, 11:02 ...).

Approval: The operator, 2026-10-21 00:08 UTC (8:08 PM ET): "lets do those fixes and put them in the bundle" (relayed by the coordinator), for the two-state ping-pong. Scope widened by the coordinator on the 97a0 evidence (extending the operator's approval): cycles of period 2-4 over (tool call, resulting state) pairs; thinking need not match when calls and states repeat exactly; fire once the cycle has repeated as many times as today's rule needs; keep the ef9f case; rename if the name no longer fits.

## Skills Loaded

feature-switch, agent-observability, feature-explainer, feature-worklog, experiment-queue (pending entry), close-the-loop (gates), multi-model-review (cloud lanes only).

## Architecture

- Owner: `FixedPointBreaker` (`packages/agent/src/fixed-point-breaker.ts`), constructed by `fixedPointBreaker()` only while duplicate-turn-collapse-v1 or fixed-point-breaker-v1 is on. The switch is read once in its constructor from the FeatureSet.
- Turn item: the turn's tool calls (names and arguments, JSON) plus the `cycleState` each result left. `cycleState` = `planState`'s fields without the open interface's `value`, qualifying overworld and ready battle as `planState` does, plus any other started screen whose readout shows a ready, non-diagnostic interface. Null where the readout cannot qualify the state; a reply with no tool call is null too. Null items never join a cycle.
- `cycleRuns(items)`: maximal runs where every item equals the one `period` items before it, period 2, 3 or 4, whose first block is primitive (A,B,A,B counts as period 2; all-identical blocks are left to the identical-turn rule), with at least `CYCLE_COPIES` = 3 copies (3 × period turns). Documented equivalent of today's rule: identical turns need 3 copies of a 1-turn block; a cycle needs 3 copies of its block.
- Stage 1 (collapse): each run keeps its newest copy (the last `period` turns); earlier turns join the drop set after today's identical-turn pass. Recorded as `loop_breaker` stage 1, trigger `short_cycle`, `repeats` = longest run's length, `collapsed` = every group the cycle pass left out of that request (as today's `collapsed` counts all runs), new optional `period`.
- Stage 2 (note, fixed-point-breaker-v1 only): the breaker keeps the last 36 turn items from recorded events; when the newest turns are in a run longer than 3 copies (3 × period + 1 turns) the request ends with `cycleNote` ("... Your last N turns repeated the same P turns of <tools> calls, and the game state came back to the same P states each time round."). Recorded as stage 2, `short_cycle`, with `period`.
- Stage 3 (auto-talk) reads `fixedPoint()`, unchanged: it acts only on the free field and its message says the state "stayed the same", which would be false for a cycle.
- fresh-retry-v1 concerns replies with no tool call; cycle turns all call a tool, so it is unaffected.
- Viewer: Activity History label for `short_cycle` (with the period); loop_breaker never reaches the timeline. Schema regenerated (`short_cycle`, `period`).

### Decision: thinking and text need not match

From the evidence: ef9f's thinking differs every bounce turn (six texts for 131-136); 97a0's walk has three texts over four "in" turns and two over three "out" turns. With identical thinking required, neither run would ever fire. The coordinator also directed that identical thinking not be required when calls and states repeat exactly. The calls (names and arguments) and the resulting states must repeat exactly.

### Decision: keep the newest copy of the cycle, not only the newest turn

The identical-turn rule keeps one copy of the repeated unit (one turn). For a cycle the unit is `period` turns; keeping only the newest turn would hide the cycle's other calls, so the request keeps the newest copy (2-4 turns). For ef9f's single call this keeps the confirmation turn and the adjustment turn.

### Decision: the cycle state leaves out the interface value and qualifies interface screens

Without both, ef9f could never fire (null fingerprint on the clock screen; the clock value moves each cycle). Phase and highlighted choice stay, so a real change of interface or selection breaks a cycle.

## Invariants

- INV-1 OFF is byte-identical: no cycle state, history, collapse, note or event. Tests: OFF rigs equal the input messages; OFF equals today's output for identical turns; ef9f and 97a0 replays OFF record nothing.
- INV-2 Fires at 3 copies (2-turn cycles at 6 turns, 3-turn at 9, 4-turn at 12); the note one turn later.
- INV-3 A different call, a real state change (position, phase, selection, party, story), a null state or a reply with no tool call breaks a cycle; a cycle is counted by its shortest period; identical turns stay today's rule.
- INV-4 Timeline closed: no new mark, lane, label or color.

## Security Review

No new inputs, subprocesses, network or file access. The note is harness-authored text about recorded calls and states.

## Milestones

**M1 — short-cycle-fixed-point-v1**
- [x] Ping-pong design: RED `test: ping-pong-fixed-point-v1 detector, stage 2 and ef9f replay (RED)` (65b6d182). Implemented (uncommitted) and gated, then superseded by the coordinator's scope change before any GREEN commit.
- [x] Short-cycle tests: agent `src/short-cycle-fixed-point.test.ts` (30 tests: fingerprint, `cycleRuns`, stage 1, OFF, stage 2, auto-talk unchanged, ef9f replay and probe, 97a0 replay and probe, registry, experiment); viewer `src/short-cycle-fixed-point.test.ts` (1). Fixtures `short-cycle-ef9f.jsonl.gz` (ef9f turns 125-140) and `short-cycle-97a0.jsonl.gz` (97a0 turns 104-136).
- [x] COMMIT (RED): `test: short-cycle-fixed-point-v1 cycle detector, stage 2, ef9f and 97a0 replays (RED; renames the ping-pong tests)` (sha in the next entry). Red at this commit: the switch, `cycleRuns`, `cycleState` and `cycleNote` do not exist.
- [x] Implement: `cycleState`, `cycleRuns`, cycle pass in `collapse`, stage 2 `cycleNote`; schema (`short_cycle`, `period`); registry last (guard, needs null), presets, flagFeatures, legacy fixture, DEFAULT_NEXT_RUN off; Activity History label; FEATURE_EXPLAINERS; registry index churn across ~50 agent tests and two viewer tests.
- [x] Deletion checks (receipts in the worktree's ignored `runs/receipts/short-cycle-fixed-point/`, each restored to 44/44): s1 cycle pass removed → 10 red; s2 switch not read → 12 red; s3 value kept in the state → 4 red (ef9f evidence among them); s4 stage 2 removed → 2 red; s5 primitive-block check removed → 2 red; s6 interface screens unqualified → 7 red; s7 two copies instead of three → 7 red. Earlier ping-pong receipts r1-r6 are in `runs/receipts/ping-pong-fixed-point/` (superseded code).
- [ ] Gates: build, lint, test, coverage
- [ ] COMMIT (GREEN)
- [x] Explainer `docs/explainers/short-cycle-fixed-point-v1.html` (`just pages-check` prints nothing), README line, FEATURE_EXPLAINERS + server test; pending `experiments/short-cycle-fixed-point-v1.json` (incumbent = same-target's with duplicate-turn-collapse-v1 on, this switch off); readiness row; bundle arm (switches, base false) of bundle-v-control, bundle-cook-1h and whole-map-cook-1h. `fixed-cli check` passes for all three against this worktree's files (the installed CLI reads the main checkout, so it was run through its `main` with `root` set to the worktree; start saves read from the main checkout's runs/).
- [ ] Multi-model review loop (principles, Claude, Grok, GPT/Codex)

## Closing the Loop

Tests for code (production context wiring and the decision probe over recorded events of both runs); the explainer checked with `just pages-check`; viewer behavior by mounted tests. No runs launched.

## Session Log

- 2026-10-20 ~8:20 PM ET: discovery on ef9f; ping-pong design.
- 2026-10-20 ~8:42 PM ET: coordinator scope change (97a0, short cycles); redesign and rename.

## Surprises

- The decision probe cannot build battle-text-auto-advance-v1's press tool or gym-heal-warning-v1's recorder from its inert ports (existing probe limit); the probe tests turn both off in both arms. Neither changes a recorded call or state.
- 97a0 turns 122-132 hold a 3-turn rotation (in, in again, out) overlapping the 2-turn walk (116-122); both collapse.
- Not covered (1-turn cycles with varied thinking): ef9f turns 102-126 (25 `press RIGHT,A,DOWN,A`, byte-identical thinking but a moving clock value on the clock screen) and 97a0 turns 131-136 (the same call six times, four thinking texts; the identical-turn collapse acted only at turn 140). Also not covered: wandering that never repeats exactly (97a0 turns 106-115).
- The shared scratchpad is written by other sessions (a `fix3.py` for `yes-no-answer-readout-v1` replaced mine); scripts for this branch are named `pp_*`. Another switch is being added in parallel, so the merge with main will need the usual registry re-append.

## Multi-Model Review Log

Local inference reviewers are never used (operator decision 2026-10-16).

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog.
