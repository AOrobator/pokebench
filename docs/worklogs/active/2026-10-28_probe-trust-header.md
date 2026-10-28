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

Round 2, frozen head 06ce8ac1b:
- Fallback (sonnet): VERDICT: LGTM. Hardening note: no omit-goal ↔ recorded-no-goal test.
- Codex gpt-5.6-sol: VERDICT: BLOCKING, two points, both ACCEPTED:
  1. displayed-place-names-v1 also shapes the kept exits line, so it is added to the refusal list.
  2. Test setup did repeated whole-stream scans, and the Python feature loop made two ROM reads. Fixed: states are indexed once per replay; the walk-away test replays once and checks the noted result kept alone (still red without the all-results fix); the displayed-names behavior is tested on `places()` directly, with one real `main()` adapter call.
- Claude (opus): VERDICT: BLOCKING, B3, ACCEPTED. The probe let HarnessTrust see a result's own after-state before deriving its header, but the recorder writes that state after the wrapped tool returns. In a702, 87 headed results are first arrivals on a map, e.g. seq 1111 at T61. Fixed: events from a result's `state_seq` up to the result are observed after its header is derived. The test harness's production replay uses the recorder's order, and a new arrival test (walk whose own after-state is the first in the LAB) goes red without the fix. Rehearsal: OFF re-derived equals recorded at a702 T62, T63, T215, T332, T633, T705 and T717. Hardening noted: `seen` is the joined body, which only matters with input-cuts-v1 plus story-destinations-v1 (off in a702).

Round 3, frozen head f26a155e2 (cumulative sha256 170103b9…170e9d; delta 275db3ab…5e4e5):
- Codex gpt-5.6-sol: VERDICT: LGTM.
- Claude (opus): VERDICT: LGTM. It checked against recorder.ts that a result's after-state and its milestones are one synchronous unit after the tool returns, and that this layout predates harness-trust-v1. Removing the deferral alone turns 2 tests red.
- Fallback (sonnet): VERDICT: LGTM.
- All three lanes are LGTM on f26a155e2 (Grok out of Cursor usage; Claude+GPT+fallback roster).
- DEFERRED as non-blocking:
  - a leftover debug `console.log` in the arrival test;
  - no explicit omit-empty-goal ↔ recorded-no-goal test;
  - no direct tests for the shared or missing state_seq branches;
  - the test harness shares its deferral rule with the code under test, where a recorder-driven test would pin it.
- Open before landing: full `just test` (CPU window).

## M2 — --recorded-trim (coordinator brief 2026-10-28 02:14Z)

The plan A GPU window (10:12:02 to 10:14:21 PM) produced no samples: llama.cpp rejected every request (78–105k tokens against a 65,536-token context). The probe rebuilt the history with today's message window and never applied the run's context-token-budget-v1. At T633 it rebuilt 27 messages and 19 images, where a702 had sent 8 and 13. No earlier note or doc covers this (searched for probe-replay-context-budget: none).

- `--recorded-trim` (opt-in) uses the run's turn_start context, which the live recorder measures at the innermost context transform, after the window, budget and loop warning. The probe gives its transform chain a measuring innermost step in the same place. It then drops whole turns from the oldest, as ContextBudget does, until the request measured there has the recorded message and image counts. When no cut matches, it fails hard with every cut's measured counts. The report adds the recorder-position size and judges fidelity on it.
- a702 rehearsal (context-only), measured at the recorder position against what was recorded:
  - T633: 8 msgs / 13 imgs / ~27231 tokens vs 8 / 13 / ~27226;
  - T694: 6 / 7 / ~26670 vs 6 / 7 / ~26669;
  - T705: 11 / 7 / ~36263 vs 11 / 7 / ~36260;
  - T726: 7 / 6 / ~23811 vs 7 / 6 / ~23809.
  Each final request carries the outer transforms' one extra message, which a702's model also received. With the switches ON, the context differs only in the re-derived header messages.
- Tests: probe-recorded-trim.test.ts has 6 tests: cut, no-trim, refusal with delta, flag, report, and decisionContext integration. Removing the measuring innermost step turns the integration test red. Probe suites: 11 files, 143 passed. tsc and eslint clean.

Round 4 (M2), frozen head 5aadfe1c8 (cumulative 561a4135…e522; delta 75db6230…9ae4): Codex gpt-5.6-sol, Claude (opus) and fallback (sonnet) all VERDICT: LGTM. They confirmed:
- the measuring step sits where live.ts puts recorder.transformContext;
- the cuts match ContextBudget.fit when rest[0] is an assistant message;
- per-candidate transform calls don't change the final request;
- the flag-off path is unchanged.
DEFERRED hardening:
- the flipped arm could hit the hard failure if a switch changes message counts; the error does not name the arm;
- fidelity is true by construction on messages and images, with tokens printed but not compared;
- no idempotence or real-cut unit test with stateful transforms;
- `starts` could mirror fit exactly when rest[0] is not an assistant message.

Synced with main 45ff0b86f. The one conflict, in play-wiring.ts, came from main adding the withShownCast wrapper. Main's trust-options object is byte-identical to trustOptions(), so the call now passes trustOptions(features) inside main's wrapper. Probe suites pass 34/34.

Full gate on the synced merge tip 0d47238f6 (CPU window from the coordinator, 10:55:57 to 10:58:34 PM): `POKEBENCH_CARD_ART=~/dev/pokebench/runs/sprites/trainer-card-v1 just test` exit 0.
- agent: 331 files, 4685 tests (statements/branches/functions/lines 96.50/92.69/97.46/99.17);
- viewer: 165 files, 2157 tests (95.24/91.16/95.12/98.27);
- Python: 4466 passed (gate lines 97.49, branches 93.61, functions 100);
- claude-gateway: 89 passed (99.32/97.13);
- trainer cards: 3/3.
An earlier attempt at 10:54:31 failed before any test assertions: the merge had left the agent build output missing, so 31 suites could not import `@pokebench/agent/milestones` (all 4060 tests that did run passed). Rebuilt and reran.
Round 5 (sync re-review of 0d47238f6): Claude (opus) LGTM; fallback (sonnet) LGTM; Codex BLOCKING only because this worklog did not yet record the full gate (added above). Also removed the leftover debug console.log in the arrival test (14/14 pass, lint clean). Round 6 is Codex on that delta.

## Landing

- Round 6 (127195a54; packet sha256 4806ee70…fe9b9 on main 45ff0b86f): Codex gpt-5.6-sol, Claude (opus) and fallback (sonnet) all VERDICT: LGTM. Grok is out of Cursor usage, so the Claude+GPT+fallback roster applies.
- Landing slot 1 from 11:03 PM. Main had moved by one docs-only commit (19381bf5e), so I merged it in (19b9ed079). `git diff --binary main HEAD` still hashed to 4806ee70…fe9b9, so the branch's own change was byte-identical to the reviewed packet.
- Landed with `git merge --ff-only 19b9ed079` on local main. Not pushed.
- Post-landing `just test` on main 19b9ed079 (CPU window from the coordinator, 11:07:14 to 11:09:56 PM, POKEBENCH_CARD_ART set) exited 0:
  - agent: 331 files, 4685 tests (96.50/92.69/97.46/99.17);
  - viewer: 165 files, 2157 tests (95.24/91.16/95.12/98.27);
  - Python: 4466 passed (gate lines 97.49, branches 93.61, functions 100);
  - claude-gateway: 89 passed (99.32/97.13);
  - trainer cards: 3/3.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
