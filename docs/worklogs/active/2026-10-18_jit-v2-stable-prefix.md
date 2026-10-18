# Stable-prefix JIT v2 experiment preparation

## Problem Statement
The operator approved the stable-prefix JIT proposal with “ok let's start working on that v2 experiment” on 2026-10-18, then asked why v1's system prompt was not much smaller. Prepare a separate, reviewable v2 treatment and experiment, preserving the active jit-10m cohort. Existing evidence: first18 completed trials have7.1% smaller logical prompt tokens but no latency benefit; median run cache fraction66.9% vs70.6%, v1 prompt hash changes5–16/run. These are associations, not causal proof. V1 system instructions shrink~20% overall; overworld25%, naming65%, clock76% by characters.

## Skills Loaded
feature-worklog, feature-switch, experiment-queue, pokebench-experiment-design, feature-explainer, agent-observability, viewer-e2e, close-the-loop, repository multi-model-review.

## Architecture
Operator approval covers the proposed architecture and implementation work recorded here. No new measured GPU allocation or launch is inferred. Use just-in-time-prompt-v2, default OFF. V2 OFF preserves existing v1/full behavior exactly. Experiment compares full standing instructions (control) with stable-prefix instruction delivery (candidate); v1 OFF in both arms. The full tool catalog and existing tool execution behavior stay identical; no v2 tool filtering or new guard.

V2 uses a fixed small core composed from existing cross-scene prompt sections, plus explicit scoping rules. Reuse existing scene instructions, preserving universal evidence/trust/supervisor rules. At actual request dispatch, project a clearly labelled harness-guidance message after the newest observation/task on first dispatch, scene change or eviction of active guidance. Keep those injected messages at stable anchors in later projections, so unchanged history retains its earlier injected guidance and reusable prefix. Do not mutate canonical messages, reorder tool results or rewrite prior guidance. When the ordinary context window drops an anchor, drop its projection entry; restore needed current-scene guidance at the current tail. Unknown scenes receive existing full-interface fallback guidance at the tail; stable core/catalog remain fixed. V2 supersedes v1 if both selected; actual experiment explicitly disables v1. All model-facing guidance and anchoring/source-state receipts must be recorded, schema-valid and inspectable in existing Activity History/raw inspector; no timeline additions.

A proposal carries forward early milestones/no probes/600000ms caps/MAIN_MENU FAST/two GPUs/24trials12arm/zero replacements/four GPU-hour shape from v1 for review only. This is not a fresh spend authorization. Outcome remains furthest native story checkpoint then exact arrival time. Cache reuse, TTFT, request latency, output, instruction/core/guidance/history sizes are secondary mechanism measurements. No confirmatory benefit claim or automatic promotion. Definition stays unapproved/unstarted.

## Invariants
- INV-1 OFF identity: contexts, tools, messages, guards and historical schema behavior match the pre-v2 path; test factory and request seams.
- INV-2 Stable prefix: core and model-facing tool definition hashes stay constant across verified scene transitions; injected history remains append-only while canonical history is unchanged; test real pinned pi loop payloads.
- INV-3 Correct context: newest authoritative recorded state selects scoped guidance including startup, unknown, naming/battle/menu ownership; no extra emulator reads; exact state seq receipts.
- INV-4 Delivery: no duplicate instruction on unchanged context; window eviction restores guidance at tail; old instructions remain explicitly scoped, canonical messages never mutated; tests for clones/retries/pruning.
- INV-5 Measurement: exact injected text/anchors and component characters recorded, no invented token splits; provider usage/cache/latency retained. Token counts only when actually measured.
- INV-6 Isolation: v1 fixed runtime, recordings, grading, definition and approvals unchanged; no new GPU calls. Any proposed v2 plan is separate and remains unapproved.

## Security Review
Local-only loopback documents, no credentials/ROM copies, no RAM writes or vendor edits. Guidance quotes existing harness interface instructions and is labelled as harness guidance rather than game dialogue or game-owned truth. No shell-string subprocesses, no any in new TypeScript.

## Milestones
**M1 — Contract and RED**
- [x] Record operator-approved proposal, protocol assumptions and launch boundary before implementation.
- [x] Add request-prefix, scope, trim/idempotence, OFF-identity and production-factory tests; commit RED e307afcc, then restore factory routing mutation and test GREEN.
**M2 — Implementation and metadata**
- [ ] Stable-prefix projection, compact-core/scene split, exact additive receipts, default-OFF registry/presets.
- [ ] Separate pending experiment and proposed fixed plan, tracked explainer/overview and native card mapping.
- [ ] Guard deletion/restoration receipts; fake-data plan rehearsal; no inference.
**M3 — Qualification and review**
- [ ] All five application gates, coverage floors>=90, no skips/vendor changes.
- [ ] Principles PB1–PB13 self-review and frozen cloud packet; Claude/Grok/GPT literal LGTM required for self-landing. Claude Cursor usage is currently unavailable; inspect approved alternate harness before declaring blocked. A fallback is not cloud merge approval.
- [ ] Independent four-persona design review before any launch approval, with budget/readiness/power limitations stated.
- [ ] Desktop1280/1440 and phone375 native UI/explainer proof; actual schema-valid synthetic replay, no gameplay actions.
**M4 — Landing and handoff**
- [ ] Land only if authorized cloud review gate passes; main FF only, post-landing test and viewer-main live proof.
- [ ] Present concrete proposed experiment and any remaining launch/budget approval boundary. Do not launch a second cohort from the old four GPU-hour authorization.

