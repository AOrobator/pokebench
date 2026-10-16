# Runs survive viewer deploys

Requested by the operator (2026-10-15): "deploys and updates to the viewer code or the stats page [must] not interrupt the current run."

Branch `claude/run-survives-viewer`, worktree `/private/tmp/pokebench-run-survives-viewer`. Local only: no push, no PR. Ask before merging. Plan approved by the operator 2026-10-15 16:22Z. Do not restart 8790 while the finals run without the operator's go-ahead.

## Why a viewer restart hurts a run today

Checked on the live machine (2026-10-15 15:40Z): the 8790 viewer (pid 98249) is the parent of the trial's agent (`live.js play`, pid 1322), and the agent is the parent of the game server (`pokebench_env.launcher`, pid 1352). All three share the viewer's process group. The stats page (`/comparisons`, workbench) is served by the same process, so updating either one means restarting it.

1. **Process group.** `productionHost.launch` (experiment-cli.ts), `spawnLaunch` (next-run.ts, used by NEXT RUN and human restarts) spawn without `detached`. Ctrl-C or any group signal kills the trial with the viewer. (`just viewer-main` sends SIGTERM to the viewer pid only, so the trial probably survives that path, but nothing guarantees it.)
2. **The runner lives in the viewer.** `ExperimentAutoRun` → `runQueue` → `runFinals`/`runNext` waits on the child's `exit` to record the outcome. If the viewer dies, nobody records it.
3. **Stale state blocks the next viewer.** The dead viewer leaves `runs/.naming-gameplay.lock` (no stale-owner recovery) and `runner.json`. The new viewer waits forever on "lease is held". If the lease is cleared by hand, the orphaned trial reads as `running`/`interrupted`, so it is **relaunched** and the finished run's result is thrown away. This matches the past restart that "grabbed the run slot".

## Design (recommended)

Keep the runner in the viewer process, but make it **restartable**: runs are detached from it, and a fresh viewer **adopts** whatever is in flight instead of relaunching.

Rejected alternative: a separate long-lived runner daemon. It separates the concerns more cleanly, but it adds a second service to start, deploy and monitor. Its own deploys would still need the same adoption logic, so adoption is the core either way.

No feature switch: this changes process supervision, not what the model sees, its tools or how actions execute (feature-switch skill exclusions). Trial semantics (one run per trial, INV-7 isolation, ledger append-only) are unchanged.

## Milestones

### M1: launched runs are detached
- [x] RED (19 failing: new detached.test.ts plus runner/finals/queue/launcher fakes). RED: the launchers spawn with `detached: true` in their own process group and `unref()`. The child pid is recorded next to the trial (`runner.json` gains `pid` and `run`; NEXT RUN and human-restart leases gain `run` and `pid`).
- [x] RED COMMIT: `test: launched runs are detached process-group leaders and name their child pid` (02be7f6)
- [x] GREEN: new `detached.ts` `spawnDetached` (detached, unref, wx logs, `started(pid)`); experiment trials, finals, NEXT RUN and human restarts all launch through it. runner.json carries `run` then `child`; the NEXT RUN lease owner carries `child`. The experiments CLI forwards Ctrl-C to the detached pid explicitly. Viewer 51 files / 648 tests; coverage 95.36 / 91.05 / 94.38; tsc + eslint clean.
- [x] GREEN COMMIT: `feat(viewer): launch every run detached in its own process group` (437a800)
- [x] Review 1 on 437a800: Claude BLOCKING. `child.unref()` lets `experiments run` exit as soon as a trial launches when stdin is not a TTY, which abandons the trial (reproduced with a real-process test). Grok hung for more than 10 minutes with no output and was stopped; it re-runs on the fix. Accepted hardening: no `unref`; try/catch around the SIGINT forward and the `started` writes; keep-alive in the CLI launch test; check the pid's command before treating a recorded child as our run (pid reuse).
- [ ] Re-review of the M1 fix together with M2.

