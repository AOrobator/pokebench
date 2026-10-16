# Ineffective loops: unchanged waiting observes and few-target loops that end on one tile

Branch `claude/ineffective-loops` (worktree `.claude/worktrees/agent-a6bc9df3bde93fc75`), from main 57415890. Brief from the coordinator, 2026-10-16 ~2:50 PM EDT, relaying the operator's approval for the next bundle: "count repeated unchanged observes and alternating two to three target loops that end on one tile as ineffective … the supervisor gives a warning message … should go into the bundle". The brief is the operator's approval of this scope. One new switch, default off, for the bundle arm; registered as a pending experiment, not queued. `experiments/fixed/bundle-v-control.json` is not edited here (its own thread owns it). No runs, no viewer, no `just viewer-main`. Review lanes: Claude, Grok (cursor-grok-4.5-high), Codex (gpt-5.6-sol); no local inference reviewers. The coordinator lands the reviewed head `--ff-only`.

## Problem Statement

Evidence (overnight run-analysis report `runs/reports/run-analysis/2026-10-16_overnight/index.html`, its hypothesis "Count repeated unchanged observes, and alternating 2–3 target loops that end on one tile, as ineffective", and the recorded events):

1. **4caa Route 103 water edge, T199–T248 (seq 4818–6218).** About 50 navigate_to calls to targets on the far side of the water ((79,9), (79,12), (79,13), (40,12), (40,13), (40,11), (45,6), …), all ending on (23,12), (23,13) or (21,8). Today's guard fires only at T219 (seq 5269, the same target (45,6) four times with no movement) and recovers two calls later (T221) when one target nudge lands on (21,10).
2. **4caa Route 102 ledge, T550–T571 (seq 14974–15332).** Presses DOWN,LEFT / RIGHT,DOWN alternate between (34,9) and (35,9). Today: no loop_guard event; only the same-plan note at T571.
3. **7ccf Oldale west exit, T198–T244 (seq 4918–5925).** navigate_to (0,10), (0,11), (1,11), (2,10) and DOWN/LEFT/RIGHT presses; the Maniac script stops the player at (1,10) and the model walks back to (2,10). Not a push-back (the model walks back itself), so pushback-loop-detection-v1 replayed ON stays silent here. Today's guard: one warning at T244 (seq 5925, (2,10) four times).
4. **Observes.** Field observes with the controls free are already counted by the observation check (2f46 T243). Battle observes are counted by battle-observation-loop-v1 (sh02, e588 replayed ON). The remaining gap: an observe of a ready menu, naming screen or (with interaction-loop-detection-v1 off) a ready message has no fingerprint, so unchanged observes there never count.

## Skills Loaded

feature-worklog, execute-worklog, feature-switch, feature-explainer, agent-observability, experiment-queue, close-the-loop, multi-model-review (local-inference-stack).

## Architecture

Switch `ineffective-loops-v1` (guard, needs null, default off). `LoopDetector` 9th / `attachLoopGuard` 10th argument, wired from the FeatureSet in `live.ts` and `decision-probe.ts`.

