# Explicit model endpoint and the connect-a-model guide

Status: APPROVED by the operator 2026-11-10 10:47 AM New York ("The milestone numbers look good"). Worklog archive convention on hold (the operator, same message).

## Why

PokeBench has two built-in model defaults that are one person's machine wiring, not product behavior:

1. `packages/agent/src/config.ts`: with nothing set, the player uses `http://inference.example/v1` and the model `think-swarm`.
2. `packages/viewer/src/cli.ts`: with no `POKEBENCH_ENDPOINT_FILE`, runs queued from the viewer use `~/.hermes/runtimes/llamacpp/server.json` when that file exists (`HERMES_ENDPOINT`).

Operator decision 2026-11-10 (the operator): no default endpoint and no fallback to Hermes or any other implementation; publish setup guidance for the four ways the operator has connected models: any OpenAI-compatible endpoint, Hermes, the Claude gateway and the Codex bridge. Land in the private repo through the normal process first, then carry into the public copy. Operator's own launch scripts and `.env` set the endpoint explicitly.

## Scope

In: the two defaults above, the error a user sees when nothing is configured, every in-repo launcher that relied on a default, the guide, README/CLAUDE.md wording, the served viewer's `.env`.
Out: model discovery, the endpoint-file format, the loopback-only rule for endpoint files, test fixtures that merely use `think-swarm` as a sample model id, the public-copy sync system (operator is still deciding), the worklog archive convention.

Not a harness behavior change (nothing the model sees, no tool, prompt or action change), so no feature switch.

## M1: No built-in endpoint

Design (settled while writing RED): config carries `endpoint: {kind:"gateway",url} | {kind:"file",path}` (file wins when both are set, as today) and `model: string | null`. `requireModel` throws where a model is played (live.ts); the decision probe keeps taking its model from `--model` or the recorded run, so it does not need `POKEBENCH_MODEL`. Viewer endpoint resolution and its no-endpoint text move into `next-run.ts` (`endpointFromEnv`, `nextRunsLine`, `NO_ENDPOINT`), because importing `cli.ts` reads files at load and fails the no-I/O guard.

RED run 2026-11-10: agent `config.test.ts` 10 failed / 8 passed; viewer `next-run-endpoint.test.ts` 3 failed / 1 passed (the queue refusal passes vacuously until `NO_ENDPOINT` exists).

- [x] RED: `loadConfig` with no `POKEBENCH_MODEL` throws a `ConfigError` naming the variables to set and the guide path.
- [x] RED: `loadConfig` with neither `POKEBENCH_GATEWAY_URL` nor `POKEBENCH_ENDPOINT_FILE` throws the same kind of error; either one alone is accepted.
- [x] RED: viewer startup with no `POKEBENCH_ENDPOINT_FILE` has `endpointFile === null` even when a Hermes endpoint file exists (injected `exists`); `HERMES_ENDPOINT` is deleted.
- [x] RED: a viewer-queued run with no endpoint is refused with the same guidance instead of launching with an empty `POKEBENCH_ENDPOINT_FILE`.
- [x] GREEN: implement; existing config tests updated to pass explicit values. Focused: agent config/live-human/decision-probe 40 passed; viewer next-run-endpoint/next-run 6 passed; tsc --noEmit clean for both packages; eslint clean on changed files.
- [x] Audit every launcher (`justfile` run recipes, plain-run `launch.sh`, fixed-run, `current-main.sh`, probe CLI, rehearsal scripts) and confirm each sets the endpoint explicitly; fix any that relied on a default.
- [x] Gates: lint, test, coverage floors (agent 63/54/57/58, viewer 36/39/40/35, never lowered).
- [ ] Review: Claude, Grok and GPT/Codex lanes LGTM.

Launcher audit (2026-11-10): viewer queue (`next-run.ts`) sets MODEL + ENDPOINT_FILE and now refuses with `NO_ENDPOINT` first; `fixed-runner.ts` sets MODEL + ENDPOINT_FILE; `serial-comparison.ts` sets MODEL + GATEWAY_URL (+ file); `roxanne-measured-host.ts` and `scripts/rehearse-roxanne-live.mjs` set MODEL + ENDPOINT_FILE; plain-run `launch.sh` sets MODEL + ENDPOINT_FILE; `glm-loop.sh` and `whole-map-loop.sh` go through `just fixed-run`; `run-agent` goes through `fixed-cli play`, which preserves the caller's variables. Only `just smoke-llm` relied on the built-in gateway and model; its comment now says what to set. `live.js human/probe/verify-state` never load model config.

## M2: Connect-a-model guide

- [x] `docs/connect-a-model.md` with four recipes:
  1. Any OpenAI-compatible server (llama.cpp, vLLM, a gateway, a cloud key behind a loopback proxy): `POKEBENCH_GATEWAY_URL` + `POKEBENCH_MODEL`, or an endpoint file `{base_url, api_key, vision}` (loopback only) via `POKEBENCH_ENDPOINT_FILE`.
  2. Hermes: point `POKEBENCH_ENDPOINT_FILE` at the endpoint file Hermes's llama-server router writes.
  3. Claude: `just claude-gateway` (session or stateless mode), `just gateway-preflight`, then point the run at the gateway's port.
  4. Codex: the opt-in `just codex-capture` bridge, with the transcript-capture preflight from `pokebench-run-coordination`.
