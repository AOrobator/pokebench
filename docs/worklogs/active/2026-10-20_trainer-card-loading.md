# Trainer card loading and recovery

Operator request: investigate missing/slow trainer cards, then "fix it and land your changes on main".

## Scope and contract

The header and phone run sheet show loading/retry state while card inputs are unavailable; a transient artwork failure retries on the existing polling cadence; optional game font loading cannot hold back usable cards. Existing card markup, identity, selection and live/replay semantics remain unchanged. Selected/live card reductions take priority over queued historical work in the existing single-worker pool, including jobs already queued by frontier/comparisons. Do not preempt a running reduction or add workers. No harness, experiment, gameplay, recording or timeline changes.

Production boundary: app.ts, card-dom.ts, baseline-pool.ts, server.ts, cli.ts, static/index.html, static/style.css. Tests exercise artwork failure/recovery, delayed optional font, initial data failure/recovery, retained existing cards, and real HTTP-to-pool priority wiring. Terminator: deterministic gates, independent review, local main landing and browser proof. New features or runtime owners split to a follow-up.

## Initial evidence

Read-only production viewer fa5ae160 showed three cards and healthy artwork. Warm /api/cards measured 0.181s. app.loadArt caches a null result indefinitely; card errors are swallowed. Every selection requests the full historical frontier, sharing one worker with card reductions. Prioritization currently distinguishes workbench from baseline jobs only, so history workbench jobs can hold up cards. Earlier slow loading was not reproduced.

## Progress

- Worktree created on codex/trainer-card-loading; no gameplay actions or restarts.
- RED/GREEN, gates, review and browser proof pending.
