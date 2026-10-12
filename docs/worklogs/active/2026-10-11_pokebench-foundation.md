# Worklog: PokeBench foundation — emulator, pi wiring, viewer, first agent

**Archive Name:** `docs/worklogs/2026-10-11_pokebench-foundation.md`
**Started:** 2026-10-11 (ET)
**Current Milestone:** M2
**Phase:** implementation (M1–M3 approved to execute autonomously; M4–M6 operator-in-the-loop)

## Problem Statement

Can a local vision-language model, given a specialized harness, play Pokémon Emerald, reach the first gym (Roxanne) quickly, and eventually beat the game? Published results (PokéAgent Challenge, arXiv 2603.15563; Continual Harness, arXiv 2605.09998) cover only frontier proprietary models and RL/distillation systems. No open model has a published Emerald result. Two lessons from that work: harness architecture matters more than model size, and coding-CLI harnesses lose coherence over thousands of steps.

This worklog builds the foundation:
- the native Apple Silicon emulator with the PokéAgent game server
- pi wired to the local-inference-stack gateway
- an observability viewer, built early so every agent run is watchable
- a first minimal agent, then a specialized harness aimed at Roxanne

**Operator decisions (2026-10-11):**
- Exploratory, with no time or compute limits for now; optimize later.
- State follows the paper convention: parsed RAM state + ASCII map + screenshots. Not pixels only.
- The emulator runs natively on the Mac and must be watchable there.
- The viewer is one of the first things built.
- Coverage floor is **90%**, a project override of the global 95%.
- Multi-model review on every milestone.
- The vendored env is excluded from coverage only while unmodified.
- A dedicated `think-pokebench` inference lane is **owned by a separate agent**, not this worklog.

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md`, `.claude/skills/execute-worklog/SKILL.md` (this repo)
- `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md` (canonical review contract)
- Principles rubric: `~/dev/local-inference-stack/docs/agent-principles.md`, inherited. See ASK USER in M1.

## Architecture

```
Mac Studio (all local)
┌──────────────────────────┐  HTTP :8000   ┌───────────────────────────────────────┐
│ packages/agent (TS, pi)  │ ────────────▶ │ env: continual-harness game server     │
│  orchestrator + tools    │ ◀──────────── │  (vendored, pinned, unmodified)        │
│  event stream ───────────┼──▶ viewer     │  native mGBA 0.10.5 arm64 binding      │
└────────────┬─────────────┘   (M4)        │  ROM via symlink → $POKEBENCH_ROM      │
             │ OpenAI chat completions     └───────────────────────────────────────┘
             ▼
  http://inference.example/v1  (model id from config; think-swarm until the dedicated lane lands)
