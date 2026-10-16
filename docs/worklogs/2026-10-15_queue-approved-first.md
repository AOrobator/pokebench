# Queue: approved experiments above drafts

Operator request (2026-10-15): in the viewer's experiment queue, list approved experiments above draft experiments. Viewer-only display order; the queue runner and `queueSnapshot` order are unchanged.

## M1 — order approved work first

- [x] RED: `queue-view.test.ts` renders approved/held/running cards before draft/stale ones, keeping queue order within each group.
  COMMIT: `test(viewer): RED approved experiments list above drafts in the queue` (e49d526)
- [x] GREEN: `renderQueue` stable-sorts running, held and approved ahead of the rest. Viewer 582 tests pass; viewer coverage 94.95 lines / 90.67 branches / 93.82 functions (gate 90 green).
- [x] GREEN commit: `fix(viewer): list approved experiments above drafts in the queue` (47fdaea)
- [x] Claude CLI review 1: no bugs; asked whether an operator-approved experiment that lapses to not-ready should stay on top. Decision: yes, the group is `approved || running` (the view's `approved` is true only for a valid approval hash, so stale drops below).
- [x] Scope added by the operator (relayed 2026-10-15): pending experiments sit on the same card as the queue. Stats page (`workbench.html`) folds the pending section into the queue box; `.eq-pc` loses its separate card styling on both pages. Viewer 583 tests; coverage 94.95 / 90.67 / 93.82 (gate 90 green).
- [x] COMMIT: `fix(viewer): keep approved not-ready experiments on top and pending on the queue card` (98fef69)
- [x] Review on the full diff: Claude CLI LGTM (asked whether a blocked queued experiment with a valid approval should stay on top: yes, it is approved); Grok (cursor-grok-4.5-high) LGTM, nit: stale header comment, fixed. Visual check on 8790 /comparisons (DOM-patched to the branch layout): pending sits under the queue on one card.
- [ ] Operator approval, local merge into main, restart viewer on 8790.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-15). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