## Closing the Loop
Use actual serialized model-bound payloads on pinned pi-loop stubs, RED/GREEN and mutations; preserve exact injected receipts and compare prefix bytes before scene transitions. Build served assets and click native Harness Config explainer on an isolated non-queue preview. Verify no timeline changes. Report prepared/reviewed/landed/launched as separate states.

## Session Log
- Main33f9ff8a clean at start. Dedicated attached managed worktree created at codex-app path jit-v2-stable-prefix; preserved unfinished-edits worktree is unrelated and unchanged. Existing jit-10m has20/24 valid,0invalid and continues on pinned2b2dec5d.
- Read source: v1 rewrites leading system prompt and tool catalog at every scene transition. Existing request receipts retain exact system/tool hashes, but no appended-guide projection. Pinned pi-ai0.73.1 places system before messages; pinned pi-loop requestContext is called for each stream dispatch, including follow-ups.

## Surprises
- Cache-friendly delivery cannot merely move guidance to the bottom of the system message; it must follow retained conversation history. Base context-window collapsing itself changes earlier payloads; isolate v2's preservation claim to unchanged retained history and measure actual reuse rather than promise it.

## Multi-Model Review Log
- Pending implementation. No approval inferred from prior v1 reviews.

## Boy Scout Log
- No unrelated cleanup.

## Archive Milestone (user-gated)
- [ ] the operator authorizes archive; not requested.

- M1 RED: added six projection contract tests covering OFF identity, six-scene stable core/catalog, immutable A→B→A guidance, idempotence, collapse/eviction/transient suffixes, result batches, exact character receipts and unknown fallback. Focused run fails as expected because jit-v2-context does not exist; transcript runs/reviews/jit-v2-preparation/red-unit.log. Factory test follows once the optional flag parses.

- COMMIT e307afcc: RED contract tests. GREEN now: nine projection tests, actual startup/factory receipts with v2 superseding v1 without filtering tools or guarding execution, pinned provider serialization including two image-bearing results, immutable prefix through intervening assistant replies, and 2000-step synthetic eviction history. The latter assistant-tail case was independently RED before its anchor fix (red-intervening-assistant.log); factory request routing deletion also RED (mutation-factory-routing-01.log), restored and passing.
- Independent preliminary projection audit found mixed character units; fixed raw core_text/guidance_text and explicitly serialized canonical_history_json, with docs/tests. No other concrete correctness finding; image-bearing batch test added as requested production seam proof.
- Registry/defaults/presets v2 OFF, additive request receipt schema regenerated, native Harness Config explainer mapping/routes, separate pending registration + proposed24trialfixedplan/hashedbaseline. Existing v1 fixed files untouched. Legacy positional registry assertions shifted once and historical definitions explicitly keep their pre-v2 keyset; no old experiments rewritten.
- Gate receipts before main sync: test2467agent+1175viewer, Python2478+229ROM-skips before .env linked. Coverage re-runs with canonical .env and isolated Python env: agent2468, viewer1175, Python2707 allpassed; aggregate TS agent lines99.23/branches94.21/functions98.33, viewer97.64/91.46/93.83; Python97.66/93.82/100. Initial overloaded coverage attempts timed out on unchanged serpentine planner and abandoned-stream tests; retained logs, no timeout/coverage/exclusion weakening. Vendor check passed. Lint/build rechecking final source before commit.
- Environment isolation: an initial shared .venv symlink caused uv to relocate only the editable package pointer (Python source byte-identical). Restored canonical editable installation immediately and replaced symlink with a dedicated venv; only pinned native mgba binding is linked read-only. No measured runtime/source/config/log edits.
- Main moved independently to b9e501df while preparation ran (viewer phone-layout flag and story-speaker aliases). Sync before frozen review; neither is v2 scope. Four-persona review now reads final24trial JIT evidence plus exact v2 design snapshot, independently. No new GPU allocation, launch, promotion or landing inferred.
- Fresh v1 status finished24/24valid at19:38:33ET. Final analysis is separate ignored evidence under main runs/reports/run-analysis/2026-10-18_jit-final; no overwriting original interim. The completed cohort remains frozen at2b2dec5d.
- Claude alternate CLI auth checked: loggedInfalse under .claude-review. Cursor model inventory refreshed; cloud review not yet attempted on final packet. This is not LGTM.

- Final before-sync lint and build PASS. Coverage complete without skips: TS2468agent+1175viewer, Python2707; all existing floor checks PASS. V2 docs now explicitly disclose permanent task-anchored startup fallback, raw text vs serialized-history units, and final-cohort cap/power sensitivity (not power for frontier). Four persona snapshot is frozen before feedback; no verdict yet.
