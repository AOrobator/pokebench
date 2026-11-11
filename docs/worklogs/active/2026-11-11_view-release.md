# `just view-release`: open a downloaded release in the viewer

Status: M1 (source readiness) in progress on `claude/view-release` (worktree `~/dev/pokebench-view-release`), off main a6a9eff8f. Requested by the operator 2026-11-11 18:27Z ("make sure that opening a release in the viewer works"); scope from the coordinator (18:28Z, 18:40Z). Landing needs the operator.

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
- [ ] Full gates
- [ ] Close the loop: unpack the real 67d7 release; viewer on a scratch port; background browser click-through of the run page, frontier and splits; desktop (1280, 1440) and phone (375) screenshots opened and looked at; stop the scratch viewer
- [ ] Codex review (two rounds, then ask)

**M2 — Landing** (the operator)

## Closing the Loop

## Session Log

- 2026-11-11: worktree from main a6a9eff8f.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