### M2: a fresh viewer adopts an in-flight or finished trial
- [x] RED: 6 failing (lease.test.ts, adoption of a trial and a finals run, a trial that ended while no viewer was up, runner position with a dead viewer and a live child, NEXT RUN past a dead lease) plus the M1 regression (a launcher with nothing else to do stays alive until its run exits).
- RED (fixtures): the lease and `runner.json` are left by a dead viewer pid.
  - (a) Trial still live: the new runner waits for it, records exactly one `outcome` from its `run_end`, and never relaunches it.
  - (b) Trial ended while no viewer was up: the outcome is recorded from `run_end`, not `launcher_error interrupted`.
  - (c) Trial ended with no `run_end` and its pid is gone: today's interrupted path is unchanged.
  - (d) A lease owned by a **live** pid is never taken.
  - The same cases hold for finals and for regular experiment trials. The NEXT RUN queue reports the adopted run as running and frees the lease when it ends.
- [x] RED COMMIT: `test: a fresh viewer adopts the trial a dead viewer left, and launchers outlive their runs` (8505bd7)
- [x] GREEN: new `lease.ts` (shared `takeLease`, `leaseStale`, `pidAlive`). A dead owner's lease is reclaimed only when its run is gone or is the one being adopted; an unreadable owner never is. Runner and finals loops adopt any interrupted or running trial with a run: wait under the lease while it plays (`liveRuns`, or the recorded child pid with no run_end), then record its outcome once. An operator stop holds; a run with no run_end gets the old interrupted path. The pre-launch live check ignores adoptable runs. `readRunner` keeps the position while the child lives. NEXT RUN waits only on a lease that is not stale. M1 fixes: no `unref`, guarded SIGINT forward and `started` writes. Viewer 52 files / 657 tests; coverage 95.18 / 90.94 / 94.29; tsc + eslint clean.
- [x] Review 2 (M1 fix + M2, at 99f1936): Claude BLOCKING with 2 findings. B1: the experiment lease never names its trial's child, so a dead viewer's lease reads stale while the trial plays, and NEXT RUN could launch during its boot window. B2: the budget hold ran before adoption, so a finished orphan was never recorded near the budget edge. Hardening taken: a reclaim mutex so two processes can't both reclaim. Grok produced no output in this round either (lane slow); it re-runs on the fixes.
- [x] RED for B1, B2 and the reclaim mutex (18 failing).
- [x] RED COMMIT (115c5bc). GREEN: the experiment and finals lease owner names `run` at launch and `child` once spawned (and the adopted run and child on adoption) through `nameLeaseRun`. The budget hold moved below adoption, so it only gates new launches. `takeLease` reclaims under a `.reclaim` mutex (cleared after 60 s if a reclaimer died). 662 tests; coverage 95.16 / 90.95 / 94.09.
- [x] Review 3 (whole branch at 73c8189): Claude LGTM. Checked: no caller tests `instanceof RunnerError`, and the autorun matches the held-lease message, so `LeaseHeldError` is safe. Hardening taken: a second signal exits at once (RED now); stub children in the process-group tests live longer. Deferred: a non-held `takeLease` error in RunQueue (filesystem errors only); releasing the lease on early exits while an orphan plays (liveRuns still guards); `buildCommit` before adoption (agent dist only rebuilds when stale, and verifySource refuses to rebuild while a run is live). Grok: pending.
- [x] GREEN: a second SIGTERM or SIGINT exits 1 at once; the process-group test children now live 500 ms. 663 tests; coverage 95.16 / 90.95 / 94.09; tsc + eslint clean.
- [x] Grok (whole branch at 73c8189): BLOCKING. Adoption ran after `verifySource`, so a dirty or moved main checkout (allowed; viewer-main never builds there) threw before the in-flight trial was recorded and dropped its lease. Hardening taken: write the lease owner atomically. Not taken: the plain-mkdir vs reclaim window (whichever mkdir wins owns the lease, and the loser throws held).
- [x] RED: trial and finals adoption with a failing source check (2 failing).
- [x] GREEN: both runners settle every adoptable trial right after taking the lease, before `verifySource`, discovery or the approval and budget checks. A finished orphan is recorded; with nothing left to run, the experiment is graded. `--once` counts an adopted trial. `nameLeaseRun` writes through tmp + rename. 664 tests; coverage 95.16 / 90.94 / 94.11.
- [x] Final review at 0b40a66: Grok VERDICT: LGTM (it also read viewer-restart.sh and viewer-main.sh); Claude CLI VERDICT: LGTM, with both scripts added to the packet (the first attempt failed with a CLI parse error and was re-run). Hardening taken: NEXT RUN's `started` write also goes through the atomic `nameLeaseRun`. Deferred: a crash between `reclaim`'s mkdir and the owner write leaves an empty lease dir; settleOrphan learns the child pid only from runner.json. 664 tests; coverage 95.16 / 90.94 / 94.11.

