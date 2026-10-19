# Trainer card for replays

## Problem Statement

The operator (2026-10-18): "the trainer card should show for replays, it just shouldn't mark as live."

The viewer header builds trainer cards only from runs that are currently live. When the operator selects an ended recording, the replay itself disappears from the card row while unrelated live runs remain. The selected replay should keep its trainer card and identify itself as `REPLAY`, without a live dot.

## Architecture

- Viewer UI only; no harness behavior change and no feature switch.
- Keep the selected ended run in the shared trainer-card inputs alongside current live/paused runs.
- Add a presentation-only `replay` card state. It is selected (`aria-pressed=true`) but renders `REPLAY` with no live dot.
- Keep the existing artless fallback unchanged.

## Milestones

**M1 — selected replay card**
- [x] RED: `trainer-card-app.test.ts` adds an ended selected run and requires its selected `REPLAY` card without a live dot while both live cards remain `LIVE`. Focused result: 1 failed / 12 passed because the replay card was absent.
- [ ] GREEN: implement the replay card state and selected-run inclusion.
- [ ] Gates: focused tests, `just test`, `just lint`, `just build`, `just coverage`, `just verify-vendor`.
- [ ] Browser proof on an owned preview: replay selection and live selection, pointer and keyboard, two polling cycles, screenshots at 1280, 1440 and 375.
- [ ] Multi-model review and landing.

## Evidence

- Baseline on the existing 8790 viewer, run `2026-10-18T22-47-51_qwen36-gpu0_849c`: the page reached `REPLAY`, but `data-ui="run-cards"` contained only the two live dry-run cards and no card for the selected replay.
