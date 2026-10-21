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
- [ ] Fake-data rehearsal of lease behavior
- [ ] Review: Claude + Grok LGTM
- [ ] Land ff-only after coordinator slot
