# Remove the objective UI (2026-10-15)

Operator request: the objective feature is no longer used, so remove the objective UI from the viewer and from the Runs & Comparisons page. Viewer-only: recorded objective events, the objective-tracking switch and its Harness Config card are untouched, and the trace still lists historical objective events.

## M1 · Remove the objective UI

- [x] RED: viewer has no objective strip, no OBJECTIVES + EVIDENCE page; comparisons current-run card and snapshot carry no objective.
  COMMIT: `test: viewer and comparisons page show no objective UI` (39691d1); `test: mounted comparisons current-run card has no objective` (57ec502)
- [x] GREEN: drop the strip, page, panel code, model state, workbench field and their CSS.
  COMMIT: `refactor(viewer): remove the objective strip, page and comparisons field` (dc04bae)
- [x] Gates: viewer vitest 644 passed; coverage 95.34 lines / 91.14 branches / 94.35 functions; tsc + eslint clean.
- [x] Browser check on an isolated viewer (127.0.0.1:8817, startViewer with no queue/autorun, copied runs): watch view has no strip and PokéNav has no Objectives page; /comparisons current-run card shows no objective at pane width and 375px. 8790 untouched (the finals runner lives in that process).
- [ ] Review: Claude + Grok.
  Round 1 (packet 2d9eb7ec): Claude CLI LGTM. Grok BLOCKING: worklog browser box unchecked while PB13 claimed PASS; stale workbench test title; lowercase objective guard. Fixed: `test(viewer): tighten objective-absence guards and record the browser check`
- [ ] Operator approval, rebase, local merge. Restart 8790 only when the operator says so.
