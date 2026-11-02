# Run isolation: leases, loud aborts, port ownership, frozen trees

Operator instruction (2026-11-02): "let's do 1-4" — the four items from the post-incident report.

## The incident this answers

`runs/2026-11-01T09-10-00_deepseek-v4.1-flash_control24h` — the 24h control arm on the
`deepseek/deepseek-v4.1-flash` API lane, port 8076 — was killed at **2026-11-02 02:50:35** by an agent
clearing ports before launching a different experiment. Its `run_end`:

```
"reason": "operator_abort", "turn": 3962, "turns": 3962, "wall_ms": 63911916
```

17.6 hours and 3,962 turns in, furthest milestone `LAVARIDGE_GYM_ENTERED`, no checkpoint
(`load_checkpoint_mode: false`), so unrecoverable. The signal was SIGTERM, handled gracefully by
`live.ts:369` through `operator-signals.ts`, which is why the ledger shows a normal-looking end.

The agent killed it because a bare `ps` showed one `live.js play` with 17h28m of uptime and it inferred
"orphan of an ended run", having read the other deepseek run's records (`...09-25-00_deepseek-v4.1-flash-mlx`,
which genuinely ended at 14:05 with a VRAM `model_error`). The uptime matched the API run's directory name
exactly and the inference went the wrong way. Nothing in the system disagreed, because:

- no run recorded that it owned a pid or a port;
- `runs/.gameplay.lock` and the per-pool leases name a *viewer* and a *model endpoint*, not a run's processes;
- a signalled run is indistinguishable from a completed one in the ledger;
- ad-hoc/preset runs execute from the live `main` checkout (`harness.dirty: true`), so they have no frozen
  tree of their own.

## Scope: 1-4

1. **Run claim registry** — one record per live run naming its pid, game-server pid and port, that any
   process-killing or port-freeing action must consult and refuse against.
2. **Loud aborts** — a run ended by a signal records that signal, and cohorts/ledgers stop counting it as a
   completed trial.
3. **Port ownership** — ports are allocated and recorded rather than hunted for, so "free the port" can
   never mean "kill the run".
4. **Frozen tree for every run** — route ad-hoc/preset runs through the existing `prepareFixedTree`, which
   already builds a detached checkout at the pinned commit and refuses a dirty one.

Item 5 from the report (VRAM preflight for the MLX lane) is **not** in this change.

## Existing seams being reused, not replaced

| seam | what already does the right thing |
| --- | --- |
| `packages/viewer/src/lease.ts` | per-pool gameplay lease, atomic reclaim, stale detection, `owner.json` naming pid/run/child |
| `packages/viewer/src/fixed-tree.ts` | detached checkout at the pinned commit, refuses a dirty tree, builds from its own sources |
| `packages/agent/src/operator-signals.ts` | latches SIGINT/SIGTERM so a signalled run still writes `run_end` |
| `packages/agent/src/run-control.ts` | `runs/<id>/control.jsonl` with `abort`, the graceful way to stop a run |
| `scripts/viewer-restart.sh` | enumerates gameplay pids before restarting and fails if any did not survive |
| `live.ts` `campaign-server-owner.json` | precedent for a run-scoped owner file naming pid/runId/port |

The gap is that none of these can answer "who owns pid 10825 / port 8076?", which is the only question the
agent actually asked.

## Phase 1 — the run claim (in progress)

`packages/agent/src/run-claim.ts`, written at `runs/<id>/run-claim.json`:

```json
{"v":1,"run":"...","pid":4242,"child":4243,"port":8076,
 "started":"...","heartbeat":"...","ended":"...","end_reason":"...","operator_signal":"SIGTERM"}
```

- Written whole and renamed, so a torn claim cannot read as an unowned run.
- `heartbeat` refreshed every `HEARTBEAT_MS` (15s), so a hard kill leaves a visibly stale claim.
- `ended` is written rather than the file deleted: the port's history stays readable, and a later reader
  can tell "ended cleanly" from "still claims a pid".
- `claimsMatching(claims, {pid, port})` matches the run's own pid **or** the game-server pid, which is the
  check that would have refused the kill.
- `listClaims` covers `runs/` and `runs/human/`.

Wired in `withRun` (`run.ts`), the single choke point every run passes through, so fixed trials, presets,
`play`, and human recordings all claim. `ServerHandle` gained an optional `pid` populated by the launcher so
the claim names the game server too.

