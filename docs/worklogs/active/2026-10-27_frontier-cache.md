# Frontier cache (2026-10-27)

Requested by the operator: "shouldn't we cache what the frontier runs so it's faster to load?" Symptom: after the 5:08:51 PM viewer restart, Claude pilot 318a's run page showed "no frontier run to compare against" until reloaded.

Cause: `/api/runs/<id>/frontier` built a complete snapshot of every run on every request. After a merge the per-build workbench cache is cold, so the first answer waited for all ~690 runs to reduce, and the page showed "no frontier run to compare yet" meanwhile (and kept it if the request failed).

Viewer display change: exempt from feature switches.

## M1: cached frontier
- [x] `frontierPair` ranks the frontier and runner-up; `pairFrontier` answers each run (runner-up when it is the frontier; none for a checkpoint resume), byte-equal to `frontierSplits`.
- [x] `frontier-cache.ts`: single-flight ranking from the complete workbench, fresh for 5 s, then answered as `stale` while it re-ranks; a cold cache waits 1.5 s, then answers `loading` (never "none").
- [x] Persisted to `runs/.viewer-cache/frontier-v1.json` (outside per-build caches, validated on load, rewritten only on change); a restart answers it as `stale` until it has ranked again. Warmed at viewer start (CLI only).
- [x] Client: `loading` shows "loading the frontier run…"; loading/stale/failed answers are asked again on the 5 s card poll.
- [x] Aborted runs stay frontier candidates (377890434 behavior).
- [x] COMMIT: `feat(viewer): cache the frontier ranking and say loading, not none, while cold` (42edb2ba6). Viewer 2081 passed, cov 95.82/91.69/95.36; lint clean (mypy needs the mGBA binding, not in this fresh worktree; no Python changed).
- [x] Review round 1 (packet 0f249165…): Cursor out of usage (all models). Claude subagent LGTM, fallback subagent LGTM, GPT (Codex CLI gpt-5.6-sol) BLOCK: disk file accepted impossible split times (negative/non-finite). Accepted. Also took the shared hardening notes: freshness 10 s (longer than the 5 s card poll), every request waits ≤1.5 s for a running ranking, checkpoint resumes answer at once, ranking failures logged once, explicit test against ranking the other runs. Grok waived (Cursor out of usage; standing operator rule).