- [x] Each recipe verified against the code it cites (option names, env names, file shape); no machine-specific hosts, users or paths.
- [x] README and CLAUDE.md: replace "talks to the local-inference-stack gateway (`http://inference.example/v1`)" with a link to the guide.
- [ ] Documentation review (round 1 Claude found two broken example commands; fixed in round 2).

Finding while verifying recipe 1 (2026-11-10): `POKEBENCH_GATEWAY_URL` is not generic OpenAI-compatible. Gateway discovery requires `context_window` and `max_tokens` per model in `/v1/models` (the operator's stack, the Claude gateway and the Codex bridge all add them; a plain OpenAI `/v1/models` does not). Local llama.cpp and vLLM work through an endpoint file, whose discovery reads their native limits. Hosted APIs need a loopback proxy; none ships in the repo. The guide states this rather than claiming more. The operator 2026-11-10: accepting limits from config for plain OpenAI endpoints is out of scope ("no. out of scope.").

## M3: Rollout (no feature code)

- [ ] Operator `.env` gains `POKEBENCH_ENDPOINT_FILE` (the Hermes file it used implicitly) so viewer-queued runs keep working; `just viewer-main`; confirm the served viewer reports the same endpoint as before.
- [ ] Land on main per execute-worklog (landing board, ff-only), report merge SHA.

## M4: Carry into the public copy

- [ ] Decide with the operator: refresh the public copy from the latest private `main` (picks up everything landed since the Nov 7 snapshot, needs the same scrub again), or apply only these commits on top of `~/dev/pokebench-public-v9`. The operator leans toward latest main (2026-11-10).
- [ ] Whichever route, commit through the protected-data guard (hooks wired in v9 2026-11-10).
- [ ] Re-run the full-history privacy sweep and gitleaks on the result.

## Multi-Model Review Log

Round 1 packet: base f8ee5f034, head e74c2f464, diff SHA-256 33778ff1bea0a33b1c94baf3408c73ba3b42b73bc45a736e063e4e6ea57d8c44 (`runs/reviews/explicit-model-endpoint/`). Lanes started 2026-11-10: Claude CLI (`~/.claude-review`, plan mode), Cursor `gpt-5.6-sol-xhigh` (GPT lane, the gating independent lane), Cursor `cursor-grok-4.5-high`. Per the operator via the coordinator (2026-11-10): Grok is out as a reviewer until 11/17, so its verdict is advisory only and does not count toward landing; GPT/Codex review is required.

Round 1 results: Claude BLOCKING on two doc defects (B1 Codex `serve` example missing required `--port`; B2 Claude session-mode example missing required `--preflight-receipt`); code: no defects. Its three hardening notes triaged: bridge prints JSON with `url` (Fix, doc), `--capture-key`/`--reply` unmentioned (Fix, doc), `server.ts` queue POST writes the draft before the endpoint check (Rebut: pre-existing order, `git diff main -- packages/viewer/src/server.ts` changes only the message; principles row PB2 reworded). Cursor GPT and Grok lanes: no review, Cursor usage limit until 11/17 (`ActionRequiredError`); GPT lane moves to the Codex coordinator. Grok excluded until 11/17 anyway.

Round 2 packet: base f8ee5f034, head d51558c36, diff SHA-256 748c1ae026311ec3500ead4d1f86320ff921e9a200acb750688418f5b2e3b1ac. Claude CLI: VERDICT: LGTM (`claude2.log`, exit 0, empty stderr). GPT lane: job `review-explicit-model-endpoint-r2` delivered to the Codex coordinator, awaiting verdict. Full gates still await the CPU window (START requested via `just tell-claude`; no relay was listening, saved for the next mailbox).

Full gates on d51558c36 (CPU window granted by the relay 11:06 AM, RELEASE sent): `just build` 0; `just test` 0 (agent 2977 passed, 244 files, coverage stmts 63.91 / branches 60.06 / funcs 63.29 / lines 69.36 vs floors 58/54/57/63; viewer 1246 passed, 114 files, 41.77 / 44.26 / 47.01 / 42.45 vs 35/39/40/36; env 3065 passed, floor 69; Claude gateway 38 passed, floor 22); `just lint` 0 and `just verify-vendor` 0 after worktree setup (first attempt failed on worktree environment only: mGBA binding absent from the worktree venv and the vendor submodule not checked out; copied the built binding from the main checkout's venv and ran `git submodule update --init`). Logs: `runs/reviews/explicit-model-endpoint/gate-*.log`.

Round 2 GPT lane (relay-run `codex exec`, gpt-5.6-sol, read-only, digest verified): VERDICT: BLOCKING (`codex-gpt.md`). Both Fix: (1) the Claude recipe claimed `just gateway-preflight --help` writes the receipt; the real preflight needs `--preset`, `--out` and recorded request files, so the example now starts in stateless mode and describes session mode after a recorded run; (2) the hosted-proxy line pointed an endpoint file at a gateway-shaped `/models`, which endpoint-file discovery rejects; the guide now says a proxy uses `POKEBENCH_GATEWAY_URL`, lists the three endpoint-file shapes exactly, and README no longer says "any". Queue-route ordering note: Rebut (pre-existing, as round 1).
