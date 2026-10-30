# Probe replay source identity repair

User authorized a subagent to tackle the replay defect; root designs the next experiment. This is one bounded correctness milestone, not a prompt intervention or gameplay change. Own branch `codex/probe-replay-identity`; no GPU calls, source study rewrites, active-run changes, shared builds/restarts or activation.

## Contract

Historical assistant identity must reflect the source message, not the sampling destination. Preserve API/provider/model and thinking signature for newly recorded replies. Legacy events lack these fields: require an explicit source identity assertion at replay entry, fail closed when unavailable, and never infer provider from a model name or destination endpoint. Keep original recorded model ID so intentional cross-model replay retains pi's deliberate conversion. No claim that old provider-wire identity can be proven from incomplete metadata.

## Milestone

- [x] RED: real pi serialization regression tests for local/gateway source, intentional cross-model conversion, missing legacy identity and recorder provenance.
- [x] GREEN: recording/replay/CLI identity plumbing; focused native-caller/serializer and affected package checks.
- [x] Reviewable commit and independent review; separate remaining full gates and landing.

Feature switch assessment: this repairs recording and experimental replay correctness, with no live gameplay prompt/tool/action/default changes. A gameplay A/B switch would knowingly retain invalid measurement behavior. Historical studies remain frozen; newly generated contexts use explicit qualification.

## Evidence

- Frozen six-strategy screen complete: 1,152 trials, 201.43247 GPU-minutes. Do not edit its artifacts.
- Source `conversation()` hardcodes `GATEWAY_PROVIDER`; pi compares API/provider/model before retaining native thinking.
- Source run_start and assistant records currently omit provider/API and reasoning signatures. Destination relabeling alone is insufficient.
- Baseline source pin: `2f3784a38622508d08afb8a66118723bc039477d`.
- Coordination ownership letter delivered to Claude; no compute requested.

## Gates

Source qualified: RED/GREEN, focused/native checks, full build/test/lint/vendor gates and independent Claude/GPT/Astra reviews pass. Integrated current ROM identity main with byte-identical replay feature delta and 30 merged focused checks passing. Source landed at `f28959c36c39eb8e603fd98a9d2af75d39d59bc0`; combined post-main test passed. No GPU use, gameplay activation or viewer restart. Original provider-wire identity for legacy events remains unproven; explicit source assertions are required.

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

### Complete gate and additional parser counterexample
- Source `638c0d163571126fa81f73bdc210035b3764f79a`: complete `just test` PASS (build, 5,072 agent, 2,342 viewer, 4,934 Python, 116 gateway, 3 protected-card checks), complete `just lint` PASS, `just verify-vendor` PASS. CPU START 2026-10-30T01:51:25.661862Z; RELEASE delivered on completion.
- Prior Python failure was the owned venv missing the canonical installed mGBA binding. Added ignored read-only dependency link; targeted failed fixture passed, then fresh complete gate passed. No Python source or assertions changed.
- Read-only real-data qualification: actual 057c first-turn prefix (62,216 bytes) through compiled `recordedConversation` and real pi serializer; same-source local reasoning remains `reasoning_content`, deliberate gateway target converts it to ordinary text, zero network calls. Receipt `runs/probe-replay-identity/real-prefix-serialization-proof.json`; explicit legacy identity assertion is not original-wire proof.
- Claude round 2 LGTM; clean OpenAI-environment GPT Sol xhigh LGTM on the cumulative packet. Earlier CLI review attempts inherited local API environment variables and default medium reasoning: discarded as unqualified provenance, not counted. Clean CLI invocations unset OPENAI_API_BASE/OPENAI_API_KEY/OPENAI_BASE_URL and use native OpenAI provider. Cursor lanes still unavailable. Astra clean review hit 300-second timeout without formal verdict; not approval.
- Astra's incomplete review exposed a concrete parser bug: a missing value for any new history flag consumes following `--context-only`, leaving contextOnly=false. Read-only compiled-source reproduction confirmed 3/3 malformed forms accepted, with zero model calls. **Fix** within existing CLI/fail-closed boundary. No new domain or unrelated feature added.
- Added three regression cases; RED 3 failures / 9 passes. Receipt `/tmp/probe-replay-flag-red.log`.
- COMMIT: `test: reject missing replay assertion flag values` (this RED commit; SHA recorded with GREEN).

### Parser GREEN
- RED commit `41529bce6`.
- The value reader now rejects a following option token as a missing value; it never consumes `--context-only` as source API/provider/thinking-field data. This is one Boolean guard in the existing parser, with no new production domain.
- GREEN 27/27 (12 native provenance/parser regressions plus 15 existing CLI tests). Changed-file ESLint, affected agent type check and whitespace pass. No model calls.
- Source identity, recorder, schema and serializer implementation are byte-identical to the already full-gated `638c0d163` version; those native proof bodies are retained. Request fresh complete gate for final parser source and cumulative delta review; no premature landing.
- COMMIT: `fix: keep context-only flag out of missing assertion values` (this GREEN commit; exact SHA recorded with final qualification).

