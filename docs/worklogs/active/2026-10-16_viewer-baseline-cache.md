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
- [x] COMMIT: `feat(viewer): GREEN baselines validate on worker threads and never block the viewer` (9a307fa7)
- [x] Guard deletions: in-flight sharing removed → "shares one compute" fails; startup warm removed → "warms every ended run" fails. Restored, 14/14 pass.
- Real catalog (235 runs, built dist, pool of 4): cold 78.8 s (was 253.7 s in process), max event-loop lag 27 ms during the scan, warm re-read 7 ms.

**M2 — Persisted baselines keyed on log and code**
- [x] Write tests: disk hit across readers, fingerprint and `codeId` invalidation, corrupt entries ignored, mid-compute change not persisted, import-closure identity on a fixture tree, no 256 cap, unwritable cache, run-id guard, week-old pruning, restarted viewer served from disk. LRU eviction and limit tests removed with the cap.
- [x] COMMIT: `test(viewer): RED baselines persist across restarts keyed on log and code` (f707fdf4)
  - RED: baseline-store.test.ts fails to import (no baseline-store module); baseline-cache 7/7 pass.
- [x] Implement store, code identity, wiring (cli prunes other-code caches unused for 7 days, opens `runs/.viewer-cache/baselines/<codeId>/`).
- [x] Gates: viewer 845 tests, agent 1426, Python 2130 passed / 2 skipped. Coverage viewer 95.16 / 90.68 / 93.41, agent 97.73 / 94.58 / 97.98, Python 96%. `pnpm -r lint`, ruff, ruff format, mypy (main venv) clean.
- [x] COMMIT: `feat(viewer): GREEN baselines persist across restarts keyed on log and code` (4f88ac88)
- [x] Guard deletions: no `store.put` → 3 store tests fail; no fingerprint check on read → 2 fail; relative imports left out of the closure → identity test fails; no after-compute fingerprint check → 2 fail (store + cache). Restored, 18/18 pass.
- Real catalog with built dist and a scratch cache dir: cold 77.9 s (235 computed), second start 0.11 s (0 computed), cache 940 KB. 20 sampled cached outcomes identical to main's in-process `baselineOf` (12 baselines and errors mixed).

**M3 — Review and live receipt**
- [x] Merge main into the branch (175df9cd) and rerun gates on that tip: build, `pnpm -r lint`, ruff, ruff format, mypy (main venv), coverage (viewer 847 tests 95.16 / 90.69 / 93.41; agent 1435 tests 97.74 / 94.58 / 97.98; Python 2130 passed, 96%), `just verify-vendor` all green.
- [x] Principles self-review (PB1–PB13): 0 FAIL; PB3, PB4, PB5, PB6, PB8, PB12 N/A. Table: scratchpad `principles-viewer-baseline-cache.md`, passed to every reviewer.
- [ ] Claude CLI, Codex, Grok reviews until clean
- [ ] ASK USER: merge approval (not a bundle-v-control fix)
- [ ] After merge: `just viewer-main`, record time to first answer, cold and warm `/comparisons`, and that live runs survived

**M4 — Workbench run loads off the request thread, persisted (the operator "yes", 4:34 AM)**

Cause (live receipt below): `workbench-store.ts` `load()` reduces every run's full log (`readNativeRecording` → `parseEvent` per line) on the main thread for `/api/workbench`, in memory only, and re-reduces a live run's whole log whenever it grows.

Design: `load()` splits into `runSignature` (main thread: stat + visual-evidence signature, unchanged) and a pure `loadRun(root, id)` returning a plain `LoadedRun` (`run`, `port`, `tag`, and `timing` replacing the `RunView`: startMs, ended, lastMs, paused, pauses). `runSeconds` on a view becomes `timingSeconds` on that record. A `createWorkbenchLoader({ compute, store })` keeps the in-memory cache by signature, shares in-flight loads, and persists ended runs at `runs/.viewer-cache/workbench/<codeId>/`. The worker pool becomes generic (`kind: "baseline" | "workbench"`); the worker validates nothing new, the main thread validates every workbench reply through `parseWorkbench`. Live runs are recomputed on the workers when their log grows (no main-thread parse); incremental live reads are deferred (needs a resumable `readNativeRecording`).

