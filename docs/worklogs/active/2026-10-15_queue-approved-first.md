# Queue: approved experiments above drafts

Operator request (2026-10-15): in the viewer's experiment queue, list approved experiments above draft experiments. Viewer-only display order; the queue runner and `queueSnapshot` order are unchanged.

## M1 — order approved work first

- [x] RED: `queue-view.test.ts` renders approved/held/running cards before draft/stale ones, keeping queue order within each group.
  COMMIT: `test(viewer): RED approved experiments list above drafts in the queue` (e49d526)
- [x] GREEN: `renderQueue` stable-sorts running, held and approved ahead of the rest. Viewer 582 tests pass; viewer coverage 94.95 lines / 90.67 branches / 93.82 functions (gate 90 green).
- [ ] Review: Claude CLI + Grok (Cursor) per the operator's choice for this change.
- [ ] Operator approval, local merge into main, restart viewer on 8790.
