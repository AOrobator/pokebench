# Frontier cache (2026-10-27)

Requested by the operator: "shouldn't we cache what the frontier runs so it's faster to load?" Symptom: after the 5:08:51 PM viewer restart, Claude pilot 318a's run page showed "no frontier run to compare against" until reloaded.

Cause: `/api/runs/<id>/frontier` built a complete snapshot of every run on every request. After a merge the per-build workbench cache is cold, so the first answer waited for all ~690 runs to reduce, and the page showed "no frontier run to compare yet" meanwhile (and kept it if the request failed).

Viewer display change: exempt from feature switches.

## M1: cached frontier
- [x] `frontierPair` ranks the frontier and runner-up; `pairFrontier` answers each run (runner-up when it is the frontier; none for a checkpoint resume), byte-equal to `frontierSplits`.
- [x] `frontier-cache.ts`: single-flight ranking from the complete workbench, fresh for 10 s (longer than the 5 s card poll); a request that finds it older waits up to 1.5 s for the running ranking, then answers `stale` (or `loading` when nothing is ranked yet, never "none"); a checkpoint resume answers ready/null at once; the file is validated strictly (named splits, finite nonnegative times).
- [x] Persisted to `runs/.viewer-cache/frontier-v1.json` (outside per-build caches, validated on load, rewritten only on change); a restart answers it as `stale` until it has ranked again. Warmed at viewer start (CLI only).
- [x] Client: `loading` shows "loading the frontier run…"; loading/stale/failed answers are asked again on the 5 s card poll.
- [x] Aborted runs stay frontier candidates (377890434 behavior).
- [x] COMMIT: `feat(viewer): cache the frontier ranking and say loading, not none, while cold` (42edb2ba6). Viewer 2081 passed, cov 95.82/91.69/95.36; lint clean (mypy needs the mGBA binding, not in this fresh worktree; no Python changed).
- [x] Review round 1 (packet 0f249165…): Cursor out of usage (all models). Claude subagent LGTM, fallback subagent LGTM, GPT (Codex CLI gpt-5.6-sol) BLOCK: disk file accepted impossible split times (negative/non-finite). Accepted. Also took the shared hardening notes: freshness 10 s (longer than the 5 s card poll), every request waits ≤1.5 s for a running ranking, checkpoint resumes answer at once, ranking failures logged once, explicit test against ranking the other runs. Grok waived (Cursor out of usage; standing operator rule).
- [x] COMMIT: `fix(viewer): validate the persisted frontier strictly and settle the page's retry` (5e23314ae). Viewer 2083 passed, cov 95.8/91.67/95.32 (gate 90); tsc + eslint clean.
- [x] Review round 2 (packet 31e2ea2b…, head 5e23314ae): Claude subagent LGTM, fallback subagent LGTM, GPT BLOCK (docs only: worklog still said 5 s; no gate record for 5e23314ae). Accepted: worklog corrected and gates recorded; also moved the misplaced workbench option comment in server.ts (Claude nit).
- Timing (isolated symlinked runs root, cold per-build cache, headless): before (main 5940bc2fb) first frontier answer 283.9 s; after, cold: "loading the frontier run…" at 1.7 s, frontier at 281.4 s; after, restart with the saved frontier file and a cold workbench cache: frontier deltas on the page at 1.5–1.9 s.
- [x] Review round 3 (packet 8ffad0f7…, head e7d182f6d): Claude subagent LGTM, GPT (Codex CLI gpt-5.6-sol) LGTM, fallback subagent LGTM. Grok waived (Cursor out of usage; standing operator rule).
- [x] Landed: `git merge --ff-only e7d182f6d` into main (6:01 PM New York). Gates at main: TS on a clean tree at e7d182f6d agent 4540 / viewer 2083 passed, viewer cov 95.81/91.68/95.32; pytest 4431 passed (Python coverage gate met, total 96%); claude-gateway 60 passed; trainer-card-check 3/3. `just test` in the main checkout itself fails one agent test (citation-evidence) only because of the untracked, uncommitted `experiments/fixed/hyperqwen-control-3h.json` there (someone else's work in progress; not touched).
- [x] Live: `just viewer-main` once at 6:06:31 PM; viewer parent PID 1 (/sbin/launchd); 3 live runs (a702, 76cd, 36b5) kept. First answers were `loading` (1.5 s), never "none"; the first ranking finished at 6:10:59 PM and wrote runs/.viewer-cache/frontier-v1.json; answers then ~1 ms (36b5 → GPT-6 Astra 429f, an aborted run; Astra itself → GLM 0d5d). Headless page check on 8790: 36b5's split times show deltas 1.08 s after opening. Proof: runs/frontier-cache-proof/.
- [x] Archived on operator approval (the operator, "yes", 6:12 PM New York).
