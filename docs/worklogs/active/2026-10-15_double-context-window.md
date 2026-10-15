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
- [x] Explainer `docs/explainers/double-context-window-v1.html`, `FEATURE_EXPLAINERS` mapping, `experiments/double-context-window.json` (pending), readiness row (READY). Other incumbents list the switch OFF. All 12 entries parse.
- [x] Gates: test, coverage ≥90, lint
- [x] Review: principles self-review (0 FAIL), Claude CLI LGTM, Grok LGTM, subagent fallback LGTM ×2
- [ ] Local merge into main (approved by the operator 2026-10-15 01:22 UTC)
- Explainer: moved the OFF label off the line, corrected the wiring box source (checked in a browser).
- Corrected activation note: full results differ from the 7th tool result, turns from turn 21.
- Review r1 (runs/window-double-review/r1 in the main checkout): Claude CLI LGTM, Cursor Grok LGTM, Cursor GPT lane unavailable (usage limit until 2026-10-17), Codex also unavailable (gpt-6.1-sol unsupported on the ChatGPT account; gpt-5.6-sol usage limit until 2026-10-20), so the standing subagent fallback replaced the GPT lane: fresh read-only Sonnet and Fable reviewers on frozen packet 8ce2334d (head 8f2aa9d), both LGTM with LOW/NIT findings only (repin source.commit after merge; untested live.ts line, deferred above). Reduced vendor diversity: no GPT-family reviewer this round. Local think_fast/think_swarm lanes skipped: the 2×2 chain is using think-fast.
  - Fixed: `FeatureSetSchema` Exclude cast now names the switch; switch copy says presets must keep it OFF with state-only decisions.
  - Deferred: `live.ts` passing `context.window` to `piLoop` has no test. It is the entrypoint, excluded like the other `contextTools` outputs it sits beside; the `contextTools` and `piLoop` halves are each deletion-tested.
  - After merge: repin `source.commit` to the merge SHA.
