# Navigation tool-use and wrong-map feedback switches

Operator authorization (2026-10-20): "lets implement these as 2 separate switches and put them in the bundle".

Scope: navigation-tool-use-guard-v1 rejects model-originated direction-only press batches of two or more inputs only with fresh stationary free-field state and navigation enabled. Zero native input on rejection; single presses, mixed batches and UI/unknown states retain behavior. Internal checked navigation bypasses the guard. semantic-current-map-feedback-v1 adds current map/name/position and zero-input confirmation to semantic wrong-map refusals, independently of the guard. Both default OFF, exact OFF invariance; both enabled only in evolving bundle definitions. Frozen fixed-run definitions and active runs are unchanged. No measured launches authorized.

Evidence: runs/reports/navigation-tool-use-2026-10-20/ in canonical checkout, 97a0 turns262–339: 15 delivered reminders, 16 multi-direction free-field batches, wrong-map semantic refusal at333. No performance benefit established.

Milestones
- [ ] RED behavioral and production-wiring tests
- [ ] GREEN implementation, registries/defaults, independent pending entries, bundle settings
- [ ] Explainers and card links; delivery/zero-input receipts
- [ ] Gates and mutation proof
- [ ] Frozen independent multi-model review (two-round cap)
- [ ] Local main landing if required cloud lanes approve; viewer-only refresh and live card proof

Readiness: not queued or designed; shoe checkpoint exists but load qualification is outside this implementation. Do not infer launch readiness from registration. New switches have separate single-change pending experiments.

Open implementation choices resolved within authorized proposal: guard evaluates native controllable/stationary plus free-field state; no policy inferred from story text. Guard feedback uses the existing tool_result (state + explicit requested/zero submitted input details), so no new timeline marks. Wrong-map feedback does not pick a destination.

Review log: not started.

RED: `red-final.log`: 3 intended failures, 75 passing tests. Guard sends input, guard wiring absent, semantic feedback absent before implementation.
