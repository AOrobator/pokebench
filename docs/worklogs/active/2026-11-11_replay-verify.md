# `just replay-verify`: replay a published run from power-on and compare its RAM

Status: M1 LANDED on local main at 04fc1aada (the operator 18:48:59Z: "@claude land replay-verify"); post-main `just test` green. No push, no viewer refresh on `claude/replay-verify` (worktree `~/dev/pokebench-replay-verify`), off main a6a9eff8f. Requested by the operator 2026-11-11 18:27Z ("We need to commit the replay tool"), scoped by the coordinator. Landing needs the operator.

## Problem Statement

`just verify-release` checks a release's shape and its final RAM, but it trusts the recorded snapshots. The strong proof is a replay: start the ROM from power-on, feed the run's logged inputs with its recorded clock, and compare the emulator's RAM with every recorded snapshot. That was done once by hand for 67d7 (`runs/release-staging/67d7/replay/replay.py`: frames 0 to 150,000, 4,777 of 4,777 snapshots matched). It is not in the repo, reads the private run folder rather than the release, and needs numpy and Pillow. A reader of the release needs one command.

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`
- `pokebench-game-state` (mGBA memory blocks, RTC)
- `talk-to-codex` (GPT review lane)

## Architecture

`just replay-verify <release-folder> [--frames N | --all]` runs `env/pokebench_env/replay_verify.py` (stdlib plus existing env code and the mGBA binding in `env/.venv`; no new dependencies).

- **Inputs** come from the release's event log (`events*.jsonl[.gz|.xz]` or the one-member `events*.tar[.gz|.xz]`, found by `verify_release.discover`). Every `native_action` gives a clock sample (`server_timestamp`); `native_input` gives the buttons for its frame. Frame N is the Nth `run_frame` call, and buttons hold until the next change.
- **Snapshots** stream from the release's raw-RAM log (`raw-ram*.jsonl[.gz|.xz]`, not `raw-ram-final`). Each line is validated by `parse_raw_ram_record` (version, layout, region digests, registers), and its sequence must be contiguous, its frames nondecreasing and its ROM the reader's ROM. Only the region digests, frame and timestamp are kept.
- **Clock:** the RTC is pinned (`RTC_FIXED`) every frame to the recorded wall time. Samples from events and from snapshot `timestamp_ns` are merged by frame; each frame keeps its earliest sample; values never go backwards; between samples the time is linearly interpolated. This is the same rule as the hand replay, computed while streaming: the snapshot stream is teed, so the clock reads a few snapshots ahead of the comparison.
- **Emulator:** an `Emulator` seam (`set_rtc`, `run_frame(buttons) -> frame counter`, `region(address, size)`). The mGBA adapter sets the core up as the hand replay did (temporary ROM copy, two resets, `RTC_FIXED`) and reads regions with `memory_reader.copy_native_region`. It is the thin entrypoint; the tests use a fake.
- **Comparison:** at each frame, every snapshot recorded at that frame is compared region by region (sha256). The replay stops at the first divergence and names the frame, sequence and regions. A frame-counter mismatch is a divergence too.
- **Bounds:** the default replays frames 0 to 150,000 (about two minutes); `--frames N` sets the end, and `--all` runs to the last snapshot. Memory is bounded: the input table is one entry per input change, the snapshot stream holds digests only, and lines are capped.
- **Integrity:** the two files it reads must be listed in `SHA256SUMS` and match it (hashed in the same read, via the `verify_release` tee). The ROM sha1 must be Emerald (U). Read-only; the only write is the emulator's temporary ROM copy in a temp dir.

Output: `PASS`/`FAIL` lines for integrity, ROM and replay; a summary; exit non-zero on any FAIL.

Files: `env/pokebench_env/replay_verify.py` (new), `env/pokebench_env/verify_release.py` (one helper that hands the event stream to a consumer, extracted with no behavior change), `env/tests/env/test_replay_verify.py` (new), `justfile` (recipe).

## Invariants

- **INV-1 read-only.** Never writes into the release or `runs/`. Test: in-memory release seam with only `names()`/`open()`.
- **INV-2 the replay decides.** PASS needs every compared snapshot to equal the emulator's RAM in all seven regions; anything else stops with FAIL naming the frame. Tests: a one-region mismatch and a frame-counter slip both FAIL at that frame, and nothing runs after it.
- **INV-3 fail closed.** A missing, unlisted, mismatched, unsupported or malformed input is a named FAIL. Tests per input.
- **INV-4 same clock as the recorded run.** The streamed clock equals the hand replay's sorted-and-bisected clock. Test: property-style comparison with a port of the original `clock_at` on samples with duplicate frames and backward values.
- **INV-5 bounded memory.** Events and snapshots stream with line caps; snapshots keep digests only. Tests: line caps.

## Security Review

Untrusted download: the same bounded, non-extracting readers as `verify-release` (line caps, `_BoundedTarInfo`, plain-name `SHA256SUMS`, no symlinks). No release content is executed. Buttons must come from the known GBA key set. The ROM comes from the user's `POKEBENCH_ROM`.

## Milestones

**M1 — Source readiness**
- [x] Worklog committed (`docs(worklog): replay-verify`)
- [x] Tests (RED): clock equivalence, inputs, snapshot stream validation, replay loop with a fake emulator (match, divergence, frame slip, prefix, `--all`), integrity, CLI
- [x] Implement (`replay_verify.py`; `verify_release.read_event_source` extracted from `scan_event_source` with no behavior change; `just replay-verify`)
- [x] Cheap checks: 24/24 replay + 80/80 verify-release; ruff, mypy clean. Guard deletion: 15 guards removed alone, all red ("stop at divergence" shows as a hang of the divergence test rather than a clean failure; no timeout plugin to turn it into one)
- [x] Full gates on 099445fbc: `just lint` exit 0; `just test` exit 0 (agent 3,038, viewer 1,276, env 3,228, gateway 39; floors; no-I/O proof)
- [x] Real run on `runs/release-staging/67d7` (read-only, folder listing unchanged): `PASS replay: frames 0-150,000 replayed from power-on with 88,567 logged actions; 4,777 of 4,777 snapshots match on all 7 regions`, 87.1 s, 244 MB peak (111.2 s after the round-1 fixes). Same result as the hand replay.
- [x] Codex review: round 1 BLOCKING (3 fixed), round 2 LGTM
- Non-goals: video or audio re-encoding, screenshot (PNG) matching, the viewer. Terminator: review LGTM.

**M2 — Landing** (the operator)
- [x] `just land-join` (number 1), `git merge --ff-only 04fc1aada` (main a6a9eff8f → 04fc1aada; main had not moved). Post-main `just test` exit 0 (agent 3,038, viewer 1,276, env 3,228, gateway 39; floors; no-I/O proof).

## Closing the Loop

Proof surface: the command's terminal output on the real 67d7 release, plus unit tests.

## Session Log

- 2026-11-11: worktree from main a6a9eff8f.

## Surprises

- The hand replay's clock reads `server_timestamp * 1000.0`, so 1.005 s becomes 1004.9999… ms; the streamed clock keeps that arithmetic exactly (the fixtures had to apply the same conversion).

## Multi-Model Review Log

### Round 1 — GPT (JOB review-gpt-replay-verify-4b9897bc8)

Base a6a9eff8f, head 4b9897bc8, SHA-256 3b6cfa93…6d4d. 104 focused passed. `read_event_source` extraction behavior-preserving. `VERDICT: BLOCKING`, three Fix findings, all accepted:

- [P1] Retained event data unbounded: every native_action kept with no count bound. Fixed: `MAX_ACTIONS` 2,000,000 (67d7 has 88,567), named FAIL beyond it. Test with the cap patched to 4.
- [P1] Same-frame snapshot groups unbounded: the clock's earliest-per-frame rule reads a whole frame group ahead of the comparison through the tee. Fixed: `MAX_SNAPSHOTS_PER_FRAME` 64 (67d7's maximum is 3), named FAIL beyond it. Test at the boundary.
- [P2] The byte prefilter `'"native_action"'` skipped escaped spellings (`native_\u0061ction`). Fixed: every event line is parsed (non-JSON is a named FAIL). Test with the escaped line.
- Guard deletion: each new guard removed alone turns its test red. 27/27. Real release rerun: 4,777 of 4,777, 111.2 s (every line now parsed), 250 MB peak, folder unchanged.
- The gate run on 4b9897bc8 was stopped (superseded); lint had passed on it.

### Round 2 — GPT (JOB review-gpt-replay-verify-r2-099445fbc)

Delta 4b9897bc8..099445fbc (SHA-256 43ebf51f…f96e5). All three resolved; no new findings; 27 passed. `VERDICT: LGTM`.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