- [x] Write tests: `loadRun`/`timingSeconds` parity with the in-process snapshot; a held compute leaves other routes answering; store reuse for ended runs only; signature change recomputes; corrupt store entries ignored; worker `kind` routing; in-flight sharing.
- [x] COMMIT RED: `test(viewer): RED workbench runs load off the request thread and persist` (10 new tests fail: missing exports; pool posts gain `kind`)
- [x] Implement: `loadRun`/`timingSeconds`/`parseLoadedRun`/`createWorkbenchLoader` in `workbench-store.ts`; generic `RunStore` with `createWorkbenchStore`/`workbenchCacheDir` and pruning of both cache kinds; pool requests carry `kind`, `pool.load` validates workbench replies; worker routes by kind; server `workbench` option; CLI `offload` builds one pool for both. Fixture note: the paused run needs its own port, since only the newest run per port is probed.
- [x] Guard deletions: persist live runs too → 2 tests fail; no in-flight sharing → 1 fails; server ignores the loader → 1 fails; no after-load signature check → new race test fails. Restored, 10/10 pass.
- [x] Gates: build, `pnpm -r lint`, ruff, ruff format, mypy (main venv), coverage (viewer 875 tests 95.32 / 90.99 / 93.61; agent 1489 tests 97.82 / 94.56 / 98.14; Python 96%), verify-vendor green.
- [x] Real catalog (240 runs, built dist, pool of 4, scratch cache dir): cold workbench snapshot 86.0 s with max event-loop lag 84 ms (in process today: 277.0 s, all on the loop); restart from disk 8.96 s, only the 3 unended runs recomputed, max lag 216 ms. Parity against main 5fd00072 built in a throwaway worktree: 237 ended/invalid rows byte-identical, cohorts/problems envelope identical, 3 live rows skipped (their logs grow between snapshots).
- [x] COMMIT: `feat(viewer): GREEN workbench runs load on worker threads and persist when finished` (327b20a8)
- [ ] Review (Claude, Codex, Grok in a throwaway worktree), merge on the operator's word, live restart receipt

## Closing the Loop

Done when a restart answers `/api/runs` within seconds, a restart without baseline-code changes serves comparisons from disk, and the live receipt is recorded.

## Session Log

- 2026-10-16 3:18–3:40 AM: viewer back on its own at 3:19 AM; cook run #2 untouched. Profiled; worklog written.

## Surprises

- One third of tonight's merges (24 of 73 since 10-15) touch the baseline import closure, so code-keyed persistence alone would still leave many restarts cold. Off-thread compute is the part that removes the outage.

## Multi-Model Review Log

