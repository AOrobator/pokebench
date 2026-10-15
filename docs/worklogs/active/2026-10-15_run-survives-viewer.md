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
- [ ] Review (Claude + Grok).

### M2: a fresh viewer adopts an in-flight or finished trial
- [ ] RED (fixtures): the lease and `runner.json` are left by a dead viewer pid.
  - (a) Trial still live: the new runner waits for it, records exactly one `outcome` from its `run_end`, and never relaunches it.
  - (b) Trial ended while no viewer was up: the outcome is recorded from `run_end`, not `launcher_error interrupted`.
  - (c) Trial ended with no `run_end` and its pid is gone: today's interrupted path is unchanged.
  - (d) A lease owned by a **live** pid is never taken.
  - The same cases hold for finals and for regular experiment trials. The NEXT RUN queue reports the adopted run as running and frees the lease when it ends.
- [ ] GREEN, gates.
- [ ] Review.

### M3: deploys are safe by construction
- [ ] The viewer handles SIGTERM and SIGINT by closing the server and stopping the autorun only. It never signals launched runs.
- [ ] `just viewer-main` refuses to report success unless every run that was live before the restart is still live after it, and the new viewer's autorun reports it adopted.
- [ ] Explainer page with a diagram (before and after process tree, adoption flow), per the feature-explainer skill.
- [ ] Review.

### M4: proof on an owned server, never 8790
- [ ] Owned test viewer on a spare port with an isolated runs root and a stub `live.js` that plays for a few minutes and writes `run_end`. Restart that viewer mid-trial with `kill`, Ctrl-C-style group signal and `viewer-main`-style restart. Show the trial finishes, is recorded once and the next trial starts.
- [ ] Report to the operator. Merge on approval. Restarting 8790 onto the new build waits for the operator's go-ahead (the first restart still kills an old-code trial if it is group-signalled; a pid-only SIGTERM plus adoption should carry it, but that is decided with the operator).

## Gates per milestone
RED → GREEN → Claude + Grok review; viewer/agent coverage ≥90% lines/branches/functions; tsc, eslint, ruff where touched.
