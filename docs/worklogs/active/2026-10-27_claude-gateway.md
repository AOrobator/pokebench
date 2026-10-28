# Claude gateway (slice 1 of "Claude Code as the PokéBench player")

Plan: runs/reports/2026-10-27_claude-code-agent-plan/index.html, option B. The operator approved slice 1 on 2026-10-27 ("go", relayed by the coordinator).

A detached process in `scripts/claude-gateway/` that serves the harness's OpenAI-compatible model surface (GET /v1/models, POST chat/completions as SSE with one tool call), the same surface as Astra's bridge (`runs/probes/gpt6-astra-30m-20261025/gateway.mjs`). Each turn is one headless `claude -p` call that replies `{name, arguments, text}`, validated against the request's tools and schemas, with one re-ask on an invalid reply.

- **stateless:** the whole harness window and its images in one call. No tools, no MCP, no settings files (`--setting-sources ""`), no session on disk, an empty cwd. The harness system prompt replaces Claude Code's.
- **session:** one Claude Code session per run, continued with `--resume`. Each turn sends only the last two harness messages and the paths of that turn's screenshots. Its only tool is Read, confined to the bridge's screens folder (`--restricted`, cwd = screens).

A provider failure (usage or rate limit, overload, auth, crash, call timeout) never becomes an HTTP error. The request is held, `pause` goes to runs/<run>/control.jsonl (viewer `appendControl` format, seq = lines + 1), retries run at 5, 10, 20 and then every 30 minutes, and `resume` follows the answer. Session mode resumes the same session id. The SSE stream opens at once and sends `: waiting` comments every 15 s, because the harness's OpenAI client (openai 6.26.0) aborts after 10 minutes without response headers and then resends the request (maxRetries 2).

Run binding: `--run-id`, or `--game-port P`: the single run whose run_start (first events.jsonl line) names isolation.port P and whose `t` is after the gateway started. It's logged as `run_bound` in gateway.jsonl. Zero or several matches means no binding, and a pause is logged as `control_skipped`.

Not a harness behavior change, so there's no feature switch: the gateway is an external process, like Astra's bridge. provider-wait-pause-v1 and resume-bundle-v1 are later slices.

## CLI facts checked on this Mac (claude 2.1.299, `claude --help`)

- `--system-prompt` replaces the default prompt. `--tools ""` disables every tool; `--tools Read` allows one. `--strict-mcp-config` without `--mcp-config` loads no MCP. `--setting-sources user` loads only the profile's user settings, as reviewer-invocation.md does (no project or local hooks). `--restricted` confines file tools to the cwd. `--disable-slash-commands`. `--permission-prompts none` denies anything that would prompt.
- `--session-id <uuid>` starts a named session and `--resume <id>` continues it. `--no-session-persistence` (print only).
- Images: `--input-format stream-json` with one user message whose content is Anthropic blocks (`{"type":"image","source":{"type":"base64",...}}`). The real CLI accepted the generated argv and stdin for both modes from request 2741 (stateless: 4 images, 17.5K-char system prompt) and got as far as the API call.
- `--output-format stream-json --verbose` gives the full event stream (thinking blocks included, saved per call as calls/call-N-A.jsonl). The final `result` event has `is_error`, `subtype`, `api_error_status`, `result`, `session_id`, `total_cost_usd`, `usage` and `modelUsage`.
- Limit errors: the binary's own strings include "You've hit your …", "usage limit reached" and `rate_limit_error`. Any `is_error` result except `error_max_turns` is held. The log labels it usage_limit, auth or provider.
- `--bare` can't be used on a subscription: it reads only ANTHROPIC_API_KEY.
- Auth blocker: the default `~/.claude` profile's refresh token is dead for non-Desktop processes ("OAuth refresh token is no longer valid"). Desktop injects its own host auth, plus CLAUDE_CODE_SIMPLE and ANTHROPIC_BASE_URL, into its children. local-inference-stack solved this with a dedicated profile (`CLAUDE_CONFIG_DIR=$HOME/.claude-review`, `.claude/skills/multi-model-review/reference/reviewer-invocation.md`). The gateway takes `--claude-config-dir` and passes the child only HOME, PATH, USER, LOGNAME, SHELL, TMPDIR, LANG, TERM, LC_* and CLAUDE_CONFIG_DIR. The operator, 2026-10-27 4:53 PM ET: "Use CLAUDE_CONFIG_DIR=~/.claude-review for the claude gateway, the replay and the pilot". Status: logged in (claude.ai, max).
- Model ids: Opus 5.5 = `claude-opus-5-5` (live: modelUsage reports claude-opus-5-5). Fable 5.1 = `claude-fable-5-1` (not called yet).
- In session mode, `total_cost_usd` and `modelUsage` are the session's running totals across resumes, while `usage` is per call. The gateway logs the difference (session_cost_total_usd is kept in session.json).
- `--system-prompt-snapshot` is on by default and would keep the first system prompt across resumes. Session mode passes `off`; live check: a resumed call saw the changed prompt.

