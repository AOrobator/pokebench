# Frontier on the split card for every picked run

## Operator report

2026-10-20 10:54 AM ET, the operator (screenshot of bundle-cook-6h-v2 replay): "replays look empty." The SPLIT TIMES VS FRONTIER column on the side card is blank.

## Cause

The side card's reference comes from `/comparisons`, which the app requests only while the PokéNav splits page is open (deliberately: the comparisons scan validates every candidate log). The old VS BEST column had the same gap.

## Design

- New `GET /api/runs/<id>/frontier` → `{ frontier }` from the complete workbench snapshot (no candidate scan); `/comparisons` goes back to `{ candidates, baseline }`.
- The app requests the frontier on every run selection (request-token guarded), so the card and the PokéNav page share it.
- Viewer-only; timeline untouched.

## M1

- [x] RED: app picks a run → one /frontier request, no /comparisons, card shows the delta; a superseded run's frontier never lands; server /frontier route (selected, self-excluded, invalid id 404, cold partial viewer); /comparisons has no frontier. 5 failing.
- [ ] GREEN
- [ ] Gates
- [ ] Proof: real browser, desktop and phone, replay with splits page closed
- [ ] Review: Claude, Grok
- [ ] Land, viewer-main, live check
