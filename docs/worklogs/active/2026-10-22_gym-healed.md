# Gym practice loop on the healed Rustboro save

## Problem
The r10 save's last heal point is Petalburg, so a run that loses to Roxanne before healing respawns two maps back (7c9f, 2026-10-22 3:49 PM). The operator (4:11 PM, "Remaining frontier report fixes"): make or find a new checkpoint. That thread made one: r10 plus scripted presses to heal at the Rustboro Pokémon Center (sha1 430f7564, sidecar lists every press and RAM check).

## Design
- `experiments/fixed/gym-rustboro-torchic-healed.json`: a copy of gym-rustboro-torchic with its own id (its own EXPERIMENT cohort, never pooled with r10 runs) and the healed start.
- The save is copied as `RUSTBORO_CITY.state` (same sha1) into `runs/checkpoints/RUSTBORO_CITY/candidates/2026-10-22_r10-healed-rustboro-center-viewer/`, because the viewer recognizes a checkpoint resume only by that file name (frontier graph "resumed" overlay).
- Swap: land, STOP the r10 gym loop (active trials play to their cap), start the loop on the new id once the old controller exits.

## Milestones
- [x] Definition written; definitionProblems [] and controlBaseProblems []; stubbed dry-run rehearsal on all four lane/arm pairs with the bundle recipe: rc 0, start 430f7564, 49 bundle switches.
- [x] Gates: lint rc 0, coverage rc 0, verify-vendor OK. Review packet e98de169: Claude (fresh subagent) LGTM, GPT gpt-5.6-sol LGTM, Astra gpt-6-astra LGTM. Rebased onto main twice with the packet byte-identical; viewer 1792 tests pass on the rebased tree. Landed fast-forward.
- [ ] swap the loop, dropdown and frontier graph check
