# Viewer cached splits

## Problem Statement

Opening or switching to a recorded run clears the selected run view and folds `events.jsonl` from event zero. The sidebar therefore paints already-recorded milestones one by one while the stream catches up. The operator expects the latest recorded split snapshot to render immediately, without weakening the event log as the source of truth.

## Skills Loaded

- `pokebench-story-milestones`: preserve recorded milestone semantics and provenance.
- `viewer-e2e`: prove the selected-run viewer behavior in the real browser.
- `close-the-loop`: require RED/GREEN tests, real-browser widths, and read-only real-data checks.

## Architecture

- Continue streaming and folding the complete event log for replay, state, trace, and final authoritative UI.
- While the stream is catching up, render the selected run's compact split snapshot from `/api/workbench`.
- Never merge partial replay milestones into the cached projection. Switch atomically from the cached projection to the fully caught-up `RunView`.
- If the snapshot is unavailable, hold a stable loading state rather than rediscovering splits one by one.

## Invariants

- **INV-1:** `events.jsonl` remains the record of truth. The cache is display-only during stream catch-up. Test: after `caught_up`, the sidebar uses the folded `RunView` and reflects its milestones.
- **INV-2:** Already-recorded splits never appear sequentially during bootstrap. Test: partial stream delivery cannot replace the cached complete split list.
- **INV-3:** The cached projection is scoped to the selected run. Test: switching runs cannot show the previous run's splits.
- **INV-4:** Cache failure is recoverable. Test: the stream still becomes authoritative after `caught_up` when `/api/workbench` is unavailable.

## Security Review

No new write, network origin, control, or file-system boundary. `/api/workbench` is already same-origin, parsed by the existing strict validator, and contains recorded read-only projections. Run identity must match before using a snapshot.

## Milestones

**M1 — Atomic cached split bootstrap**

- [x] Write tests for cached complete splits, partial stream stability, run scoping, and cache-failure recovery.
- [x] COMMIT: `test(viewer): require atomic cached split bootstrap` (`a5c72590`) (RED; rebased onto current `main`)
- [x] Implement the display-only cached projection.
- [x] Gates: targeted tests 86 passed; `just test` 1,189 viewer + 2,515 agent + 2,480 Python passed; `just lint` passed; `just build` passed; viewer coverage 95.41% statements / 91.46% branches / 93.87% functions / 97.65% lines; Python coverage 97.47% lines / 93.37% branches / 99.43% functions. The first combined coverage run hit two unrelated timing failures in `server-stream.test.ts`; the immediate isolated viewer coverage rerun passed all 1,189 tests and all thresholds.
- [x] COMMIT: `fix(viewer): show cached splits during replay catch-up` (`8b20705a`) (GREEN; rebased onto current `main`)
- [x] Real-browser proof at 1280x900, 1440x900, and 375x812, including pointer run switching, collapsed/expanded split times, and multiple polling/playback cycles. At replay clock 0:00:02, all 23 recorded splits were already visible. Screenshots: `runs/mockups/viewer-cached-splits/shots/` (all five links returned HTTP 200 on the local pages server).
- [x] Read-only real-data check: run `2026-10-18T22-47-51_qwen36-gpu0_849c` has 23 recorded milestone rows and the candidate viewer showed 23 completed split chips immediately while replay remained near the start; switching to `2026-10-15T19-44-55_qwen36-gpu0_dfb0` changed the selected run and its split projection without retaining the first run's chips.
- [ ] Multi-model review loop until clean. Grok and GPT/Codex are green on frozen head `125060a3`; Claude-family review is blocked by exhausted Cursor Claude usage and an unauthenticated standalone Claude review profile.

## Closing the Loop

- Implementation, deterministic gates, coverage, and real-browser proof are complete.
- Landing is blocked by the required Claude-family cloud review lane; no merge was attempted.

## Session Log

- 2026-10-18: Operator reported sequential milestone flashing and asked to render the recorded current state from cache. Traced the behavior to `App.select` resetting `RunView` and the SSE endpoint replaying from byte zero in 2,000-line chunks. Confirmed milestone events and the workbench split snapshot already exist.
- 2026-10-18: RED targeted run: app tests failed because cached splits were ignored and partial streamed milestones painted during loading. The controls suite also requires the agent package build in this fresh worktree; this setup gap is separate from the two expected behavioral failures.
- 2026-10-19: GREEN implementation uses the parsed workbench snapshot only while the selected event stream is loading, then uses the completely folded run rather than the replay cursor for the sidebar. Trainer-card art remains optional. Adversarial deletion replaced the complete run with the replay cursor; the focused test failed (`TRUCK EXIT` disappeared) and passed after restoration.
- 2026-10-19: Browser proof used a scratch clone of two real run recordings on port 8797. At 0:00:02 of the ended replay, the sidebar already showed all 23 completed splits; timeline/screen continued replaying from the start. Run selection replaced the split set cleanly. Inspected 1280, 1440, and 375 px captures with split times both collapsed and expanded; no clipping or narrow-column regression observed. Scratch server stopped and the temporary run copy was removed.
- 2026-10-19: Synced onto the current `main`, rebuilt the agent package to refresh its generated schema, then reran the full gates: 2,527 agent tests, 1,193 viewer tests, and 2,480 Python tests passed; lint and build passed.

## Surprises

- The compact workbench snapshot already contains every split needed for this sidebar; the selected-run view currently ignores it during bootstrap.

## Multi-Model Review Log

- Frozen packet `17d7f83e..125060a3`, binary diff SHA-256 `a9f1a8d6e0d0c66812ccf9457c6acfbf5968c1bb8d6e688aae36c6bb1b6419e0`; clean pre/post status and exact HEAD verified.
- Principles self-review: PB1–PB13 complete, 5 PASS / 8 N/A / 0 FAIL.
- Claude-family: unavailable. Cursor Claude Opus and Sonnet each stopped before review with the account usage limit; the dedicated standalone Claude review profile reports `loggedIn: false`. Per `CLAUDE.md`, this lane is not waived and self-merge is blocked.
- Grok-family: Cursor `cursor-grok-4.5-high`, `VERDICT: LGTM`. Non-blocking notes only: optional stale-cache disappearance coverage and speculative timing differences at the cache-to-fold handoff.
- GPT-family: Cursor GPT hit the same account usage limit, then the standing-authorized isolated Codex subagent (`gpt-5.6-sol`, xhigh, no inherited turns) independently reproduced the digest, verified clean status, reran tests/lint/build, and returned `VERDICT: LGTM` with no findings.
- Review synthesis: no consensus blocker, contradiction, security defect, scope expansion, or missing deterministic/live evidence. Test quality covered caller seam, adversarial break/restore, absence of shared globals/retries/sleeps/skips, diagnostic assertions, and small in-memory fixture runtime shape. Disposition: implementation-ready but review-incomplete until Claude returns literal `VERDICT: LGTM`; do not merge.

## Boy Scout Log

- None.

## Archive Milestone

- [ ] ASK USER: approve archival after landing and live proof.
