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
- COMMIT: `feat(agent): random-starter-v1 ...` (c240a6bcf120dd1e15a322629ee620679acdf891); pending entry pinned to it in the next commit

### Review round 1 (packet 24a360c33..25474ecf3, sha256 32797df9…): Claude lane auth expired (no verdict), GPT BLOCKING, fallback BLOCKING
- [x] fix: dialogue auto-advance dropped the pick receipt and could send the rest of the model's batch after the pick; the press result now carries starterPick and the wrapper returns it as is (RED: 2 batch cases fail without the wrapper line)
- [x] fix: checked presses (objective-tracking-v1 path) bypassed the pick; interception no longer requires an unchecked press (the check still runs first)
- [x] fix: RNG test was stochastic; pickRandomStarter takes an injectable draw, tested with 0 and 1
- Review round 2 (packet 24a360c33..9c634fdad, sha256 f2fe6c37…): GPT BLOCKING only on the pending entry's stale source pin; repinned to 9c634fdad
