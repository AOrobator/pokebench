Single milestone: stable parser-scoped ended-record cache, revisioned per-run updates for comparisons, semantic chart/version memoization; tests/gates, measured restart/payload/browser proof and frozen review. No gameplay, events, experiment launch, or game-process restart changes. Existing live incremental reader stays authoritative. Failed/newer-schema records remain ungraded according to current build relation. Source implementation changes invalidate raw cache through compiled dependency identity; viewer commits alone do not. Full GET /api/workbench contract remains available to existing clients; opted-in browser gets validated atomic full/delta updates with bounded history and full-resync recovery.

Operator explicitly requests "pls fix" the over-invalidated cache, repeated full polling payload and graph rebuilds. One milestone, complete loop.

Baseline: 445 records, ~24.46 GiB logs. Full warm workbench payload 7,549,199 bytes, HTTP response ~31ms on local loopback (not browser rendering latency). Persistent ended summaries are keyed by dependency identity AND viewer commit; commit key causes needless reread on presentation/docs changes. Only ended records are persisted; live reader already supports incremental appends. Workbench unconditionally rebuilds versions/graph every 5 seconds. Shared main clean537c0a99 on start; own previous worktree reused on branch codex/frontier-cache.

- [ ] RED/GREEN cache reuse across build identities with skew/integrity checks retained.
- [ ] RED/GREEN opted-in full/delta transport, full-resync on restart/history expiry, atomic malformed-update refusal.
- [ ] RED/GREEN chart memoization, independent clocks, filter/reference/resize/status invalidation.
- [ ] Gates, real-data measurements, browser failure/recovery and visual proof.
- [ ] Review, authorized local landing and live proof.

RED: event-skew/workbench focused run 2 failed / 45 passed: restart rereads completed log; graph node is replaced on unchanged inputs. New sync contract suite fails import before implementation. Logs /tmp/frontier-cache-red.log and /tmp/frontier-cache-sync-red.log. Live listener PID81750, build97046aa6 (main advanced independently). Original comparisons tab1657055914 is controlled by another session; preserve it and use an owned candidate tab for proof.
