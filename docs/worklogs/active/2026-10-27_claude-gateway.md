# Claude gateway (slice 1 of "Claude Code as the PokéBench player")

Plan: runs/reports/2026-10-27_claude-code-agent-plan/index.html, option B. The operator approved slice 1 on 2026-10-27 ("go", relayed by the coordinator).

A detached process in `scripts/claude-gateway/` that serves the harness's OpenAI-compatible model surface (GET /v1/models, POST chat/completions as SSE with one tool call), the same surface as Astra's bridge (`runs/probes/gpt6-astra-30m-20261025/gateway.mjs`). Each turn is one headless `claude -p` call that replies `{name, arguments, text}`, validated against the request's tools and schemas, with one re-ask on an invalid reply.

- **stateless:** the whole harness window and its images in one call. No tools, no MCP, no settings sources, no session on disk, an empty cwd. The harness system prompt replaces Claude Code's.
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
- Auth blocker: the default `~/.claude` profile's refresh token is dead for non-Desktop processes ("OAuth refresh token is no longer valid"). Desktop injects its own host auth, plus CLAUDE_CODE_SIMPLE and ANTHROPIC_BASE_URL, into its children. local-inference-stack solved this with a dedicated profile (`CLAUDE_CONFIG_DIR=$HOME/.claude-review`, `.claude/skills/multi-model-review/reference/reviewer-invocation.md`). The gateway takes `--claude-config-dir` and passes the child only HOME, PATH, USER, LOGNAME, SHELL, TMPDIR, LANG, TERM, LC_* and CLAUDE_CONFIG_DIR. Which profile to use is waiting on the operator's go.
- Model ids: Opus 5.5 = `claude-opus-5-5`, Fable 5.1 = `claude-fable-5-1` (the session's model list). Not live-verified while auth is blocked.

## M1 — gateway, fake-claude tests, gates

- [x] claude_gateway.py, replay.py, fake_claude.py, tests (46)
- [x] Gates
- [ ] Review: Claude, GPT (Codex CLI gpt-5.6-sol), fallback
- [ ] Land ff-only via the land board

## M2 — replay dry run (needs a working claude login)

- [ ] About 20 Astra requests spread over the run copied into runs/claude-gateway-replay/ (gitignored, read only from the source)
- [ ] Opus 5.5 at medium effort, both modes, total spend capped at about $3: validity, tokens, cost and latency per turn, session context growth

## Log

- 2026-10-27 ~5:15 PM ET: M1 code and tests. 46 tests pass. Coverage of claude_gateway.py + replay.py: lines 99.08%, branches 96.50%, functions 100%. ruff and mypy --strict are clean. `just test` and `just lint` now include the gateway folder.
