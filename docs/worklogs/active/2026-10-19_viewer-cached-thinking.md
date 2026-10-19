# Viewer cached thinking

## Problem Statement

Opening or switching to a recorded run paints the `RIGHT NOW` thinking box and `EARLIER · NEWEST FIRST` list from the event stream while it replays from byte zero. The latest recorded thought therefore appears only after older turns visibly load in sequence. The operator expects the latest recorded thinking state immediately, matching the cached split bootstrap behavior.

## Skills Loaded

- `viewer-e2e`: bind the real selected run, prove the atomic bootstrap in an owned candidate browser, and verify the landed main viewer.
- `feature-worklog`: preserve the explicit contract, RED/GREEN receipts, gates, review, and landing state.
- `close-the-loop`: require real-data desktop/phone proof and a live check after merge.

## Architecture

- Add a read-only, run-scoped `/api/runs/:id/head` snapshot containing the run header plus recorded events from the latest 30 complete turns.
- Read only a fixed tail byte window, discard a partial boundary turn, and validate every returned event through the existing event schema.
- During stream catch-up, render `RIGHT NOW` and the sidebar's `EARLIER` rows only from this atomic snapshot (or a stable loading state). The full trace page and all replay surfaces keep their existing event-stream behavior.
- At `caught_up`, switch the run-splits thinking pane atomically to the fully folded event stream while the separate full trace and replay cursor keep their playback behavior; `events.jsonl` remains authoritative.

## Invariants

- **INV-1:** Latest recorded thinking appears atomically during catch-up. Test: partial SSE delivery cannot replace the cached final thought or recent-turn list.
- **INV-2:** The snapshot is bounded and contains complete turns only. Test: a byte-window boundary drops its partial oldest turn, retains the newest complete turns, and includes `run_start`.
- **INV-3:** The snapshot is scoped to the exact selected run and stale responses cannot cross run selection. Test: switching runs ignores the prior request's later response.
- **INV-4:** Snapshot failure is recoverable. Test: the stable loading state remains until `caught_up`, then the full stream becomes authoritative.
- **INV-5:** Replay remains replay. Test: frames, timeline, stats, full trace, and replay cursor behavior are unchanged; only the sidebar thinking surfaces use the snapshot while loading.

## Security Review

The endpoint is same-origin, GET-only, uses the existing run-id/path owner, validates returned log lines with the existing event schema, and has a fixed byte/turn cap. It exposes only events already available through the selected run's SSE stream and adds no write, origin, file-system, or authorization surface.

## Milestones

**M1 — Atomic recorded-thinking bootstrap**

