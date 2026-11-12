# Direct Codex provider

## Problem
The outer Codex capture player required 5–6 chunk reads plus polling/write/respond per game decision, causing 71–78 seconds per action. The operator explicitly requested direct-provider wiring, preserved transcript/reasoning, and a speed check before restarting the 24h Astra run.

## Scope and architecture
One bounded source milestone: opt-in native pi Codex Responses provider in the existing PokeBench loop. Preserve normal tools/prompts and ordinary recorder; durably capture full provider request and response bytes plus opaque reasoning as sidecars tied to game turn. No outer player, polling or reply-file protocol. Credentials stay outside recordings; retain existing transport by default. Follow source readiness, reviewed landing, then authorized activation.

## Invariants
- Existing connections remain unchanged when direct provider is not selected.
- No credentials in transcripts, errors, repository or viewer.
- Record complete request/body streams and thinking; no truncation or generated retrospective reasoning.
- One native provider request per ordinary game decision, apart from provider retries.
- Run limits remain 24h from operator and 20000 turns plus other preset-sourced conditions. No wrapper deadline/cost stop.

## Verification
Pure injected tests for configuration, credential validity/expiry, provider payload options, capture and failure. Existing recorder/replay thinking path. Full required gates/reviews. At most six recorded-boot model-only requests after lane clearance; report latency/capture, not gameplay quality. Restart only after capture and pace checks pass.

## Status
- [x] Source and focused checks (44 focused tests; agent and viewer types; changed-source ESLint)
- [ ] Gates, capture/speed receipts, independent reviews
- [ ] Land locally via board
- [ ] Clean pinned 24h boot launch and live/capture proof

## Session log
2026-11-11: operator authorized implementation and conditional restart. Previous run 4489 ended operator_abort at turn4; complete native archive sealed.
2026-11-11 9:18 PM: relay cleared full gates and six model-only recorded boot requests. Native transport uses SSE with per-chunk durable capture; login is reread, never rewritten. Current credentials have over five days remaining. Full lint running; build/test and speed receipts pending.

2026-11-11: full lint PASS. First full suite caught one registry ordering error (new switch inserted before existing final switch); corrected by appending without changing existing assertions. Independent Claude/GPT round1 both BLOCKING on normal parser cancellation vs raw EOF capture; GPT also caught direct-provider env leaking into fixed trials. Accepted and fixed both plus concrete effort-OFF/unsupported-mode checks and upstream cancellation on write failure. Native factory and trailing-capture mutation tests each went red, then were restored. Full suite retry in progress.

Six real model-only replay requests: 4272, 2738, 3773, 3966, 2957, 4012 ms; median3869.5ms. All returned offered game tools; six exact request/raw-response pairs/hash receipts complete. No readable or opaque reasoning emitted on these trivial inputs despite medium/detailed settings, so availability remains input-dependent. Separate synthetic proof through installed pi parser and production RunRecorder preserved exposed summary, opaque signature and next-request continuation. Source evidence: canonical runs/direct-codex-provider-20261111/. These are transport checks, not model-quality evidence.

Round2: original capture P1 persisted under delayed prefetch. Narrow correction serializes the pending pull before draining after parser cancellation, suppressing enqueue into a cancelled consumer. Exact reviewer delayed-tail reproduction fails on prior2d0cffa39 and passes after correction; no new scope. Rechecking the existing P1 only. Full r2 suite passed (3050 agent, viewer/env counts in gate-test-r2.log), vendor passed; narrow final correction requires rerun.
