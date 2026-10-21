# Fixed-run lane leases and single-arm reruns

## Operator ask

2026-10-20 ~8:15 PM ET, the operator via the coordinator: don't stop a run just because a GPU is free. (1) A fixed runner holds a lane's lease only while that lane has a trial running or due; release it when the lane is paused, finished or out of slots (v5, pid 10465, held lane 8098 while lane B was "paused, replacement reserve used up"). (2) Let an operator run a single arm on one free lane without a pair (`just fixed-run rerun <id> --arm bundle --lane B`), recorded so it shows in the EXPERIMENT dropdown and marked exploratory so paired analysis stays balanced. Merge rule for this branch: Claude and Grok LGTM (GPT/Codex waived by the coordinator), ff-only, after a merge slot from the coordinator. Runner infrastructure: no feature switch.

## Design

- Each lane takes its own pool's lease (`takeLease`, unchanged stale/adopt/reclaim) just before it adopts or plays a trial, and gives it back whenever it pauses (any backoff), waits (phase gate), is blocked (reserve), finishes or stops. A held pool makes only that lane wait, naming pool and holder; the other lane plays. No lane needs two leases, so the old all-or-nothing order is not needed.
- Each lane's lease names that lane's own run and child pid (lease-per-pool follow-up).
- `fixed-run rerun <id> --arm <arm> --lane <lane> [--phase <p>]`: the parent must be approved and unchanged. It runs `soloDefinition`: id `<id>-solo-<arm>-<lane>-<n>` (next free n), one lane, one exploratory phase with `singleArm`, no replacement reserve, at the parent's first launch commit (else HEAD). Its ledger is its own, so the parent's paired ledger and analysis never see it. The dropdown labels it "<parent title> (exploratory: <arm> only, lane <L>, #n)".

## M1 Lane leases and reruns

- [x] RED: lane lease release on reserve block and on done; per-lane lease waiting; lease names its lane's run; runner `commit`; soloDefinition; `rerun` CLI; dropdown label
- [x] GREEN: per-lane `holdLease`/`releaseLease` in the fixed runner; `commit` option; `singleArm` phase + `soloDefinition`; `fixed-run rerun`; dropdown SOLO label. Viewer 1450, agent 3013 pass.
- [x] Gates: lint clean (pnpm + ruff/mypy via main's venv); viewer coverage 95.14/91.06/93.84 lines/branches/functions; pytest 2767 pass, 1 needs POKEBENCH_ROM from .env (no Python changed)
- [x] Fake-data rehearsal: two real processes on a temp runs root with the v5 definition (reserve 0). Parent lane B blocked on reserve with its lease free; the rerun `rehearsal-v5-solo-bundle-b-1` took lane B's lease and played valid while the parent held lane A; after stop no lease dirs remained. Evidence: runs/reviews/lane-leases/rehearsal-evidence.log.
- [x] Review: round 1 on 3454a7dd (Grok LGTM, Claude BLOCKING B1, fixed below). Round 2 on packet faf9d460 (base 5ab3f577, head 68031b00): Claude (subagent; CLI logged out) `VERDICT: LGTM`, Grok (cursor-grok-4.5-high) `VERDICT: LGTM`. GPT/Codex lane waived by the coordinator. Non-blocking follow-ups: test adopt's final children.delete; solo #n check-then-create race; runner.json written before nameLeaseRun. Artifacts: runs/reviews/lane-leases/.
- [ ] Land ff-only after coordinator slot

## Review round 1 (packet 3454a7dd)

- Grok `VERDICT: LGTM`; hardening note: stop is not polled while a lane waits on a held lease to adopt (the old all-lane wait did poll it).
- Claude `VERDICT: BLOCKING` B1: an I/O error inside `adopt` (writeRunner, or adopt's own ledger read) reached `pause`, which released the lease while the adopted child still played; a second runner could take that GPU. Real regression. Fix: `pause` keeps the lease while the lane has a recorded child; `adopt` takes the run from the loop's state (no second ledger read before the child is recorded) and clears the child only once it has exited; stop is honored while waiting to adopt.
- [x] RED: 2 tests (adopt I/O error keeps the lease and a foreign take throws; stop while waiting to adopt)
- [x] GREEN: `pause` keeps the lease while a child is recorded; `adopt(run)` from loop state, clears the child after exit; stop honored while waiting to adopt. Viewer 1453, agent 3013, pytest 2767 (+1 ROM-env) pass; lint clean; viewer coverage 95.14/91.07/93.84. Rehearsal re-run on the new build: same result (runs/reviews/lane-leases/rehearsal-evidence.log). Round 1 artifacts in runs/reviews/lane-leases/r1/.