- Round 1 (3:52 AM), packet `git diff --binary da8993aa d5c1a0b3`, SHA-256 d8c70696…04da. Claude CLI (default profile; `~/.claude-review` reports loggedIn false), plan mode: BLOCKING, B1 the 258-run retention test validates real logs (fixture runtime). Codex gpt-5.6-sol read-only: BLOCKING, B1 `pruneBaselineCaches` throws on a vanished/unreadable entry and stops startup; B2 same 258-run test. Grok cursor-grok-4.5-high (ask mode): no verdict; it wrote three scratch files into the worktree (`.tmp_hash_git.sh`, `src/__emit-cmd-out.test.ts`, `runs/_emit.mjs`, all hashing the packet), which made one coverage run fail on a missing `runs/.cmd-out.txt`. Stopped after 25 min, files removed, round discarded for Grok.
- Fix batch: retention test uses empty logs and a canned compute; prune tolerates per-entry stat/rm failures (new test with a dangling 64-hex symlink and a throwing `rmSync`); a worker reply with another request's id now rejects the job instead of leaving it pending (Claude speculation, cheap to close). Guard deletions: 256 eviction re-added → retention test fails; prune try removed → prune test fails; restored. Viewer 848 tests, coverage 95.16 / 90.69 / 93.41, lint clean.
- Round 2 (4:05 AM), packet `git diff --binary da8993aa 3ad975e4`, SHA-256 91148101…95c2; fix delta d5c1a0b3..3ad975e4 SHA-256 49f018bc…2929. Claude CLI: VERDICT: LGTM (both round-1 blockers resolved; new non-blocking: a missing built worker makes `codeIdentity` throw at startup, a broken-build condition). Codex gpt-5.6-sol: VERDICT: LGTM. Grok (ask mode): VERDICT: LGTM, but it again wrote untracked scratch files (`_compute-out.mjs`, `src/__emit-cmd-out.test.ts`) despite the read-only instruction, so the worktree status changed and the result fails the frozen-packet check; discarded, files removed. Grok rerun with `--mode plan --sandbox enabled`.
- Deferred follow-ups (Claude, non-blocking): warm queue is FIFO, so a cold-cache single-run request waits behind it (no regression); `codeIdentity` hashes bare packages by name only, so a typebox upgrade would not invalidate (lockfile hash would close it); import regex could over-match non-import text (only widens the hash).

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
- Grok round 2 rerun in a throwaway worktree of 3ad975e4: `--mode plan` produced empty output (discarded); `--mode ask` produced VERDICT: LGTM, exit 0, empty stderr; candidate worktree status and HEAD unchanged, packet SHA-256 unchanged (911481015fd7…).
- Landing: merged main into the branch (1e1feec9); `git diff --binary main 1e1feec9` SHA-256 equals the reviewed packet (911481015fd7…). Gates on that tip: build, lint, mypy, ruff, coverage (viewer 849, agent 1451, Python 96%), verify-vendor green. Auto-mode check blocked the merge until the operator's "yes" (4:12 AM); `git merge --ff-only 1e1feec9` on main.

## Live receipt (2026-10-16)

- 4:13 AM `just viewer-main` at 1e1feec9: script 14 s, 2 live gameplay processes kept. Cold cache (new code id 73495147…): 235 baselines filled in the background; feature history 109 s, comparisons for the live run 0.08 s cold and warm afterwards. But `/api/runs` and `/api/experiments` timed out at 120 s during the fill.
- 4:24 AM restart by another thread (viewer at 308ddd3e, includes this fix, same code id, warm baseline cache): `/api/runs` still unanswered until 4:29:46, about 4 min 50 s.
- Cause: a second full-log scan on the main thread. `workbench-store.ts` `load()` reduces every run's whole log through `readNativeRecording` / `readWorkbenchSnapshot` (`parseEvent` per line) for `/api/workbench` (EXPERIMENT dropdown, comparisons page), cached only in memory, and re-reads a live run's whole log whenever its signature changes. The baseline fix removed one of two scans; restart downtime is not yet fixed.
- NOT DONE: restart outage. Proposed next milestone (awaiting the operator): workbench `load()` on the worker pool, ended runs persisted per code identity, live logs read incrementally.

## M4 review and landing