Done so far: `run-claim.ts`, `run-claim.test.ts` (8 tests green), `ServerHandle.pid`, `live.ts` returning it,
and the `withRun` import.

## Phase 2 — loud aborts

- `live.ts` already receives the signal name and throws it away at the `governor.abort("operator_abort")`
  call. Capture it on the plan and pass it to `recorder.end`.
- `RunEnd` gains optional `operator_signal` (`SIGINT` | `SIGTERM`).
- Ledger/cohort: a trial whose `run_end` carries `operator_signal`, or whose claim shows
  `end_reason: operator_abort`, is reported as aborted and excluded from the valid count that
  `fixed-run status` prints.

## Phase 3 — port ownership

- Allocation from a pool (8075-8099) that skips ports held by live claims and by listeners.
- The chosen port goes into the claim, so the next allocator sees it.
- Ad-hoc launches ask for a port instead of defaulting to a constant.

## Phase 4 — frozen tree for every run

- Route the preset/ad-hoc launch path through `prepareFixedTree` so it materializes
  `/private/tmp/pokebench-fixed-<sha>` and runs `live.js` from there.
- The existing dirty-refusal then applies to every run, and `harness.dirty` becomes false or the launch
  fails loudly.

## Result

| phase | state |
| --- | --- |
| 1 run claim | **done** — `run-claim.ts` + 8 tests, wired into `withRun`, `ServerHandle.pid` |
| 2 loud aborts | **done** — `operator_signal` on `run_end`, schema regenerated, signalled trials classified invalid and exempted from lane backoff |
| 3 port ownership | **done** — `port-allocator.ts` + 9 tests, used when a run has no explicit port, `just run-claims` / `scripts/run-claim.mjs` to ask before killing |
| 4 frozen tree | **not done** — see below |

Also added `scripts/run-control.mjs` and `just run-control`, because the refusal message points at a
graceful stop and there was no command for one. That missing obvious command is part of why the incident
happened: the only visible way to free a port was a signal.

### Evidence

| suite | result |
| --- | --- |
| agent, full | **378 files / 5356 tests passed** (was 376 / 5339 on `main`) |
| viewer, full | 2399 / 2417, exit 1 from the **pre-existing** `panels.test.ts` SIGABRT |
| `fixed-ledger.test.ts` | 21 passed, including the two new signalled-abort cases |
| `run-claim.mjs` against a fixture claim | `--list` names it; `--port [local inference port]` exits 1 with the refusal; `--port 8099` exits 0 |
| `run-control.mjs` | wrote `{"v":1,"seq":1,"at":...,"action":"abort"}` |

The `panels.test.ts` SIGABRT is not load-related and not from this change: it reproduces with the file run
alone, and reproduces identically on clean `main` with these edits stashed (216 passed / 234).

### Two corrections made during the work

- The entrypoint tests (`live-objectives`, `live-world-features`) stub `node:fs`, so an atomic rename and a
  claim write threw and **killed the run**. Bookkeeping now degrades loudly (`console.error`) instead of
  aborting a scored run, which is the right production behaviour too.
- `RunEnd` gained `operator_signal`, which made the checked-in `schemas/events.v1.json` stale. Regenerated
  via `just schema`.

### Why phase 4 is not in this change

`prepareFixedTree` is viewer code driven by `FixedHostDeps` (root, runsRoot, git, fetchFn, node, env, log),
while `just run-agent` invokes `packages/agent/dist/live.js play` directly from the main checkout. Routing
the ad-hoc path through the frozen tree means giving the viewer CLI that dependency surface and a spawn
path, which is a separate, testable change rather than something to staple onto an unverified tree. It
remains the protection against `pnpm -r build` and post-landing gates reaching a live run — a real hazard,
but not the one that ended the control arm.

### Open

- Phase 4 (frozen tree for ad-hoc/preset runs).
- Runs started before this change write no claim, so `run-claims` cannot see them; the port allocator still
  refuses their ports because it also checks for listeners.
- No post-landing gate ran: the hyperqwen 24h run (`2026-11-02T02-55-21_hyperqwen-gpu0_07a7`) is live, and
  `dist` in the main checkout was not rebuilt.

Per phase: unit tests for the new module, then the full agent suite (376 files / 5,339 tests at `d1f105ddc`),
then the viewer suite. Post-landing gates deferred while the hyperqwen 24h run is live, and disclosed.
Nothing in this change is allowed to rebuild `dist` in the main checkout while that run executes.