## M1 — gateway, fake-claude tests, gates

- [x] claude_gateway.py, replay.py, fake_claude.py, tests (46)
- [x] Gates
- [ ] Review: Claude, GPT (Codex CLI gpt-5.6-sol), fallback (round 2)
- [ ] Land ff-only via the land board

## M2 — replay dry run (needs a working claude login)

- [x] 20 Astra requests (1, 145, …, 2741, evenly spread) copied into runs/claude-gateway-replay-20261027/requests/ (gitignored; the source was only read)
- [x] Opus 5.5 at medium effort, both modes, $1.40 cap per mode

## Log

- 2026-10-27 ~5:15 PM ET: M1 code and tests. 46 tests pass. Coverage of claude_gateway.py + replay.py: lines 99.08%, branches 96.50%, functions 100%. ruff and mypy --strict are clean. `just test` and `just lint` now include the gateway folder.
- Gates on 51abcf127 + fixes: agent vitest 4540 passed, viewer 2060 passed (TS coverage passed). pytest 4429 passed and 2 failed in test_gate_wiring: the test pins the exact `just test` recipe, so it now expects the two gateway lines (6/6 pass). env coverage 97.47/93.58/100. The env lint (ruff, mypy, 133 files) used the main checkout's venv: a fresh worktree venv has no mgba binding. trainer-card-check fails in this worktree only, because the approved art under runs/sprites is not here ("Approved font/art did not load"); it is rerun on main after landing.
- Replay (2026-10-27 ~4:55 PM ET, ~/.claude-review, claude-opus-5-5, effort medium):
  - stateless, 9 turns (stopped at the $1.40 cap): 9/9 valid on the first try. $0.157 per turn ($1.41 total). Median latency 6.1 s, max 8.3 s. Each call writes ~13–26K tokens of new cache and reads only the ~5.8K system prefix, because the window changes every turn. Output 37–617 tokens.
  - session, 8 turns: 8/8 valid on the first try. Real cost $0.323 total, $0.040 per turn (the run's own budget check stopped it early: it summed the running totals, the bug fixed below). Median latency 5.0 s. Context per turn (input + cache read + cache write) grew 7.5K → 32.3K over 8 turns, about 3.5K per turn, almost all cache reads. One turn (request 145) first tried to call navigate_to as a native tool ("No such tool available") and then replied correctly. The model never used Read to look at a screenshot in 8 turns.
  - Total spend: about $1.75 including two live flag checks.
- Review round 1 (packet 39b0f044, head 51abcf127): Claude-family subagent LGTM, fallback (Sonnet subagent) LGTM, Codex CLI gpt-5.6-sol BLOCKING with 5 findings, all fixed:
  1. The validator skipped anyOf/oneOf/allOf, pattern, uniqueItems and patternProperties, which real tool schemas use. All are now checked.
  2. Settings were loaded from the profile: now `--setting-sources ""`.
  3. The system-prompt snapshot kept the first prompt on resume: now `--system-prompt-snapshot off`.
  4. The session wasn't bound to its run: session.json stores run_id, and a different bound run starts a fresh session (`session_reset`).
  5. A disconnect or exception after a pause skipped resume: resume is now written in a `finally`, and a client that's gone (keepalive write fails) ends the hold (`client_gone`).
- Also fixed:
  - Per-call session cost (the replay finding).
  - Invalid base64 is now a 400.
  - An integer schema accepts 3.0.
  - Keepalive no longer writes after the final frame.
  - The session contract says the harness tools aren't callable.
- Gateway tests: 58 pass. Coverage 99.28/96.96/100.
- Review round 2 (packet c5671457, head 1d7978f7a): Claude LGTM, fallback LGTM (its follow-up: a JS-only regex would raise re.error; every `pattern` in packages/agent/src compiles in Python re), Codex gpt-5.6-sol BLOCKING on one point. A session with unknown ownership (a legacy session.json, or one created before --game-port resolved) could be resumed by a newly bound run. Fix: a stored session resumes only when its run_id equals the bound run (both None only when there is no binding at all, as in a replay); anything else is `session_reset`. Two new tests.
- Capture preflight (pokebench-run-coordination): the replay streams had thinking blocks with empty text, because Claude Code omits thinking unless asked. `--thinking-display summarized` (accepted by 2.1.299, not listed in --help) returns readable thinking summaries in stream-json (live check: a 48-char summary). `--settings {"showThinkingSummaries":true}` did not. Both modes now pass it. These are provider reasoning summaries, not raw reasoning.
- Gateway tests 60 pass, coverage 99.28/96.96/100.
- Review round 3 (packet 07d6cb2f, head d2ea46ee9): Claude LGTM, fallback LGTM, Codex gpt-5.6-sol LGTM.
- Sync: main moved to 377890434 (aborts-included). Merge head 461ebb193; packet 169024f9 is identical to round 3 except the justfile `index` line. Round 4 confirmation: Claude LGTM, fallback LGTM, Codex LGTM. Gates on the merged tip: build 0, TS lint 0, agent 4540 passed, viewer 2072 passed, pytest 4431 passed (env coverage 97.47/93.58/100), env ruff and mypy clean (main venv), gateway 60 passed (99.28/96.96/100). main then moved to 2f1b3f00a (docs only). The merge gives head ffd31114d, whose packet is byte-identical to round 4 (sha256 169024f9…).

## Landed

- `git merge --ff-only ffd31114d` into main, 2026-10-27 ~5:11 PM ET, slot 1 on the landing board.
- `just test` on main: agent 4545/4546. The one failure is citation-evidence.test.ts, the known failure from the main checkout's untracked experiments/fixed/hyperqwen-control-3h.json (see the vllm-tuple worklog). The suite stops at the first failing package, so the viewer, pytest and gateway passes were the merged-tip numbers above.
- Pilot (M3, operator go 5:09 PM ET): run 2026-10-27T17-09-29_claude-opus-5-5_318a, a diagnostic probe launched the way Astra was (runs/probes/claude-opus55-30m-20261027). Results get their own entry when it ends.
- Follow-ups, not done:
  - fixed-run gateway lane plus commit pin (needed for scored runs).
  - A startup sanity call, so a rejected flag or model doesn't hold forever.
  - Interrupt the backoff sleep when the client is gone.
  - A distinct label for non-OSError handler failures.
  - An incremental cursor for replay.

## M4 — `--autocompact` gateway option (future runs only)

The operator, 2026-10-27 ~6:30 PM ET (relayed): leave the live runs 36b5 and 76cd uncapped and untouched. The option is for future runs only.

- `claude --help` (2.1.299): `--autocompact <auto|tokens>`, "Auto-compact window size (auto, or 100k–1M tokens)". Live check: `258k` and `258000` are accepted, `50k` is rejected ("must be 'auto', or between 100k and 1M").
- Gateway: `--autocompact <100k–1M>` (for example `258k`) is passed through as `--autocompact <tokens>` in both modes, and logged in gateway_start and on every calls.jsonl row. When it's not set, the argv is unchanged (default auto, i.e. the model's window, 1M for Opus 5.5 and Fable 5.1). Astra's Codex compacted at a 258,400-token window.
- [x] Option, argument parsing, tests (69 pass; 99.29/97.01/100), ruff and mypy --strict clean
- [ ] Review: Claude, Codex gpt-5.6-sol, fallback
- [ ] Land ff-only
- M4 review (packet 5ab4bad6, head 4acd3f050): Claude LGTM, fallback LGTM, Codex gpt-5.6-sol LGTM. Synced with main (docs only); the packet stayed byte-identical. Gateway tests 69 pass (99.29/97.01/100), ruff clean. Landed ff-only as 94f1b29a3 (2026-10-27 ~6:40 PM ET). Not applied to 36b5 or 76cd: The operator chose to leave the live runs untouched. Recorded difference: the Claude runs compact near their 1M window, while Astra's Codex sessions reported model_context_window 258400 (~/.codex/sessions, 10/25).