- Round 3 (M4 only), packet `git diff --binary 48d6b48f 55af4bc7`, SHA-256 52afd14a…ab1b. Claude CLI: VERDICT: LGTM. Codex gpt-5.6-sol: VERDICT: LGTM. Grok cursor-grok-4.5-high (ask mode, throwaway worktree; candidate and copy stayed clean): VERDICT: LGTM.
- Deferred follow-ups: one rejected `pool.load` (worker crash, invalid reply) fails the whole `/api/workbench` instead of one invalid row (Claude, Grok); the workbench signature is weaker than the baseline fingerprint (no dev/ns ctime) and is computed twice on a miss; no prune test for `workbench/` dirs; `parseLoadedRun` returns the validated input rather than a rebuilt value; pool/worker names still say "baseline"; live logs still re-reduce in full on each growth (now on a worker).
- Landing: merged main (115c3bfc); `git diff --binary main 115c3bfc` SHA-256 equals the reviewed packet. Gates on that tip: build, lint, mypy, ruff, verify-vendor green; coverage green on rerun (viewer 877, 95.32 / 90.99 / 93.61; agent 1521; Python 96%). The first coverage run timed out one unrelated test (`experiment-cli.test.ts` production host, 5 s, load average 29); the rerun passed. Fast-forwarded main to 115c3bfc under the operator's 4:34 AM "yes" (build, review and merge).
- Live receipt: 5:14 `just viewer-main` collided with another thread's 5:11 restart ("old viewer still holds 8790") and the port was empty about 15 s; 5:17:18 `just viewer-main` at 115c3bfc, 2 live gameplay processes kept. With a cold cache (new code id): `/api/runs` 0.12 s at +9 s and every probe after it 0.09-0.13 s; feature history 1.9 s then 0.07 s; `/api/workbench` filled its 237-run cache in the background and answered at 5:19:59 (30 s request), then 7 ms. Restart outage fixed for every route except a cold `/api/workbench`, which waits on the background fill without blocking anything else.

**M5 — The comparisons page never waits on a cold cache (the operator, 6:46 AM: "stuck on loading recorded runs… needs to be fixed… landed on main")**

Cause: the 6:40 restart (main 7f9721cf) had a new code identity, so all 249 workbench records were cold. `/api/workbench` awaited every one; those loads sat in the pool's FIFO behind 249 baseline warm jobs (baselines done 6:42:25, workbench done 6:47:09), so the page showed "Loading recorded runs…" for about 6.5 minutes. Five code identities today: most merges touch the worker's import closure.

Design: `workbenchSnapshot` gains a partial mode (server, when offloading): it serves every run whose record is cached for its current signature, serves the previous record of a run whose log grew (stale until its reload lands), starts loads for the rest without awaiting them, and reports "Still loading N of M recorded runs" in `problems` (the existing problems box). The pool runs workbench jobs before queued baseline jobs. Default (in-process) mode is unchanged.

