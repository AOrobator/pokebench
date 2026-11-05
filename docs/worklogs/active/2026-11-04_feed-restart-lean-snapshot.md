# Feed restart and lean snapshot

Requested by the operator 2026-11-04, follow-ups to `2026-11-04_instant-live-state.md`. Viewer and service tooling only, no harness behavior, so no feature switch.

## M1

- [x] RED/GREEN: `_unload` waits for launchd to release the label after bootout, bounded at 10 s (`just current-main` failed with status 5 on both restarts)
- [x] RED/GREEN: a snapshot sends a shared state once (`partyIsState`) and restores it on read; older rows still parse
- [ ] Gates
- [ ] Review
- [ ] Land, `just viewer-main`, `just current-main`, confirm one-try restart and snapshot size

## Review log

Round 1: Claude LGTM, fallback LGTM, GPT BLOCKING at eca8bbc08. Marker validation fixed. Tabs open across the rollout need a reload: rebutted as operational, the same for any snapshot change, and reported to the operator.

## Principles self-review

PB1-PB8, PB11, PB12: N/A, display and tooling only. PB9 PASS: asked for by the operator. PB10 PASS: no gate weakened. PB13 PENDING until the post-merge check.
