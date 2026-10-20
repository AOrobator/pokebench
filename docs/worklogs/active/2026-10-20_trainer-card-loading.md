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

### RED and GREEN

- RED: four new behavioral assertions failed on the original implementation: early usable art, missing artwork retry/status, initial card-data failure/status, and queued card promotion. The initial full viewer run also hit an unrelated missing compiled Play module before the viewer had been built.
- GREEN: focused suite 55/55. The production HTTP/offload test starts a full frontier scan, requests a selected card behind it, completes only the active historical job and verifies selected runs next, without spawning another worker. Root-qualified selection changes are covered.
- Adversarial mutations independently removed artwork retry, early art delivery and priority selection; each corresponding regression test failed. Restored focused suite is being rerun. Full gates pending on the final synced candidate.