- [x] RED (5 tests fail: no partial option, FIFO pool): partial snapshot returns at once with a pending count; stale record for a grown log; a failed background load is retried, never unhandled; pool priority; server answers `/api/workbench` while loads are held.
- [x] GREEN: `WorkbenchLoader.current` (non-blocking: fresh record, else the previous record of a grown log, else null, always kicking a load); `workbenchSnapshot(..., { partial })` serves found records and adds "Still loading N of M recorded runs; this page fills in as they finish." to `problems`; pool takes queued workbench jobs before baseline jobs; server `workbench.partial`, CLI sets it. Guard deletions: partial ignored → 4 fail; no stale record → 1 fails; FIFO pool → 1 fails; server ignores partial → 1 fails. Restored, 15/15.
- Real catalog, built dist, cold scratch cache, pool of 4: every partial snapshot 108-347 ms; 34 runs shown at +2 s, 130 at +65 s, all 259 at +97 s.
- Review round 1 (M5), packet be428cdb..246a8756 SHA-256 cfd3675e…54c4. Grok: VERDICT: LGTM (throwaway worktree, clean). Claude CLI: VERDICT: BLOCKING, a live log grows during every load, so `start()` never caches the result and an active run stays "Still loading" forever (and is missing from the EXPERIMENT dropdown). Codex gpt-5.6-sol: VERDICT: BLOCKING, (1) the previous record is served after any log change, not only appends (same-size rewrite, truncation, replacement); (2) `current()` returns null for a disk-cache hit on the first partial snapshot. Claude raised (2) and reload pile-up as follow-ups.
- Fix batch: the loader keeps the newest finished record per log (`latest`), even when the log grew while it loaded, and serves it only when the current log is that log with bytes appended (same inode, larger, same visual evidence and build: `appendedSince`); one partial-mode reload in flight per log; `current()` re-reads the cache after starting a load so disk hits land at once. New tests: live log growing during every load stays shown over 3 cycles with exactly 3 reloads; rewritten, truncated and replaced logs are pending, then correct; disk-cached runs in the first partial snapshot without compute. Guard deletions: no `latest` → 1 fails; no append check → 3 fail; no re-read → 1 fails; no single-reload guard → 1 fails. Restored, 20/20.
- Real catalog, cold scratch cache: all 7 unended runs shown from +21 s (2 actively playing), every snapshot 111-322 ms, complete at +95 s.
- Review round 2 (M5), packet be428cdb..54a99af8 SHA-256 11d3b8dc…f5d2. Claude CLI: VERDICT: LGTM (follow-ups: `forget()` leaves `latest`/`reloading` entries for deleted runs; inode reuse on non-APFS filesystems; same-inode rewrite plus growth is undetectable without hashing). Grok (throwaway worktree, clean): VERDICT: LGTM. Codex: VERDICT: BLOCKING, no real-browser proof for a polling change (CLAUDE.md viewer-e2e rule); all round-1 blockers resolved.
- Gates at 54a99af8 (main unchanged): build, lint, mypy, ruff, coverage (viewer 924 tests 95.32 / 91.09 / 93.68; agent 1700; Python 96%), verify-vendor green.
- Browser receipt (viewer-e2e), 7:10-7:13 AM: owned candidate server on 127.0.0.1:8797 (pid 18755, `startViewer` from the 54a99af8 build with the production pool, a cold scratch cache, `partial: true`, no autorun or queue), real runs root. `/comparisons` rendered within 2 s with "Still loading 257 of 259 recorded runs…" in the problems box and no "Loading recorded runs…"; the count fell 223 → 199 → 179 over successive 10 s checks, and "2 CURRENT RUNS" with both live cards showed from about +12 s. Pointer click on the GPU0 live card's Watch link opened `/#run=2026-10-16T06-52-53_qwen36-gpu0_230d`, RUNNING, live game frame visible. Returned through the RUNS & COMPARISONS link (still loading, 135 left); keyboard Enter on the focused GPU1 Watch link opened `/#run=2026-10-16T06-52-53_qwen36-gpu1_3d9e`, RUNNING, frame visible. Back on `/comparisons`: "Still loading 1 of 259", then no loading line on the next three checks. Only console error: `/api/models` 503, because the candidate has no model endpoint file (not part of this change). Candidate stopped after the check.
- Review round 3 (M5), packet be428cdb..9e27986a SHA-256 46f3ac6d…6ba9: Claude CLI VERDICT: LGTM, Codex gpt-5.6-sol VERDICT: LGTM, Grok (throwaway worktree, clean) VERDICT: LGTM. Follow-ups: `forget()` should also prune `latest`/`reloading`; inode reuse or same-inode rewrite-plus-growth could pass `appendedSince` (not seen on APFS); browser receipt has no screenshot files under runs/.
- Landed: main fast-forwarded be428cdb → 9e27986a (`git diff --binary be428cdb main` SHA-256 equals the packet). 7:16 AM `just viewer-main` at 9e27986a, 2 live gameplay processes kept. `/api/workbench` answered at +0 s (0.17 s, 0 of 259 with the loading line), every poll 0.11-0.17 s, 111 runs at +58 s, complete (259) at 7:18:09, about 2 minutes. `/api/runs` 0.26 s.

**M6 — Opening a run never stalls the viewer (the operator, 12:40 PM: "the viewer seems to take forever to load… loading some runs… the caching feels broken")**

Reproduced 12:42-12:47 PM on 8790 (main 6603d64f): the comparisons cache was warm (the 12:42 restart rebuilt the same commit, so the same code id; only the 2 newly started runs loaded, in seconds). The slow path is opening a run in the viewer: `/api/runs/<id>/events` reads, validates and re-serializes the whole log in one synchronous `pump()` before `caught_up`. An hourly cook run's log is about 151 MB: 8.5 s for the stream, about 20 s until REPLAY in the browser, and `/api/runs` took 3.7 s while another run was being opened, so every page and poll stalls behind each open.

