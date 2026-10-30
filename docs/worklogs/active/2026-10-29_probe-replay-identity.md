# Probe replay source identity repair

User authorized a subagent to tackle the replay defect; root designs the next experiment. This is one bounded correctness milestone, not a prompt intervention or gameplay change. Own branch `codex/probe-replay-identity`; no GPU calls, source study rewrites, active-run changes, shared builds/restarts or activation.

## Contract

Historical assistant identity must reflect the source message, not the sampling destination. Preserve API/provider/model and thinking signature for newly recorded replies. Legacy events lack these fields: require an explicit source identity assertion at replay entry, fail closed when unavailable, and never infer provider from a model name or destination endpoint. Keep original recorded model ID so intentional cross-model replay retains pi's deliberate conversion. No claim that old provider-wire identity can be proven from incomplete metadata.

## Milestone

- [ ] RED: real pi serialization regression tests for local/gateway source, intentional cross-model conversion, missing legacy identity and recorder provenance.
- [ ] GREEN: recording/replay/CLI identity plumbing; focused native-caller/serializer and affected package checks.
- [ ] Reviewable commit and independent review; separate remaining full gates and landing.

Feature switch assessment: this repairs recording and experimental replay correctness, with no live gameplay prompt/tool/action/default changes. A gameplay A/B switch would knowingly retain invalid measurement behavior. Historical studies remain frozen; newly generated contexts use explicit qualification.

## Evidence

- Frozen six-strategy screen complete: 1,152 trials, 201.43247 GPU-minutes. Do not edit its artifacts.
- Source `conversation()` hardcodes `GATEWAY_PROVIDER`; pi compares API/provider/model before retaining native thinking.
- Source run_start and assistant records currently omit provider/API and reasoning signatures. Destination relabeling alone is insufficient.
- Baseline source pin: `2f3784a38622508d08afb8a66118723bc039477d`.
- Coordination ownership letter delivered to Claude; no compute requested.

## Gates

Pending focused RED/GREEN tests, affected package type/lint, required reviews and coordinated full gates. No merge or activation authorized by this record alone.

### RED
- New actual pi `completeSimple` serialization tests stop at onPayload before network; global fetch forbidden.
- Focused run: 7 tests, 6 expected failures / 1 gateway control pass. Failures reproduce local/vLLM reasoning flattening, incorrect cross-provider source relabeling, missing legacy fail-closed handling, absent recorded source identity, and recorder provenance omission. Receipt `/tmp/probe-replay-red.log`.
- Initial fixture timestamp and null-content assertion corrected before the meaningful RED result; no production changes yet.
- COMMIT: `test: expose probe replay source identity loss` (this RED commit; SHA recorded in subsequent evidence).
