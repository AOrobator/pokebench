# Frontier graph: show invalid fixed-run trials

## Problem

The operator (2026-10-19, 11:27 PM ET): "the latest cook runs aren't showing up on the frontier graph". The 4 hour cook pair (`bundle-cook-4h`, runs `2026-10-19T20-12-11_qwen36-gpu{0_4cd7,1_86ac}`) ended with both trials judged invalid by the fixed-run driver (an emulator crash and a 64K-context overflow), and the last round-loop pair (`bundle-v-control-dryrun-cook@1502cfb`) was operator-stopped. `fixedCohort` in `workbench-store.ts` turns an invalid outcome into `excluded = "Invalid fixed-run trial: …"`, and `shownAgent` in `frontier.ts` drops every excluded run, so these runs vanish from the chart even though they reached Petalburg and Petalburg Woods. The live 6 hour pair is plotted correctly.

## Invariant

An agent run excluded only because the fixed-run driver judged its trial invalid is plotted as a dotted line, labelled with the invalid reason, colored by its harness version and counted in the legend. It never competes for the agent frontier (gold line), and every other exclusion (probe, operator-aborted hand runs, problems) stays hidden. Viewer-only change: no harness switch (feature-switch skill exempts viewer-only changes); the timeline is untouched.

## Second bug (same thread)

The operator, 11:34 PM ET: "the viewer also says +3 live and thats wrong". `liveRuns` calls a run live when it has no `run_end` and `/health` answers on its recorded port. Two Oct 18 round-loop runs (`2026-10-18T01-29-44_qwen36-gpu{0_4ac1,1_5f5c}`) never wrote `run_end` and recorded ports 8076/8075, which the 6 hour pair's game servers now hold, so they count as live. Invariant: a port belongs to the newest unended run that recorded it (an older run could not still hold a port a newer server bound); older claimants are not live.

## Milestone

- [x] RED: frontier tests for invalid trials plotted, labelled, never best; other exclusions still hidden.
- [x] GREEN: `invalidTrial` admitted by `shownAgent`; dotted line, title reason, notice and legend row.
- [x] RED/GREEN: newest unended run per port is the only live candidate.
- [ ] Gates: build, test, lint, coverage, verify-vendor.
- [ ] Cloud review (Claude, Grok, GPT/Codex) LGTM on the frozen diff; ff-only landing.
- [ ] `just viewer-main`; real-browser desktop and phone check that the 4h pair is drawn.

## Session log
- RED: COMMIT: `test: invalid fixed-run trials stay on the frontier chart (RED)` (1d7f07e4). `vitest run src/frontier.test.ts`: 3 new tests failed (no dotted series, no version, no dasharray), 29 passed.
- GREEN: `invalidTrial()` admits only `excluded` starting `Invalid fixed-run trial: ` for agent runs with a New Game or known checkpoint start; `frontierCandidate` still requires `excluded === null`. `vitest run src/frontier src/workbench`: 246 passed (legend list test updated for the new "Dotted line" row).
- Real data, scratch branch viewer on 127.0.0.1:8796 over the shared runs root: choosing EXPERIMENT "Bundle vs control, let it cook (4 hour pair)" draws both 4h trials dotted (4cd7: 38 points to Petalburg Woods at ~132 min; 86ac: 34 points to Petalburg) with the invalid notice; gold frontier is still e046. Phone 375×812: no horizontal overflow.
- Port reuse RED: COMMIT: `test: a reused game-server port does not keep an abandoned run live (RED)` (33ac477e); the new next-run test failed with 3 live runs instead of 2.
- Port reuse GREEN: `liveRuns` keeps only the newest unended claimant per recorded port (start time, then id) before probing `/health`. next-run, experiment-runner/cli/gate, server and app tests: 238 passed.
- Review lanes round 0 (on the frontier-only packet) did not complete: Claude CLI OAuth expired, Cursor GPT usage-capped; Grok stopped to re-review the cumulative packet.
- Operator waiver, the operator 11:34 PM ET: "chatgpt reviews are waived, im outta tokens there". GPT/Codex lane dropped; Claude (subagent; CLI OAuth expired) and Grok remain required.
- Gates round 1 on 8e6e49a2: lint passed; agent 2,681 tests passed; viewer server-controls fixture put two live runs on one port (8011), so the port-owner rule hid the older one. Fixture now gives the second run 8012 (INV-7). Review round 1: Claude subagent LGTM; Grok BLOCKING, real: invalid trials broke lines at never-recorded checkpoints because milestoneStatus returns excluded. RED added to the bridge test (got [2, 2], want [4]).
- GREEN: the plot's gap rule reads milestoneStatus with the invalid trial's exclusion lifted, so never-recorded checkpoints bridge as for valid runs. Frontier tests 114 passed.