Design: the stream reads at most a fixed number of bytes per step (default 1 MiB, option `streamChunkBytes`), yielding to the event loop between steps (setImmediate) until it reaches the end of the file, and waits for `drain` when the socket buffer is full; a line longer than the chunk is read whole. `caught_up` and `done` keep their meaning; live polling uses the same stepping. `readFrom` gains an optional byte limit.

- [x] RED (2 fail: reads all happen in one tick; no streamChunkBytes option): a log many chunks long streams every event in order with `caught_up` then `done`; another route answers while that stream is still sending; a line longer than the chunk is delivered whole; a closed request stops stepping.
- [x] GREEN: `readFrom(path, offset, lineNo, maxBytes)` reads at most `maxBytes` and grows the read only when one line is longer; `streamEvents` steps one chunk per turn of the event loop (`setImmediate`), and when the socket is full it waits for `drain` and then also yields with `setImmediate`. `caught_up`/`done` unchanged; live tailing uses the same stepping; a closed request stops. `streamChunkBytes` option (default 1 MiB, positive integer). First candidate (yield only on non-full steps) still stalled other requests for 3.7 s: a CPU profile showed the drain callback chaining steps without returning to the loop (`socketOnDrain → afterWrite → drainLog`). The drain path now yields too.
- Guard deletions: no yield between steps → 1 fails; no long-line growth → 3 fail; drain without yield → the drain test fails (a mocked full socket that emits drain on the next tick). Restored, 6/6.
- Live comparison, 151 MB log `2026-10-16T08-54-30_qwen36-gpu1_4806`, real runs root: on 8790 (main 6603d64f) `/api/runs` took 3.82 s while that run was being opened; on the candidate (port 8797, startViewer only) `/api/runs` took 0.30-0.37 s and `/api/features` 0.09 s during the same open; the stream itself took 4.4 s (about 4.0-4.3 s before).
- Review round 1 (M6), packet 6603d64f..fbd70a7a SHA-256 1b26e627…4804. Claude CLI: VERDICT: LGTM (follow-ups: a `readSync` error in a later step is now thrown from a `setImmediate` callback; do the browser check at landing). Grok (throwaway worktree, clean): VERDICT: LGTM. Codex: VERDICT: BLOCKING: (1) after a write returns false, the rest of the chunk was still written; (2) the "answers another route while streaming" and "closed request stops" guards were not really tested; (3) no browser playback receipt; (4) no head-bound gate receipt. Gates at fbd70a7a (main 6603d64f): build, lint, mypy, ruff, coverage (viewer 938 tests 95.33 / 91.11 / 93.70; agent 1867; Python 96%), verify-vendor green.
- Fix batch: the stream keeps validated messages in a queue and writes until a write returns false, then waits for `drain` (and yields) before writing the next one; it reads the next chunk only once the queue is empty, and `run_end`/end-of-file count only once their messages are written. New tests: one write reporting a full socket means no further write until `drain`; a slow reader pauses reading (fewer than half the chunk reads) while `/api/runs` answers, then the stream finishes; after an abort the read count stops growing. Guard deletions: writing the whole queue regardless → backpressure test fails; ignoring a full socket → backpressure test fails. Without the `closed` check the abort test still passes, because a destroyed socket reports full and never drains; kept as defense in depth. Restored, 8/8.
- Browser receipt (viewer-e2e), 1:06-1:09 PM: candidate on 127.0.0.1:8797 (pid 89112, production offload with a cold scratch cache, partial mode). Chose `2026-10-16T08-54-30_qwen36-gpu1_4806` (151 MB) in the run picker: LOADING, and 0.5 s later `/api/runs` answered in 144 ms and `/api/workbench` in 154 ms; REPLAY within 11 s, recorded game frame visible, exact run in the hash. Returned through RUNS & COMPARISONS ("Still loading 193 of 265", page live) and back: the same run reached REPLAY again within 10 s. Keyboard Down on the focused macOS select did not change the run (native popup behavior); no control changed in this milestone. Console errors: `/api/models` 503 (candidate has no model endpoint) and connection errors from the previous candidate being stopped. Candidate stopped.