## Final qualification and integration
- Final source GREEN `3af6b911caa1a9e0113e4cf980670a75e9b69299`; final frozen cumulative diff SHA-256 `076a13c987ba61c5f666393d0249baca9c4baa78f11570d60ce61fec85e581fa`. Final independent Claude, clean-routing GPT Sol xhigh and separate Astra high reviews all LGTM. Unavailable/timeout/unqualified attempts remain excluded. Grok unavailable; standing operator waiver and reduced vendor roster forwarded by parent/coordinator, not self-issued.
- Fresh final `just test` PASS: 5,075 agent, 2,342 viewer, 4,934 Python, 116 gateway, 3 protected-card checks. Coverage agent lines/branches/functions 99.2/92.46/97.57; viewer 98.32/90.83/94.97; all required global floors pass. Complete `just lint` and `just verify-vendor` PASS. Successful build prerequisite counts as build gate. CPU START 2026-10-30T02:03:06.412189Z, RELEASE delivered after gates.
- Final review routing clears local API/host credential overrides, pins native OpenAI reviewer models, and verifies immutable diff/head/status before and after. Claude stderr empty. Full packets/failed receipts remain retained; review synthesis records all triage.
- Main advanced to ROM identity `46338c77667b027517c7f24259362dc35777af5b`. Merge into owned branch after gates, without holding main. Shared registry/play-config impacts inspected: added optional default-OFF ROM feature appends a gated system sentence/current future recipe selection; no replay source identity, recorder/event schema, serializer, dependency or CLI changes. Historical replay derives recorded flags and never loads current recipe; absent historical ROM flag remains OFF. New ON behavior belongs to upstream tests. No upstream behavior is reverted.
- Feature-only binary diff (excluding this evidence worklog) remains byte-identical after integration: SHA-256 `65b8f1502c1067b0575a4f7cb9f1eee3411852e27b65df5738c140c21ebbf1c0`. Retain frozen reviews, native source proofs and full-gate receipts; affected merged-source replay/ROM OFF/ON tests pass. One combined post-main just test remains required after coordinated fast-forward landing.
- Archived Qwen template offline check: all208screenfittedwires set preserve_thinking=true. Corrected reasoning_content should remain inside <think>; with preserve_thinking=false it is still retained after last real user. This is template/kwargs inference, not actual live rendered-token proof. No endpoint requests.
- No gameplay/model inference, active process changes, historical metadata edits or viewer refresh. Coordinator explicitly states this probe-only repair needs no viewer refresh; ROM owner owns its one refresh. Preserve GLM44575, background18986 and paused hyperqwen37156.
- COMMIT: `merge: integrate ROM identity with probe replay repair` (this integration/evidence commit; exact SHA recorded after landing).

### Waiting for landing
- Qualified integration commit `542a40303185f5b213aa0c76b3276980646eccd4`. Joined board with actual helper session `00000000-0000-4000-8000-b0f954d0ac4d`; queued number 2 behind ROM identity owner `codex/visibility-v1-retirement`. All owned CPU/GPU resources released; no waiting endpoint claimant.
- Durable packet copied to canonical `runs/reviews/2026-10-29-probe-replay-identity/`; source is qualified but not landed or live. Await board notification, recheck main/feature identity, fast-forward only while first, run one combined post-main test under CPU clearance, then release board. Probe-only repair requires no viewer refresh per coordinator.
- COMMIT: `docs: record qualified replay repair and landing wait` (this evidence-only commit).

### Landing turn
- Coordinator forwarded 2026-10-30T02:16:03.935118Z: actual board turn is now this branch; verified board entry is number 1 with exact helper session. Main `157b46e11c8fd4e09048d12a2dad76c5134ef9bb` adds only ROM owner's evidence worklog over integrated `46338c776`; synced without new source/contract changes and retained frozen source reviews/gates.
- Post-main just test CPU explicitly cleared; preserve GLM/background/paused HyperQwen processes. Coordinator now states 8790 is down pending a separate socket-crash repair. Do not refresh/restart it from this branch. Source landing is distinct from service restoration.
- COMMIT: `merge: sync ROM landing evidence before replay repair` (this integration evidence commit).

## Landing and post-main complete
- Actual board number 1 verified; canonical main clean before fast-forward. Landed reviewed/qualified integration at `f28959c36c39eb8e603fd98a9d2af75d39d59bc0`. Replay feature-only binary diff remained exact SHA-256 `65b8f1502c1067b0575a4f7cb9f1eee3411852e27b65df5738c140c21ebbf1c0` against ROM evidence main `157b46e11`.
- One combined post-main `just test` on canonical main PASS: 5,077 agent, 2,345 viewer, 4,934 Python, 116 gateway and 3 protected-card checks, including build and ≥90% coverage gates. Receipt `/tmp/probe-replay-post-main-test.log`; CPU RELEASE delivered. Prelanding final lint/vendor checks retained; source bodies unchanged.
- Protected PIDs 44575 (llama-server start18:10:11), 18986 (node start10:01:26), 37156 (node startOct27 15:23:07) remain present with original starts after gate. No GPU/model inference calls, active run changes, service restart or historical study rewrite.
- Additional actual CLI rehearsal: supported synthetic legacy fixture completes `--context-only` with all three source assertions, zero fetch attempts. Actual 057c prefix hits existing `gym-heal-warning-v1 needs a recorder for gym_heal_warning events` before and after this repair (untouched frozen runtime reproduced it identically). This known replay-feature gap remains a separate follow-up, not hidden or expanded into this identity patch. Actual real-prefix `recordedConversation`→pi source serialization proof passes independently. Do not claim every historical feature/CLI path is supported.
- Archived template/kwargs inference remains separate from live rendered-token proof. No inference experiment or gameplay benefit claim follows from this source repair.
- Final evidence-only commit changes this worklog, then fast-forwards main under the held board turn and releases it. Coordinator owns viewer/socket status; no viewer refresh is required or performed by this probe-only patch. Keep worklog active; no archival authorization.
- COMMIT: `docs: close replay identity repair with post-main proof` (this evidence-only commit).