## M5 — `--continue-session-from` (continuation runs keep the parent's Claude session)

The operator, 2026-10-27 ~9:09 PM ET, via Codex (relayed by the coordinator): continue the stopped Opus run 3642 from its latest checkpoint on the current bundle, keeping the original run and labeling the continuation. To keep Opus's compacted memory, the continuation's gateway reuses 3642's bridge folder, because Claude Code finds a session by its cwd's project folder. The new option lets the newly bound run adopt a stored session only when that session's run_id equals the named parent run. It's logged once as `session_continued`. Any other mismatch still resets the session. The option is recorded in gateway_start.
- [x] Option, tests (72 pass; 99.29/97.03/100), ruff and mypy --strict clean
- [ ] Review: Claude, Codex gpt-5.6-sol, fallback

## M6 — session mode sends the whole current turn, not a fixed last two messages

Found by Codex's read-only audit and confirmed 2026-10-27 ~9:35 PM ET. Session mode sent `dialogue[-2:]`, copying Astra's next.py. On the current bundle (d06b9f4db) the harness appends an "OBSERVED INSTRUCTION MEMORY" user message after the screenshot message, so the tool result fell out on every turn: continuation f60d, requests 577–606, 30/30. Claude's native transcript contains the call_600 tool text 0 times. On aacff2371 it fell out only when an extra user message (a battle update or a SUPERVISOR stall message) followed the screenshot: 3642 17/574, 36b5 8/303, 76cd 8/287, 318a 1/104. Astra itself, through next.py: 174/2740 (6.4%).

