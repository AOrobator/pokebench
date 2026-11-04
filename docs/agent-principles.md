# PokeBench agent principles

> **DRAFT — pending operator review.** Drafted by an agent at the operator's request (2026-10-11) as a minimal starting point, adapted from `~/dev/local-inference-stack/docs/agent-principles.md`. Until the operator approves it, the principles self-review keeps scoring the local-inference-stack file (see `CLAUDE.md`).

**Purpose:** the judgment calls that keep PokeBench honest as a benchmark and workable as a long-running harness project. Each entry names the default, how it is enforced, and the local-inference-stack principle it descends from (`SI-Pn`), so the evidence behind it can be traced.

- **Principles** explain the judgment call.
- **Skills** (`.claude/skills/`) explain the workflow.
- **Invariants and tests** (worklog `INV-n`, gates) make the rule mechanically hard to break.
- **Worklogs and run logs** are the evidence.

## How to use this file

Read it at session start for any milestone work, and score every ID in the principles self-review (N/A with a reason is fine). For small edits, use it as a tie-breaker.

## Update protocol

The operator owns this file. Agents may **propose** an addition (pattern, principle, enforcement, evidence) in the worklog or a review synthesis; it lands only with operator approval. Deletions or softening always need the operator. Promote a lesson when the operator corrects judgment, the same mistake happens twice, or a run or review exposes a recurring blind spot.

## Principles

### A. Measuring the benchmark

### PB1. The game grades the run, not the agent

Progress is what the game state says happened: milestones from the game server's `/milestones` and parsed RAM flags (badges, location, party). The model's own claims ("I beat Roxanne", "I'm heading to Petalburg") are never progress and never drive a pass/fail verdict.

**Default action:** every reported result cites the milestone event and its step and wall-clock timestamps from the run log. A summary that only quotes the agent's narration is not a result.
**Enforcement:** the milestone split table in the viewer and run summaries is built from game-server events only (M4/M5).
**From:** SI-P44 (reality grounds the signal), SI-P18 (probe artifacts, not intent).

### PB2. Failed runs count — measure the misses

A run that crashes, loops, softlocks, blacks out repeatedly, or hits a step or token budget is a result, not noise to discard. Reporting only runs that reached a milestone is survivorship bias.

