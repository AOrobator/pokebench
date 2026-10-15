# Stats page cleanup (2026-10-15)

Operator request: remove the Runs & Comparisons sections below the story frontier that are no longer useful. Keep the frontier graph, filters, experiment queue and execution queue (queue changes belong to other threads).

## M1 · Remove the sections

- [x] Remove reference notes + completion table, diagnostic filters, summary tiles, milestone timing chart, split ribbons and the all-runs outcomes list, with the code, tests and CSS only they used.
  COMMIT: `refactor(viewer): drop unused stats sections below the story frontier` (a3b2573); follow-up `fix(viewer): keep frontier caption, subtitle and drawer focus right after the stats cleanup` (52e030b)
- [x] Frontier caption no longer points at the removed exact-times table; closing the drawer returns focus to the matching frontier point after a refresh; subtitle matches the page.
- [x] Gates: viewer vitest 570 passed, agent 1042 passed; viewer coverage above the 90 floor; tsc + eslint clean.
- [x] Browser: isolated viewer on copied runs; a real click on a frontier point opens run details.
- [x] Grok LGTM (round 2). Claude lane: Cursor Opus and Sonnet out of quota, Claude CLI review profile logged out; subagent fallback
- [ ] Operator approval, local merge, restart 8790 on main