Fix: `ChatRequest.current_turn` is every message after the model's latest assistant reply: the tool result plus all trailing harness blocks. It's the whole dialogue before any reply, and empty when the request ends on an assistant message, so the model's own reply is never resent. session_prompt and _save_screens use it.

- Tests: built from real reduced requests (fixtures/: bundle request 601, aacff 145 with a battle update, aacff 400).
- Replay receipt: runs/launch-receipts/opus-3642-continuation-20261027/current-turn-fix/, before and after for requests 601 and 577.
- Expected cost: payloads grow when the tool result is large; request 577's observe result is about 58K chars.
- 77 tests pass, coverage 99.41/97.46/100.
- Review round 1 (packet 044aa305): Claude LGTM, fallback LGTM, Codex BLOCKING:
  1. The `dialogue[-1:]` fallback resent an assistant-terminal reply. Fixed: no fallback, plus a negative test.
  2. Receipts were "missing". Rebuttal: runs/ is gitignored, so they live in the main checkout at /Users/user/dev/pokebench/runs/launch-receipts/opus-3642-continuation-20261027/current-turn-fix/ (4 files), not in the worktree.
- Review round 2 (packet 74529db0, head 9edf0dbe1): Claude LGTM, fallback LGTM, Codex LGTM (rebuttal accepted; receipts verified).
- [ ] Hold for the operator: landing and any gateway restart for f60d