### M3: deploys are safe by construction
- [x] RED: cli.test.ts `shutdown` (2 failing): SIGTERM/SIGINT close the viewer once and exit 0; a failed close still exits 1.
- [x] RED COMMIT: `test: the viewer closes itself on SIGTERM or SIGINT and leaves its runs alone` (e3d9989)
- [x] GREEN: `closeOnSignals` in cli.ts closes the server and stops the autorun once, then exits; it never signals a run. `scripts/viewer-restart.sh` (new, used by `just viewer-main`) records live `live.js play|human` pids, SIGTERMs only the port's listener, starts the new viewer and fails unless every recorded gameplay pid still lives.
- [x] `just viewer-main` refuses to report success unless every run that was live before the restart is still live after it, and the new viewer's autorun reports it adopted.
- [x] `docs/explainers/run-survives-viewer.html` (+ README index): process groups before and after, the adoption flow, the lease reclaim table, the proof table. Checked in a browser. Not a harness switch, so no Harness Config card.
- [x] Explainer page with a diagram (before and after process tree, adoption flow), per the feature-explainer skill.
- [ ] Review.

### M4: proof on an owned server, never 8790
- [x] First real-process proof (scratchpad harness: this branch's runner + stub play with a /health grandchild) found a bug: with the trial still playing, the experiment shows `running`, and `nextExperiment` only picks approved/held, so the restarted runner said "nothing to run: survive is running" until the trial ended. RED: the adoption test now uses a really-live child pid.
- [x] GREEN: `nextExperiment` also picks a `running` experiment whose own trial is the one playing (not one being measured in an external cohort; INV-G5 test kept that distinction). 659 tests; coverage 95.14 / 90.95 / 94.08.
- [x] Real-process proofs (receipts in `runs/run-survives-viewer/`). Before, Ctrl-C: play and server died, and the fresh runner was stuck on the lease. Before, deploy: the run lived, but the fresh runner refused it as still running. After, Ctrl-C and after, deploy: play and server lived, and the fresh runner adopted trial 1 (one launch, one outcome) then ran trials 2 and 3. `viewer-restart.sh` on owned port 18990 kept the stand-in run alive (exit 0, stats page 200, run listed live).
- [x] Owned test viewer on a spare port with an isolated runs root and a stub `live.js` that plays for a few minutes and writes `run_end`. Restart that viewer mid-trial with `kill`, Ctrl-C-style group signal and `viewer-main`-style restart. Show the trial finishes, is recorded once and the next trial starts.
- [ ] Report to the operator. Merge on approval. Restarting 8790 onto the new build waits for the operator's go-ahead (the first restart still kills an old-code trial if it is group-signalled; a pid-only SIGTERM plus adoption should carry it, but that is decided with the operator).

## Gates per milestone
RED → GREEN → Claude + Grok review; viewer/agent coverage ≥90% lines/branches/functions; tsc, eslint, ruff where touched.

- 2026-10-15: rebased onto main 74ad319 (one import conflict in experiment-gate.test.ts with finalsRunLabels, kept both). Agent and viewer rebuilt; viewer 52 files / 673 tests; coverage 95.22 / 90.98 / 94.15; tsc + eslint clean. Waiting for the operator on merge timing: any merge to main stalls the running finals at the next run boundary.
- 2026-10-15 19:11Z: The operator approved the merge ("You can go ahead and merge it") and accepted restarting while run 4 plays. Merging into main.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-15). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
