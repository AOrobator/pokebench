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
