# Worklog: PokeBench foundation — emulator, pi wiring, viewer, first agent

**Archive Name:** `docs/worklogs/2026-10-11_pokebench-foundation.md`
**Started:** 2026-10-11 (ET)
**Current Milestone:** M4 (awaiting the operator's design checkpoint)
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
**Rationale:** The ROM is copyrighted and operator-supplied. It lives at `~/.roms/pokemon-emerald.gba` (moved from `~/Downloads` 2026-10-11, operator decision; SHA-1 re-verified).
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

### INV-7: Every run is isolated
**Invariant:** A run never reads or writes state belonging to another run: no shared cache, map, milestone, metrics, log or save files, and no reuse of another run's game server. *(operator 2026-10-11: "each run should be it's own thing that's an invariant. i dont want u crossing wires ever. that will mess up comparisons and benchmarks.")*
**Why:** cross-run state silently corrupts comparisons and benchmarks (PB3).
**Enforcement (M4):** each run gets its own game server process with its own working directory under `runs/<id>/` (the vendor writes `.pokeagent_cache/`, `run_data/`, `llm_logs/`, `backups/` and root-level fallbacks relative to cwd), `RUN_DATA_ID=<run id>`, and `LOAD_CHECKPOINT_MODE=false`. Tests prove that two runs, including two started in the same second, share no written path, and that the vendor checkout is unchanged after a run.

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
- [x] **ASK USER:** principles rubric. Operator (2026-10-11): a separate, minimal PokeBench file inspired by local-inference-stack, tailored to this task. Agent drafted it at the operator's request; operator reviewed and approved → `docs/agent-principles.md` (PB1–PB13). CLAUDE.md and `execute-worklog` now score it.
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
- [x] COMMIT: `test(env): hostile PNG chunks and decompression bombs are ClientErrors` (R2b RED, e51b1f8)
- [x] COMMIT: `fix(env): map every Pillow decode failure to ClientError, size-check before load` (R2b GREEN). Gates: pytest 95, ruff/mypy clean, Python coverage 98.77 / 97.30 / 100. Review closed per the proportional-review rule (memory: one round per milestone, fix real defects, defer polish): the fix-delta reviewers' findings are all fixed and pinned by tests. Deferred hardening: smoke vs a stale server on its port, `brew` check, transport scheme check.
- [x] Multi-model review loop (M2): closed

**M2.5 — Spectator audio + window-fit view** *(operator 2026-10-11: "ok go for it, get audio working")*
- Context (research, same day): the headless mGBA core already mixes full stereo PCM; nobody reads it. `mgba.audio.StereoBuffer` (`available`/`read`/`set_rate`) hangs off `core.get_audio_channels()`; probe on the real ROM drained 2.89M samples over 900 boot frames, peak 9687/32767. Calibration: raw rate ≈95.9k, `set_rate(48000)` measured 47932 Hz over 10.05 s game time. `set_rate` is a `blip_set_rates` ratio setter — cheap, no resampler state reset.
- Design (INV-3 clean): `pokebench_env/audio.py` patches only Emerald lifecycle (`initialize` attaches an mGBA native frame callback; `load_state` flushes). PCM reads occur in the frame callback in the frame owner's thread, not in HTTP/browser handlers. The lock-guarded tape retains at most 24000 stereo frames (0.5 s at 48 kHz); independent non-consuming readers receive up to 12000 latest frames, dropping stale backlog. `serve.run` installs `/audio.wav`, `/view`, and `/spectator.js` before vendor main. `/view` scales the pristine `/stream` iframe and has a client-local mute button. Covered TS `AudioFollower` compiles via `just build`; `just serve` builds it first. Polling every 100 ms replaces the one active source; PCM/wall-time varispeed is clamped 0.25–8×, intentionally shifts pitch, and never queues unlimited 1× sound. Mute/disconnect/hide stop playback; lifecycle flushes and generation guards prevent old-core audio. Audio failures do not propagate into emulation.
- [x] Tests: tape bounds/drop-oldest/absolute cursors/WAV fields; native callback/lifecycle isolation; production serve ASGI routes/validation/local bind; TS mute/unlock, varispeed, pause, disconnect, in-flight cancellation; real-ROM two-reader smoke
- [x] RED commits: d49e3a7, e256585, fd7dfd3, 655ff16 (separate vertical slices)
- [x] Implement audio.py + view.py + covered spectator.ts; wire serve; no vendor changes
- [x] Gates: test/lint/build/coverage ≥90, verify-vendor and verify-rom clean (see Session Log)
- [ ] E2E acceptance: real-ROM nonzero PCM and endpoints are proven; parent must verify browser rendering, real Web Audio playback/mute, and operator hearing
- [ ] Canonical multi-model review (parent-owned; not yet run)
- [x] GREEN slices: 06db9bb, dca4dcb, 09f881d, final routes GREEN recorded in Session Log

**M3 — pi ↔ local gateway** *(M3 of record: branch `m3-agent-provider`, worktree `../pokebench-m3`; built in parallel with M2. Main's duplicate M3 was reverted in 465b704.)*
- [x] Write tests (`packages/agent`):
  - discovery: `/v1/models` fixture → pi `Model` objects (contextWindow/maxTokens from payload, image input only for lanes configured as vision); unknown/malformed → typed error
  - a tool returning `ImageContent` is serialized for `openai-completions`
  - reasoning content across a tool-call turn is preserved (pi compat setting verified against the pi-ai source)
  - `gateway.test.ts`: fixture is the live `/v1/models` payload captured 2026-10-11 (`src/fixtures/gateway-models.json`); malformed payloads, HTTP/JSON/network errors, a configured vision lane the gateway reports text-only → `GatewayDiscoveryError`
  - `provider.test.ts`: a fake gateway (node `http`, SSE) driven by pi-agent-core `runAgentLoop`; asserts the second request's wire body (`image_url` data URL, `reasoning_content` replay, `chat_template_kwargs.preserve_thinking`, `system` role, `max_tokens`, no `store`/`reasoning_effort`), and that a non-vision lane never receives image bytes
  - `config.test.ts`: `POKEBENCH_VISION_MODELS` (default `think-swarm`, comma list, blank entries rejected)
- [x] COMMIT: `test(agent): gateway discovery and multimodal tool round trip` (54e812d) (RED). vitest: gateway/provider files fail to import; config 4 failing / 9 passing
- Design (from reading pi-ai 0.73.1 `providers/openai-completions.js` and the local stack Qwen chat template):
  - pi replays a thinking block under the field it streamed from (`thinkingSignature = "reasoning_content"`), so llama.cpp gets `reasoning_content` back on the assistant message.
  - pi moves tool-result images into a synthetic user message ("Attached image(s) from tool result:"). The Qwen template treats that as a new user query and drops earlier `reasoning_content` unless `preserve_thinking` is on. So the gateway compat uses `thinkingFormat: "qwen-chat-template"`, which sends `chat_template_kwargs: { enable_thinking, preserve_thinking: true }`. The wire shape (the flag and the reasoning replay) is asserted by `provider.test.ts` against a fake gateway; `just smoke-llm` exercises the path live end-to-end (a template that rejected the payload would error or derail the loop) but does not assert that the deployed template honored earlier reasoning — that would need a behavioral probe, deferred to M5's harness work.
  - Gateway compat: no `developer` role, no `store`, `max_tokens` field, no `reasoning_effort`.
- [x] Implement the provider + `@mariozechner/pi-ai`/`pi-agent-core` pinned exact (0.73.1 at time of writing); `typebox` 1.3.36 pinned exact (the version pi-ai resolves)
  - `src/gateway.ts`: `discoverModels` (TypeBox-validated `/v1/models` → pi `Model<"openai-completions">`), `selectModel`, `GATEWAY_COMPAT`
  - `src/provider.ts`: `gatewayLoopConfig(model, thinking)` for pi-agent-core (placeholder API key, `maxTokens` from discovery, `reasoning` unless off)
  - `src/config.ts`: `visionModels` from `POKEBENCH_VISION_MODELS`
  - Adversarial deletion: dropping the qwen thinking format, thinking-as-text, vision for every lane, `max_completion_tokens`, `developer` role, or the duplicate-id check turns 1/1/2/2/2/1 tests red; restored → 39 green
- [x] Gates: vitest 39 passed; coverage statements 100 / branches 97.67 / functions 100 / lines 100; tsc + eslint clean; build clean. (`just test` pytest still errors on collection here: that is M2's RED, whose implementation lives uncommitted on main.)
- [x] COMMIT: `feat(agent): local gateway provider for pi` (2bab6dd) (GREEN)
- [x] Live smoke (`just smoke-llm`): agent-core loop calls a `screenshot` tool against the running game server, the model describes the real frame, and a second tool call completes
  - `packages/agent/src/smoke.ts` (entrypoint, vitest-excluded per INV-6): refuses to run if a server is already healthy on the port (M2 review hardening: no passing against a stale server — proven live on a stale main-worktree server), else spawns its own `python -m pokebench_env.launcher` (argv list, INV-2), waits on `/health`, runs `runAgentLoop` with `screenshot` + `state` tools (TypeBox-validated responses, INV-4), asserts: both tool results present and not errors, and ≥2 non-empty assistant texts, printed before asserting so failures are diagnosable. 420 s loop abort via `AbortController`.
  - `just smoke-llm: build` → `node packages/agent/dist/smoke.js`.
  - Attempt 1 failed as designed (stale server on :8000). Attempt 2: loop ended after the frame description without the second call — the loop terminates on any tool-call-free assistant message, so the description must ride in the *same* message as the second tool call; PROMPT rewritten to that protocol.
  - GREEN: `tool calls: screenshot, state`; model: "green, foliage-filled screen with the words 'GAME REAK' in the center" (the GAME FREAK title screen, read honestly); `DONE TITLE_SEQUENCE` matching `/state`.
- Port from main's duplicate M3 (operator 2026-10-11: "u can keep the worthwhile ideas from your implementation"; main's copy was reverted in 465b704):
  - Vision comes from the gateway's reported capabilities (`multimodal`). `POKEBENCH_VISION_MODELS` only fills in for lanes that report nothing, and its default is now empty. Before this, think-fast and think-longctx (multimodal per the gateway) ran text-only.
  - Tools, frame validation (PNG, 240x160) and the pass/fail check move out of the coverage-excluded `smoke.ts` into a covered `game-tools.ts`. Only process spawning and the loop wiring stay in the entrypoint.
- [x] COMMIT: `test(agent): gateway-reported vision, covered game tools and smoke check` (port RED, 3a18c5f)
- [x] Implement: `gateway.ts` vision precedence, `game-tools.ts` (`serverHealthy`, `screenshotTool` with PNG/240x160 check, `stateTool`, `checkSmoke`), `smoke.ts` down to 125 lines of wiring. Bug found live: `smoke.ts` sent SIGTERM only to the launcher, which doesn't forward it, so every smoke orphaned its `pokebench_env.serve` child (PPID 1, still holding the port and stdout). The fix spawns the launcher in its own process group and signals the group. Follow-up for M5's run supervisor: the launcher itself should handle SIGTERM.
- [x] Gates: vitest 54; TS coverage 100 statements / 98.55 branches / 100 functions / 100 lines; tsc, eslint, build clean
- [x] Live smoke (2026-10-11 ~20:55 ET, own server on :8011, vision from the gateway's report with `POKEBENCH_VISION_MODELS` unset): `tool: screenshot` → "The current frame is completely black." (early boot) → `tool: state` → `DONE TITLE_SEQUENCE`; `smoke-llm OK`; no server left on :8011
- [x] COMMIT: `feat(agent): vision from gateway capabilities, covered game tools, no orphaned server` (port GREEN)
- [x] M3 review R1 (465b704..98a89f3, packet sha256 b9f143c3…802b; principles PB1–PB13: 0 FAIL): Claude CLI LGTM; Codex BLOCKING, accepted: `checkSmoke` ignores an assistant turn that ended in `error`/`aborted`, so a failed final turn after two good texts passed (reproduced with the pinned `runAgentLoop`). think_fast BLOCKING, rejected: claims `controller.signal` is mispositioned, but pi-agent-core 0.73.1's `runAgentLoop(prompts, context, config, emit, signal?, streamFn?)` takes it 5th, as passed. think_swarm BLOCKING, rejected: claims gateway `multimodal` is dropped when `visionModels` is empty, which the test "takes vision from the capabilities the gateway reports" disproves. Its other items are scope/hardening/speculation.
- [x] COMMIT: `test(agent): smoke check rejects errored or aborted model turns` (R1 RED, 5ad6e14)
- [x] COMMIT: `fix(agent): smoke check fails on errored or aborted model turns` (R1 GREEN). Gates: vitest 56; TS coverage 100 / 97.36 / 100 / 100; tsc/eslint/build clean
- [x] COMMIT: R1 GREEN is 1a68a3d. Fix-delta re-check (98a89f3..1a68a3d): Codex LGTM (24 adversarial probes; removing the guard breaks them and restoring it fixes them). Deferred hardening: regression cases for nonterminal failures and `errorMessage` formatting.
- [x] Multi-model review loop: closed (one round plus a fix-delta check, per the proportional-review rule)
- [x] **STOP — report to operator before M4** (2026-10-11 ~21:20 ET). The branch merges into main without conflicts; landing it is the operator's call.

**M4 — Run event log (agent o11y foundation)** *(operator-in-the-loop; rescoped 2026-10-11, operator: "rewrite m4 that way, own viewer after m5")*
- Context: the starter kit's `/stream` page already shows the live frame (websocket), a thinking panel fed by `POST /agent_step` (SSE, plain text, last 20 messages), recent actions, milestones, party, map and metrics. It has no structured tool calls, no per-step tokens or latency, and no replay, and it logs into the vendor `run_data/` (the cross-run bleed seen in M2). It can't be edited (INV-3).
- Scope: the event schema (typed; turn start/end, thinking, tool call with arguments, tool result, button press, milestone from the game server, tokens and latency, terminal stop record per PB2) and a writer to `runs/<id>/events.jsonl`. Events are written before they are acted on (PB7). Run metadata: model id from discovery, sampling settings, harness commit, vendor pin, start state (PB3). The pi-agent-core event stream is the source.
- [x] **ASK USER:** mirror into the starter kit's `/stream` thinking panel? Operator 2026-10-11: "agreed, skip it". There is no integration. During M5, runs are watched via `/stream` (frame, map, party, milestones) plus a formatted terminal tail of `events.jsonl`. If that proves too painful, pull M5.5 forward rather than pipe into their page.
- [x] **ASK USER:** schema checkpoint. Operator 2026-10-11 approved the draft: thinking stored as a full block per assistant message; every screenshot saved as `frames/<seq>.png` under a 500 MB disk cap on frames; `/milestones` checked after every button press; no per-turn prompt dump (the system prompt goes in `run_start`); run isolation is an invariant (INV-7) and is recorded in `run_start`. Envelope `{v, run, seq, t (Eastern, with offset), turn, type}`. Types: run_start, turn_start (context size), assistant, tool_call (before execution), button_press (before `/action`), tool_result (frame refs, never inline bytes), milestone (game server only), retry, run_end (always; reason ∈ milestone/budget/stuck/crash/model_error/operator_abort). TypeBox is the source, exported to `schemas/events.v1.json`.
- [x] **ASK USER:** frame cap. Operator 2026-10-11: a global cap (500 MB across all runs), and "you need to tell me when we're 10%, 20%, 30% etc full". Models run serially (memory), but INV-7 enforcement stays as designed. At the cap: operator 2026-10-11, "you can auto delete the oldest screenshots but runs shouldnt start above 75% capacity". The oldest frames are deleted first across all runs (the current run's too, if it alone fills the cap), and each deletion is recorded as a `frames_evicted` event in the owning run's log. A run refuses to start while usage is above 75%; `just runs-prune` frees frames, oldest first, down to a target. Alerts go to the terminal and events (chat not requested).
- Findings: `docs/findings/continual-harness.md` (F1 root cause of `PLAYER_NAME_SET`, F2 cross-run state, F3 the M2 findings).
- M4 tasks (each RED → GREEN):
  - [ ] Event schema (TypeBox) + `schemas/events.v1.json` export + a test that the export is current; a writer that appends `runs/<id>/events.jsonl` with gap-free `seq` and Eastern timestamps, written before acting; `run_end` always written (try/finally)
  - [ ] Frame store: `frames/<seq>.png`; global usage across `runs/*/frames`; a `disk_usage` event and a terminal warning each time usage crosses a new 10% step; at the 500 MB cap, delete the oldest frames first (`frames_evicted`); runs refuse to start above 75%; `just runs-disk` shows usage; `just runs-prune` frees down to a target
  - [ ] INV-7 run isolation: per-run server cwd under `runs/<id>/server/` (ROM and state files linked read-only), `RUN_DATA_ID`, `LOAD_CHECKPOINT_MODE=false`; refuses to reuse a running server. Tests: two runs (including two in the same second) share no written path, and `just verify-vendor` stays clean with no new ignored files in the vendor tree.
  - [ ] F1 fix: `pokebench_env` milestone guard for `PLAYER_NAME_SET` (pointer non-null + non-blank decoded name), installed by `pokebench_env.serve`, with a patch-point check and tests. Live check: repeated cold boots with `/milestones` polled from frame 0 never report it on the title screen.
  - [ ] pi-agent-core event stream → events (assistant, tool_call, tool_result, turn_start context size), milestone diffing after every `button_press`
  - [ ] Terminal tail: `just tail-run [id]` formats `events.jsonl` live
  - [ ] Gates + one review round; **STOP — report before M5**
- Finding (2026-10-11): `PLAYER_NAME_SET` at the title screen was **not** cross-run carryover. Milestones live in per-run cache dirs. It was an intermittent false positive in the vendor's own check (`pokemon_env/emulator.py`: any non-empty name read from RAM, other than "PLAYER"/"UNKNOWN", counts). It fired 0.09 s after boot in 1 of the 6 recorded boots. The earlier "restores cached run data" note was wrong. Real cross-run risks found: every server writes into the shared vendor cwd; run ids have one-second resolution (`run_YYYYMMDD_HHMMSS`), so two servers started in the same second share a directory; and there are root-level fallbacks (`./map_stitcher_data.json`, `.pokeagent_cache/maps`).

**M5 — Minimal agent** *(operator-in-the-loop)*
- [ ] **ASK USER:** harness checkpoint. agent-core vs coding-agent SDK; tool set; image pruning policy.
- Outline: observe→act loop with state/map/screenshot/press/navigate tools on think-swarm, writing M4's event log; first measured run against the milestones.

**M5.5 — PokeBench viewer** *(operator-in-the-loop; after M5 so it is designed against real runs)*
- [ ] **ASK USER:** design checkpoint. Layout, stack (served next to the game server like M2.5's `/view`, or a separate localhost app).
- Outline: reads only `runs/<id>/events.jsonl` (live tail and replay of past runs). Live frame, button-press timeline, thinking, tool calls with arguments and results, milestone splits, tokens and latency per step. It may embed the starter kit's frame/map/party panels instead of rebuilding them.

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
- M2.5 review batch load flush GREEN: native drain/clear now precedes final tape epoch invalidation, in finally even when native clear fails; no new native ownership or locks. Six audio tests passed. Same controlled real-ROM native schedule: 803 pending pre-load frames, 0 PCM bytes after load, 0 native availability. RED deffb33. COMMIT: `fix(env): invalidate tape after native load flush` (GREEN, this commit). This resolves the reproduced stale-publication window, not the vendor's general unsynchronized core lifecycle.
- M2.5 review batch load flush RED: deterministic pending-native-buffer fixture failed (pre-load sentinel survives), 5 audio tests passed. Pinned vendor: main-thread game step holds memory_lock, FastAPI background-thread /load_state takes neither memory_lock nor step_lock; native StereoBuffer.clear clears channels sequentially. Real-ROM native controlled interleave paused a real frame callback before capture, loaded raw state on the other thread, resumed capture during final native clear: 803 pending pre-load frames / 3212 PCM bytes survived despite native availability becoming zero. Callback thread equals frame owner, distinct from loader. Probe: `~/.hermes/cache/scratch/pb_audio_load_probe.py`. No new PCM generated during load/clear; no new lock/thread owner is proposed. COMMIT: `test(env): load flush rejects pending native capture` (RED, this commit).
- M2.5 review batch cursor GREEN: explicitly reject null and trimmed-empty header before Number conversion; 64 TS tests passed. RED ce11c84. COMMIT: `fix(view): validate audio cursor presence before coercion` (GREEN, this commit). Existing numeric/body guards unchanged; batch re-review not yet started.
- M2.5 review batch cursor RED: missing/empty/blank X-Audio-Next each coerced to zero and played; new transport fixtures 3 failed (`muted` false), 61 TS tests passed. COMMIT: `test(view): reject missing and blank audio cursor` (RED, this commit). R1 receipts retained at `~/.hermes/cache/scratch/pb-audio-review-c499ebf`; strict custody failed due docs-only HEAD changes; no closure claimed. Native load flush topology and remaining evidence gaps are being adjudicated for one cumulative fix-batch re-review.
- M2.5 overlap GREEN: capture snapshots the tape epoch before drain; append compares it inside the existing tape lock, atomically with clear. No new native-thread control. Regression audio tests 5 passed; full final vitest 61 / pytest 102; lint/build/coverage/verify-vendor/verify-rom all exit 0. Python coverage lines 98.07 / branches 95.65 / functions 100; TS 97.38 statements / 91.66 branches / 100 functions / 98.79 lines. Fresh own-port ROM smoke peak 2354, 169687 PCM frames, `/view` + module 200, two readers, TITLE_SEQUENCE / screenshot 7556 bytes / GAME_RUNNING, exit 0 and port closed. Two more adversarial deletions (epoch comparison and capture token) fail the overlap test; restored 5 audio tests green, total 9 mutation receipts. RED 961efb3; COMMIT: `fix(env): reject stale PCM atomically across lifecycle flush` (GREEN, this commit). Parent UI/hearing and external review still pending; no task closure.
- M2.5 overlap regression RED: deterministic reset injected during native buffer read reproduces stale retired-core PCM appended after the clear (1 failed). No new threading owner or emulator control will be introduced: fix stays in the existing tape lock/epoch boundary. Cursor GREEN 3f6e235. COMMIT: `test(env): reset overlapping capture rejects old PCM` (RED, this commit).
- M2.5 self-check GREEN: regression 4 audio tests passed; full final `just test` vitest 61 / pytest 101; lint/build/coverage/verify-vendor/verify-rom exit 0. TS coverage statements 97.38 / branches 91.66 / functions 100 / lines 98.79; Python lines 98.04 / branches 95.56 / functions 100. Repeat own-port ROM smoke :8129: peak 2354, 172904 PCM frames read, `/view` + module 200, two readers, TITLE_SEQUENCE / 7736 screenshot bytes / GAME_RUNNING, exit 0 and port closed. RED 2e68852; COMMIT: `fix(env): clamp live audio cursor to frame zero` (GREEN, this commit). Parent review prerequisites + PB1–PB13 self-review (0 FAIL, no external review claim): `~/.hermes/cache/scratch/pokebench_audio_handoff.md`. Browser visual/Web Audio/hearing acceptance still pending.
- M2.5 self-check RED: a new live reader incorrectly reports pre-origin frames as skipped; tiny-cap regression 1 failed (2 != 0). COMMIT: `test(env): live audio skipped count starts at frame zero` (RED, this commit). Routes GREEN ead3bdb. Seven adversarial deletions (tap wiring, PCM publication, tape bound, native callback registration, mute stop, stale response guard, speed policy) each turned tests RED; restoration returned controls 4 Python / 61 TS green and git diff empty. Evidence: `~/.hermes/cache/scratch/pokebench_audio_mutations.json`. `POKEBENCH_SMOKE_PORT=8130 just smoke` also passed: TITLE_SEQUENCE, screenshot 1631 bytes, GAME_RUNNING; vendor clean.
- M2.5 final routes/build GREEN: prerequisite RED b0653bd now passes; final `just test` vitest 61 / pytest 100; `just lint`, `just build`, `just coverage`, `just verify-vendor`, `just verify-rom` all exit 0. Coverage unchanged from slice 4 evidence below. COMMIT: `feat(env): serve spectator audio and window-fit view` (GREEN, this commit). Browser acceptance/review remain pending parent; no long-lived smoke server was left.
- M2.5 build prerequisite RED: `test_serve_builds_browser_module_before_launching` failed because `just --dry-run serve` has no build step (1 failed). COMMIT: `test(view): serve builds the spectator module first` (RED, this commit). Route implementation is still uncommitted pending final GREEN.
- M2.5 slice 4 GREEN (pending parent UI/review): serve/ASGI test 1 passed; `just test` vitest 61 / pytest 99; lint/build clean; coverage TS statements 97.38 / branches 91.66 / functions 100 / lines 98.79, Python lines 98.04 / branches 95.56 / functions 100; verify-vendor/verify-rom clean. Own-port real ROM smoke :8129: `/audio.wav` stereo 48 kHz nonzero peak 1656, 168884 frames read, two bounded concurrent readers; `/view` and compiled module HTTP 200; game smoke TITLE_SEQUENCE, 7545 screenshot bytes, GAME_RUNNING; server exited 0, port closed, vendor pristine. Scratch evidence: `~/.hermes/cache/scratch/pokebench_audio_smoke.result.json` and `.server.log`. RED 655ff16. Route GREEN commit follows after the build prerequisite test. Operator hearing + browser visual acceptance and canonical review remain parent-owned, not complete.
- M2.5 slice 4 RED: production serve/ASGI seam test failed `spectator wiring missing` (1 failed). Client GREEN 09f881d. COMMIT: `test(env): spectator routes wired through production serve` (RED, this commit).
- M2.5 slice 3 GREEN: follower tests 5 passed; full `just test` vitest 61 / pytest 98; TS lint clean. RED fd7dfd3. COMMIT: `feat(view): client-local mute and bounded varispeed audio` (GREEN, this commit).
- M2.5 slice 3 RED: client-local follower tests 5 failed (spectator module missing) / existing vitest 56 passed. Callback GREEN dca4dcb. Browser business logic lives in the already-covered TS package; `/view` uses its compiled browser-safe module, and `just serve` builds first. Explicit speed policy: at most one playing source, 100 ms latest-segment polling, varispeed follows PCM frames/wall time (pitch shifts), drop stale rather than queue. COMMIT: `test(view): mute lifecycle and bounded varispeed follower` (RED, this commit).
- M2.5 slice 2 GREEN: callback/lifecycle tests 3 passed; full `just test`: vitest 56 / pytest 98; ruff/mypy clean. RED e256585. COMMIT: `feat(env): native frame callback captures spectator audio` (GREEN, this commit).
- M2.5 slice 2 RED: native callback/lifecycle tests 2 failed (`native audio callback missing`), 1 passed. Native ROM timing probe: 180 callbacks / 180 run_frame calls, PCM available at callback (117–809 frames), callback thread matches frame owner. Slice 1 GREEN 06db9bb. COMMIT: `test(env): frame-owned audio callback and lifecycle isolation` (RED, this commit).
- M2.5 slice 1 GREEN: tape tests 1 passed; full `just test`: vitest 56 / pytest 96. RED d49e3a7; COMMIT: `feat(env): bounded stereo spectator tape` (GREEN, this commit).
- M2.5 implementation slice 1: bounded stereo WAV tape RED; `pytest env/tests/env/test_audio.py -q` failed with `audio feature missing` (1 failed). COMMIT: `test(env): bounded spectator audio tape` (RED, this commit). Design refinement: use native frame callback attached after initialize, not a per-frame emulator method wrapper. Parent owns browser acceptance and multi-model review; no M4 work.
- 2026-10-11 ~21:30 ET: **M3 landed on main.** Operator: "yes, land m3 and resolve conflicts and commit. u can kill the leftover server". main fast-forwarded 465b704 → a9f1dc5 (`m3-agent-provider`). The only conflict was another session's uncommitted M2.5 worklog block, which was set aside and re-applied unstaged. Gates on main: vitest 56, pytest 95; TS 100 / 97.36 / 100 / 100; Python 98.77 / 97.30 / 100; lint, build and verify-vendor clean. Killed the orphaned `pokebench_env.serve` on :8000 (pid 2876, PPID 1, from the pre-fix smoke).
- 2026-10-11 ~21:00 ET: merged main (M2 review fixes 31fac2a..33636ae, the duplicate-M3 revert) into `m3-agent-provider`; the only conflicts were in the worklog. Ported main's ideas (3a18c5f, 08e48e6). M3 multi-model review is next.
- 2026-10-11 ~20:35 ET: Duplicate M3 resolved. M2 review closed on main (33636ae). The resumed main session built a second M3 on main (f514521, 4685b85) before noticing branch `m3-agent-provider` already had M3 GREEN plus a passing live `smoke-llm`. Operator: "u can revert and keep the fuller m3". Main's duplicate is reverted; the branch is M3 of record. Idea to port to the branch: read vision from the gateway's `metadata.observed.capabilities` instead of `POKEBENCH_VISION_MODELS`. Gateway probe facts (live, 2026-10-11): the gateway honors `chat_template_kwargs.enable_thinking`, accepts both `max_tokens` and `max_completion_tokens` and the `developer` role, and thinking on spends ~400 tokens on a trivial prompt.
- 2026-10-11 ~20:30 ET: COMMIT: `docs: adopt PokeBench principles rubric, move ROM home to ~/.roms` (principles file, CLAUDE.md, README, execute-worklog, this worklog's INV-1/ASK USER/session-log lines; M2.5 audio entries left uncommitted for their own milestone).
- 2026-10-11 ~17:50 ET: operator moved the ROM home: copied to `~/.roms/pokemon-emerald.gba` (SHA-1 `f3ae0881…7b7` matches; the `~/Downloads` original is left in place), `.env` `POKEBENCH_ROM` points there, CLAUDE.md/README updated. Principles: `docs/agent-principles.md` approved and adopted as the rubric.
- 2026-10-11 ~18:20–19:55 ET: merged main (M2 GREEN) into `m3-agent-provider` — clean. macOS TCC now blocks agent processes from `~/Downloads` (earlier smoke had access): ROM relocated by the operator to `~/.roms/pokemon-emerald.gba`, SHA-1 verified against `EMERALD_SHA1`, `.env` repointed in both worktrees. `just build-mgba` re-run for the worktree venv. All gates green post-merge (vitest 39, pytest 86, coverage ≥90 both stacks, vendor clean after smoke). Implemented and greened `just smoke-llm` (see M3). **Resume:** run the M3 multi-model review loop, then the pending M2 loop (`6294533..c6301e6`), then STOP-report before M4.
- 2026-10-11 ~17:55 ET: usage limit reached during the M2 review round (one round, proportional to risk). Fallback reviewer (sonnet): LGTM, with hardening: smoke passes against a stale server already on the port; brew-missing message; http scheme check. Still pending: Claude CLI, think_fast, think_swarm, Codex (artifacts in the session scratchpad `review/m2/`) and fallback (fable). **Resume:** rerun the M2 review lanes on 6294533..c6301e6, then start M3. pi 0.73.1's openai-completions provider already reads llama.cpp `reasoning_content`.
- 2026-10-11: Research + kickoff discussion. Spike: mGBA 0.10.5 binding builds natively (FFmpeg required, or the import fails on EReader symbols); Emerald ran at ~4,350 fps headless. ROM SHA-1 verified. Repo initialized (`746a785`). Worklog written; operator approved M1–M3.

## Surprises
- pi-agent-core 0.73.1's loop terminates on the first assistant message without tool calls. Multi-step prompts must bundle any narration with the *next* tool call, or the loop exits mid-protocol. M5/M6 harness prompts must encode this.
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
