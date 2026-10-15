# Finals run labels

Operator report (2026-10-15 15:27 UTC): the viewer said "trial 12 of 32" during the full-map-navigation finals, which had just started.

Cause: the page was replaying `2026-10-14T23-43-18_think-fast_d116`, run 12 of 32 of the overnight 2×2 cohort. The green live chip above it named the finals preset, so the replay's TRIAL strip read as the finals' trial. The finals ledger was correct (run 1 of 32).

Viewer-only; no harness behavior change, so no feature switch.

- [x] RED: finals runs carry "<experiment> finals · <arm> · run n/total"; a relaunched slot labels both runs; unreadable finals are skipped; a live chip for another run reads "LIVE ELSEWHERE · … · WATCH ▸"
  COMMIT: `test: finals runs carry their own finals place, and a live chip for another run says so` (e803880)
- [x] GREEN: `finalsRunLabels` in experiment-gate-store; `/api/runs` uses it for the run's experiment label; app chip text
  Tests: agent 1083, viewer 648 passed. TS coverage over 90 on every metric; tsc + eslint clean. Python gates not run in this worktree (no mGBA binding built here; nothing Python changed).
  Rebased onto main at 914d90c (mobile timeline merge); GREEN is now 0a4333f.
- [x] Review round 1: Claude CLI (no blockers) and Grok 4.5 high. Grok's "deletes mobile layout" was a stale-base diff artifact, gone after the rebase. Addressed: /api/runs overlay test, replay-with-live-elsewhere chip test, arm taken from the ledger row. Accepted as is: reused incumbent runs keep their cohort label and "/total" counts finals launches, matching the gate's "finals run n of N"; withdrawn finals keep plain labels (history); no cache (one readdir and two small files per finals experiment per poll).
  Tests: viewer 651 passed; viewer coverage 95.37/91.16/94.39/98.1; tsc + eslint clean.
- [x] Review round 2: Grok LGTM; Claude LGTM with a non-blocking note that an unreadable finals.jsonl would 500 /api/runs. Fixed: an unreadable ledger is skipped (test covers a directory named finals.jsonl). Deferred: a finals run's own header still shows PRESET, not its finals place.
  Tests: viewer 651 passed; coverage 95.37/91.16/94.39/98.1; tsc + eslint clean.
- [x] Operator approval (the operator 2026-10-15 16:22 UTC: "yes but dont restart the viewer"); rebased onto main at e0a0552 (objective UI removal). Viewer 648 passed, coverage 95.36/91.17/94.36/98.09, lint clean.
- [ ] 8790 is not restarted (operator). The fix goes live at the next viewer restart made for another reason.
