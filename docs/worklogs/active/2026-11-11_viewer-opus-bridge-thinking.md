# Gateway thinking in CURRENT

Authorized JOB viewer-opus-bridge-thinking-20261111, relayed from the operator 20:42 ET.
Branch `codex/viewer-opus-bridge-thinking`, base `306a6e8d8`.

## Scope
Viewer-only fallback for empty recorded thinking, bound to successful session-gateway calls for the exact run. Preserve native thinking and original recordings. Match timestamps and reply; reject ambiguous/missing records. Inject transcript reads for pure tests. No shared viewer restart without the operator. Screenshot task is independent.

## Milestone
- [x] RED pure injected-reader tests committed.
- [x] GREEN implementation and focused checks.
- [ ] CPU window, full gates, headless browser proof at desktop/phone widths, trainer-card check.
- [ ] Principles, frozen Claude and GPT reviews (Grok standing waiver per job).
- [ ] Landing board, main test; report landed separately from activation.

## Evidence
Read-only example: run 1121 assistant seq 5628, turn 97, call_945; bridge launch-receipts/opus55-control-4h-20261107/bridge/calls.jsonl request 945 completes 1ms before event. Transcript call-945-1.jsonl contains a 503-character thinking block. Session also serves other runs, so run binding is mandatory.

RED: focused no-I/O suite: 1 expected failure, 9 pass; fallback remains empty under stub. COMMIT: `test(viewer): specify gateway thinking fallback` (this commit).

GREEN: 19 no-I/O tests pass (`gateway-thinking.test.ts`, `current-api-unit.test.ts`); viewer tsc and changed-file ESLint pass. Initial package links caused duplicate private types; replaced with normal offline install. Tests initially needed agent build output; copied unchanged main agent dist for cheap checks, full build pending CPU grant.
Implementation: asynchronous read-only disk adapter discovers bounded bridge manifests under runs/*/bridge, launch-receipts/*/bridge, probes/*/bridge; caches file signatures and parsed index for 5 seconds. Successful session calls must bind exact run and archive session, with event request ID + timestamp + exact reply. CURRENT has no call ID, so it binds the latest successful gateway completion at/before the snapshot timestamp and requires exact reply. Ambiguity and absent/private thinking keep native display. Raw archives and projector checkpoints never change.
COMMIT: `fix(viewer): recover gateway thinking in CURRENT responses` (this commit). Full gates, browser proof, reviews and landing pending.

Scope amendment from verify-release job relayed 20:51 ET: include released agent-trace in view-release, thinking panel and Activity History, exact turn97 screenshot; reuse broadcast request/reply mapping rather than timestamp guessing. Existing broadcast joins request==turn, unsafe for continuation offsets (97 vs945); revised implementation uses recorded call_N request and exact reply, and resolves CURRENT's thought through the original bounded recent event reader. Timestamp-only association removed.
Release RED: in-memory unpack test fails with missing bridge/calls/call-945-1.jsonl, proving agent-trace is currently ignored. COMMIT: `test(release): require gateway thinking archives in playback` (this commit). CPU grant released unused because scope changed; will re-request after cheap checks.

Revised GREEN: original event call_N + reply binding, last successful gateway attempt, session validation and terminal result parsing (same request/reply principle as broadcast). CURRENT resolves its original assistant from bounded recent source events; no temporal guessing. Shared async reader also hydrates legacy head/stream/trace-history responses. view-release now stages optional SHA256SUMS-verified agent-trace calls and a run-bound manifest, with rollback on corrupt JSON, links, duplicates or digest mismatch. Releases without traces remain supported; previously unpacked traced releases require fresh extraction.
Cheap checks: viewer focused 19 pass; release 31 pass; viewer tsc, changed-file ESLint and Ruff, release mypy and diff check pass. COMMIT: `fix(viewer): bind thinking to recorded calls and release archives` (this commit).