## Codex handoff: registered current-turn correction

2026-10-27 9:52 PM ET user authorization relayed verbatim: "yes we need this fixed. codex can do it". Existing clean 3b360a236 handed off; work continues on codex/gateway-current-turn-fix in the same isolated worktree, synced with fd621a45d. Preserves reviewed continuation-session support stacked below. No live gateway edits or run restart. Review and landing are authorized; later gameplay activation is separate.

Register gateway-current-turn-v1, omitted/default OFF for old presets; current recipe ON in both arms per coordinator's user rule for correctness fixes. The gateway reads the bound run_start evaluation FeatureSet, then passes one selected message span to both screen capture and prompt rendering. No transport extras sent to other providers. OFF must reproduce old last-two prompt and screenshot indices exactly. Native capture/request logs declare which span was used. Existing current_turn pure selection stays independently tested.

RED addition: factory tests bind actual run_start features, cover ON delivery, absent/false exact legacy bytes, malformed recorded values, and assistant-terminal requests. Targeted execution pending cleared CPU window. No claims of improved gameplay or reduced token cost; restoring large omitted observations increases prompt size.
RED observed: 4 targeted gateway failures (3 OFF prompt/index mismatches, one malformed flag accepted), and 2 registry/current-recipe failures. The initial malformed test accidentally called request without its required turn; corrected and reran, obtaining the intended DID NOT RAISE failure. Receipt /tmp/gateway-current-turn-red.txt, copied below into canonical ignored evidence before final review. Light tests cleared by coordinator21:55.
GREEN targeted: all78 gateway tests pass; ruff and strict mypy pass. Agent registry tests2 pass; agent tsc passes after correctly excluding the new optional field from the legacy required-field map and using an actually omitted property in the regression. A performed mutation removed production binding, making the delivery test RED, then restoredGREEN; receipt wiring-mutation-red.txt. Offline production-factory replays on real f60d requests577/601 prove whole tool text includedON, omittedOFF, ordered screen handles retained; no model calls or game inputs. Receipts canonical runs/reviews/gateway-current-turn-fix. Explainer themed/pages-check clean; background screenshots1280/1440/375 inspected, no page overflow (diagram scrolls inside its container on phone). Full gates/review/landing pending CPU window. Local worktree receives a copy of canonical mgba binding for gates, no ROM copied or live runtime changed.
Extended recorded-prefix check: replayed every archived f60d request577–606 through the production prompt factory in both modes (60cases, no inference). All30ON prompts contain the complete current tool text; all30OFF prompts omit it and preserve screenshot ordering/count. Source hashes, rendered output hashes and counts saved in replay-receipt.json. This measures delivery only, not gameplay benefit. Synced latest main through6caa63b35; exact main may move again before full gates/review. No registry reorder or unrelated source repair.
Registry regression pins the new switch's absolute285 slot after no-story-foreknowledge-v1 and asserts it is gateway-only (absent from server feature transport). Existing registry membership/order stays intact. Full gates pending the shared CPU queue, no parallel full-suite load started.
Final scoped regressions also check the gateway session_input receipt (appliedON,3messages, request/run binding), normalize the current recipe into both arm presets, and keep older Harness Config cards NOT RECORDED rather than inferring today'sON default. No change to old run files or native sessions.

## Claude takeover (2026-10-27 ~10:25 PM ET): operator override and fail-safe read

