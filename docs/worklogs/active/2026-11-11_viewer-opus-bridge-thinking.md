# Gateway thinking in CURRENT

Authorized JOB viewer-opus-bridge-thinking-20261111, relayed from the operator 20:42 ET.
Branch `codex/viewer-opus-bridge-thinking`, base `306a6e8d8`.

## Scope
Viewer-only fallback for empty recorded thinking, bound to successful session-gateway calls for the exact run. Preserve native thinking and original recordings. Match timestamps and reply; reject ambiguous/missing records. Inject transcript reads for pure tests. No shared viewer restart without the operator. Screenshot task is independent.

## Milestone
- [x] RED pure injected-reader tests committed.
- [ ] GREEN implementation and focused checks.
- [ ] CPU window, full gates, headless browser proof at desktop/phone widths, trainer-card check.
- [ ] Principles, frozen Claude and GPT reviews (Grok standing waiver per job).
- [ ] Landing board, main test; report landed separately from activation.

## Evidence
Read-only example: run 1121 assistant seq 5628, turn 97, call_945; bridge launch-receipts/opus55-control-4h-20261107/bridge/calls.jsonl request 945 completes 1ms before event. Transcript call-945-1.jsonl contains a 503-character thinking block. Session also serves other runs, so run binding is mandatory.

RED: focused no-I/O suite: 1 expected failure, 9 pass; fallback remains empty under stub. COMMIT: `test(viewer): specify gateway thinking fallback` (this commit).
