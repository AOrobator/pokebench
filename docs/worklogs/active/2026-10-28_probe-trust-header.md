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
- [x] RED tests (probe-trust-header.test.ts; test_rerender.py places)
- [x] GREEN
- [x] Targeted gates
- [ ] Review lanes
- [x] Context-only rehearsal on a702 with the switch branch merged in a scratch worktree (no GPU)

## Closing the Loop

Targeted vitest and pytest, tsc, eslint and ruff/mypy on the touched files, then a context-only a702 rehearsal before any GPU window.

## Session Log

- 2026-10-28: Context-only rehearsal (no GPU) on a scratch merge of this branch with claude/story-speaker-briefing, against a read-only prefix copy of a702 (events to turn 730, frames and raw RAM symlinked). The first pass showed the switches-OFF re-derived headers differing from the recorded ones at T633 (4 messages), because the probe passed the whole joined body as the readout. The production wrapper reads characters from the first text part, which for a walk ends before the readout's Screen line. FIXED. With the switches OFF, the re-derived headers now equal the recorded ones at T633, T664, T705 and T717. With all three ON, the header changes to Stone's Story goal from T664 on. The equivalence test now gives the production wrapper navigate_to's two parts; dropping the boundary turns it red.
- 2026-10-28: GREEN. probe suites: 10 files, 131 tests passed; test_rerender.py 12 passed (2 skip without ROM), rerender.py 100% lines and branches; tsc, eslint, ruff and mypy clean.
- 2026-10-28: RED: without the implementation, probe-trust-header.test.ts fails 8 of 8 and test_rerender.py fails 2 (the places tests); the rest pass.

## Surprises

## Multi-Model Review Log

Round 1, frozen d06b9f4db..b40e669d2 (sha256 87c27b9a…3b7d):
- Codex gpt-5.6-sol: BLOCKING, five points.
  1. The local lane's key was dropped at sampling. ACCEPTED: `probeLane` returns the endpoint key and `gatewaySampler` passes it; without a key it keeps sending the gateway key it always sent.
  2. HarnessTrust advanced only on kept results. ACCEPTED: every annotated result now advances it and only kept ones are rewritten. A synthetic walk-away test (three presses farther from MAY's LAB door) goes red without the fix.
  3. An arm annotating other tools couldn't add or remove headers. ACCEPTED as a refusal (now part of the kept-lines refusal below).
  4. The reader buffered every line before parsing. ACCEPTED: `readRunLines` parses as it reads; a test shows a malformed first line fails before a second line is pulled.
  5. Full `just test` is pending. OPEN: needs a CPU window.
- Fallback (sonnet subagent): BLOCKING, the same walk-away point as Codex 2. Hardening notes on the key and memory overlap with Codex 1 and 4.
- Claude (opus subagent): BLOCKING.
  - B1 is the same walk-away point.
  - B2: other wrappers prepend parts on press and observe (requested-movement heads, gym progress, citations, semantic navigation and more), so the first-part rule can't be reconstructed from joined text. a702 T214/T331/T332 would gain a characters line production never printed. ACCEPTED by narrowing the scope: `--trust-header` re-derives only the Story goal line and the walk-away note, which are what story switches change, and keeps the other recorded header lines verbatim. It refuses an arm that flips harness-trust-v2, semantic-navigation-v2, character-presence-v1, exit-reachability-v1, exit-labels-v3 or untalked-people-header-v1. Tests cover a stale goal line replaced to equal production, a recorded-only line kept, and the refusals; restoring the old whole-header replacement turns 3 tests red.
  - Rehearsal: OFF re-derived equals recorded at a702 T215, T332, T333, T633, T664, T705 and T717.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
