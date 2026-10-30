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

### GREEN source qualification
- RED commit: `6af5c2e2c`.
- Replay now uses recorded per-assistant source identity and reasoning signature. New recorder events capture that metadata from the actual native reply; checked-in JSON schema regenerated from TypeBox without a shared build.
- Legacy records fail closed without an explicit source assertion. CLI requires source provider, API and thinking-field assertions together; it never derives source identity from the target endpoint. Source model remains recorded model ID; intentional cross-model/provider/API conversion is preserved.
- Native serializer regression suite: 9/9 pass, no network calls. Includes llama.cpp/vLLM/gateway, explicit cross-model/provider/API cases, missing legacy provenance, signature precedence/absence, recorder capture and file-backed CLI source plumbing.
- Existing focused group: 169/169 pass across eight files; final CLI refinements separately pass 24/24 (new regressions + existing CLI tests). Changed-file ESLint and agent package type checking passed before final CLI refinement; repeated final checks pending receipt.
- Legacy fixture ports now explicitly assert their fixture's source gateway identity; no assertions, snapshots, thresholds or exclusions were weakened.
- Initial package type check lacked viewer dependency links in the new worktree; resolved local ignored dependency links, then passed. No shared dependency tree was modified.
- Full CPU gate window requested after the Rusturf census IO window releases; not started without clearance. No GPU calls, live runs, service changes, landing or activation.
- COMMIT: `fix: preserve source identity in decision probe replay` (this GREEN commit; SHA recorded in subsequent evidence).

### Review round 1 and integration correction
- GREEN commit `1cbc8444da15d63ccab6124de93693674c042219`; frozen packet `/tmp/probe-replay-review`, exact base `2f3784a38622508d08afb8a66118723bc039477d`, diff SHA-256 `16c591191859bea27dd0907e20603b49c81118e06e778018d2ce589f00396b2a`.
- Claude native CLI review completed exit0, empty stderr, `VERDICT: BLOCKING`: six additional legacy fixture callers lacked explicit source identity. **Fix** within frozen historical-fixture scope; no production domains added. Other source identity, pi serializer, schema and recorder checks found no defect.
- Full CPU START clearance forwarded by root from coordinator 2026-10-30T01:34:34.430229Z. First `just test`: owned-tree build passed, agent coverage reproduced 16 failures / 5,056 passes in those six fixture files. Preserved `/tmp/probe-replay-full-test.log`. CPU RELEASE delivered immediately; lint not started. Root notified; census final-flag scan has the next CPU/IO slot.
- Added explicit fixture-source gateway API/provider declarations in the six test files; changed no expected outputs/assertions. Focused regression run 184/184 pass. Changed-file ESLint and whitespace check pass.
- Both discovered Cursor Grok and GPT review lanes unavailable: exit1, empty stdout, `ActionRequiredError` account usage exhaustion on stderr. Records preserved. Fresh app GPT reviewer attempts hit shared agent-slot cap; waiting for census/analysis agents to finish, without interruption. Reduced-review diversity will be disclosed if standing waiver used; no self-issued waiver.
- Claude hardening suggestions triaged **Follow-up**: machine-readable source assertion provenance in probe report; separate legacy qualification scripts now intentionally fail closed; no recipe/script migration in this correction. First reasoning field matches pinned pi serializer's own first non-empty-block behavior. Old served viewer needs coordinated refresh before any future activation/new recording, not part of branch source qualification.
- COMMIT: `test: declare legacy replay source identities` (this correction commit; SHA recorded in subsequent evidence).
