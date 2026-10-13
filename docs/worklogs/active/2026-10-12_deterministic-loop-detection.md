# Deterministic loop detection

## Problem Statement
Operator approved implementation of planning stalls, observation stalls, ineffective actions, short cycles and repeated rejections, with warning, bounded recovery, explicit stuck termination and review/landing before another run. Recorded Swarm trial made95planning calls after its last press. Existing guards do not cover this behavior.

## Skills Loaded
PokeBench feature-worklog; local inference stack multi-model-review; PB1–PB13 current project principles. User approval is the start gate; no additional approval needed for routine implementation choices.

## Architecture
One typed bounded monitor consumes completed calls and coherent returned state in the existing sequential pinned pi0.73.1 loop. Stable semantic state excludes elapsed playtime, timestamps, event IDs and objective wording. Warning reaches subsequent model context and event log; persistent episode terminates as existing stuck reason. No model supervisor, scripted gameplay, route/name skill, RAM writes or new dependencies. Shared episode prevents overlapping detectors charging duplicate strikes. Unknown/unobservable screen state does not prove equivalence. Versioned harness feature declares policy.

## Invariants
- INV-1: planning metadata alone never advances game; six calls warn and persistent metadata-only recovery stops. Test real pi consumer including batched calls.
- INV-2: reliable state changes permit dialogue advancing, naming letters, map exploration and battle changes; missing state never proves no-change. Test positive/negative semantic fixtures.
- INV-3: observation, ineffective action, length2–4cycles and repeated model rejection detectors warn from bounded histories and persist across cosmetic changes. Tiny injected policy bounds pin defaults separately.
- INV-4: warning is recorded and reaches model before terminal escalation; stuck terminal schema/viewer remain replayable. Test pinned loop/context/batching/abort/log.
- INV-5: no canonical source/build or benchmark endpoint changes during frozen cohort. Isolated worktree only; root coordinates landing and any native smoke.
- INV-6: ROM never copied/staged; pristine pinned vendor; typed JSON/no any; 90coverage floors unchanged.

## Security Review
Monitor performs no I/O/game actions, accepts only validated events/state, bounds retained history, never stores screenshots or credentials. Service/network failures remain infrastructure/model_error paths rather than gameplay rejections. No public network or permissions changes.

## Milestones
**M1 — Deterministic monitor and production wiring**
- [ ] Tests and RED commit
- [ ] Monitor, semantic equivalence, warning/recovery, event/viewer/pinned loop wiring
- [ ] Gates: tests/lint/build/coverage/vendor
- [ ] GREEN commit
- [ ] Delete/restore guard mutations with specific assertion failures
- [ ] Recorded-run replay/native isolated smoke after cohort ends
- [ ] Principles self-review and selected multi-model roster LGTM
**M2 — Landing and closeout**
- [ ] Root coordinated canonical integration, sequencer unchanged, reviewed artifact identity
- [ ] Report exact gates, review diversity and limitations

## Closing the Loop
Continue until reviewed deliverable or explicit blocker. Root owns canonical integration; do not mutate main. Original cohort source freeze40262a0 preserved. Worklog updated per commit; archiving user-gated.

## Session Log
2026-10-12: read CLAUDE.md, current resumed experiment worklog, PB principles and skills; created codex/loop-detection in managed isolated checkout from40262a0. Source discovery: returned state includes naming cursor/text/page, field dialogue, story flags, location/position/party; no reliable battle command/opponent state or clock/menu cursor readouts. Do not claim those unobservable domains are semantically unchanged.

## Surprises
State schema lacks reliable generic menu/clock/battle phase readouts. Conservative unknown handling is required for ineffective/observation/cycle detectors outside naming and fully legible field scenes; planning/rejection detection remains available everywhere.

## Multi-Model Review Log
Pending. Endpoint reviewers wait for root confirmation original benchmark cohort terminal; offline distinct-model reviewers possible. Exhausted options and any fallback must be recorded honestly.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] ASK USER: archive after closeout.
2026-10-12 RED: added11focused detector contracts; run fails because loop-detection.js production module is absent. No implementation edits yet. Tiny thresholds exercise warning/exposure/recovery; production thresholds pinned separately. Conservative semantics avoid unknown/battle/locked menu and multi-button net-effect assumptions.
2026-10-12 implementation checkpoint: completed all five monitor paths, persistent shared warning/recovery episode, finite recovery even for unknown observations, actual coherent prepress snapshot IDs and batched-call cancellation, additive loop_guard schema/tail/viewer, default enabled POKEBENCH_LOOP_GUARD=0 ablation and versioned metadata. Existing model-error retry and first terminal reason preserved; infrastructure errors do not consume gameplay recovery.18+semantic focused tests and6pinned pi consumer scenarios cover all detectors, warning context, completed state order and stopped trailing presses.14detector/semantic mutations +5wiring mutations each produced assertion failures then restored (ignored review receipts). Counterfactual replay catches original6746 planning warning1042/stop1264; other Swarm planning episodes recover on realpress. Raw oldlogs lack new prepress snapshot ID, so no claim those replays validate action/cycle detection. No originals rewritten.
2026-10-12 GREEN gates:407agent +149viewer +378unchangedPython =934tests; TSbuild/lint, Pythonruff/format/mypy, vendor pin/clean and all independent90coverage floors pass. Agent statements98.33/branches93.00/functions98.39/lines98.91; viewer97.48/91.48/98.43/98.37; Pythonlines99.34/branches96.77/functions100.00. Monitor itself95.80/93.06/100.00/97.54. New publisher tests retain oldschemas and declare offswitch. Five realconsumer scenarios plus unknownrecovery variant use tiny policybounds; no benchmarkendpoint requests yet. Review and native smoke still pending; gates are not landing.
