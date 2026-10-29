# Stable recorded timeline history

User request: timeline fails to load and constantly flashes; fix it while preserving live gameplay. Bounded viewer history delivery correction, no new timeline marks/lanes/colors, no harness behavior, no recording mutation, no card redesign.

Live background reproduction against f511c6d8e on8790: sampled60s activeGLM2804. History responses all200/ready yet only1–3events each, skipping source sequences between head refreshes. Timeline status flips Loading recorded turns / recorded history every~500ms during activity; identical status text rewritten10Hz. Current game/stats remain live. Native reader currently starts at latest sparse index entry (often latest event), rather than start of a bounded recent page. Client clears error on retry before success; UI exposes background refresh as fresh loading. Exact HTTP error not yet reproduced; asked operator for text while investigating.

Frozen production boundary: current-store.ts historyWindow lookup span, current-read.ts bounded page selection/read, current-browser.ts preserve history/error while refreshing, app.ts stable timeline history status. No public protocol/schema change or additional runtime owner. Preserve source root/generation/epoch/committed-offset checks and existing read/reply/client memory budgets. Tests exercise production reader, browser consumer and mounted status.

- [ ] RED real sparse-page continuity and refresh/error status regressions.
- [ ] Correct page/read bounds and stable refresh presentation; focused checks/mutations.
- [ ] Full appropriate gates, independent review, background browser normal/failure/recovery proof.
- [ ] Queued landing, combined postmain test, one coordinated viewer refresh, live proof.

RED three regressions fail on real reader head continuity, browser failure-message retention, and mounted timeline status stability. Correction: transactional sparse lookup accepts requested lookback; native reader starts far enough back for the existing bounded page, allows existing16-event index slack plus one boundary sentinel, preserves committed source/read/reply limits. Restored namespaces compare page start against namespace boundary so native gaps do not masquerade as missing index. Browser retains failure message until success; timeline status remains steady during refresh once data exists and identical text/hidden values are not rewritten. No timeline drawing/CSS or public protocol change.

Focused core91tests PASS; earlier nativeHTTP suite requires fresh worker build, intentionally refused stale worker (full build queued). Typecheck/changed-file ESLint PASS after replacing closure-capture test variable with typed holder. Reader expected small completed logs now include header; restored tiny page groups differ but same exact native sequence coverage/no duplicates. Ordinary missing-index test enlarged past a64-event page so it still proves no unbounded header scan. No skipped/weakened gates or changed timeouts/baselines.
