# `just verify-release`: one-command check of a published clear

Status: M1 LANDED on local main at cae3b65f0 (the operator: "land it", 18:00:04Z; evidence fe1215c24), post-main `just test` green. M1b (tokens) landed at bc3a9e936. M3 closeout needs the operator. Approved by the operator 2026-11-11 16:50Z; scope cut by the operator 17:10Z (both relayed by the coordinator). No push, no viewer refresh.

## Problem Statement

A stranger who downloads the 67d7 release (Opus 5.5, boot to Hall of Fame, Rayquaza caught) has five manual steps in `VERIFY.md` and no tool. The operator: "We definitely do need to have a one command check for the 67d7 clear." The check must run with only the user's ROM: no model, GPU or network.

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`
- `pokebench-game-state` (native flag, party and save-block readers)
- `pokebench-review` (evaluation-integrity persona, applied as a self-review lens)
- `talk-to-codex` (GPT review lane)

## Scope change (the operator, 2026-11-11 17:10Z)

Cut to the fast checks. The snapshot-by-snapshot scan is gone: no full raw-RAM NDJSON read, no per-milestone RAM check, no 89-milestone flag table and no vitest drift guard (all removed; nothing else used them). RAM is read only from one small release file holding the final snapshot. The full raw-RAM log stays in the release for the replay. Real-data check: a small staging folder, no 16 GB copy.

## Architecture

`just verify-release <folder>` runs `env/pokebench_env/verify_release.py` (stdlib plus existing env code) with `python -I`, so a release folder used as the working directory never lands on `sys.path`. It prints one `PASS`/`FAIL` line per check (15), totals and a summary, and exits non-zero on any FAIL. It reads only the release folder and `POKEBENCH_ROM` and writes nothing. Each file it reads is streamed once through a sha256 tee, so the bytes checked are the bytes hashed; tar members are hashed and parsed in memory, never extracted.

Release layout (one file per kind, chosen by name and extension):

| Kind | Name | Compression |
|---|---|---|
| Checksums | `SHA256SUMS` | none |
| Event log | `events*.jsonl[.gz|.xz]`, or `events*.tar[.gz|.xz]` whose only member is a plain `events*.jsonl` (the 67d7 release ships `events-67d7.tar.xz`) | by extension |
| Final RAM snapshot | `raw-ram-final*.json[.gz|.xz]` (the 67d7 release ships `raw-ram-final.json.gz`), one `raw-ram/*.json.gz` record (the run's last) | by extension |
| Checkpoints | `checkpoints*.tar[.gz|.xz]` with `checkpoints/*.state` + `*.json` | by extension |

When several supported copies of one kind exist, the one `SHA256SUMS` lists wins; stale unlisted copies are ignored, two listed copies are ambiguous. zstd is not supported (no stdlib codec, no new dependency). A `.zst` copy is ignored when a supported copy of the same kind exists, and is a named FAIL when it is the only one. Other files (the full raw-RAM log, screenshots, logs, replay) may be listed in `SHA256SUMS`; they must exist but are not hashed here (`sha256sum -c SHA256SUMS` covers them).

Checks:

1. **integrity**: `SHA256SUMS` lines are `<sha256>  <plain name>`, no duplicates; every file this tool reads is listed and matches; every listed file exists. **rom**: `POKEBENCH_ROM` sha1 is `f3ae088181bf583e55daf962a92bb46f4f1d07b7`.
2. **events** (six checks): `run_start` first with `start_state.kind` boot and the ROM sha1; seq contiguous from 0 with one run id; `turn_start` turns contiguous from 1 and equal to `run_end.turns`/`turn`; no `human_input`, `human_sample` or `operator_control`; `run_end` last and once, reason `completed`, `target_proof` `GAME_CLEAR_CONFIRMED` whose `milestone_seq` is an observed milestone of that name and whose `state_evidence` are credits states after it; `evaluation.features_sha256` recomputed like `featuresSha256` in `packages/agent/src/run-evaluation.ts` (entries sorted by UTF-16 code unit, `JSON.stringify`).
3. **final snapshot**: validated by `parse_raw_ram_record` (the validation half of `load_raw_ram`, split out with no behavior change), decompressed under the 2 MiB raw-RAM archive bound. Its sequence and frame equal the last state event's `raw_ram` reference, which is also the highest sequence any state references; its `rom_sha1` is the ROM's. When it is the original `.json.gz`, its file sha256 must equal that reference's `sha256` (byte-identical to the run's archive); a recompressed copy is bound by sequence and frame only, and the PASS line says so. **native** (three checks, ROM-decoded): `FLAG_SYS_GAME_CLEAR` (0x864) set; the eight badge flags set; a validly decoded Rayquaza (species 406) in the party.
4. **checkpoints** (three checks): safe streaming tar (only the `checkpoints` directory and regular files named `checkpoints/<UPPER_CASE>.state|json`; links, devices, `..`, absolute or other names, duplicates and oversized members rejected; at most 4,096 members); `.state`/`.json` pairs complete, `GAME_CLEAR_FINAL` present; sha256 and size match; provenance: run id matches; milestone saves name themselves, start from boot on the ROM and point at a milestone event of that name; `GAME_CLEAR_FINAL.proof` equals `run_end.target_proof`; `RUN_END` (when present) has `kind` run_end and the run's end reason and turn count, from boot on the ROM.
5. **totals** (information): run, turns, wall time, model and thinking level, harness commit and tree state, tokens ("not recorded" when zero), list cost ("not in this release"), event and milestone counts, the final snapshot's sequence and frame, checkpoint count, and a pointer to `just replay-verify` (separate worklog).

Files: `env/pokebench_env/raw_ram.py` (split), `env/pokebench_env/verify_release.py` (new), `env/tests/env/test_verify_release.py` (new), `env/tests/env/verify_release_67d7.py` (new: the 67d7 final and power-on snapshots and switch set, as code), `justfile` (recipe).

## Invariants

- **INV-1 read-only.** Never writes into the release or `runs/`; the release seam (`ReleaseFiles`) has only `names()` and `open()`, and the disk implementation opens with `O_RDONLY | O_NOFOLLOW`. Test: `test_verifier_only_reads_and_reads_each_file_once` (each needed file opened once; the full raw-RAM log never opened).
- **INV-2 headline from RAM.** Game clear, badges and Rayquaza come from native readers on the final snapshot, not milestone events. Tests: events that claim game clear over a final snapshot without the flag FAIL only `native: game clear flag`; same for a missing badge and a party without (or with a mangled) Rayquaza; a final snapshot that is not the last referenced one, or whose gzip bytes differ from the run's digest, FAILs `final snapshot`.
- **INV-3 fail closed.** Each missing, unreadable, ambiguous, unsupported or malformed input is a FAIL naming it; any exception in a check is a FAIL, and dependent checks FAIL as "not checked". Tests: missing file per kind, zstd only, two supported copies, truncated or non-JSON event lines, corrupt tar, bad checksums, missing or wrong ROM, unreadable party.
- **INV-4 no network, model or GPU.** Imports no network or model code; all tests run in memory under the no-I/O guard.
- **INV-5 bounded memory.** Events stream line by line with a 16 MiB line cap; the final snapshot is read under the 2 MiB archive bound; tar members stream with size caps; per-event bookkeeping is the milestone list and credits seqs, never a snapshot. Tests: oversized event line, oversized final snapshot. Real run: 99 MB peak RSS on the 4.3 GB 67d7 event log.

## Security Review

The input is an untrusted download.

- Decompression is bounded (`readline(cap + 1)`, `read(MAX_ARCHIVE_BYTES + 1)`, tar member size caps); nothing large is buffered whole.
- Tars: links, devices, `..`, absolute or unexpected names, duplicates and oversized members rejected; nothing extracted.
- `SHA256SUMS` names must be plain file names; the folder must not be a symlink and files open with `O_NOFOLLOW`.
- Release content is never executed or imported; JSON only. `python -I` keeps the folder off `sys.path`. No subprocesses.

## Milestones

**M1 — Source readiness**
- [x] Worklog committed (`docs(worklog): verify-release`)
- [x] Write tests (RED)
- [x] COMMIT: `test(verify-release): in-memory release fixtures and invariants` (9df412628, RED: collection fails, `pokebench_env.verify_release` does not exist)
- [x] Implement (WIP commit 66b87cd7c before the pause)
- [x] Scope cut applied: full-RAM scan, milestone table and vitest drift guard removed; final-snapshot file and its binding added; `RUN_END` checkpoint handled
- [x] Cheap checks: ruff, mypy, focused pytest 50/50; module coverage 97% (`verify_release.py`)
- [x] Guard deletion check (rule 5): 22 guards removed one at a time, each turns a test red, restored (see Session Log)
- [x] Real check: 67d7 staging folder outside `runs/`, 15/15 PASS, 27.9 s wall
- [x] COMMIT: `feat(verify-release): fast release check with the final RAM snapshot` (ea5f06478, GREEN)
- [x] Full gates on f5262a74c: `just lint` exit 0; `just verify-vendor` OK; `just test` exit 0 (agent 249 files/3,038, viewer 121/1,276, env 3,171, gateway 39; all floors; no-I/O proof OK)
- The operator asked (17:09Z, delivered late) why it scanned gigabytes; answered with options (a) full event-log pass ~28 s, (b) first/last line ~1 s, (c) shelve. Coordinator 17:21Z: go with (a).
- [x] Review: Codex GPT lane via `just tell-codex`: rounds 1-3 BLOCKING (fixed), round 4 LGTM
- Outcome: `just verify-release <folder>` prints 15 PASS/FAIL lines for a 67d7-style release in well under a minute. Consumers: release readers, `VERIFY.md`. Non-goals: video, replay, viewer, other runs' releases, zstd, per-snapshot RAM. Terminator: review LGTM. Split trigger: any need for emulator execution.

**M1b — Tokens and list cost from the agent trace** (coordinator 17:58Z; The operator's decision card "Land now, tokens next"), branch `claude/verify-release-tokens` off cae3b65f0
- [x] Write tests: per-session cumulative usage at the max `total_cost_usd`, summed across sessions, multiple models; non-call members ignored; absent and zstd-only trace; malformed result lines; links, member size, member count and line caps. Informational only: a bad trace never fails a check, and the check count stays 15.
- [x] COMMIT: `test(verify-release): agent-trace token totals` (RED, 88def9f7a: 12 failed, 65 passed)
- [x] Implement `scan_agent_trace` (bounded, safe streaming tar via `_BoundedTarInfo`; only `calls/call-*.jsonl` read; links, non-regular call files, >64 MiB members, >65,536 members, lines over 16 MiB, non-JSON and malformed result lines make the trace "unreadable" in the totals; the trace is hashed like every file read). Event-log token line relabelled `tokens (event log)`.
- [x] Cheap checks: 79/79, ruff, mypy. Guard deletion: 8 guards removed alone; "max cost per session" and the cost type check first survived, pinned by `test_a_later_but_smaller_result_does_not_replace_the_session_total` and a boolean-cost case; all red now. Real release (read-only, folder unchanged): 15/15 PASS, 57.1 s, 273 MB peak; integrity 4 files read; totals exactly as expected below.
- [x] Full gates; real release run (expected 67d7: input 7,967,144; cache write 75,149,150; cache read 574,225,342; output 1,643,515, thinking 361,372; $780.55 list; 1 session, 4,132 results)
- [x] Codex review (small): round 1 BLOCKING (fixed), round 2 LGTM; stopped at ready to land
  - Round 1 (JOB review-gpt-verify-release-tokens-055b6bd2d, base cae3b65f0, head 055b6bd2d, SHA-256 614e7555…a143a): `VERDICT: BLOCKING`, one Fix [P1]: non-call members were skipped before the size cap, so a streamed 1 TiB ignored member (or a compressed bomb) was decompressed in full. Fixed: the member size cap now runs on every member before the skip. Test: a 1 TiB declared `requests/huge.bin` backed by a few bytes is refused. Guard deletion: putting the skip first again turns it red. 80/80.
  - The gate run started on 055b6bd2d was stopped (files changed mid-run); gates rerun on the fixed head.
  - Round 2 (JOB review-gpt-verify-release-tokens-r2-e8cf93eef, delta 055b6bd2d..e8cf93eef, SHA-256 af963951…dd814): P1 resolved, no new findings, 80 passed. `VERDICT: LGTM`.
  - Gates on 600578b78 (main fe1215c24 merged in): `just lint` exit 0; `just test` exit 0 (agent 3,038, viewer 1,276, env 3,201, gateway 39; floors; no-I/O proof). Real release: 15/15 PASS, 56.9 s, expected totals exact. READY TO LAND (needs the operator's go).
  - LANDED: The operator 18:27:45Z ("we need to land the tokens branch"). `just land-join` (number 1), `git merge --ff-only bc3a9e936` (main fe1215c24 → bc3a9e936; main had not moved since the branch merged it). Post-main `just test` exit 0 (agent 3,038, viewer 1,276, env 3,201, gateway 39; floors; no-I/O proof). Not pushed; no viewer refresh.

**M2 — Landing** (the operator)
- [x] ASK USER: land — the operator, 18:00:04Z: "land it"
- [x] FF merge via landing board: `just land-join` (number 1), `git merge --ff-only cae3b65f0` (main 608c01540 → cae3b65f0; main had not moved, so all gates and reviews carry over unchanged). Post-main `just test` exit 0 (agent 3,038, viewer 1,276, env 3,186, gateway 39; floors; no-I/O proof). Not pushed; `just viewer-main` not run (not needed: no viewer or runtime change).

**M3 — Closeout** (the operator)
- [x] README "Verify the clear" section; `VERIFY.md` step 1 points at `just verify-release`; the release ships `raw-ram-final-67d7.json.gz` (the run's `raw-ram/00109027.json.gz`) and lists it in `SHA256SUMS`. Branch `claude/verify-the-clear-docs` (prose only).
  - [x] README: "Verify the clear" section after Results (download, `POKEBENCH_ROM`, `just verify-release <folder>`, what all PASS means and does not mean; optional `just replay-verify` and `just view-release`)
  - [x] `runs/release-staging/67d7/VERIFY.md` (untracked release staging): "How to check it yourself" step 1 is `just verify-release` from a PokeBench clone; the manual checks stay as steps 2-6. The Claude Code session id prefix was removed from "Tokens and cost" (now "the gateway's session record"). `VERIFY.md` is not listed in `SHA256SUMS`, so the sums are unchanged.
  - [x] Final snapshot file name: satisfied by the existing `raw-ram-final.json.gz` (byte copy of `raw-ram/00109027.json.gz`, listed in `SHA256SUMS`). `verify_release.KINDS["final snapshot"]` accepts `raw-ram-final*.json[.gz|.xz]`, so no rename.
  - [ ] Independent review of the prose (caller handles review and landing)

## Closing the Loop

- Proof surface: the command's terminal output on a real 67d7 staging folder, plus unit tests. No viewer or browser surface.
- Staging folder (scratchpad, outside `runs/`; APFS clones, so no extra space and the originals untouched): `events-67d7.jsonl` (the run's `events.jsonl`, 4.3 GB uncompressed), `raw-ram-final-67d7.json.gz` (the run's `raw-ram/00109027.json.gz`), `checkpoints-67d7.tar` (uncompressed, built with `COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs`), `raw-ram-67d7.jsonl.zst` (listed, never read), `SHA256SUMS`.
- Result (`just verify-release .` run from inside the folder, `POKEBENCH_ROM` set): 15/15 PASS, exit 0, 27.90 s real, 27.09 s user, 99 MB peak RSS. Party: RAYQUAZA Lv 74, ELECTRIKE Lv 25, WINGULL Lv 15, ABRA Lv 11, CASTFORM Lv 26, SWAMPERT Lv 55. Checkpoints: 202 pairs (200 milestones + final save + run-end save).

## Session Log

- 2026-11-11 18:30 ET: GPT review of 8eae230c1 BLOCKING, 2 x P2 (README overclaimed): all PASS does not prove every milestone has a checkpoint, and verify-release hashes only the files it reads. README now says each checkpoint present has a matching pair with agreeing digests and metadata, says other listed files are only checked for presence, and points to `shasum -a 256 -c SHA256SUMS` for every file. Same correction in the staged 67d7-r2 VERIFY.md. Prose-only delta after the gates ran on 8eae230c1.

- 2026-11-11 18:30 ET: Quick-start rehearsal from a fresh clone of public main 780321615 on the gpubox (Linux) and the Mac: setup, build-mgba, lint, test, verify-rom and smoke all green on both. Two fixes on this branch: README step 1 clones plainly and initialises only `env/vendor/continual-harness` (the vendor has a nested `pokered` submodule with no URL, so `--recurse-submodules` exits 128); `.env.example` comments out the placeholder `POKEBENCH_MODEL` and `POKEBENCH_GATEWAY_URL`, so a fresh `just doctor` reports the model tier as SKIP (16 passed, 0 failed, 2 skipped, exit 0) instead of FAIL.

- 2026-11-11: worktree from main `608c01540`. Discovery: 67d7 has 189,738 events (4.3 GB), 109,028 raw-RAM snapshots (16 GB gz), 202 checkpoint pairs. The last state event (seq 189736) references snapshot 109027 with the sha256 of `raw-ram/00109027.json.gz`. Max event line 462,570 bytes.
- 17:09Z pause, then 17:10Z scope cut (see above). Before the pause: 57/57 tests on the full-scan design; WIP commit 66b87cd7c.
- After the cut: 50/50 tests; ruff and mypy clean on the changed files.
- Guard deletion (each removed alone, test went red, restored): game-clear flag, badge flags, Rayquaza, gzip digest binding, last-snapshot binding, sequence/frame binding, tar links, tar names, tar size cap, operator events, features digest, seq order, turn contiguity, run_end completed, boot start, integrity mismatch, checkpoint sha256, checkpoint boot provenance, event line cap, final snapshot cap, RUN_END kind, RUN_END turn. Turn contiguity and checkpoint sha256 first survived (the tests also tripped other guards); `test_a_turn_gap_fails_even_when_run_end_agrees` and `test_a_same_size_swapped_state_fails` were added to pin them. RUN_END kind likewise survived until the RUN_END test covered each field.
- First real run FAILed `checkpoints: provenance` on `RUN_END`, a third checkpoint kind (`checkpoint-capture.ts`: `kind: run_end`, `end_reason`, `turn`, `source`). Added its provenance rule and tests; the rerun passed.
- 2026-11-11 18:05 ET: M3 closeout docs on `claude/verify-the-clear-docs` (worktree `~/dev/pokebench-verify-clear-docs` from main b2c7f71ae). README section and staged `VERIFY.md` step 1 written from the recipes and module docstrings of `verify_release`, `replay_verify` and `view_release`. Documentation validation: `git diff --check` clean; no build, lint or test suites (prose only). Found: the session id prefix also appears in the shipped agent trace (`session.json`, `calls.jsonl`, every `calls/call-*.jsonl`); left for the operator.

## Surprises

- `GAME_CLEAR_FINAL.json` has no `source` block (it carries `proof`), so boot provenance applies to milestone and `RUN_END` saves; the final save is bound to `run_end.target_proof`.
- The run's checkpoints include `RUN_END` (the resume save written at every run end), not only milestones and the final save.
- The no-I/O guard forbids test fixture reads even at import time, so the recorded snapshots live in a Python data module.
- Uncompressed raw RAM for 67d7 would be about 76 GB; the cut scope removes any need for it.

## Multi-Model Review Log

### Principles self-review (`docs/agent-principles.md`)

| ID | Score | Note |
|---|---|---|
| PB1 game grades the run | PASS | The headline (game clear, badges, Rayquaza) is read from the final RAM snapshot by native readers; milestone events never stand in for it (INV-2 tests). |
| PB2 failed runs count | N/A | No run inclusion or exclusion logic. |
| PB3 one run is an anecdote | N/A | Verifies one published run; makes no population claim. |
| PB4 declare every advantage | PASS | Reports the switch set's digest; does not hide or reinterpret the lane's assistance (the release README states it). |
| PB5 change one thing | PASS | No harness behavior change; no feature switch needed (verification tool only). |
| PB6 long runs | PASS | Real 4.3 GB / 17 h event log streamed in 27.9 s at 99 MB peak. |
| PB7 no event log, no run | PASS | The event log is mandatory; its absence or damage FAILs every dependent check. |
| PB8 misbehavior loud and bounded | PASS | Any exception is a named FAIL; caps on lines, records, tar members and member sizes. |
| PB9 rock-solid-or-ask | PASS | Scope questions went to the operator (pause, cut). |
| PB10 no carve-outs | PASS | All tests run under the no-I/O guard; fixtures moved into code instead of exempting a read; no floor or exclude changed. Only the disk opener and ROM reader are `pragma: no cover` thin entrypoints. |
| PB11 verify the pinned dependency | PASS | Checkpoint kinds and `featuresSha256` checked against the harness source (`checkpoint-capture.ts`, `run-evaluation.ts`) and the real 67d7 switch digest. |
| PB12 macOS privacy prompts | PASS | The ROM path is `~/.roms`; no TCC-protected folders read. |
| PB13 close the loop | PASS | Real 67d7 output recorded under Closing the Loop; full gates recorded below. |

Zero FAIL rows.

### Round 1 — GPT (Codex coordinator, JOB review-gpt-verify-release-f5262a74c)

Packet base 608c01540, head f5262a74c, diff SHA-256 70612537…63e6af, `/private/tmp/review-verify-release-f5262a74c/`. Worker verified the digest, ran the focused tests (50 passed) and reproduced both findings in memory. `VERDICT: BLOCKING`.

- Fix [P1] `scan_checkpoints`: tarfile reads PAX and GNU long-name payloads before yielding a member, so a 4 MiB PAX comment passed and peaked at ~21 MB, scalable to memory exhaustion. Fixed: `_BoundedTarInfo._proc_member` rejects extension headers over 64 KiB (`EXTENSION_CAP`) and sparse members before tarfile reads them; small extension headers stay allowed. Tests: oversized PAX comment, a forged 8 GB PAX header backed by 1 KiB, a 64 KiB+ GNU long name, a sparse member, and a small PAX header that still passes.
- Fix [P2] `_integrity`: `SHA256SUMS` was read with `read(SIDECAR_CAP)` and silently truncated. Fixed: own `SUMS_CAP` (1 MiB), read cap+1, overflow is a named integrity FAIL. Test: a manifest one byte over the cap FAILs; at the cap the absent file is reported missing.
- Guard deletion: each new guard removed alone turns its test red; restored. Focused 54/54; ruff and mypy clean; real 67d7 rerun 15/15 PASS, 28.4 s.
- No objection from the reviewer to the scope or the recompressed-snapshot binding policy.

### Round 2 — GPT (JOB review-gpt-verify-release-r2-b4e9023b1)

Base 608c01540, head b4e9023b1, cumulative SHA-256 ce2375e4…d9a375, delta 593bf1ab…dfd30c. Both digests verified; focused 54 passed. Round-1 P2 resolved; oversized PAX/GNU long-name and type-S sparse rejected. `VERDICT: BLOCKING` on one new finding:

- Fix [P1] PAX sparse (GNU 0.0/0.1/1.0) still reached tarfile's sparse-map parsing through a small PAX header on a regular member; 1.0 reads a caller-sized map before the member is yielded (~21 MB traced for ~400 KB of map, scalable). Fixed: `_BoundedTarInfo` overrides `_proc_gnusparse_00/01/10`, which `_proc_pax` calls on the header's own TarInfo before reading any map, to raise. Test: one PAX header per sparse version on `GAME_CLEAR_FINAL.state` declaring a 100,000-entry map that is never present; each FAILs `checkpoints: archive`. Guard deletion: each override removed alone turns its case red.

### Release layout (coordinator 17:28Z: final xz package)

`runs/release-staging/67d7` ships `events-67d7.tar.xz` (one member, `events.jsonl`), `raw-ram-final.json.gz` (byte copy of `00109027.json.gz`), `checkpoints-67d7.tar.xz`, the raw-RAM log as `raw-ram-67d7.jsonl.xz` (never opened), agent trace, screenshots, logs, replay, `unpack_raw_ram.py`, `SHA256SUMS`, `VERIFY.md`, plus stale unlisted `.zst`/`.jsonl.xz` copies. Changes: events may be a tar holding exactly one plain `events*.jsonl` (second member, other names, links and empty archives FAIL); discovery prefers the copy `SHA256SUMS` lists; totals name a shipped agent trace instead of saying none ships. Tests: events-in-tar for plain/gz/xz with the unsuffixed final name, event-tar member rules, listed-copy preference and listed-twice ambiguity, discovery on the real 67d7 file names. Guard deletion: each new rule removed alone turns a test red; restored. Focused 62/62; ruff and mypy clean.

Real run on the final release, `just verify-release ~/dev/pokebench/runs/release-staging/67d7` (read-only; the folder listing is identical before and after): 15/15 PASS, exit 0, 47.5 s real, 280 MB peak RSS (xz decoding the 4.3 GB event log).

### Round 3 — GPT delta check (JOB review-gpt-verify-release-r3-8be012a1a)

Base 608c01540, head 8be012a1a, cumulative SHA-256 31a25dae…77d1d, delta b02f7690…3d08. Gates on 8be012a1a: `just lint` exit 0; `just test` exit 0 (agent 3,038, viewer 1,276, env 3,183, gateway 39; floors and no-I/O proof OK). Round-2 PAX sparse resolved; listed-copy preference and event-tar rules consistent with the layout. `VERDICT: BLOCKING` on one new finding in the layout delta:

- Fix [P2] archives were detected by the substring `.tar`, so valid names such as `events.target.jsonl.gz` (read as a tar) and `raw-ram-final.target.json.gz` (not decompressed) failed. Fixed: one `_is_tar` predicate on the terminal suffix (`.tar`, `.tar.gz`, `.tar.xz`) for both paths. Test: plain/gz/xz release with `.target` in both basenames passes; predicate cases. Guard deletion: restoring the substring rule turns the test red. Focused 65/65; ruff and mypy clean. Real release rerun: 15/15 PASS.
- Gates on 52ec2dd79: `just lint` exit 0; `just test` exit 0 (agent 3,038, viewer 1,276, env 3,186, gateway 39; floors and no-I/O proof OK). Main unchanged at 608c01540.
- Round count: the two-round cap was passed at round 3 (requested by the coordinator as a layout delta check); The operator then chose a round-4 delta check (option a, relayed 17:45Z).

### Round 4 — GPT delta check (JOB review-gpt-verify-release-r4-52ec2dd79)

Scope only 8be012a1a..52ec2dd79 (tar-suffix predicate and test); delta SHA-256 e813de58…ebd6e50, cumulative context cfd9f31b…335b29e. Round-3 finding resolved: both dispatch sites use the same full-match terminal-suffix predicate. No new findings. Reviewer ran the focused file: 65 passed. Files byte-identical between 52ec2dd79 and the worklog-only head 3ae24fe90. `VERDICT: LGTM`.

### Ready-to-land summary

- Source head 52ec2dd79 (later commits are worklog-only). Base main 608c01540, unchanged.
- Gates on 52ec2dd79: `just lint` exit 0; `just test` exit 0 (agent 3,038, viewer 1,276, env 3,186, gateway 39; floors; no-I/O proof); `just verify-vendor` OK.
- Real release (`just verify-release ~/dev/pokebench/runs/release-staging/67d7`, read-only): 15/15 PASS, 47.1 s, ~300 MB peak.
- Review: GPT lane rounds 1-3 BLOCKING (5 real fixes, all applied), round 4 LGTM. Claude CLI and Grok lanes not run (not requested); self-merge would need them, so landing is the operator's call.

## Boy Scout Log

(none)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog to `docs/worklogs/2026-11-11_verify-release.md`
