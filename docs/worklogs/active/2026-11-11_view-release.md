# `just view-release`: open a downloaded release in the viewer

Status: M1 READY TO LAND (source c4ced78e5 on main 640ba5c74; gates green; GPT round 2 LGTM) on `claude/view-release` (worktree `~/dev/pokebench-view-release`), off main a6a9eff8f. Requested by the operator 2026-11-11 18:27Z ("make sure that opening a release in the viewer works"); scope from the coordinator (18:28Z, 18:40Z). Landing needs the operator.

## Problem Statement

A release ships compressed archives (`events-*.tar.xz`, `screenshots-*.tar.xz`, `checkpoints-*.tar.xz`, a raw-RAM `.jsonl.xz`). The viewer reads a run folder (`events.jsonl`, `frames/`, `checkpoints/`, `raw-ram/`). A reader needs one command that checks the release, lays it out as a run folder and opens the viewer on it, without touching the live viewer on 8790.

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`, `viewer-e2e` (background browser only), `detached-long-lived-processes` (the proof server)

## Architecture

`just view-release <folder> [--raw-ram] [--port N]` builds the viewer, then runs `env/pokebench_env/view_release.py`:

1. **Integrity.** Each archive it reads must be listed in `SHA256SUMS` and match, hashed in the same streaming read (the `verify_release` tee). Discovery and safe tar reading reuse `verify_release` (`discover`, `_BoundedTarInfo`, `read_event_source`).
2. **Unpack** into gitignored `runs/releases/<run-id>/` (a runs root holding one run folder, `<run-id>/`). The work goes into a `.partial` sibling, which is renamed into place only when everything verified; any failure removes it.
   - `events.jsonl` from the event log (its first line must be `run_start` with a valid run id, which names the folders).
   - `frames/NNNNNN_N.png` from the screenshots tar (viewer `FRAME_NAME` names only, regular files, size and count caps).
   - `checkpoints/<NAME>.state|json` from the checkpoint tar (same member rules as `verify-release`).
   - With `--raw-ram`, `raw-ram/NNNNNNNN.json.gz` plus `index.jsonl`, rebuilt from the NDJSON at gzip level 1 with mtime 0. That is byte-identical to the run's own archives, so the event log's `raw_ram.sha256` references hold. It is off by default: viewing does not need it (the viewer reads `raw-ram/` only to back-fill older runs), and it means decoding about 76 GB.
   - An existing complete unpack of the same release (same `SHA256SUMS` digest) is reused; a different one is refused.
3. **Viewer.** It execs `node packages/viewer/dist/cli.js --runs runs/releases/<run-id> --port <free port> <run-id>` on 127.0.0.1. The port is the one given, or a free ephemeral port, never 8790. The environment has the model-endpoint variables removed, so next-run controls stay off. Ctrl-C stops it.

Files: `env/pokebench_env/view_release.py` (new), `env/tests/env/test_view_release.py` (new), `justfile` (recipe).

## Invariants

- **INV-1** The release folder is only read. Writes go only under `runs/releases/<run-id>/`, through a `.partial` folder renamed into place after full verification. Test: an in-memory sink; a failure leaves nothing.
- **INV-2 fail closed.** A missing, unlisted, mismatched or unsafe archive member aborts the unpack, naming it. Tests per input.
- **INV-3 safe paths.** Every written path is built from validated names (run id pattern, `FRAME_NAME`, checkpoint names, `%08d`); tar names are never joined. Tests: `..`, absolute, links and odd names are refused.
- **INV-4 no live interference.** Never port 8790, never the repo's `runs/` root as the viewer root, next-run controls off. Test: the argv and env built for the viewer.
- **INV-5 bounded.** Streams, per-member caps, line caps.

## Security Review

Untrusted download, the same bounded non-extracting readers as `verify-release`. Paths are never taken from archive names. The viewer binds 127.0.0.1 only (its own rule). Argv lists only.

## Milestones

**M1 — Source readiness**
- [x] Worklog committed
- [x] Tests (RED)
- [x] Implement (`view_release.py`, `just view-release`; stacked on `claude/replay-verify` for `verify_release.read_event_source`)
- [x] Cheap checks: 22/22, ruff, mypy. Guard deletion: 16 guards removed alone; discard-on-failure, run_start type and frame regular-file first survived, pinned by new tests; all red now
- [x] Full gates on c4ced78e5 (rebased onto main 640ba5c74; upstream changed Node/mypy tooling, so the gates were rerun rather than reused): `just lint` exit 0; `just test` exit 0 (agent 3,042, viewer 1,276, env 3,284, gateway 39; floors; no-I/O proof)
- [x] Close the loop (see Closing the Loop; frontier-headline gap recorded): unpack the real 67d7 release; viewer on a scratch port; background browser click-through of the run page, frontier and splits; desktop (1280, 1440) and phone (375) screenshots opened and looked at; stop the scratch viewer
- [x] Codex review: round 1 BLOCKING (3 fixed), round 2 LGTM

**M2 — Landing** (the operator)

## Closing the Loop

Real 67d7 release, `just view-release ~/dev/pokebench/runs/release-staging/67d7 --port 8796`, run detached (nohup, log, disowned) and stopped afterwards. The release folder listing was unchanged before and after.

- Unpack: `unpacked (4,153 frames, 404 checkpoint files)` into the worktree's `runs/releases/<run-id>/`. The viewer started on 127.0.0.1:8796 with `next runs: queueing is disabled`. The live 8790 viewer was untouched.
- Headless Playwright Chromium (agent-owned, no desktop focus) at 1280×900, 1440×900 and 375×812 (mobile, DPR 2):
  - Frontier (`/comparisons`): BEST OVERALL "Game clear confirmed", HEAVILY ASSISTED, 17:16:02 active, story 203/203, claude-opus-5-5 · 67d7.
  - A real click on "← BACK TO VIEWER" leads to the run page: ENDED in about 26 s, run selected, recorded frame, TURN 4124, TIME 17:16:30, final thought "Wallace is beaten, all eight badges are collected, and the game says game clear." No page errors.
  - SPLITS (button on desktop, page picker on phone): badge rails, 233 milestones and the heavily-assisted banner render. Phone page width 375 equals the viewport (no horizontal scroll).
- Screenshots (opened and looked at): `runs/mockups/view-release/shots/{frontier,run,splits}-{1280,1440,375}.png` plus full-page splits.
- Known gaps, not fixed here:
  - (1) The SPLITS headline and STORY GRAPH stay "Loading the frontier run…" on a single-run release root. The server answers `/api/runs/<id>/frontier` with `{"state":"ready","frontier":null}`, because the only run is assisted and there is nothing to race. The client never leaves its loading state for a settled null frontier. On the live 8790 viewer, where another run is the frontier, the same page reads "9:02:23 ahead of the FRONTIER". This is a viewer-client follow-up.
  - (2) Trainer card, party and bag art are ROM-derived; `view-release` now prints the four art recipes.
  - (3) The current-run projector endpoints return 503 (expected for a finished run).

## Session Log

- 2026-11-11: worktree from main a6a9eff8f.

## Surprises

- Peeking the run id through `read_event_source` decoded the whole 4.3 GB events tar (it keeps iterating to prove there is one member). The peek now reads only the first member's first line; the full pass still enforces the single-member rule before publishing.
- The trainer card, party and bag art are ROM-derived assets in `runs/sprites/` (`just trainer-card-art`, `party-art`, `bag-art`, which also need a pokeemerald checkout); a release folder has none, so the viewer shows "Trainer card artwork unavailable" and `/sprites/...` 404s. Cosmetic; not in this scope.
- `/api/models`, `/api/current-runs` and `/api/runs/<id>/current` answer 503 on a release root (no current-run projector for a finished run); the run page replays from frames regardless.

## Multi-Model Review Log

### Round 1 — GPT (JOB review-gpt-view-release-e031ec5cf)

Base 6c8c42247, head e031ec5cf, SHA-256 1d44f7f5…c3c3. 22 focused passed. `VERDICT: BLOCKING`, three Fix findings, all accepted:

- [P1] Concurrent invocations shared one partial folder and `begin()` deleted it, so a published folder could miss `events.jsonl`. Fixed: `DiskOutput` now runs on an injected `Fs` (`RealFs` is the thin entrypoint). Each invocation gets its own `mkdtemp` staging folder, publishes by an atomic claim of the final name (mkdir, then rename onto that empty directory), and discards only its own staging. The second finisher gets "another view-release … finished first". Test: the reviewer's interleaving on an in-memory `Fs`. Real disk: two concurrent unpacks of the 67d7 release; one published 4,153 frames and 404 checkpoint files, the other refused, no partial left. A rerun reused it.
- [P1] `--raw-ram` kept an unbounded references dict (with unvalidated digests) and index list. Fixed: digests must be 64 hex characters, at most `MAX_REFS` 500,000 references (67d7: 48,201), and the index is appended to the output line by line through a new `Output.append`. Tests for the digest, the cap and appends.
- [P2] The reuse marker ignored `--raw-ram`. Fixed: the marker records `base` or `raw-ram`; a `base` unpack is refused for `--raw-ram` (remove and rerun), while a `raw-ram` unpack serves both. Test.
- Guard deletion: each of the six new guards removed alone turns its test red. 26/26.
- The gate run on e031ec5cf was stopped (superseded).

### Round 2 — GPT (JOB review-gpt-view-release-r2-a2d4c151c)

Delta e031ec5cf..a2d4c151c (SHA-256 0a461faa…3f8e). All three resolved; the reviewer also reproduced the RealFs interleaving in a throwaway directory (winner complete, second publish refused, no staging left). 26/26. `VERDICT: LGTM`. The rebase onto 640ba5c74 was clean, with no conflicts in the reviewed files.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
