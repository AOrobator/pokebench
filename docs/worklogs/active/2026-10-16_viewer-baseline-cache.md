# Viewer baselines off the request thread, persisted across restarts

## Problem Statement

Operator (2026-10-16, 3:18 AM): the 8790 viewer was "down" twice tonight right after `just viewer-main` restarts (1:11 AM, 3:14 AM): about 5 minutes of timeouts each. Operator: "Why does a restart block the viewer for five minutes? That seems like very bad design. There probably needs to be some caching somewhere."

Measured cause (offline, against the real `runs/`, viewer at `bf246930`): `listRuns` takes 76 ms; `baselineOf` over the 234 ended runs takes **253,725 ms** (163 baselines, 71 expected errors; slowest 17 s for one 100+ MB log). Every page load asks `/api/features/history` and `/api/runs/<id>/comparisons`, which fold `readBaseline` over every ended run. The reader (`createBaselineReader`, 2026-10-14 viewer-comparison-cache) caches in memory only, so each restart re-validates ~1.5 GB of logs synchronously on the event loop, and nothing else is answered until it finishes. Its LRU cap is 256 entries and the catalog holds 234 ended runs: past 256 every history request would evict and re-parse everything, and the viewer would stay down permanently.

The 2026-10-14 worklog named both persistent caching and worker threads as non-goals and "first validation after server restart remains cold" as a limitation. This worklog removes that limitation.

## Skills Loaded

- feature-worklog (this file), multi-model-review contract (`~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md`).
- No feature switch: viewer-only, no change to what the model sees or does (feature-switch skill scope excludes viewer-only work).

## Architecture

- `BaselineReader` becomes async: `(runId) => Promise<Baseline>`. `comparisonsOf`, `featureHistory` and the `/milestones` route await it. `baselineOf` stays the sole validator and split fold (PB1).
- **Off-thread compute.** A small `worker_threads` pool (default `min(4, availableParallelism() - 2)`, at least 1) runs `baselineOf` in `baseline-worker.ts`. The main thread only stats files, dispatches and awaits, so the server answers every other route during a cold scan. Concurrent requests for one run share one in-flight promise. A crashed worker rejects its job as an error result and is replaced.
- **Persisted outcomes.** Each outcome (baseline, or expected `BaselineError`/`RunsError` message) is stored at `runs/.viewer-cache/baselines/<codeId>/<runId>.json` with the log fingerprint (path, ino, size, mtimeNs, ctimeNs). Writes are atomic (temp + rename). Entries are validated on read; a missing, corrupt or mismatched entry is recomputed.
- **Code identity.** `codeId` = SHA-256 over the compiled import closure of `baseline-worker.js` (relative and `@pokebench/*` imports, file bytes; bare package specifiers by name). Any merge that changes how baselines are folded or validated changes `codeId` and recomputes; other merges reuse the cache.
- **Warm on start.** The server queues every ended run through the pool at startup without awaiting it.
- In-memory cache keeps the fingerprint before/after race check; the 256 LRU cap is removed (entries are a few hundred bytes).
- Out of scope: the experiment autorun `recordedRuns().recent()` cold scan (measured 2.3 s, cached after); log format; agent behavior.

## Invariants

- INV-1: Cached, persisted and freshly computed baselines are identical for the same log and code. Test: compare responses from fresh reader, warm reader and a second reader on the same disk cache.
- INV-2: A cold baseline scan never blocks unrelated routes. Test: with a compute that never resolves, `/api/runs` and `/api/features` answer while `/comparisons` is pending.
- INV-3: A changed log (append, same-size edit, replacement) or changed `codeId` never serves a stale outcome. Test: real filesystem edits and a second `codeId`.
- INV-4: A result for a file changed during compute is never persisted or cached. Test: mutate during an injected compute.
- INV-5: Corrupt or foreign cache files are ignored, never trusted. Test: garbage, wrong shape, wrong fingerprint.
- INV-6: Expected errors keep their class (`BaselineError` → 422 on `/milestones`, skipped in comparisons/history) across the worker boundary and disk.
- INV-7 (project): no run is stopped or restarted by this work; the cache lives beside runs, never inside a run dir.

## Security Review

- Cache paths are built from validated run ids (`RUN_ID_PATTERN`) and a hex `codeId`; no user input reaches a path otherwise.
- Cache JSON is untrusted input: parsed and validated into typed values, never `eval`ed.
- Workers receive only `runsRoot` and a validated run id. No subprocesses.

## Milestones

**M1 — Baselines off the request thread**
- [x] Write tests: async reader parity, in-flight sharing, unrelated routes answer during a pending scan, error classes preserved, worker pool protocol (queueing, crash → error + replacement, close), worker handler in-process.
- [x] COMMIT: `test(viewer): RED baselines computed off the request thread` (1afe57bd)
  - RED: baseline-offthread.test.ts fails to import (no baseline-pool, baseline-worker, computeBaseline); 3 baseline-cache tests fail (sync reader, positional limit). history, runs, server-cache pass with awaits.
- [x] Implement pool, worker entry, async reader, await in comparisons/history/milestones, startup warm.
- [x] Gates: viewer 836 tests, agent 1426, Python 2130 passed / 2 skipped (ROM). Coverage viewer 95.15 / 90.61 / 93.31 (lines/branches/functions), agent 97.73 / 94.58 / 97.98, Python 96%. `pnpm -r lint` clean; ruff clean; mypy clean with the main checkout's venv (this worktree's venv lacks the native mGBA binding, `mgba._pylib`, an environment gap, no env/ diff).
- [x] COMMIT: `feat(viewer): GREEN baselines validate on worker threads and never block the viewer` (pending sha)
- [x] Guard deletions: in-flight sharing removed → "shares one compute" fails; startup warm removed → "warms every ended run" fails. Restored, 14/14 pass.
- Real catalog (235 runs, built dist, pool of 4): cold 78.8 s (was 253.7 s in process), max event-loop lag 27 ms during the scan, warm re-read 7 ms.

**M2 — Persisted baselines keyed on log and code**
- [ ] Write tests: disk hit across readers, fingerprint and `codeId` invalidation, corrupt entries ignored, mid-compute change not persisted, import-closure identity on a fixture tree, no 256 cap.
- [ ] COMMIT: `test(viewer): RED ...`
- [ ] Implement store, code identity, wiring.
- [ ] Gates
- [ ] COMMIT: `feat(viewer): GREEN ...`
- [ ] Guard deletions recorded

**M3 — Review and live receipt**
- [ ] Principles self-review (PB1–PB13), Claude CLI, Codex, Grok reviews until clean
- [ ] ASK USER: merge approval (not a bundle-v-control fix)
- [ ] After merge: `just viewer-main`, record time to first answer, cold and warm `/comparisons`, and that live runs survived

## Closing the Loop

Done when a restart answers `/api/runs` within seconds, a restart without baseline-code changes serves comparisons from disk, and the live receipt is recorded.

## Session Log

- 2026-10-16 3:18–3:40 AM: viewer back on its own at 3:19 AM; cook run #2 untouched. Profiled; worklog written.

## Surprises

- One third of tonight's merges (24 of 73 since 10-15) touch the baseline import closure, so code-keyed persistence alone would still leave many restarts cold. Off-thread compute is the part that removes the outage.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
