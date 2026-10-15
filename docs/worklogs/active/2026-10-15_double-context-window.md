# Doubled context window

Requested by the operator in the "Keep 2×2 or test context?" thread (2026-10-15): build the
sliding-window doubling behind a switch and land it. Branch `claude/window-double`, worktree
`/private/tmp/pokebench-window-double`. The running 2×2 chain uses a frozen build and is not
touched.

## Change

`double-context-window-v1` (guidance, default OFF). The play loop's sliding window keeps up to
40 assistant turns (boundary moves in chunks of 20) and 12 full tool results (chunks of 6),
instead of 20/10 and 6/3. OFF is the incumbent window, byte-identical. State-only decisions
send no history, so `state-only-decisions-v1` requires this switch OFF.

## Hypothesis (the operator)

A longer view of its own recent play reduces looping. Risk: about twice the prompt size, so
slower turns and fewer turns per 30-minute run.

## Milestone

- [x] RED: registry, preset default, window selection, piLoop honors the window, wiring (4 failing in harness/play-wiring tests)
- [x] GREEN: switch through `contextTools` → `piLoop`. Wiring-deletion check: forcing OFF in `contextTools` and dropping `options.window` in `piLoop` each turned one test red, then restored. Agent 1032 tests, viewer 563 tests. Coverage agent 97.43/93.88/98 (stmts/branches/funcs), viewer 94.83/90.17/93.6. Lint clean.
- [ ] Explainer, feature-card link, pending experiment entry, readiness note
- [ ] Gates: test, coverage ≥90, lint
- [ ] Review: principles self-review, Claude CLI, independent lane
- [ ] Local merge into main (approved by the operator 2026-10-15 01:22 UTC)
