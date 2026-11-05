# Instant live state

Requested by the operator 2026-11-04: the viewer must not replay history to show the live turn, context or thinking.

Viewer-only, no harness behavior, so no feature switch. No timeline marks added.

## Findings

- No regression in the read path: `/api/runs/<id>/current` has been a saved-row lookup since 979ef9074 (10-28), about 15 ms on run 5f0f.
- A restored run behind its log folded forward event by event. Only first-seen runs started from the tail.
- Thinking was not in the snapshot. It came from a newest-events page refetched on every new seq: 35 fetches, 27 MB in 30 s on one open page.

## M1

- [x] RED/GREEN: thought and in-flight thinking in `CurrentState` and the snapshot display; old checkpoints still parse
- [x] RED/GREEN: `behindLive`, `jumpToTail`; projector jumps when over `burstBytes` behind and folds the gap as a stage
- [x] RED/GREEN: recent-events page refreshes on a turn change or every 3 s
- [x] Thinking panel reads the snapshot on live runs
- [x] Rehearsal on a scratch copy of 5f0f events, 37 MB backlog: first state 65 ms (was 4553 ms), backfill 4.5 s, final state identical to a full fold
- [ ] Gates
- [ ] Review
- [ ] Land, `just current-main`, `just viewer-main`, headless proof

## Review log

Round 1 (GPT, 1bd040640, BLOCKING): old snapshot rows rejected by the new parser, fixed: the three thinking fields are optional when reading. Refresh marked done while a page was loading, fixed. Tail may miss the current `turn_start` during a long response: rebutted, recovery-only and clears at the next turn or backfill.

Rollout order: `just viewer-main` first, then `just current-main`.

## Principles self-review

PB1-PB8, PB11, PB12: N/A, display-only change that records nothing and changes no run. PB9 PASS: asked for directly by the operator. PB10 PASS: no gate weakened. PB13 PENDING until the post-merge browser proof.
