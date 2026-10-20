# Splits vs the frontier

## Operator report

2026-10-20 10:17 AM ET, the operator: "split times versus best we should really rename it to split times versus frontier... when I go to the splits page... I expect it to be compared to the frontier. That's always what we're measuring against."

## Design

- The reference is the frontier graph's agent frontier (`frontierReferences(...).best`: furthest New Game start, then fastest), not the per-save "best historical run" `comparisonsOf` picked.
- `/api/runs/<id>/comparisons` returns `frontier` (its native splits, active time, screenshot-only splits left out, recovered splits flagged) computed from the workbench snapshot, with the selected run left out so a frontier run races the next one instead of itself. `comparisonsOf` no longer computes `best`.
- A checkpoint resume gets no frontier (its clock starts mid-game).
- Labels: SPLIT TIMES VS FRONTIER, VS FRONTIER column, PokéNav page SPLITS · BASELINE · FRONTIER, "Frontier" column and "Frontier run:" note. A delta under one second is a tie, uncolored.
- Viewer-only; no harness behavior, no feature switch; timeline untouched.

## M1

- [x] RED: frontier.test (frontierSplits), controls/panels/app labels and `frontier` key, server /comparisons returns frontier; 12 failing
- [x] GREEN: `frontierSplits` in frontier.ts; /comparisons adds `frontier` from the workbench snapshot; `comparisonsOf` drops `best`; card, page, table and note relabelled; sub-second ties uncolored
- [x] Gates: agent 2702, viewer 1356, python 2894 passed; coverage viewer 95.14/91.17/93.87, agent 97.61/93.75/97.87, python 96.94/92.45/100; lint clean
- [x] RED 2: on the real runs dir the first /comparisons after a viewer start returned frontier null, because the cold partial workbench had not loaded the runs yet (a second call found `…gpu1_e046`). Test: a partial-workbench viewer's first /comparisons must name the frontier; fails.
- [x] GREEN 2: /comparisons reads a complete workbench snapshot (shared loader cache); gates rerun: viewer 1356, agent 2702, python 2894; coverage viewer 95.15/91.18/93.88; lint clean
- [ ] Proof: real browser, desktop and phone
- [ ] Review: Claude, Grok (GPT waived for this thread)
- [ ] Land ff-only, viewer-main, live check