**Default action:** every launched run gets a terminal record: the furthest milestone reached, the stop reason (`milestone`, `budget`, `stuck`, `crash`, `model_error`), steps, wall time, and tokens. Report the DNF rate next to any time-to-milestone number. A stuck detector logs stuck intervals even when the agent eventually recovers.
**Enforcement:** the run log schema requires the terminal row; a run directory without one fails the summary script (M5).
**From:** SI-P45 (invisible omissions are failures), SI-P33 (gate on operational failure, don't average it).

### PB3. One run is an anecdote

Runs are stochastic. A harness change "works" only when it holds across repeated runs from the same start state.

**Default action:** claim an improvement only from N ≥ 3 runs per arm from the same save state, reporting the median, spread, and DNF count. A single good run is a hypothesis to re-run, not a verdict. Every run records the model id (from live `/v1/models`, never a hardcoded SKU), the sampling settings, the harness commit, the vendor pin, and the start state.
**Enforcement:** run metadata is written at launch and validated (M5); INV-5.
**From:** SI-P14 (a small probe is a hypothesis), SI-P19 / INV-5 (no hardcoded SKUs).

### PB4. Stay comparable: declare every advantage the harness gives the model

The aim is to measure what a local model can do *with a specialized harness*. Specialization is allowed and expected. What isn't allowed is hiding it. Anything the harness does for the model (scripted pathing, a battle subagent, puzzle solvers, extra RAM fields, save/load-state retries) must be declared, so a result says what the model did and what the harness did.

**Default action:** the vendored game server stays pristine (INV-3). Observations follow the paper convention: parsed RAM state, ASCII map, screenshot. Any extra privileged information or scripted capability is a named harness feature, listed in the run metadata, and switchable off for ablation. Never write game memory or edit a save mid-run. Never reload a save state to undo a mistake unless the run is explicitly labeled as allowing it.
**Enforcement:** `just verify-vendor`; the run metadata `harness_features` list (M5); review challenges any undeclared helper.
**From:** INV-3, SI-P3 (reviewable changes beat hidden transforms and quiet fallbacks).

### PB5. Change one thing, record the hypothesis

Harness work is experimentation. Bundling several changes into one run makes the result uninterpretable.

**Default action:** before a measured run, write the hypothesis and the single variable that changed in the worklog. After it, record the outcome against PB2/PB3 metrics, including "no effect". Keep a known-good baseline config to compare against, and bisect regressions from that baseline instead of guessing.
**Enforcement:** worklog session log entries per measured run.
**From:** SI-P2b (known-good and known-bad beat speculative fixes), SI-P6.

### B. Building the harness

### PB6. Long runs fail where short runs can't see

Coherence loss over thousands of steps is the known failure mode of coding-agent-style harnesses. Context growth, accumulated screenshots, and compaction only show their bugs late in a run.

**Default action:** images and large tool results enter model context under an explicit budget (pruning policy decided at the M5 checkpoint); old frames become references in the run log, not repeated payloads. Test compaction and memory on long runs (thousands of steps), not only on short smoke runs, before claiming they work.
**Enforcement:** a per-step context-size metric in the event stream (M4/M5); a long-run soak before M6 sign-off.
**From:** SI-P34 (large artifacts enter context as handles), SI-P14.

### PB7. A run with no event log didn't happen

Every run must be watchable live and replayable afterwards. The event log (`runs/<id>/events.jsonl`) is the record of truth: frames, button presses, thinking, tool calls with arguments and results, milestones, tokens, and latency.

**Default action:** the agent writes events before acting on them, and the viewer reads only the event log. Never debug or report a run from memory or terminal scrollback.
**Enforcement:** viewer replay of past runs (M4); the summary script reads only `events.jsonl`.
**From:** SI-P18, SI-P27 (the worklog is your memory).

### PB8. Model misbehavior is loud, bounded, and counted

Local models emit malformed tool calls, empty replies, endless reasoning, and repeated identical button presses. Quietly retrying forever turns a model failure into a slow harness hang.

**Default action:** validate every model tool call against its schema (enums and ranges, per the security review). On invalid output, re-prompt with the error a bounded number of times, log each retry as an event, and end the run with stop reason `model_error` when the bound is hit. Add no fallback branch without a run log showing the failure it handles.
**Enforcement:** schema-validated tool params (INV-4); retry counters in the event stream.
**From:** SI-P33, SI-P41 (fallback complexity needs failure evidence), SI-P15.

### C. Working in this repo

### PB9. Rock-solid-or-ask

An under-specified harness decision (what counts as "stuck", what the battle subagent may decide, what the memory keeps) gets filled with the laziest proxy if it isn't asked about. Milestones M4–M6 are operator-in-the-loop for this reason.

**Default action:** stop at each `ASK USER` checkpoint. When a review or implementation finds a hole in the spec, raise it as a question instead of picking a plausible default.
**Enforcement:** `feature-worklog` / `execute-worklog` gates; the review treats an unresolved hole as blocking.
**From:** SI-P43.

### PB10. No carve-outs, no skipped tests, no weakened gates

Gates pass or fail. An exception needs evidence and operator provenance, not a story.

**Default action:** never skip, xfail, or disable a test. Never lower a coverage floor, widen coverage excludes, or bypass the pre-commit hook (`--no-verify`). If a gate is wrong, change it openly with operator approval.
**Enforcement:** coverage gates, the wiring tests, the pre-commit hook.
**From:** SI-P29, SI-P26, SI-P45 test-gate corollary.

### PB11. Verify the pinned dependency, not your memory of it

pi-ai/pi-agent-core, the mGBA Python binding, and the continual-harness server API change between versions, and remembered shapes drift.

**Default action:** check every integration call against the source or docs at the exact pinned version, and prove it with a small test against the real pinned package before building on it.
**Enforcement:** exact version pins; contract tests against fixture payloads plus the live smoke tests (`just smoke`, `just smoke-llm`).
**From:** SI-P19, SI-P10 (replay real topology, not just mocks).

### PB12. Don't trip macOS privacy prompts silently

The ROM lives under `~/Downloads`, which is TCC-protected. A tool read there can hang on a privacy prompt the operator can't interpret.

**Default action:** touch the ROM only through `POKEBENCH_ROM` and the symlink resolver. If a step must read a protected path, tell the operator first. Never copy the ROM (INV-1).
**Enforcement:** the ROM resolver tests (M2); INV-1 hook.
**From:** SI-P36.

### PB13. Close the loop

"Done" means tests, gates, worklog, commit, and review are all updated, not just the code. Session length is never a reason to park unfinished work; the worklog carries state.

**Default action:** finish the milestone loop (RED, GREEN, gates, worklog, multi-model review) or record a real blocker in the worklog.
**Enforcement:** worklog-freshness pre-commit hook.
**From:** SI-P8, SI-P27, SI-P25 (re-review every fix).

## Deliberately not inherited

Local stack-inference principles about deployment, launchd, GPU hosts, merge queues, Beads, incident severity, and Rust-owned gates (SI-P1b, P1c, P9, P12, P13, P20, P22, P23, P28, P35, P37–P42, P46–P52) don't apply to a local research tool with no deploy. Promote one only if PokeBench evidence calls for it.
