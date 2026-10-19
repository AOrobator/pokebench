# Replay trainer card and mobile sheet repair

## Contract

Restore the selected replay card when no renderable live cards exist, preserving live-card precedence. Fix mobile card background stability during updates and animate the bottom sheet opening with reduced-motion support. Viewer only; no harness or experiment changes.

## Evidence and scope

- Reported tab: 8790, selected `2026-10-19T16-13-42-317Z_qwen36-gpu1_petalburg2h-r6-visited-map`, REPLAY mode, no trainer cards. Served build `35edd7af`, PID 9114.
- Discovery advertises two newer live runs plus two stale old runs. The workbench has not loaded the newer runs and marks the old pair unresponsive. `cardInputs` returns an empty live branch and never reaches replay fallback.
- Mobile sheet currently remounts every card when any card markup changes; this can discard loaded image backgrounds. Preserve sheet card nodes separately from its surrounding metadata and give the art a solid fallback surface.
- Use an isolated worktree from main; the original checkout belongs to ongoing 60fps changes and is dirty.

## Milestone

- [x] RED: both regressions fail at the consumer seam: no replay card when live workbench records are missing; unchanged other mobile card is replaced when a fresh badge expires. Focused result 16 passed / 2 failed.
- [ ] Implement card fallback, stable sheet cards and slide-up entrance.
- [ ] Build, focused/full viewer checks and browser verification at desktop/mobile widths.
- [ ] Independent review and local-main landing, followed by live proof.