The Codex chat ended with "Selected model is at capacity" (10:18 PM ET). Claude resumed from 6d1f640dc, clean and synced with main bb32b94c4.
- `--current-turn auto|on|off` (default auto) is per the coordinator's instruction. auto follows the bound run's recorded gateway-current-turn-v1. on/off is an operator override for this gateway only. It's logged in gateway_start, and every session_input carries `source` (run_features or operator_override).
- The control.jsonl schema accepts only run actions (pause/resume/stop/cancel_stop/abort/extend), so the gateway can't write a note into the run's own record. An override used on a live run is recorded in that run's probe provenance.json plus gateway.jsonl.
- Fail-safe read (from the fallback review of 6d1f640dc): an unreadable run_start (OS or JSON error) or a non-boolean recorded value now falls back to the legacy input and logs `current_turn_feature_invalid`. Previously it raised inside a request whose SSE stream was already open.
- Gateway tests 88 pass, coverage 99.32/97.11/100, ruff and mypy --strict clean.
- Not applied to f60d: the swap waits for the operator's explicit OK.
- Review of 7b002b525:
  - Fallback LGTM.
  - Claude BLOCKING: an unreadable run_start fell back silently, with no `current_turn_feature_invalid`. Fixed: the read error becomes a GatewayError that _first_prompt logs before falling back.
  - Codex BLOCKING:
    1. Same as Claude's. Fixed.
    2. The switch was read from any first event. Fixed: it must be `type: run_start`, else it's invalid and falls back. New negative test.
    3. Full gates pending. Sequencing: they run in the coordinator's CPU window before landing.
    4. Repeated fixture reads. Fixed: fixtures are read once (functools.cache).
  - Gateway tests 89 pass, coverage 99.32/97.13/100.
- Review round 2 (packet 2c2d316f, head b37ac80ef): Claude LGTM, fallback LGTM. Codex verified the fixes and found no production regression, but blocked on test shape: the OFF and override matrices launched the fake-claude process 8 times. Coordinator chose to fix it. Those rows now use an in-memory runner through the Gateway's injectable `runner`, with 0 subprocess launches (receipt runs/reviews/gateway-current-turn-fix/runtime-shape-receipt.txt). The real-adapter tests are kept: bundle ON delivery and assistant-terminal. 89 pass, coverage 99.44/97.54/100. Test-only change.
- Synced main d641b8dc9 (merge ee0b0f71e; current.json and features.ts conflicts resolved by keeping both no-story-foreknowledge-v1 and gateway-current-turn-v1). Confirmation round on packet dc089359: Claude LGTM, fallback LGTM, Codex gpt-5.6-sol LGTM.
- Full gates on ee0b0f71e (2026-10-27 10:48–10:52 PM ET, coordinator's CPU window), all passing:
  - build 0, TS lint 0, env ruff and mypy (134 files) clean, gateway ruff and mypy --strict clean
  - agent 4665/4665, viewer 2157/2157
  - pytest 4463 passed (97.48/93.61/100), gateway 89/89 (99.44/97.54/100)
  - trainer-card guard 0, Playwright trainer cards 3/3 (approved art linked from the main checkout's runs/sprites)

## Landed (current turn, continue-session, override)

- `git merge --ff-only ee0b0f71e`, 2026-10-27 ~10:53 PM ET, slot 1 on the landing board. The packet is byte-identical to the reviewed dc089359. This lands both --continue-session-from and gateway-current-turn-v1 with --current-turn.
- Post-merge `just test` on main and `just viewer-main` (the switch adds a Harness Config card) are pending a coordinator CPU and viewer window.
- f60d is untouched. Its swap (f60d-gateway-swap-steps.md, swap_gateway.py with --current-turn on) waits for the operator's explicit OK.
- Follow-up: the anyOf re-ask text should list each option's required keys. f60d request 1007 failed twice on navigate_to_target target shape.
- Post-merge `just test` on main 45ff0b86f (2026-10-27 11:00–11:02 PM ET, clean tree, coordinator window): exit 0. Agent 4665/4665, viewer 2157/2157, pytest 4463 (97.48/93.61/100), gateway 89/89, trainer-card check passed. `just viewer-main` done earlier (viewer at 45ff0b86f, ppid 1).
