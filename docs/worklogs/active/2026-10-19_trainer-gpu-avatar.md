# Trainer-card GPU avatars

## Problem Statement

The two live Petalburg reruns have the same model and no experiment arm, so the trainer-card selector gives both the same character. The operator asked for the GPU identity to contribute to avatar selection so concurrent GPU0 and GPU1 runs are visually distinct.

## Skills Loaded

viewer-e2e, close-the-loop.

## Architecture

Keep the existing stable experiment/arm trainer selection and add the GPU token recorded in fixed-run IDs (`gpu0`, `gpu1`, and future numbered lanes) to its hash input. Runs without a GPU token retain the previous selection.

## Invariants

- INV-1: A run's trainer remains deterministic across polls and pages; cover the same input repeatedly.
- INV-2: GPU0 and GPU1 affect the selection; cover the two live-run-shaped IDs.
- INV-3: Existing non-GPU run IDs preserve their prior trainer selection; cover the empty-GPU fallback.
- INV-4: Experiment arms remain distinct while enough trainer sprites exist; retain the collision-probing test.

## Security Review

Viewer-only string hashing. No network boundary, secrets, ROM data, run mutation, experiment mutation, or timeline change.

## Milestones

**M1 — GPU-aware trainer selection**

- [x] Add a failing unit regression for same-model GPU0/GPU1 cards.
- [x] Implement GPU-aware deterministic selection.
- [x] Pass focused viewer tests, build, lint, full tests, and coverage.
- [x] Verify the candidate in a real browser against an isolated scratch runs root.
- [ ] Complete the required multi-model review before landing.

## Closing the Loop

The change is complete only after the built candidate visibly assigns different trainer characters to the two live-run-shaped fixtures at desktop and phone widths, while Watch selects the exact run and a visible frame. Landing and the shared 8790 restart are separate states.

## Session Log

- 2026-10-19: Bound the reported live tab identity (`2026-10-19T00-04-00_qwen36-gpu0_petalburg-rerun-b`). Browser control could not attach because another browser session owns that tab. Read-only live APIs show two live same-model, untagged runs on GPU0 and GPU1; the current selector hashes only the shared model title and empty arm, explaining the duplicate avatar.
- 2026-10-19: Created isolated worktree `/private/tmp/pokebench-trainer-gpu-avatar` from clean main `24232e63`; left the shared viewer on 8790 and its frozen `/private/tmp/pokebench-viewer` checkout untouched.
- RED: the current two live-run IDs both selected `norman`; the new focused regression failed on their equal trainer values. GREEN: GPU1 deterministically selects Wally and GPU0 Glacia from the production 14-trainer manifest, and the same GPU1 run remains Wally after clock/status changes. Focused trainer-card suite: 13 passed.
- Full gates: `just test` passed 2,527 agent, 1,191 viewer, and 2,709 Python tests. `just lint`, `just build`, and `just verify-vendor` passed. `just coverage` passed the 90% floor: agent 97.99% statements / 94.15% branches / 98.32% functions / 99.25% lines; viewer 95.42% / 91.50% / 93.85% / 97.65%; Python 97.64% lines / 93.77% branches / 100% functions.
- Candidate browser proof used scratch root `/private/tmp/pokebench-gpu-avatar-proof.SCfRHZ` and port 8804, containing copied events/frames for only the two live Petalburg reruns plus trainer-card art and no experiment state. The comparison page showed GPU1 as Wally and GPU0 as Glacia across two polling cycles. Pointer activation of GPU1 and keyboard Enter on GPU0 each selected the exact run URL, reached RUNNING, and displayed a run-owned `/api/runs/<id>/screen` image. Opened 1280×900, 1440×900, and 375×812 screenshots; both avatars are visibly distinct and the page reports no horizontal document overflow. Receipts: `runs/mockups/trainer-gpu-avatar/shots/cards-{1280,1440,375}.png`, served by 8791 with HTTP 200.

## Surprises

The current live runs are not present in the fixed-run lane status, so the only durable GPU identity available to both viewer surfaces is the `gpuN` token in their run IDs. The first full-test attempt in the fresh worktree lacked its initialized vendor map data and ROM/native environment; after initializing the pinned top-level vendor submodule and linking the established local environment, the complete test and coverage gates ran with zero skips.

## Multi-Model Review Log

- Pending.

## Boy Scout Log

- None.

## Archive Milestone

- [ ] ASK USER: archive after reviewed landing and live verification.