- [x] Write endpoint and app tests for bounded complete turns, atomic cached thinking, exact run scoping, and failure recovery.
- [x] COMMIT: `test(viewer): require atomic recorded thinking bootstrap` (RED; this commit)
- [x] Implement the bounded snapshot and sidebar projection.
- [x] Adversarial break/restore proof.
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage`.
- [x] COMMIT: `fix(viewer): show recorded thinking during replay catch-up` (GREEN)
- [x] Real-browser proof at 1280x900, 1440x900, and 375x812 on recorded runs, with run switching and multiple polling/playback cycles.
- [ ] Multi-model review loop until clean (round 1 repaired; cumulative round pending).
- [ ] Fast-forward onto current `main`, restart 8790, and verify the live page.

## Closing the Loop

- Pending.

## Session Log

- 2026-10-19: After landing cached splits at `f0ff0138`, the real main viewer showed the analogous thinking defect: during `LOADING`, `RIGHT NOW` and `EARLIER` filled from old to new as the selected run's SSE stream replayed from byte zero. Confirmed final and streaming thoughts are already recorded in `events.jsonl`; no recorder change is required.
- 2026-10-19: RED focused run: 4 expected failures. The endpoint does not exist, the client ignores the recorded head and shows partial stream thinking, and the failure path has no stable recorded-thinking loading state.
- 2026-10-19: GREEN focused run: 142 tests passed across `app.test.ts`, `runs.test.ts`, and `server.test.ts`, including stale-response rejection and exact run scoping.
- 2026-10-19: Adversarial proof: temporarily rendered the partial stream view during `loading`; the atomic-thinking test failed because the pane showed `no data` instead of the latest recorded thought. Restored the snapshot selection before continuing.
- 2026-10-19: Final full gates passed sequentially: `just test` (2,527 agent tests, 1,202 viewer tests, 2,480 Python tests; 229 ROM-dependent skips), `just lint`, `just build`, and `just coverage` (viewer 97.67% lines; Python gate 97.47% lines / 93.37% branches / 99.43% functions).
- 2026-10-19: The first real-browser candidate check exposed a handoff defect the initial tests missed: the snapshot showed final turn 260 during `LOADING`, then the run-splits pane fell back to replay turn 0 at `caught_up`. Added a finished-run regression test and kept the pane on the fully folded recorded present while the full trace continues replaying.
- 2026-10-19: Candidate browser proof on the real 10,090-event `petalburg-rerun-a`: final turn 260 and its latest thought appeared during catch-up, remained final after `REPLAY` began while the full trace stayed at replay start, and `EARLIER` held 30 newest groups. No console-visible problem text or horizontal overflow at 1280x900, 1440x900, or 375x812. Switching to paired run B showed its final turn 229 snapshot, then switching back restored A's final turn 260 snapshot without stale cross-run content.
- 2026-10-19: Review round 1 found two in-contract UI defects and two proof gaps: a late same-run `/head` success or failure could overwrite the authoritative caught-up stream; cached sidebar rows looked up inspector events in the replay cursor instead of their recorded-thinking owner; the partial-oldest-turn branch was not isolated by the original bounded-tail fixture; and the production 30-turn / 8 MiB defaults were not pinned. All were accepted and repaired within the frozen viewer boundary.
- 2026-10-19: Added deterministic late-success and late-failure scheduling tests, cached-row inspector tests during loading and finished replay, a same-run reselection test, client/server exact-run rejection tests, an isolated mid-turn byte-boundary fixture, and explicit production-bound assertions. Focused repaired suite: 150 tests passed across `app.test.ts`, `runs.test.ts`, and `server.test.ts`; `git diff --check` passed.
- 2026-10-19: Adversarial repair proofs, each restored afterward: deleting the catch-up invalidation exposed `Late stale snapshot.` over `Authoritative at catch-up.`; forcing sidebar inspection back to replay-owned `shown` produced the inspector placeholder in both cached-row tests; deleting partial-oldest-turn discard returned turns `[1,2,3]` instead of `[2,3]`; drifting defaults to 29 turns / 7 MiB failed the 30-turn pin; deleting the request-generation guard let `Stale same-run thought.` replace the fresh same-run response; deleting client run-identity validation rendered `Foreign run thought.`; deleting server recent-event ownership validation stopped the expected `someone-else` rejection.
- 2026-10-19: Repair commit `35b93b95` passed `just test` (2,527 agent, 1,209 viewer, 2,480 Python; 229 ROM-dependent skips). The first `just lint` found two unnecessary optional chains in the new DOM test queries; removed them, reran the 77-test app file, and reran `just lint` clean before amending the repair commit. Build and coverage remain pending for the amended head.
- 2026-10-19: Repaired head `be7146d1` passed `just build` and `just coverage`: 1,209 viewer tests with 97.67% line coverage; Python 2,480 passed / 229 ROM-dependent skipped with 97.47% lines, 93.37% branches, and 99.43% functions. Together with the prior full test and clean lint rerun, all required gates are green sequentially.
- 2026-10-19: `main` advanced to `a7be38f6` (`feat(bundle): enable automatic running`), so the four-commit candidate was rebased before final freeze. Rebased head `e985f18` passed `just test`, `just lint`, and `just build`. The first two rebased coverage attempts each hit a different unrelated 5-second agent-test timeout (`people-id-cards-delivery`, then `exit-reachability`); both tests had passed in the full suite and the pre-rebase coverage gate. After stopping this task's two CPU-heavy viewer proof servers, a clean full `just coverage` passed with 1,209 viewer tests / 97.67% lines and Python 2,480 passed / 229 skipped / 97.47% lines / 93.37% branches / 99.43% functions.
- 2026-10-19: Rebased candidate browser proof on the real 10,090-event `petalburg-rerun-a`: `FINAL · TURN 260` and its latest thought appeared while the mode still read `LOADING`, remained unchanged after `REPLAY`, the full trace stayed at its replay-start content, the problems panel was empty, and there was no page overflow. Clicking the first cached `EARLIER` row opened its exact turn-260 `tool_call` and `button_press` events in the inspector, proving the repaired row owner on real data.

## Surprises

- The all-runs workbench response is intentionally compact and cannot safely carry recent thought text for hundreds of recordings; the cache must be selected-run scoped.
- The run-splits thinking pane and the full trace had shared the same replay cursor even though the former is labeled `RIGHT NOW`; fixing only stream catch-up would have preserved the visible replay-from-zero flash after handoff.

## Multi-Model Review Log

- Round 1 frozen head `41075b40`, diff SHA-256 `33a7ff9191305500ed4f32135ec6611b9b5e8fcfbb0931222e4fd4159bfc71c7`: BLOCKING from Grok, GPT, and both standing-authorized Claude-outage fallbacks. Consensus blocker: late `/head` completion could replace or clear the authoritative stream after `caught_up` (PB7 / INV-4). Two fallback reviewers additionally reproduced cached sidebar rows that could not open inspector details. Evidence audit also found the non-isolating boundary fixture, unpinned production limits, and incomplete operand-level break/restore receipts. No reviewer requested scope expansion or found an additional security boundary defect.
- Claude primary profiles were unavailable due authentication/usage limits; two fresh, isolated fallback reviewers (`gpt-6.1-sol` and `gpt-6-astra`) were used under the documented outage policy. Vendor diversity was therefore reduced and is recorded rather than treated as equivalent Claude coverage.
- Round 1 disposition: all concrete findings accepted; no contradictions remained after reproductions. Repairs are pending a new frozen-head cumulative re-review.
- Round 2 frozen head `29ebc06c`, diff SHA-256 `4d6fe9bb52c4e6d9e958cf45b3bbc8fdc77f53595a846368d142af8240148b11`: Grok returned LGTM, while GPT and both Claude-outage fallbacks blocked. Consensus reproduced a candidate-created reconnect defect: duplicate historical SSE events were rejected by `RunView` but still appended to the sidebar trace until the next `caught_up`. Both fallback reviewers also proved the late-failure test was non-falsifying because its live-view fallback preserved the same thought after the recorded projection was cleared. Both findings are accepted for repair; Grok's contrary LGTM missed these concrete reproductions.
- Round 2 repair proof: the sidebar trace now appends only when `RunView.apply` accepts a new higher-sequence event. A deterministic reconnect test repeats historical sequences before a second `caught_up`, requires the existing row to remain unique, and proves a fresh higher sequence still appears. Removing the acceptance condition produced two rows for sequence 4 instead of one. The late-failure test now uses a finished run at replay start and requires both final thought `Again.` and earlier thought `Press A to start.` to survive; removing only the catch-side stale-request guard changed the thought to `no data`. Both mutants were restored and the three focused race/reconnect tests passed.
- Round 2 repaired head `62035f6f` passed all sequential gates: `just test` (2,527 agent, 1,210 viewer, 2,480 Python; 229 ROM-dependent skips), `just lint`, `just build`, and `just coverage` (viewer 97.67% lines; Python 97.47% lines / 93.37% branches / 99.43% functions). No timing retry was needed after stopping the candidate proof server before coverage.
- Before convergence review, `main` advanced again to `cd596604` with the target-specific battle-damage feature. The five candidate commits rebased cleanly. The first post-rebase `just test` saw the new preset through stale compiled agent schema and failed viewer validation; `just build` refreshed the generated package output, after which the exact rebased head passed `just test` (2,529 agent, 1,210 viewer, 2,492 Python; 229 ROM-dependent skips), `just lint`, `just build`, and `just coverage` (viewer 97.67% lines; Python 96.96% lines / 92.48% branches / 99.44% functions).
- After two blocking rounds, the operator explicitly confirmed the unchanged scope and requested that round three review only the repair delta. The convergence packet is therefore limited to `7b172326..HEAD`: reconnect trace acceptance, the deterministic reconnect regression test, the strengthened finished-run late-rejection test, and their worklog receipts. Landing still applies the already-gated cumulative five-commit candidate.

## Boy Scout Log

- None.

## Archive Milestone

- [ ] ASK USER: approve archival after landing and live proof.
