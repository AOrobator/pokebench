# After the cook runs: priorities by useful information per GPU-hour

## Operator decisions (2026-10-20, New York time)

The operator made these calls on 2026-10-20 between 10:52 and 11:02 AM, in the cook-run analysis thread:

- Cook runs are capped at 1 hour from now on. The agent frontier reaches the Aqua woods event in under an hour.
- battle-move-tool-v1 and battle-menu-loop-v1 go into the control with no probe.
- exit-reachability-v1 goes into the control.
- context-token-budget-v1 stays in the control. It was already on in both arms of 6h-v2.
- The whole-map cook is 2 one-hour pairs from the fast-text MAIN_MENU save. It includes semantic-navigation-v1 and deterministic-exploration-v1 with full-map-navigation-v1.
- The next bundle drops supervisor-briefing-v2 and ineffective-navigation-v2, and adds stale-story-goal-v2 on top of v1. harness-trust-v1 stays on. Smaller ablations of the 10/19 batch come later.
- Approved: a stale-story-goal-v2 decision probe, a probe of the story-character stall gate, and a fixed-point breaker test using planted repetitive thinking.
- The operator approved the prioritized schedule below.

## Evidence

- Report: `runs/reports/run-analysis/2026-10-20_cook-6h-v2/index.html`, served at `http://127.0.0.1:8791/reports/run-analysis/2026-10-20_cook-6h-v2/index.html`.
- Evidence packet and the four persona reviews: `runs/reviews/2026-10-20-run-analysis-cook-6h-v2/`.
- Runs:
  - 6h-v2 control `2026-10-20T03-02-13_qwen36-gpu0_8d39` reached the Aqua woods event at 145.9 min.
  - 6h-v2 bundle `2026-10-20T03-02-13_qwen36-gpu1_f28d` reached Running Shoes at 347.7 min.
  - The 4h and 6h pairs were void.
- Main findings:
  - The bundle regressed with the 17 switches added together on 10/19 (pin 56dfa98f to 08287126). After it, the bundle repeated the same plan in 74–91% of turns and 65–74% of navigate_to calls moved 0 tiles.
  - A stale "come by my lab" story goal cost about 412 min across three bundles.
  - The control lost about 265 min around Petalburg Woods. It took the known south exit, then chased an unreachable "NORTH edge -> RUSTBORO CITY" exit.
  - A story milestone follows a loop-guard fire about as often as it follows any random turn.

## Prioritized schedule

1. No GPU (thread "Supervisor and navigate_to bug fixes"):
   - [ ] Fix supervisor-briefing-v2 `focused()`, which drops the ×N repeat count (loop-supervisor.ts:475 vs :484).
   - [ ] Fix the navigate_to wording on the player's own tile ("arrived at requested coordinate; 0 bounded movement actions").
2. Preset changes (thread "Control and bundle preset update"):
   - [ ] Control gets battle-move-tool-v1, battle-menu-loop-v1 and exit-reachability-v1.
   - [ ] Next bundle: supervisor-briefing-v2 off, ineffective-navigation-v2 off, stale-story-goal-v2 on.
3. Cheap probes (thread "GPU queue: probe and whole-map cook"; the breaker work is in "Loop breaker and stall gate"):
   - [ ] stale-story-goal-v2 decision probe at f28d turn 455.
   - [ ] Story-character stall gate probe at f28d turn 452.
   - [ ] Fixed-point breaker probe on planted repetitive or degenerate thinking.
4. [ ] Whole-map cook: 2 one-hour pairs, control vs control + full-map-navigation-v1 + semantic-navigation-v1 + deterministic-exploration-v1. The semantic navigation switches have been on main since 4565f9ef (2026-10-20 10:41 AM). The arm layout follows the "Semantic nav into the bundle" thread.
5. [ ] Next bundle cook: one hour, with the trimmed 10/19 batch from item 2.
6. [ ] Ablations of the rest of the 10/19 batch, smallest first.
7. Analysis (cook-run analysis thread):
   - [x] Report v2 with reach-rate charts, a token chart and loop-guard effectiveness.
   - [x] Forensics on the control's woods-exit regression.

## Open design notes

- **Fixed-point breaker, one switch with stages.** It triggers on the same state and the same call 3 times, or on a turn with no tool call.
  1. Collapse the duplicate turns in the window. Only duplicates go; old thinking in general is never dropped.
  2. Send a short positive prompt with the repeat count.
  3. Walk to and talk to the nearest person not yet talked to, preferring characters from the game's own object list.
- **Loop guard "do no harm".** No stall or "leave" briefing while a named story character is on the map and has not been talked to since the last story step.
- **Loop-guard recovery.** Recovery should mean a story milestone, or a map not seen recently. A single new tile is not recovery.
