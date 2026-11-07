# Model stream log

## Problem Statement

HyperQwen (qwen3.8-27b on vLLM 0.31, `--tool-strict-level parameter`) has 40 replies across 13 Qwen runs that hit max_tokens 8192 with under 3000 visible characters. All 40 are one zero-argument `observe` call. The visible text and tool call stream in the first 1-3 seconds, then 20-45 seconds of generation never reaches pi-ai. The raw stream is not logged, so the cause is unknown (example: `runs/2026-11-06T10-33-12_rayquaza-lane-qwen_aeb8` turn 47).

Goal: record enough of the raw provider stream to see what those hidden tokens are. The operator approved this through the coordinator on 2026-11-07. Live runs 37ca and 6056 stay on their pins.

## Skills Loaded

execute-worklog, feature-worklog, feature-switch, agent-observability, close-the-loop, talk-to-codex.

## Architecture

- `packages/agent/src/model-stream.ts`: pure. `StreamAccount` parses the SSE bytes and counts every delta field, including what pi-ai ignores. `ModelStreamLog` wraps `fetch`, clones the response of the model's chat-completions POST, and joins the stream's account with the recorder's `assistant` event for the same turn.
- pi-ai builds its own OpenAI client with no fetch option and no chunk hook, so the only seam is the global `fetch` the client reads at construction. `live.ts` (the thin entrypoint) installs the wrapper for the play run. The wrapper passes its arguments through untouched and returns the original response; it reads a clone.
- One `model_stream` event per reply. Full raw stream only when a reply's output tokens reach one per visible non-blank character, at least 512 tokens: `runs/<id>/model-stream/turn-<turn>-<n>.jsonl.gz`, each network read as `{ms,text}`.

## Switch decision

No switch. The feature-switch skill exempts "a measurement feature" and "a fix to recording or grading that the model never sees"; nothing here changes the request, the response pi-ai reads, or what the model sees. It is a recorder event, like `guide_purchase_missed`, so it needs no `measured()` registry entry either.

## Invariants

- INV-1: request bytes never change. The wrapper hands `fetch` the same input and init objects. Test: identity assertions.
- INV-2: pi-ai reads the original response. Test: the response object returned is the one `fetch` gave, with its whole body intact.
- INV-3: logging can never break a run. A parse, read, record or save failure is contained. Test: malformed frames, a failing reader, throwing save and record ports.
- INV-4: bounded on disk. Per reply cap `RAW_CAP_BYTES`, per run cap `RAW_FILE_CAP`, raw written only over the ratio threshold. Test: each cap.
- INV-5: nothing here reaches the model. Only `recorder.recordModelStream`; no transform or context hook.

## Security Review

The raw stream holds model output only, in the gitignored run directory. Authorization is in request headers, which are never read. The raw file name comes from the turn number and a counter, not from stream content.

## Milestones

**M1: log the raw stream**
- [x] Write tests
- [x] COMMIT: `test(agent): the raw model stream log (RED)` (a2afddd82)
- [x] Implement, wire into live.ts, viewer row, tail line, schema
- [x] Cheap checks: agent and viewer `tsc --noEmit`, eslint on changed files, model-stream 31/31, events, trace and panels tests pass; model-stream.ts 98% lines, 96% branches. Deleted once and watched go red, then restored: returning a clone, the run cap, the reply cap, the save containment, the token minimum, the URL filter.
- [x] Full gates in the window the coordinator granted (2026-11-07 2:17 AM New York time): `just test` passed: agent 2776 tests, viewer 1235, env 3051, gateway 38, `no-io-proof` OK, every floor held (agent 67.88 lines / 58.74 branches / 61.72 functions / 62.5 statements; viewer 42.36 / 44.2 / 46.91 / 41.7). `just lint`: agent and viewer pass; env mypy first failed only on the missing native mGBA binding in the fresh worktree venv, and passed (144 files) once it was copied from the main venv, then the gateway ruff and mypy steps passed. `just verify-vendor` first failed on the uninitialized submodule, and passed after `git submodule update --init`.
- [x] COMMIT: `feat(agent): record the raw model stream beside each reply` (ba9190bbf)
- [ ] Review
- [ ] Land

## Closing the Loop

Offline rehearsal only: replay a production-shaped SSE stream through `ModelStreamLog` and pi-ai's real provider against an in-memory fetch. No run is launched and the vLLM server is not touched.

## Session Log

- 2026-11-07: worklog written, worktree `/private/tmp/pb-stream-log`, branch `claude/model-stream-log`.

## Surprises

- A fresh worktree's `just lint` and `just verify-vendor` fail on setup, not code: copy `mgba` into the worktree venv and init the submodule first.
- A viewer built before this lands cannot read `model_stream`; any run from a newer pin needs `just viewer-main` first (already the rule in CLAUDE.md). Live runs keep their pins.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER
