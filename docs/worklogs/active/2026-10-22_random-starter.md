# Random starter pick (random-starter-v1) and one 2-hour data run

Requested by the operator 2026-10-22 6:08 PM New York: a switch, off in control and in the bundle, that at the starter
bag picks Treecko or Mudkip 50/50, takes it and does nothing else; then one 2-hour run with it on, kept apart from
the Torchic data. The operator's message is the launch approval for that one run.

## M1: switch, wiring, explainer, pending entry, fixed definition

- [x] `packages/agent/src/random-starter.ts`: pick, bag predicate, per-state step (pret starter_choose.c order and inputs)
- [x] `pressTool` intercepts a model press at the open bag (before any input), presses one button at a time, returns the screen with the pick line
- [x] Registry, presets, next-run default, legacy fixtures, explainer map; registry counts bumped in older tests
- [x] Explainer `docs/explainers/random-starter-v1.html` (themed, pages-check clean) and README line
- [x] Pending entry `experiments/random-starter-v1.json` (never queued) and readiness row
- [x] `experiments/fixed/random-starter-2h.json`: bundle arm of bundle-v-control-2h plus this switch, lane B (GPU0, :[local inference port], Codex keeps GPU1 for Double Kick), one trial, 2 h from MAIN_MENU; plan matches generatePlan, no definition or control-base problems
- [x] Wiring deleted once: 4 ON tests red; restored: green

Gates and review recorded below.
