# `just verify-release`: one-command check of a published clear

Status: M1 (source readiness) in progress on `claude/verify-release` (worktree `~/dev/pokebench-verify-release`). Approved by the operator 2026-11-11 16:50Z (relayed by the coordinator). Landing (M2) and closeout (M3) need the operator.

## Problem Statement

A stranger who downloads the 67d7 release (Opus 5.5, boot to Hall of Fame, Rayquaza caught) has five manual steps in `VERIFY.md` and no tool. The operator: "We definitely do need to have a one command check for the 67d7 clear." The check must run with only the user's ROM: no model, GPU or network.

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`
- `pokebench-game-state` (native flag, party and save-block readers)
- `pokebench-review` (evaluation-integrity persona, applied as a self-review lens)
- `talk-to-codex` (GPT review lane)

## Architecture

`just verify-release <folder>` runs `env/pokebench_env/verify_release.py` (stdlib plus existing env code). It prints one `PASS`/`FAIL` line per check, then a summary, and exits non-zero on any FAIL. It reads only the release folder and `POKEBENCH_ROM` and writes nothing: tar members are hashed and parsed in memory as they stream, so no temp dir is needed.

Release layout (one file per kind, chosen by name and extension):

| Kind | Name | Compression |
|---|---|---|
| Checksums | `SHA256SUMS` | none |
| Event log | `events*.jsonl[.gz|.xz]` | by extension |
| Raw RAM | `raw-ram*.jsonl[.gz|.xz]`, one snapshot JSON per line, same fields as a `raw-ram/*.json.gz` record | by extension |
| Checkpoints | `checkpoints*.tar[.gz|.xz]` with `checkpoints/*.state` + `*.json` | by extension |

zstd is not supported (no stdlib codec, no new dependency). A `.zst` file is ignored when a supported copy of the same kind exists, and is a named FAIL when it is the only one.

Checks:

1. **Integrity.** Every `SHA256SUMS` line names a plain file in the folder whose sha256 matches; each file the checks read is listed there. The ROM at `POKEBENCH_ROM` has sha1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`.
2. **Event-log shape.** First event `run_start` (seq 0, `start_state.kind` boot, ROM sha1); last `run_end` with reason `completed` and `target_proof.name` `GAME_CLEAR_CONFIRMED` whose `milestone_seq` is an observed `GAME_CLEAR_CONFIRMED` milestone and whose `state_evidence` are state events; one run id; seq contiguous from 0; `turn_start` turns contiguous from 1 to `run_end.turns`; no `human_input`, `human_sample` or `operator_control` events; `evaluation.features_sha256` recomputed from `evaluation.features` the way `featuresSha256` in `packages/agent/src/run-evaluation.ts` does.
3. **Native re-derivation from RAM.** Each NDJSON line is validated by `parse_raw_ram_record` (the validation half of `load_raw_ram`, split out with no behavior change): version, region layout, per-region sha256, registers, ROM identity. Sequences are contiguous from 0, and every state event's `raw_ram` reference names a snapshot with the same frame. From the final snapshot the native readers give `FLAG_SYS_GAME_CLEAR`, the eight badge flags and the party (decoded with the ROM), which must include Rayquaza. Each event-log milestone whose catalog definition is a flag or variable predicate (no map condition) must be seen true in RAM at or before the snapshot its evidence state event references.
4. **Checkpoints.** Safe streaming tar read (regular files and the one directory only, names under `checkpoints/`, no `..`, absolute paths, links or duplicates, per-member size limits). Every `.state` has a `.json` and the reverse; sha256 and size match the JSON; every milestone checkpoint's `source.start_state.kind` is boot and its `source.rom_sha1` is the ROM; the run id matches; `GAME_CLEAR_FINAL.json`'s proof equals `run_end.target_proof`.
5. **Totals** (information, not a check): turns, wall time, model, harness commit and dirty flag, tokens (or "not recorded" when zero); list cost is "not in this release" because the agent trace is not shipped. Ends with a pointer to `just replay-verify` (separate worklog).

Milestone predicates come from the agent's catalog (`PROGRESS_CATALOG` in `packages/agent/src/story-progress.ts`). The flag/variable subset is checked in as `env/pokebench_env/release-milestones.json`; a vitest test (`packages/agent/src/release-milestones.test.ts`) derives the same subset from the catalog and fails if the JSON drifts, so the TS catalog stays the source of truth.

Files: `env/pokebench_env/raw_ram.py` (split), `env/pokebench_env/verify_release.py` (new), `env/pokebench_env/release-milestones.json` (new, generated), `env/tests/test_verify_release.py`, `env/tests/test_raw_ram_record.py` (new), `packages/agent/src/release-milestones.test.ts` (new), `justfile` (recipe).

## Invariants

- **INV-1 read-only.** The verifier never writes into the release or `runs/`; it opens files read-only and creates nothing. Test: the verifier runs against an in-memory release whose opener records every mode requested; only reads occur, and there is no write API on the seam.
- **INV-2 headline from RAM.** GAME_CLEAR, badges and party come from native readers on RAM, not milestone events. Test: a fixture whose events claim `GAME_CLEAR_CONFIRMED` and `run_end completed` but whose final RAM lacks the flag FAILs the native check; same for a missing badge and a party without Rayquaza.
- **INV-3 fail closed.** Each missing, unreadable, ambiguous, unsupported or malformed input is a FAIL naming it; an exception inside a check is a FAIL, never a skipped check. Test: one case per input kind (missing, `.zst` only, truncated line, corrupt JSON, bad checksum).
- **INV-4 no network, model or GPU.** The module imports no network or model code; tests run under the no-I/O guard on in-memory fixtures.
- **INV-5 bounded memory.** Events and RAM stream line by line with a per-line byte cap (events 16 MiB, RAM 2 MiB); tar members stream with size caps. Per-event bookkeeping is a few integers per state event, never a stored snapshot. Test: a line over the cap FAILs without being buffered whole.

## Security Review

The input is an untrusted download.

- Decompression is bounded per line (`readline(cap + 1)`) and per tar member; nothing is fully decompressed into memory.
- Tars: reject symlinks, hard links, devices, absolute names, `..`, names outside `checkpoints/`, duplicates and oversized members. Nothing is extracted.
- `SHA256SUMS` names must be plain file names (no `/`, no `..`); the folder itself and each named file must not be symlinks.
- Release content is never executed or imported; JSON only. The ROM path comes from the user's environment.
- No subprocesses.

## Milestones

**M1 — Source readiness**
- [x] Worklog committed (`docs(worklog): verify-release`)
- [ ] Write tests: raw-RAM record split, release discovery/compression, integrity, event shape, native RAM (INV-2), checkpoints/tar safety, INV-1/3/5, vitest catalog drift
- [ ] COMMIT: `test(verify-release): ...` (RED)
- [ ] Implement
- [ ] Cheap checks: ruff, mypy, focused pytest, vitest on the new test
- [ ] Full gates: `just lint`, `just test`, `just verify-vendor`
- [ ] Real check: 67d7 staging copy outside `runs/`, output saved
- [ ] Guard deletion check (rule 5): remove each guarded behavior once, watch the test go red, restore
- [ ] COMMIT: `feat(verify-release): ...` (GREEN)
- [ ] Review: Codex GPT lane via coordinator; Claude CLI lane; two-round cap
- Outcome: `just verify-release <folder>` prints PASS/FAIL per check for a 67d7-style release. Consumers: release readers, `VERIFY.md`. Non-goals: video, replay, viewer, other runs' releases, zstd. Terminator: both review lanes LGTM. Split trigger: any need for emulator execution.

**M2 — Landing** (the operator)
- [ ] ASK USER: land
- [ ] FF merge via landing board, post-main `just test`

**M3 — Closeout** (the operator)
- [ ] README "Verify the clear" section; `VERIFY.md` step 1 points at `just verify-release`

## Closing the Loop

- Proof surface: the command's terminal output on a real 67d7 staging copy, plus unit tests. No viewer or browser surface.

## Session Log

- 2026-11-11: worktree from main `608c01540`. Discovery: 67d7 has 189,738 events (4.0 GB), 109,028 raw-RAM snapshots (16 GB gz), 202 checkpoint pairs incl. `GAME_CLEAR_FINAL`. Only state events carry `raw_ram` refs (48,201). Max event line 462,570 bytes.

## Surprises

- `GAME_CLEAR_FINAL.json` has no `source` block (it carries `proof` instead), so `start_state.kind boot` applies to milestone checkpoints only; the final save is bound to `run_end.target_proof` instead.
- An uncompressed raw-RAM NDJSON for 67d7 is about 76 GB (109,028 × ~700 KB of base64), too large for the 99 GB free; the real check uses a gzip NDJSON built by concatenating the run's own gzip members with newline members.

## Multi-Model Review Log

(pending)

## Boy Scout Log

(none yet)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog to `docs/worklogs/2026-11-11_verify-release.md`
