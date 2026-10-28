# Decision probes: re-derived trust header, local lanes, streamed logs

## Problem Statement

The a702 Dewford switches (self-named-speaker-v1, retire-reached-story-line-v1; branch claude/story-speaker-briefing) change harness-trust-v1's result header. `just probe-decision` can't measure them, for three reasons:
1. The header is baked into each recorded tool result. The probe re-derives only readouts, press lines and the loop and stall briefings, so flipping these switches leaves the context unchanged. A context-only run at a702 T633 reported "differs in: nothing".
2. The CLI discovers models only through the inference gateway. It ignores `POKEBENCH_ENDPOINT_FILE`, which the GPU1 fixed-run lane (:[local inference port]) uses.
3. It reads `events.jsonl` as one string. a702's log is over Node's 512 MB string limit.

Coordinator brief (2026-10-28 01:00Z, for the operator's thread "Why Qwen bundle struggles reaching Dewford"): build this as a separate change. Default behavior is unchanged, with targeted tests and the usual review.

## Skills Loaded

pokebench-decision-probes, feature-worklog, close-the-loop.

## Architecture

- `--trust-header` (off by default) passes `trustHeader` into `decisionContext`. `rederiveTrustHeaders` replays the recorded events through `HarnessTrust`, using the arm's `trustOptions(features)` (factored out of play-wiring; the same object the production wiring passes). For each kept result whose recorded text starts with the trust header, it replaces everything before the first blank line with the header and walk-away note the production wrapper would print for that arm, and keeps the body. It refuses unless harness-trust-v1 is on in both the run and the arm, and unless a map-table port exists.
- Map table: `ProbePorts.places(ref, features)`. The file port runs `pokebench_env.rerender` with an optional `"places"` archive, which outputs the `PlaceDirectory` table as GET /pokebench/places would serve it, honoring displayed-place-names-v1. Without `"places"` the output is unchanged.
- Local lanes: `probeModels(config)` uses `readEndpoint` and `discoverLocal`, the same functions live runs use, when `POKEBENCH_ENDPOINT_FILE` is set; otherwise it uses the gateway.
- Streaming: `readRun` reads events line by line, through `parseRunLines`, the same parse as `parseRun`.

## Invariants

- INV-1: without `--trust-header` and without an endpoint file, the probe's contexts and model selection are unchanged. Existing decision-probe tests pass unchanged, and `parseArgs` output omits the new key unless the flag is given.
- INV-2: the re-derived header equals what `withHarnessTrust` prints for the same events. A test compares the probe output byte-for-byte with the production wrapper on 4caa T273.

## Security Review

`rerender.py` validates the new `places` ref like `raw_ram`: a relative path inside the run directory. Subprocesses use argv lists. No network change beyond selecting a local endpoint the operator configured.

## Milestones

**M1 — probe header, local lanes, streaming**
- [ ] RED tests (probe-trust-header.test.ts; test_rerender.py places)
- [ ] GREEN
- [ ] Targeted gates
- [ ] Review lanes
- [ ] Context-only rehearsal on a702 with the switch branch merged in a scratch worktree (no GPU)

## Closing the Loop

Targeted vitest and pytest, tsc, eslint and ruff/mypy on the touched files, then a context-only a702 rehearsal before any GPU window.

## Session Log

- 2026-10-28: RED: without the implementation, probe-trust-header.test.ts fails 8 of 8 and test_rerender.py fails 2 (the places tests); the rest pass.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
