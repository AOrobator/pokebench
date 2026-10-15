# Rival-house exit split; finals without the stall stop

Requested by the operator in the "Navigation and memory experiment" thread (2026-10-15 14:02 UTC):
"might as well not even do the stall, doesn't seem worth it. and it seems like we should be
tracking the time it takes to leave the rival's house after meeting the rival so we get a more
granular view into how runs are going". Branch `claude/rival-house-exit-split`, worktree
`/private/tmp/pokebench-rival-exit`. Local only, no push; ask before merging.

## Evidence
- On the 32 Think Fast 2×2 trials, a 10/15/20-minute stall stop would have cut 5/1/1 runs; 20
  minutes still ends trial 17 (21.1 min from RIVAL_MET to ROUTE_101, then STARTER_CHOSEN at
  29.3). 25 minutes cuts none and saves ~3% of play. Operator: drop the stall stop from finals.
- After RIVAL_MET, runs leave the rival's house in 0.2-3.5 min, then spend most of the gap in
  Littleroot and Birch's lab. No split marks leaving the rival's house.

## Spec
1. `finalsPreset` forces `milestone-stall-stop-v1` OFF for every finals arm, whatever the
   incumbent or finalist sets. The switch stays registered, default OFF.
2. New navigation split `RIVAL_HOUSE_EXITED`: the first stable Littleroot Town state, with
   `rival_stage` 3 or 4, directly after a stable state in the other family's 1F with
   `rival_stage` 3 or 4. Home is the post-clock route home (fresh-boot witness or the house a
   Clock set save starts in), so the player's own house never counts. Evidence is
   [home, rival-house 1F, town]; always `observed`. The home state must still show the rival unmet
   (rival state 0-2), so a save that starts after the meeting gets no credit.
   Recorded under its own measured feature `rival-house-exit-v1`; the viewer derives it for
   older runs from recorded state, like the other post-clock route splits.

## Milestones
- [x] M1 RED: finals preset keeps the stall switch as the incumbent has it; tracker,
  qualification and viewer recovery tests for RIVAL_HOUSE_EXITED (both genders, fresh boot and
  Clock set save, own house, before RIVAL_MET, transition/unknown screens).
- [x] M2 GREEN: experiment-gate, milestones, features, milestone hint, viewer order/frontier/
  recovery, findings, explainers. Gates: lint, tests, coverage ≥ 90.
- [x] M3 Verify on recorded 2×2 runs (viewer replay shows the split); principles self-review;
  Claude CLI review; report to operator; merge only on approval.

## Log
- M1 RED: 7 failing tests (agent: finals preset, tracker fresh boot and Clock set save, features registry x2; viewer: recovery, frontier axis). Withholding cases pass already.
- COMMIT: `test: finals keep the stall stop off; rival-house exit split after the rival meeting` (44d472e)
- M2 GREEN: finals force milestone-stall-stop-v1 off; RIVAL_HOUSE_EXITED in tracker (routeProof, evidence [home, rival 1F, town]), feature rival-house-exit-v1, viewer order/frontier/status/derived recovery (frontier-recording keeps it for resumed runs). Updated expectations: frontier zoom counts (+1 checkpoint), milestone order list, finals incumbent-reuse fixture (stall off). Not added to next-milestone-hint list (would change the hint switch's behavior). Gates: agent 1070 tests (97.5/93.84/98.13), viewer 644 (95.35/91.14/94.38), lint clean; Python untouched.
- COMMIT: `feat: finals play the full wall limit; record leaving the rival's house after the meeting` (4ae121f)
- M3: viewer recovery over the 32 recorded 2×2 runs finds RIVAL_HOUSE_EXITED in 15 of the 16 RIVAL_MET runs, matching the location trace; the 16th (trial 04) ended inside the rival's 2F. Claude CLI review: no blockers; medium finding (a save starting after the meeting could misname home and earn credit) taken as RED below; spec text for item 1 corrected.
- COMMIT: `test: no rival-house exit credit when the run's home already shows the rival met` (f14d6d3)
- GREEN (review fix): routeProof and viewer derivation require the home witness at rival state 0-2. Re-verified: 2×2 still 15/16 (checkpoint home has rival state 0); boot run dea1 home witness rival state 0, met at 24.6 min and never left the rival 1F, so no split (correct). Gates: agent 1071 (97.5/93.86/98.13), viewer 645 (95.36/91.12/94.38), lint clean. Known limit: a missed split if an unknown-screen town frame sits between the rival 1F and the first stable town state; 0 of 15 exits on the 2×2 hit it.
- Operator approved merge 2026-10-15 14:23 UTC ("yes"); merged into main with --no-ff, then rebuilt and restarted the viewer on main.
- Follow-up (branch claude/finals-incumbent-preset): the recorded full-map-navigation nomination (13:46 UTC, before the merge) stores the incumbent preset with milestone-stall-stop-v1 on, and experiment-runner used it unchanged for the incumbent arm while finalists went through finalsPreset. RED: a nomination recorded with the stall on must still launch every finals arm with it off.
