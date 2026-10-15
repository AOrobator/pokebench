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
- [x] R3 interaction-loop-detection-v1 (inside the existing switch, OFF unchanged): a batch that itself reprints the
  conversation counts as a restart even when every batch stops at the same print cursor.
- [x] M6a context rebuild + raw-RAM re-render (`env/pokebench_env/rerender.py`, `decision-probe.ts`).
- [x] M6b `just probe-decision`, tests, small samples.
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

- R3 RED (`conversation-restart-loop.test.ts`, "same print cursor"): found by the probe's own live-path test, whose
  fixture server replays 6684 T600's recorded before/after snapshots with no cursor jitter: 14 identical restarting
  batches, zero loop_guard events. fc06571 compared each result's cursor with the previous result's only, so it
  counted 6684 only because its cursor jittered. GREEN: also count a restart when the call's own pre-press snapshot
  showed the same text, in the same place, further along. Replaying 6684 after: unchanged (T491, every 6 calls).
- M6a fidelity: built against the run's own commit 74ad319 (scratch worktree), the rebuilt context of dc0e
  T172/176/200/219/400 and a 1-in-5 sweep of both runs matched the recorded turn_start sizes exactly. Against today's
  harness the sizes differ by design (today's guard and supervisor text). The live-path test
  (`decision-probe-live.test.ts`) drives live.ts with a fixture model, then requires the rebuilt context of every
  turn to equal what the model was sent (system prompt, tools, every message, image order) in three presets.
  It caught one fidelity bug (image before text in observations) before commit.
- M6b CLI: `just probe-decision <run> <turn> [--switch id=on|off]... [--samples K≤8] [--context-only]
  [--runs-root DIR] [--model ID]`. Both arms rebuild with today's harness (system prompt, tools, guard, supervisor,
  notes, press results); a flipped server switch re-renders the window's readouts from raw RAM in both arms through
  the server's own `read_state`/`render`, so the arms differ only by the switch. Sampling uses pi `completeSimple`
  with the run's thinking level and token budget on the gateway model (discovered, not hardcoded).

- Merged claude/bundle-integration 5d8681d (round-4 GREEN) into this branch (16cad4f; one conflict in
  loop-supervisor.ts, both sides kept). Agent suite 1236 green on the merge.
- M6c RED (auto-advance fidelity): `decision-probe-live.test.ts` gains a dialogue-auto-advance-v1 preset (with
  its required field-dialogue-phase-v1) and asserts the rebuilt context equals what the model was sent, plus refusals
  for a flipped text-shaping switch or a re-render of an auto-advanced result. The earlier hang was the fixture: the
  preset lacked field-dialogue-phase-v1, live.ts rejected it with only `play FAILED:` on console.error, and the test
  awaited a run that never started. The fixture now rejects on that line, so a bad preset fails in ~0.2 s.

## Decisions
- R1 is a bug fix (false model-facing facts in the supervisor briefing), under the M1 operator exception.
- R2 changes wording that was literally true but incomplete. It goes behind the existing, not yet landed,
  default-off `transition-press-result-v1` rather than a new switch, because that switch's scope is exactly "press
  results name what really happened". Open question for the operator: should the OFF text also be corrected as a bug fix?
- milestone-stall-stop-v1 is forced off for experiment arms (experiment-gate.ts:90), so dc0e's 40-minute stall was
  by design.

- R3 stays inside interaction-loop-detection-v1 (default-off: an omitted preset key reads false); it completes fc06571's
  stated intent ("however the print cursor jitters"), and OFF bytes are unchanged.
- The probe's replayed derivation is today's code; the recorded derivation (only under the run's own switches)
  reuses the recorded notes and tool texts and is the fidelity check.

## Status
R0–R3 and the probe done (R1 = 7cc96c9, R2 = e8f3b70, R3 = 8a219b0). Merge into main pending: the bundle is not yet in main.
