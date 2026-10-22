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

## Review round 1 and bounded fix batch

Frozen base 675cc4b8, head 1eb64852, exact binary diff SHA256 cc0e8d64b0c6b092d01cdb7bc707f5e8d2702436f00263c52e7ee9912847d709. Clean identity independently verified by fresh no-history GPT-5.6-Sol and GPT-6-Astra reviewers. Both returned VERDICT: BLOCKING on two evidence gaps: App early-art callback wiring and non-selected live priority operand. Astra also proved the root-identity assertion did not discriminate the wrong-root mutant. Cursor Grok inspected the patch and returned VERDICT: BLOCKING on the misleading "unavailable" notice during retained-card refresh failure; its Ask harness could not execute shell identity checks, so the supervisor separately retained the exact seal. These are in-contract test/message fixes, not scope expansion; production paths stay within the original boundary.

Accepted fixes: App-level pending-font test observes both desktop and phone cards before font resolution; HTTP/offload scenario now independently exercises selected and non-selected health-confirmed live work; wrong-root same-name job is queued before the target and exact root/run pairs are asserted; retained cards say "Trainer card updates unavailable. Retrying…" and clear the notice on successful refresh. Each of these four guards was independently removed, observed RED, restored; focused result 57/57.

Normal Claude-family lane unavailable: dedicated Claude CLI profile loggedIn=false; Cursor Opus 5.5 and Sonnet 5 both report usage limits resetting 2026-11-17. Required distinct-model fallback uses read-only no-history GPT-5.6-Sol xhigh and GPT-6-Astra xhigh. Reduced vendor diversity is explicit; normal self-landing gate has no Claude approval.

## Validation before final sync

- Full tests: agent 2,846, viewer 1,401, Python 2,896, zero skipped.
- Lint, build, vendor integrity passed.
- Coverage: agent statements/branches/functions 97.18/92.92/97.61%; viewer 95.12/91.05/93.90%; Python lines/branches/functions 96.95/92.46/100%. First coverage attempt hit unrelated experiment-cli five-second timeout under simultaneous build/test load; unchanged complete coverage passed on rerun without suppression or source changes.
- Browser fault/recovery fixtures use only scratch copies of three real logs/frames/artwork, no approvals or ledgers, served via startViewer (no CLI autorunner). Initial manifest503 and card-data503 showed explicit retry notices; both recovered automatically on polling, notices cleared and two live cards rendered. Pointer and keyboard selection still select the intended run. Actual phone viewport 375x812 confirmed readable error notice and full trainer cards in the run sheet; two-plus polling cycles retained cards. Proxy WebSocket failure leaves a visible recorded frame fallback in this diagnostic fixture; this is not live-frame proof. Original user tab was inspected but not reloaded or modified during these checks.
- Browser and final gates will be rerun after the final build. Final candidate remains unlanded until review/landing contract is resolved.

## 2026-10-22 authorized landing continuation

Operator replied "yes" to the explicit request to land with Grok and two independent GPT approvals while Claude is unavailable. This is the narrow Claude-lane exception, not a waiver of gates or landing-board coordination.

Current main 4967a3ca9 includes an independently landed early-art callback/parallel font-loading repair, new party/bag pages, visual splits, extension clocks, sprite caching and trainer-card cleanup. Integration preserves those changes. Conflicts resolved by retaining main's card-dom implementation and both early-art tests, retaining all main app consumers and test fixtures, adding the retry/status and root-qualified selected/live queue priority, and preserving both sets of independent workbench tests. No new feature or runtime owner. Since integration changes the exact patch, re-run gates and independent integrated review before joining the landing board with actual CODEX_THREAD_ID. Main will only move while this branch is number 1.

### Final authorized continuation

Coordinator relayed explicit human authorization to finish and land this repair using the standing Grok outage waiver, preserving runs and automatic-start schedules. Required current roster is Claude + fresh isolated GPT + distinct fallback; reduced vendor diversity is explicit and no current Grok approval is claimed. Dedicated Claude reviewer authentication is now available, so run that lane on the final integrated packet. Current main 632089f43 merged cleanly; no new production behavior was added by this continuation. All browser checks are hidden/background only; no native focus, tab activation or desktop input. Join the shared board with this chat's actual ID only after final gates/reviews; coordinate one viewer-only refresh in the landing slot and prove gameplay processes survive.
