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
- [x] GREEN: `/frontier` route (404 for an unknown run), `/comparisons` back to candidates + baseline, `loadFrontier` on every selection with its own request token; comparisons tests now route /frontier separately
- [x] Gates: viewer 1358, agent 2702, python 2894 passed; coverage viewer 95.14/91.16/93.88; lint clean
- [x] Proof: branch viewer 8796, replay of `…gpu1_f28d` with the AGENT TRACE page open (splits page never opened): card shows VS FRONTIER deltas against `…gpu1_e046`; 375 px phone, no horizontal scroll
- [x] Review on packet 5a252907… (base 2a2fe257, head 025aaeec): Grok cursor-grok-4.5-high VERDICT: LGTM; Claude lane via Claude subagent VERDICT: LGTM. Non-blocking: complete snapshot per pick is not memoized; some app test doubles answer /frontier with comparisons-shaped payloads. Logs under runs/reviews/frontier-on-select/
- [x] Synced with main 48309d51 (semantic navigation landed meanwhile); code diff against main is byte-identical to the reviewed packet (index lines aside). Gates on the merged tree: viewer 1360, agent 2787, python 2896; coverage viewer 95.14/91.16/93.88; lint clean. Re-review of the synced packet below.
- [x] Round 2 on synced packet 1b11ee94… (base 48309d51, head f6396c46): Grok VERDICT: LGTM; Claude subagent VERDICT: LGTM.
- [ ] Land, viewer-main, live check
