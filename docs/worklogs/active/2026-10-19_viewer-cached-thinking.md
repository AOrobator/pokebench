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
- At `caught_up`, switch atomically to the fully folded event stream; `events.jsonl` remains authoritative.

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
- [ ] Implement the bounded snapshot and sidebar projection.
- [ ] Adversarial break/restore proof.
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage`.
- [ ] COMMIT: `fix(viewer): show recorded thinking during replay catch-up` (GREEN)
- [ ] Real-browser proof at 1280x900, 1440x900, and 375x812 on recorded runs, with run switching and multiple polling/playback cycles.
- [ ] Multi-model review loop until clean.
- [ ] Fast-forward onto current `main`, restart 8790, and verify the live page.

## Closing the Loop

- Pending.

## Session Log

- 2026-10-19: After landing cached splits at `f0ff0138`, the real main viewer showed the analogous thinking defect: during `LOADING`, `RIGHT NOW` and `EARLIER` filled from old to new as the selected run's SSE stream replayed from byte zero. Confirmed final and streaming thoughts are already recorded in `events.jsonl`; no recorder change is required.
- 2026-10-19: RED focused run: 4 expected failures. The endpoint does not exist, the client ignores the recorded head and shows partial stream thinking, and the failure path has no stable recorded-thinking loading state.

## Surprises

- The all-runs workbench response is intentionally compact and cannot safely carry recent thought text for hundreds of recordings; the cache must be selected-run scoped.

## Multi-Model Review Log

- Pending.

## Boy Scout Log

- None.

## Archive Milestone

- [ ] ASK USER: approve archival after landing and live proof.