- **(a) waiting observes.** `waitingState(state)`: outside battle, a ready active UI (no diagnostic), a ready naming screen, or a locked field holding a ready message (dismiss/button/page/scroll wait). Its fingerprint is the player's place and facing, the lock, the UI, naming, dialogue and message, story, party, money, badges and name. An observe whose waiting fingerprint equals the previous game call's counts as an unchanged observation (the existing counter, threshold 3 repeats). A waiting state not among the last 16 recovers the episode. Field states with controls free keep today's fingerprint; scripts, transitions and printing text are the game acting and never count.
- **(b) few-target loops.** A move is a navigate_to or a press with a direction button, not an errored call, whose result is on the overworld outside battle with a known tile, no menu or naming screen, whose own start state had no menu or message open, and during which no message or dialogue appeared (conversations are information and belong to the interaction and push-back checks). Moves are kept per map (a map change, a battle or a story milestone clears them; 12 kept). When the newest move's tile has been the end of 3 (`cycleRepeats`) moves, and the moves from the first of those three to now ended on at most 2 tiles and named at least 2 different targets, the guard raises a `cycle` warning with its own message, then the supervisor briefing. Evidence: the three moves' seqs. The episode recovers only on a tile not among the last 16 results, or a story milestone (as push-back episodes do); one turn or a new facing on the same tiles does not end it.
- OFF: byte-identical (no waiting fingerprint, no moves, no place tracking beyond push-back's own).

Design note: the brief says "two to three" targets. The recorded loops name more (4caa T202–T206 named five targets, each varying one coordinate, all ending on two tiles), so the rule needs at least two and has no upper bound; the tile bound (at most two end tiles since the first of the three returns) is what keeps exploration from a hub tile out.

## Invariants

- **INV-1** OFF is byte-identical: the three fixtures replay to today's notices with the switch off.
- **INV-2** Real progress never counts: a walk that reaches new tiles, exploration out of a hub tile (three or more end tiles), a map change, a battle, a story milestone, conversations, menu cursor presses and in-place A presses add nothing.
- **INV-3** Observes count only while the game waits for input; the truck ride, scripts, transitions and printing text never count.
- **INV-4** No sleeps, polling or truncation: driven by recorded events; model text is not clipped.
- **INV-5** The production factory honors the switch (live.ts loop guard); wiring-deletion check.

## Security Review

No new inputs, files, processes or network. Fixtures are trimmed copies of local runs (no ROM bytes; raw RAM dropped).

## Milestones

**M1 — Ineffective loops guard**
- [x] RED: replay tests on 4caa Route 103, 4caa ledge and 7ccf Maniac (ON fires, OFF matches today), start-menu waiting observes (real b41f state), negatives, registry and factory tests
- [ ] COMMIT RED
- [ ] GREEN: switch registered, detector, wiring (live, decision-probe), presets, next-run default
- [ ] Wiring-deletion checks
- [ ] COMMIT GREEN

**M2 — Measurement, explainer, pending experiment**
- [ ] Sweep of recent runs OFF vs ON (warnings added), hand-check for false positives during progress
- [ ] Explainer + FEATURE_EXPLAINERS mapping
- [ ] experiments/ineffective-loops.json pending + readiness row
- [ ] Observability trace (agent-observability)

**M3 — Close**
- [ ] Gates: test, lint, build, coverage (90), verify-vendor
- [ ] Principles self-review (zero FAIL)
- [ ] Sync with main; review: Claude, Grok, Codex — LGTM each
- [ ] Report reviewed head SHA to the coordinator for the --ff-only landing

## Session Log

- 2026-10-16 3:00 PM EDT: Worktree on `claude/ineffective-loops` from 57415890; submodule checked out at the pin, deps installed, hooks enabled. Replay harness (scratchpad `replay.mjs`, the built `attachLoopGuard` with each run's own switches) reproduces 4caa's recorded loop_guard events exactly. Loop evidence and today's notices as in the Problem Statement. Observe scans of every 2026-10-1x run: unchanged observe chains are in battle (sh02, e588: counted by battle-observation-loop-v1 when ON), Birch's speech without a known owner, and the truck ride (game acting); no chain of 3+ unchanged waiting-interface observes exists, so (a) has no recorded firing case and is tested on the one recorded start-menu observe (b41f seq 144).
- 2026-10-16 3:10 PM EDT: RED. Fixtures (trimmed with the scratchpad `trim.py`: state events without navigation grid, interaction targets, local map, raw RAM, topology, map grid, game stats; berry/storage resources null; map triggers emptied; tool result text cut at the first blank line; every row passes checkEvent): `revisit-route103-4caa.jsonl.gz` (seq 4700–6250), `revisit-ledge-4caa.jsonl.gz` (seq 14830–15500), `revisit-maniac-7ccf.jsonl.gz` (seq 4860–5990), `waiting-start-menu-b41f.jsonl.gz` (seq 130–146). `ineffective-loops.test.ts`: 12 of 21 fail (every ON case and the registry); the OFF replays already pass and equal the recorded warnings (4caa T219; ledge none; 7ccf T244), as do the negatives that need no new export. `live-world-features.test.ts` factory test: both arms fail (the preset does not know the switch).
