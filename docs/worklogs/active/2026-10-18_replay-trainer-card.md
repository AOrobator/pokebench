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
- [x] GREEN: the selected ended run joins the stable card row as a selected `REPLAY` card; replay and paused states have no live dot, and the phone sheet calls the mixed collection `RUNS`. Focused trainer-card/app/header tests: 47 passed.
- [x] Gates: focused 47/47; after merging current `main` (`5e2701f3`), `just build`; `just test` (agent 2,515, viewer 1,187, Python 2,709); `just lint`; `just coverage` (agent 98.00/94.19/98.31/99.24, viewer 95.42/91.50/93.84/97.64, Python lines 97.64 / branches 93.77 / functions 100); `just verify-vendor`.
- [x] Browser proof on owned preview 8798 over a clone-on-write scratch copy of the selected replay plus two live runs. The replay reached `REPLAY`, showed its recorded frame, was selected, said `REPLAY`, had zero live dots, and remained so through two 5-second workbench polling cycles. Pointer and keyboard activation each selected a live card, retained keyboard focus, reached `RUNNING`, showed the live screen endpoint and restored `WATCHING` plus one live dot. Screenshots at 1280, 1440 and 375 were captured and visually inspected; at 375 the open phone sheet showed the replay first under `RUNS · TAP TO WATCH`, followed by two live cards. No application console errors; browser-extension warnings only. The browser-control surface did not expose persistent screenshot paths, so the inspected captures are in the task tool record rather than `runs/`.
- [ ] Multi-model review and landing.

## Evidence

- Baseline on the existing 8790 viewer, run `2026-10-18T22-47-51_qwen36-gpu0_849c`: the page reached `REPLAY`, but `data-ui="run-cards"` contained only the two live dry-run cards and no card for the selected replay.
