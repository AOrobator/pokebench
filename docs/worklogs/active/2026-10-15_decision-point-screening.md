# Decision-point screening (M6) and finals loop replay

Requested by the operator through the parent agent (2026-10-15), as M6 of `2026-10-15_harness-fixes-bundle.md`.
Branch `claude/decision-point-screening`, worktree `/private/tmp/pokebench-decision-point`, based on
`claude/bundle-integration` 83e3a6a. Local only. Merging into main is allowed only after the bundle is in main, with
gates and a clean multi-model review, and never while a finals trial is running.

## Problem Statement

Two finals runs looped for hundreds of turns, and their recorded loop guard was silent:
- **dc0e** (memory arm), INSIDE OF TRUCK, T216–T615: 400 × `press A` at the MOVING_BOX (2,3). Every result read
  `Press result: locked (field controls locked in a snapshot; no net movement)`. The guard fired only at T200/T206.
- **6684** (whole arm), LITTLEROOT TOWN, T494–T788: 294 × `press A×8` restarting the PC conversation. Zero
  loop_guard events.

Before building the probe tool, answer whether the bundle's fixed loop guard and supervisor catch these runs, and what
they say. Then build `just probe-decision <run> <turn> --switch <id>=on|off --samples K`.

## Skills Loaded
feature-worklog, feature-switch, agent-observability, pokebench-game-state, pokebench-review.

## Architecture
- Replay = feed the recorded `events.jsonl` (minus the recorded loop_guard events) into `attachLoopGuard` +
  `loopSupervisor` + `stallBriefing` from the built dist, with the run's recorded FeatureSet.
- Probe = rebuild the turn's model context from events + frames, re-render the readout from `raw-ram/` under a
  flipped switch set (Python `format_readout` on `load_raw_ram`), and sample the next tool call K times.

## Milestones
- [x] R0 replay of dc0e and 6684 through the fixed guard and supervisor.
- [x] R1 supervisor fixes (bug fix, no switch): restart inside a batch graded as restart; a walked-onto step trigger counts as tried.
- [x] R2 transition-press-result-v1 scope extension (behind the existing default-off switch): box opened/paged/closed.
- [ ] M6a context rebuild + raw-RAM re-render (spike done: byte-identical re-render of dc0e T212).
- [ ] M6b `just probe-decision`, RED/GREEN, small samples.
- [ ] Merge into main after the bundle (pending conditions above).

## Progress Log
- R0 (replay, scratch `~/.hermes/cache/scratch/dp-replay.mjs`): with the fixed dist, dc0e fires first at T193 (cycle),
  recovers T206 (moved), warns again T219, and then briefs every 6 looping calls to the end (T609; 70 supervisor
  briefings). 6684 warns at T491 and briefs every 6 calls to T783 (50 briefings). Neither run goes silent.
- R0 truck lock: true lock T171–T176 only (the truck is driving; controls free from 15:11:55, about 16 s after naming).
  From T216 onward the 399 "locked" results are a 3-cycle at the box: free→box (open), box→box (page), box→free
  (close). The lock is the sign's own message box. The exit (4,3) was one RIGHT step away the whole time.
- R0 gaps: the briefing graded 6684's batches "dialogue advanced ×215 / no change ×75" (false: each batch restarted
  the conversation). It listed dc0e's trigger at (3,3) as "not tried yet" after the player walked onto it.
- R1 RED (`finals-briefing.test.ts`): 2 red on base. GREEN in loop-supervisor.ts: the call's before-state is the
  pre-press snapshot (button_press before_state_seq); same opening with the cursor moved back means "restarted a
  conversation already shown"; moving onto a step-activated target touches it. Replay after: 6684 "press A×8 ×289 →
  restarted a conversation already shown"; dc0e untried list no longer has (3,3); the exit stays first.
- R2 RED (`transition-press-result.test.ts`, finals describe block): 4 red on base. GREEN: press-result.ts
  `dialogueChange` plus `reprinted`; ShownStates.record(state, before) counts a restart inside one batch. OFF unchanged
  (test asserts the OFF "locked" bytes). Description + explainer section 4 updated.

## Decisions
- R1 is a bug fix (false model-facing facts in the supervisor briefing), under the M1 operator exception.
- R2 changes wording that was literally true but incomplete. It goes behind the existing, not yet landed,
  default-off `transition-press-result-v1` rather than a new switch, because that switch's scope is exactly "press
  results name what really happened". Open question for the operator: should the OFF text also be corrected as a bug fix?
- milestone-stall-stop-v1 is forced off for experiment arms (experiment-gate.ts:90), so dc0e's 40-minute stall was
  by design.

## Status
R0–R2 done. Next: probe tool.
