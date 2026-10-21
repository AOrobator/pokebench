# Navigation tool-use and wrong-map feedback switches

Operator authorization (2026-10-20): "lets implement these as 2 separate switches and put them in the bundle".

Scope: navigation-tool-use-guard-v1 rejects model-originated direction-only press batches of two or more inputs only with fresh stationary free-field state and navigation enabled. Zero native input on rejection; single presses, mixed batches and UI/unknown states retain behavior. Internal checked navigation bypasses the guard. semantic-current-map-feedback-v1 adds current map/name/position and zero-input confirmation to semantic wrong-map refusals, independently of the guard. Both default OFF, exact OFF invariance; both enabled only in evolving bundle definitions. Frozen fixed-run definitions and active runs are unchanged. No measured launches authorized.

Evidence: runs/reports/navigation-tool-use-2026-10-20/ in canonical checkout, 97a0 turns262–339: 15 delivered reminders, 16 multi-direction free-field batches, wrong-map semantic refusal at333. No performance benefit established.

Milestones
- [x] RED behavioral and production-wiring tests
- [x] GREEN implementation, registries/defaults, independent pending entries, bundle settings
- [x] Explainers and card links; delivery/zero-input receipts
- [ ] Gates and mutation proof
- [ ] Frozen independent multi-model review (two-round cap)
- [ ] Local main landing if required cloud lanes approve; viewer-only refresh and live card proof

Readiness: not queued or designed; shoe checkpoint exists but load qualification is outside this implementation. Do not infer launch readiness from registration. New switches have separate single-change pending experiments.

Open implementation choices resolved within authorized proposal: guard evaluates native controllable/stationary plus free-field state; no policy inferred from story text. Guard feedback uses the existing tool_result (state + explicit requested/zero submitted input details), so no new timeline marks. Wrong-map feedback does not pick a destination.

Review log: not started.

RED: `red-final.log`: 3 intended failures, 75 passing tests. Guard sends input, guard wiring absent, semantic feedback absent before implementation.

COMMIT: `test: capture navigation guard and current-map feedback contracts` (c8147d1d).
GREEN: behavior tests include exact OFF bytes, default normalization, free-field exclusions, single/mixed inputs, checked navigation bypass, abort, unavailable state, semantic v1/v2 current/unknown map facts and zero inputs; production factory and pinned pi loop prove delivery before the next decision. Two independent pending entries, full explicit incumbent flags, only one candidate difference; no queue or approval.
Mutation receipts: guard wiring deletion fails the intended test; first semantic deletion selector matched no tests (UNPROVEN, retained), attempt2 uses the exact ON test; card link deletion fails; restoration receipt retained separately.
Explainers: tracked + mapped cards/routes, pages-check, local 8791 HTTP200; 1280/1440/375 expanded/collapsed screenshots inspected under canonical runs/mockups/navigation-tool-switches/shots. UI card/replay proof pending.
Gates in progress. Agent/viewer coverage passed before the final delivery test (agent 99.14 lines/92.99 branches/97.59 functions; viewer 97.81/91.06/94.18). Initial Python gate failures were environment setup: worktree vendor uninitialized and POKEBENCH_ROM unset. Vendor now initialized at exact pinned bbab97ad; private venv cloned and canonical editable install restored after detecting shared-venv symlink. No Python source changes or gameplay processes restarted. Full ROM-backed test/coverage rerun pending.

Implementation checkpoint f39614f5 (rebased GREEN); RED is now ac96231f on main 97046aa6. Supplemental check excludes explicit script activity even if other free-field signals disagree. Pending definitions pin implementation checkpoint, explicitly require reviewed landing repin before use. 103 focused tests pass. Lint6 passes all TypeScript and Python checks; vendor2 passes. Full test8/coverage2 hit pre-existing wall-clock-sensitive live-human/serial-comparison tests during concurrent CPU-heavy gates; no assertion or timeout relaxed. Serial rerun in progress. No gate is counted green from those failed attempts.

Principles self-review (PB1-PB13, zero FAIL):
| ID | Score | Evidence / applicability |
|---|---|---|
| PB1 | PASS | No grader, native milestone or objective change; model chooses navigation targets. |
| PB2 | PASS | No measured runs; all failed gate/mutation attempts retained and qualified. |
| PB3 | PASS | No speed or promotion claim; unqueued standalone experiments remain hypotheses. |
| PB4 | PASS | Two registered recorded switches, defaults OFF, existing event delivery; vendor pinned and unchanged. |
| PB5 | PASS | Each pending candidate flips only its named switch. User explicitly requests bundled configuration, not causal attribution. |
| PB6 | N/A | No context/compaction/long-run storage behavior changed. Existing bounded tool loop remains owner. |
| PB7 | PASS | Pinned pi integration proves both tool_result records and delivery to subsequent decisions, with no button/native_action event. |
| PB8 | PASS | Refusal is explicit, zero input, no silent rewriting, no automatic destination, existing turn/wall budgets bound retries. |
| PB9 | PASS | User explicitly approved these two behaviors and bundle scope. No measured launch or approval inferred. |
| PB10 | PASS | Coverage floors, tests, vendor and hooks unchanged; failed resource-sensitive gates retained for clean rerun. |
| PB11 | PASS | Production tool factory and real pinned pi loop/recorder integration; existing typed state schema and native controllable field. |
| PB12 | PASS | ROM resolved only through the external ~/.roms path for read-only tests; no ROM copied or committed. |
| PB13 | PASS | RED/GREEN commits, worklog and frozen review packet; gates/landing/live state explicitly pending until proved. |