```

## Invariants

### INV-1: The ROM never enters git
**Invariant:** No `.gba`/`.gb`/`.gbc`/save file is ever staged. The ROM is referenced only through `POKEBENCH_ROM` and never copied into the repo.
**Rationale:** The ROM is copyrighted and operator-supplied (`~/Downloads/...`).
**Test Strategy:** a hook test stages a `.gba` in a temp repo and the commit is rejected; `.gitignore` covers the extensions; a ROM-resolver test proves no copy is made, only a symlink.

### INV-2: Shell out safely
**Invariant:** Every subprocess uses an argv list. Paths, including the ROM path, are untrusted input.
**Rationale:** Global convention. The real ROM path contains spaces and parentheses.
**Test Strategy:** the launcher test uses a ROM path with spaces, `;` and `$(...)` and asserts that the argv is exact and nothing gets interpreted.

### INV-3: The vendored env is pristine or it is ours
**Invariant:** `env/vendor/continual-harness` is a git submodule at pin `bbab97ad73e460b7cd7c08527d10ced30cc03fbe` with a clean tracked tree. Any behavior change lives in pokebench-owned, covered code. A fork of the vendored code moves it into coverage.
**Rationale:** Operator decision. It also keeps the milestone/anti-cheat semantics comparable to the paper.
**Test Strategy:** `just verify-vendor` fails when the submodule HEAD is not the pin or `git status --porcelain` is non-empty. A test proves it.

### INV-4: Concrete types at every boundary
**Invariant:** No `any` in TS. Gateway and game-server JSON is validated into typed values (TypeBox/pydantic) before use.
**Rationale:** Global convention.
**Test Strategy:** `tsc --noEmit` with `noImplicitAny`; a lint rule bans explicit `any`; malformed-payload tests.

### INV-5: No hardcoded model SKUs
**Invariant:** Model ids and limits come from gateway `/v1/models` discovery plus config. Image support is declared per lane in config and verified live.
**Rationale:** Backing models change; the dedicated lane will arrive later.
**Test Strategy:** discovery unit tests over fixture payloads; a live smoke test reads ids from the gateway.

### INV-6: Coverage ≥ 90%
**Invariant:** Lines, branches and functions are each ≥90% for TS app code (vitest v8) and Python app code (pytest-cov), checked at every milestone.
**Exclusions:** entrypoints, tests, the unmodified vendor submodule, and the native build script (exercised by the smoke gate).

## Security Review

- **Threat 1, a malicious ROM path or filename leads to command injection.** Mitigation: INV-2, with no shell strings.
- **Threat 2, the game server or viewer is exposed beyond localhost.** Mitigation: servers bind `127.0.0.1`; there is a test on the launcher argv.
- **Threat 3, untrusted LLM output drives tool arguments**, for example a path in save/load state. Mitigation: tool params are schema-validated enums or ranges; save-state names are restricted to `[a-z0-9_-]` inside `runs/`.

## Milestones

**M1 — Scaffold and guardrails**
- [x] `CLAUDE.md` (project rules: 90% override, inherited principles, review roster), `.claude/skills/{feature-worklog,execute-worklog}/SKILL.md`, `docs/worklogs/.gitkeep`
- [x] Write tests: pre-commit hook (in a temp repo)
  - Test: commit blocked when the active worklog is older than HEAD; allowed after a touch
  - Test: commit blocked when a `.gba`/`.sav` is staged, even with an updated worklog (INV-1)
  - Test: no active worklog means only the ROM rule applies
- [x] Write tests: TS config module (`packages/agent/src/config.ts`): parses gateway URL and model id from env, rejects invalid URLs, applies defaults
- [x] COMMIT: `test(scaffold): hook and config tests` (d168b85) (RED). vitest: 1 file fails (no config module); pytest: 14 errors (no hook)
- [x] Implement `.githooks/pre-commit`, `justfile` (`setup`, `test`, `coverage`, `lint`, `build`; `verify-rom`/`verify-vendor`/`build-mgba`/`smoke` land with M2, `dev` with M4), pnpm workspace + `packages/agent`, `env/` uv project (Python 3.11), coverage thresholds at 90
  - Adversarial deletion: disabling the asset guard → 8 hook tests red; disabling the freshness guard → 2 red; restored → 14 green
- [x] Gates: `just test` (vitest 8, pytest 14), `just lint` (tsc, eslint strictTypeChecked, ruff, ruff format, mypy strict: clean), `just build` clean, `just coverage` TS 100/100/100, Python 100% (only `__init__` so far)
- [x] COMMIT: `feat(scaffold): repo tooling, hook, config` (3f69d59) (GREEN)
- [ ] **ASK USER:** principles rubric. Keep inheriting local-inference-stack's `docs/agent-principles.md`, or will you author a PokeBench one? (Agents never author it.)
- [x] **ASK USER:** review round 3 on the R2 fix delta. Operator (2026-10-11): "u can run the review but keep in mind the production wiring test skill in local inference stack".
- [x] Wiring tests (production-wiring-tests skill), `env/tests/tooling/test_gate_wiring.py`, drive `just --dry-run`:
  - `coverage` runs pytest with `--cov --cov-branch`, then the gate on the same JSON report with `--min 90`, plus `pnpm -r coverage` → `vitest run --coverage`
  - every Python package is in coverage `source` (derived from the `*/__init__.py` enumeration plus a pinned set)
  - `setup` sets `core.hooksPath .githooks`
  - Mutation sweep (exit-code keyed, files restored byte-identical): control green; red on each of: delete gate line, floor 90→50, gate reads another report, drop `--cov-branch`, drop pnpm coverage, unmeasured package, wrong hooksPath.
  - Operational: a vitest branches threshold of 101 makes `pnpm coverage` exit 1; restored → 0.
  - COMMIT: `test(scaffold): wiring tests prove just coverage/setup reach the gates` (4343928). Gates: pytest 43, vitest 9, lint and build clean; Python coverage lines 98.65 / branches 95.83 / functions 100; TS 100.
- [x] Multi-model review loop. Closed after R4 (operator 2026-10-11: "is this just testing that you need to polish? doesnt seem like a good use of time").
  - R4 verdicts: Claude LGTM, Codex LGTM, fallback A LGTM; think_fast and think_swarm blocked on false positives, rejected with evidence (one `node` call per package is linear; exact command pinning is deliberate).
  - R3 fallback B's prose and record findings were fixed in the final commit, without a further round.
  - R1 GREEN commit: `fix(scaffold): per-metric coverage gate, portable hook mtime, doc drift` (56d2cb2).
  - Deferred (hardening): exotic config that bypasses the wiring tests (`-`/`@` justfile prefixes, `set shell`, `PYTEST_ADDOPTS`, vitest include/exclude/enabled, pytest addopts/testpaths); zipped ROM extensions; tseslint `defineConfig`; mypy over tests; Linux portability of the GNU-stat shim.

**M2 — Native emulator and game server**
- [x] Write tests (`env/tests/env`), plus a smoke orchestrator test (health wait, process exit, terminate):
  - ROM resolver: missing env → error; SHA-1 mismatch → error; match → symlink placed into the vendor ROM slot, idempotent, never a copy
  - launcher: exact argv for the server (port, `--no-ocr`, optional `--load-state`), `127.0.0.1` bind, hostile path characters (INV-2)
  - vendor check: pin mismatch or a dirty tree fails (INV-3)
  - typed client: `/health`, `/state`, `/screenshot`, `/action` parsed into dataclasses; malformed payload → error
- [x] COMMIT: `test(env): rom, launcher, vendor, client` (RED, this commit). Submodule added at pin bbab97a. Finding: the vendor `/action` queues unknown buttons (e.g. "NOPE") and reports success, so the client validates against a `Button` enum.
- Design (from the 2026-10-11 spike):
  - The vendor `main()` hardcodes `uvicorn.run(host="0.0.0.0")`. `pokebench_env.serve` wraps `uvicorn.run` to pin `127.0.0.1`, then calls the vendor `main()` unchanged.
  - The ROM reaches the server through the git-ignored `Emerald-GBAdvance/rom.gba` symlink; the vendor tree stays clean.
  - Measured runtime dependencies beyond the server's imports: opencv-python-headless, beautifulsoup4.
- [x] Add submodule `env/vendor/continual-harness` at pin; `scripts/build-mgba.sh` (0.10.5, FFmpeg on, pip `pkgconf`, installs the binding into the env venv); minimal env dependency set (not the starter kit's torch/bitsandbytes stack)
- [x] Implement `pokebench_env`: rom, vendor, launcher (prepare/spawn/launch), serve (localhost pin), client (typed, `Button` enum), smoke; `just build-mgba/verify-rom/verify-vendor/serve/smoke`; gitignored `.env` carries `POKEBENCH_ROM`
- [x] Gates: pytest 86, vitest 9, lint and build clean; Python coverage 98.42 / 95.95 / 100; TS 100
- [x] COMMIT: `feat(env): native mGBA env, localhost game server launcher, typed client, smoke` (c6301e6) (GREEN)
- [x] Smoke: `just smoke` → `SmokeReport(location='TITLE_SEQUENCE', screenshot_bytes=508, milestones_completed=['GAME_RUNNING', 'PLAYER_NAME_SET'])`; server terminated; vendor clean before and after
- [x] Visual check: `just serve` → Chrome at http://127.0.0.1:8000/stream shows the live game (NEW GAME menu) plus the starter kit's thinking/milestones/party/map panels
- [ ] Multi-model review loop until clean (R1 on 6294533..c6301e6: fallback sonnet LGTM; Codex BLOCKING, 2 accepted; think_fast/think_swarm rejected; see review log)
- [x] COMMIT: `test(env): reject undecodable screenshots, bool timestamps, raw button names` (R1 RED, f4c9e20)
- [x] COMMIT: `fix(env): decode screenshots with Pillow, reject bool timestamps and raw button names` (R1 GREEN, 31fac2a). Gates: pytest 91, lint clean, Python coverage 98.77 / 97.22 / 100
- [x] R1 fix-delta review (f1d81f4..31fac2a): Claude CLI BLOCKING (B1: non-ASCII base64 raises a plain `ValueError`, accepted); fallback fable pending
- [x] COMMIT: `test(env): non-ASCII screenshot base64 is a ClientError` (R2 RED, e71848a)
- [x] COMMIT: `fix(env): map every base64 decode failure to ClientError` (R2 GREEN, c7e4743). Gates: pytest 92, vitest 9, lint clean, Python coverage 98.77 / 97.22 / 100
- [x] Fallback fable on f1d81f4..31fac2a: BLOCKING. Accepted: post-IDAT short chunks (tRNS 1 byte, iCCP empty) leak `struct.error`/`IndexError` from `load()`, and `DecompressionBombError` escapes `Image.open`. Its third finding was B1 (already fixed).
- [x] COMMIT: `test(env): hostile PNG chunks and decompression bombs are ClientErrors` (R2b RED)

**M3 — pi ↔ local gateway**
- [ ] Write tests (`packages/agent`):
  - discovery: `/v1/models` fixture → pi `Model` objects (contextWindow/maxTokens from payload, image input only for lanes configured as vision); unknown/malformed → typed error
  - a tool returning `ImageContent` is serialized for `openai-completions`
  - reasoning content across a tool-call turn is preserved (pi compat setting verified against the pi-ai source)
- [ ] COMMIT: `test(agent): gateway discovery and multimodal tool round trip` (RED)
- [ ] Implement the provider + `@mariozechner/pi-ai`/`pi-agent-core` pinned exact (0.73.1 at time of writing)
- [ ] Gates: vitest + coverage ≥90, tsc, eslint
- [ ] COMMIT: `feat(agent): local gateway provider for pi` (GREEN)
- [ ] Live smoke (`just smoke-llm`): agent-core loop calls a `screenshot` tool against the running game server, the model describes the real frame, and a second tool call completes
- [ ] Multi-model review loop until clean
- [ ] **STOP — report to operator before M4**

**M4 — Viewer (agent o11y)** *(operator-in-the-loop)*
- [ ] **ASK USER:** design checkpoint. Layout, stack (web app on localhost), the event schema it consumes.
- Outline: live frame, button-press timeline, streaming thinking, tool calls with arguments/results, milestone splits, tokens/latency per step. Replay of a past run from `runs/<id>/events.jsonl`.

**M5 — Minimal agent** *(operator-in-the-loop)*
- [ ] **ASK USER:** harness checkpoint. agent-core vs coding-agent SDK; tool set; image pruning policy.
- Outline: observe→act loop with state/map/screenshot/press/navigate tools on think-swarm; persisted event log; first measured run against the milestones.

**M6 — Specialized harness → Roxanne** *(operator-in-the-loop)*
- [ ] **ASK USER:** plan checkpoint after the M5 failure-mode analysis.
- Outline: orchestrator with objectives, stuck detection, battle/puzzle subagents, memory, compaction tuned for long runs; target the STONE_BADGE milestone.

**Out of scope (later worklogs):** the dedicated `think-pokebench` lane (another agent), gyms 2+, the full game, the cross-model scorecard, leaderboard submission.

## Closing the Loop
- [ ] `just test`, `just lint`, `just build` green; `just coverage` ≥90 on both stacks
- [ ] `just verify-vendor` and `just verify-rom` green
- [ ] `just smoke` + `just smoke-llm` green against the real ROM and gateway
- [ ] Operator watches a live run in the viewer (M4+)

## Session Log
- 2026-10-11 ~17:55 ET: usage limit reached during the M2 review round (one round, proportional to risk). Fallback reviewer (sonnet): LGTM, with hardening: smoke passes against a stale server already on the port; brew-missing message; http scheme check. Still pending: Claude CLI, think_fast, think_swarm, Codex (artifacts in the session scratchpad `review/m2/`) and fallback (fable). **Resume:** rerun the M2 review lanes on 6294533..c6301e6, then start M3. pi 0.73.1's openai-completions provider already reads llama.cpp `reasoning_content`.
- 2026-10-11: Research + kickoff discussion. Spike: mGBA 0.10.5 binding builds natively (FFmpeg required, or the import fails on EReader symbols); Emerald ran at ~4,350 fps headless. ROM SHA-1 verified. Repo initialized (`746a785`). Worklog written; operator approved M1–M3.

## Surprises
- mGBA's Python binding needs `USE_FFMPEG=ON`: with it off, `_pylib` references EReader symbols that are compiled out.
- The starter kit's game server hardcodes the ROM at `Emerald-GBAdvance/rom.gba` relative to cwd, so a symlink is used (the path is git-ignored upstream).
- Reviewer availability at kickoff: Codex logged in; Cursor CLI needs `agent login`; the `~/.claude-review` profile is logged out.

## Multi-Model Review Log
| Milestone | Round | Principles | Claude-family | think_fast | think_swarm | Grok lane | GPT lane | Result |
|---|---|---|---|---|---|---|---|---|
| M1 | R1 (746a785..3f69d59, diff sha256 ec36e28b…89db) | 0 FAIL (P36, P8 rows corrected after review) | Claude CLI (default profile; `~/.claude-review` logged out): LGTM | BLOCKING (test seeds asset via hooksPath=/dev/null) | LGTM | Cursor unavailable (not logged in) → subagent fallback A (sonnet): LGTM; B (fable): LGTM | Codex isolated (gpt-6-astra): BLOCKING (Python coverage gate is aggregate; branches/functions not independently enforced) | fix batch R1 |
| M1 | R2 fix delta (3f69d59..56d2cb2, sha256 12d23ec5…e7bd) | 0 FAIL (P36→N/A, P8, P41 rows) | Claude CLI: LGTM | BLOCKING (false positives, see synthesis) | BLOCKING (rejected; self-contradicting output) | fallback A (sonnet): LGTM; B (fable): LGTM | Codex: BLOCKING (function coverage inferred from a line proxy) | fix batch R2 |
| M1 | R3 (56d2cb2..4343928, sha256 ccef0ebf…9062) | 0 FAIL | Claude CLI: BLOCKING (worklog missing 2597b9c/4343928 records) | BLOCKING (rejected: one glob + one TOML read is not superlinear) | BLOCKING (rejected: exact-line pinning addresses brittleness; operator-directed tests are not scope expansion) | fallback A (sonnet): BLOCKING (6 mutation survivors: prefix-matched commands, vitest thresholds, omit, setup installs); B (fable): pending | Codex: LGTM | fix batch R3 |
| M2 | R1 (6294533..c6301e6) | 0 FAIL | Claude CLI: FAILED (rc=1, empty stderr), re-run on the fix delta | BLOCKING (rejected) | BLOCKING (rejected) | fallback A (sonnet): LGTM; B (fable): cut off by usage limit | Codex: BLOCKING (2 accepted) | fix batch R1 |

**M2 R1 synthesis.** Accepted (Codex):
- `_png_size` read only the IHDR header, so a header-only PNG passed and a short IHDR leaked `struct.error`. Screenshots are now decoded with Pillow, and failures raise `ClientError`.
- A boolean milestone timestamp became `1.0`. Booleans are now rejected.
- Hardening: the raw-name button test now goes through `GameClient.press` and asserts that no request was sent. Invalid base64 raises `ClientError`.

Rejected (think_fast/think_swarm): "monkeypatching uvicorn mutates global state" (intended, and pinned by the `run()` test); "`prepare` has two responsibilities" (check and link are a single precondition); "smoke is not a unit test" (it is the end-to-end gate, and its orchestrator is unit-tested); "unneeded dependencies" (opencv and bs4 were measured as required by server imports).

Deferred (fallback sonnet hardening): smoke would pass against a stale server already on port 8765; build-mgba gives no message when `brew` is missing; `http_transport` has no scheme check.

**M1 R2 synthesis.** Accepted:
- Codex: functions with zero statements (e.g. docstring-only) are no longer counted. The line proxy is otherwise sound because `ruff format --check` rules out one-line `def` bodies.
- Fallback A hardening, both cheap and inside the gate: reject a NaN or out-of-range `--min`; fail a report that measured no statements (a vacuous pass).

Rejected:
- think_swarm: "deletion test fails". The hook filters `ACMR`, and the test passes (34/34).
- think_fast: "`stat $args` breaks on spaces". `$1` is quoted, and the repo-with-spaces suite passes.
- think_fast: "per-file floors". INV-6 sets per-stack floors, matching vitest's global thresholds, so per-file floors are scope expansion.

Fix batch R2: RED `6c01cd7`, GREEN `2597b9c`.
- Gates: pytest 39, vitest 9, lint clean.
- Coverage: Python lines 98.65, branches 95.83, functions 100.
- Adversarial deletion: dropping the zero-statement skip, the empty-report check, or the floor validation turns 1/1/3 gate tests red.

**M1 R3 synthesis.** Accepted:
- Claude B1: the worklog records for 2597b9c and 4343928 were missing.
- Fallback A: the wiring tests only matched command prefixes. They now pin the full `just --dry-run` output for `coverage` and `setup`, check that the gate reads pytest's report, evaluate the real vitest config with `node` (provider v8, all four thresholds = 90), and require that coverage `run` has exactly `source` + `branch` (no `omit`/`include`).
- Mutation sweep (17 + control, exit-code keyed, files restored byte-identical): every mutation red, including `|| true` on the pytest/pnpm/gate lines, `-k zzz`, `--no-cov`, vitest thresholds lowered or removed, `omit`, and dropped setup installs.
- Hardening (Claude, B): one `just` call per module via a fixture; dead `{"tests"}` filter removed; `local args`; CLAUDE.md lists `pokebench_gates` and marks M2 paths; principles rows P1/P8/P11/P26/P30/P45 refreshed.

Fix batch R3 gates: pytest 44, vitest 9, lint and build clean.
- Coverage: Python lines 98.65 / branches 95.83 / functions 100; TS 100.
- `just coverage` was not re-run before 4343928 was recorded. Re-running it at the R3 fix head gave identical figures.

Environment note: hook tests vary from 0.5 to 24 s per test under machine load (a concurrent local-inference-stack llvm-cov landing gate, load average about 10–12). A bare `stat` loop is unaffected; the cost is git process spawns.

**Process note:** R1 and R2 both raised new blockers. Per multi-model-review, round 3 needs operator scope confirmation (ASK USER below).

**M1 R1 synthesis.** Accepted:
- Codex: per-metric Python coverage gate (lines, branches and functions each ≥90).
- Claude and fallback reviewer A: the hook's `stat` fallback breaks under GNU stat; reproduced with a PATH shim.
- think_fast: seed fixture assets before the hook is installed instead of disabling it.
- Test gaps (Claude, A): rename into an asset name, first commit with a worklog, two worklogs where the freshest decides, https and game-server trailing slash, isolated global git config, `utime` instead of sleep.
- Principles corrections (Claude): P36 (`~/Downloads` *is* privacy-protected by macOS TCC, the Transparency, Consent and Control framework; M1 reads nothing there → N/A; M2 must handle it), and P8 wording.
- Doc drift (Claude): CLAUDE.md asset list and commands not yet available.

Rejected as false positives:
- think_swarm "hook test depends on the source repo": testing the real hook is the point.
- think_swarm "unanchored regex": the pattern ends with `$`.
- think_swarm "verify-vendor scope expansion": the skill says "once the submodule exists".

Fix batch R1: RED `d49b7b3`. GREEN adds:
- `pokebench_gates.coverage_gate`, which enforces lines, branches and functions independently and replaces the aggregate `fail_under`
- a hook `mtime()` that tries BSD then GNU stat and discards a failed attempt's output
- CLAUDE.md drift fixes

Gates: pytest 34, vitest 9, lint clean, build clean. Coverage: TypeScript 100/100/100; Python lines 98.48, branches 94.44, functions 100.

Adversarial deletion: skipping the branches/functions/lines check fails 3/2/1 gate tests; restoring the old `stat … || stat …` fallback fails both GNU-shim tests. A speculative integer validation was removed after tests showed it unobservable (P29).

Deferred (HARDENING): zipped ROM extensions (.zip/.7z) and .srm. Speculation not acted on: config trimming, credentials echoed in URL errors.

- M2: `ruff format .` (run from env/) reformatted 107 vendor files before `vendor` was excluded. The submodule was restored with `git checkout -- .` and verified clean; ruff now has `extend-exclude = ["vendor"]`.
- M2: the vendor server restores cached run data and checkpoint metrics from earlier runs by default (smoke reported `PLAYER_NAME_SET` without reaching it). Benchmark runs need isolation, likely `LOAD_CHECKPOINT_MODE=false` plus a per-run data dir; to settle in M5.

## Boy Scout Log

## Archive Milestone
- [ ] **ASK USER:** ready to archive? Then move this body to the Archive Name and remove the root `WORKLOG.md` pointer.
