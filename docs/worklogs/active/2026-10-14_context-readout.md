# Context readout accuracy (2026-10-14)

Viewer-only fix. No feature switch: the model sees nothing different.

## Finding

The CONTEXT bar (live side panel and Budgets) showed `turn_start.context.est_tokens`,
computed in `packages/agent/src/recorder.ts` as message text/thinking chars ÷ 4.
It omits the system prompt, tool schemas, tool-call arguments and images.

Across 673 answered turns in four think-fast runs from 2026-10-14
(`runs/context-audit/compare.py`, `fit.py`), the server-reported prompt
(`usage.input + usage.cache_read`) was a median 1.8× the estimate; the estimate
was off by a median 44%. A fit of `1.48 × est + ~1.8k fixed` matches the real
prompt within 1% median.

The readout going down is real: `slideWindow` (harness.ts, WINDOW) keeps the
last 10–20 assistant turns and the last 3–6 full tool results, so the prompt
sawtooths. Estimate and real prompt dropped on the same turns (36/36, 147/148).

## M1: show the measured prompt size

- [x] RED: model/controls/panels tests for measured prompt and `~` estimate
  COMMIT: `test(viewer): context readout shows the server-measured prompt size, estimate labelled` (d8682ab)
- [x] GREEN: `RunView.promptTokens` from the latest assistant usage with a nonzero
  prompt; `contextReadout()` prefers it, falling back to the labelled estimate
  Tests: viewer 566 passed. Coverage: viewer 94.84 lines / 90.19 branches / 93.61 functions. Lint clean.
- [ ] Real viewer check against a recorded run
- [ ] Reviews: Claude CLI, Grok (Codex out of credits; no local models)
- [ ] Operator approval, local merge to main
