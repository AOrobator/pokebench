# Connect a model

PokeBench has no built-in model. Every run names one model and one endpoint, and the player stops with a message pointing here when either is missing.

The player always talks to the model over the OpenAI chat-completions API. What differs between setups is how PokeBench finds that API and learns the model's limits (context window, maximum reply tokens, whether it reads images). Runs need a model that reads images.

| Variable | What it holds |
|---|---|
| `POKEBENCH_MODEL` | The model id exactly as the endpoint's `/v1/models` lists it. |
| `POKEBENCH_ENDPOINT_FILE` | Path to an endpoint file (below). Takes precedence over `POKEBENCH_GATEWAY_URL` when both are set. |
| `POKEBENCH_GATEWAY_URL` | A `/v1` URL whose `/v1/models` reports each model's limits (below). |
| `POKEBENCH_VISION_MODELS` | Optional, gateway only: comma-separated ids to treat as image-reading when the gateway does not say. |

The viewer queues runs only when it was started with `POKEBENCH_ENDPOINT_FILE` set. Without it, the viewer still shows runs, and its next-run controls say what to set.

## 1. Any OpenAI-compatible server

### llama.cpp or vLLM on this machine: an endpoint file

Write a JSON file and point `POKEBENCH_ENDPOINT_FILE` at it:

```json
{ "base_url": "http://127.0.0.1:8080/v1", "api_key": "any-non-empty-string", "vision": true }
```

- `base_url` must be `http://127.0.0.1:<port>`. Endpoint files never point off this machine.
- `api_key` is sent as a bearer token. Use the server's `--api-key` if it has one, otherwise any non-empty string.
- `vision` is needed for vLLM, whose `/v1/models` does not report image input. llama.cpp reports it itself (`--mmproj` on a router, `multimodal` on a single-model server).

PokeBench reads the model's limits from the server's own `/v1/models`, and an endpoint file accepts only these three shapes: a llama.cpp router (loaded models, limits from `--ctx-size` in their args), a single-model llama.cpp server (`n_ctx`), and vLLM (`owned_by: "vllm"`, `max_model_len`). Anything else, including the gateway shape below, fails with `malformed .../models payload`.

```bash
export POKEBENCH_ENDPOINT_FILE="$PWD/lanes/local/endpoint.json"
export POKEBENCH_MODEL="your-model-alias"
just run-agent
```

### A gateway: `POKEBENCH_GATEWAY_URL`

A gateway in front of several models works directly when its `/v1/models` gives every model `context_window` and `max_tokens`:

```json
{ "object": "list", "data": [ { "id": "lane-a", "context_window": 65536, "max_tokens": 8192, "metadata": { "observed": { "capabilities": ["multimodal"] } } } ] }
```

The `metadata.observed.capabilities` entry is optional; without it, list image-reading models in `POKEBENCH_VISION_MODELS`. The gateway is called without an API key.

```bash
export POKEBENCH_GATEWAY_URL="http://127.0.0.1:8000/v1"
export POKEBENCH_MODEL="lane-a"
```

A plain OpenAI `/v1/models` (ids only) is not enough, because PokeBench needs the limits. Hosted APIs therefore go behind a small proxy on `127.0.0.1` that holds the key, answers `/v1/models` in this gateway shape and forwards `chat/completions`; point `POKEBENCH_GATEWAY_URL` at the proxy. No such proxy ships with PokeBench.

## 2. Hermes

Hermes's llama-server router writes an endpoint file for the models it serves. Point PokeBench at that file and name a model the router has loaded:

```bash
export POKEBENCH_ENDPOINT_FILE="$HOME/.hermes/runtimes/llamacpp/server.json"
export POKEBENCH_MODEL="model-id-as-the-router-lists-it"
```

Only loaded models are listed. Set the same variable before starting the viewer if runs should be queued from it.

## 3. Claude, through the Claude gateway

`scripts/claude-gateway/` serves the same API and answers each turn with Claude Code (`claude -p`). It reports one model, multimodal, with the limits you give it.

```bash
just claude-gateway --mode stateless --model claude-model-id --bridge runs/claude-bridge \
  --port 8810 --game-port 8000 --context-window 200000 --max-tokens 16000
export POKEBENCH_GATEWAY_URL="http://127.0.0.1:8810/v1"
export POKEBENCH_MODEL="claude-model-id"
```

- `--mode stateless` sends the whole harness window every turn and needs nothing else.
- `--mode session` continues one Claude Code session per run, and refuses to start without `--preflight-receipt`. The receipt comes from `just gateway-preflight`, which replays harness requests already recorded by a bridge (its `requests/` folder) through the gateway with a stub `claude`, so session mode follows at least one recorded run:

  ```bash
  just gateway-preflight --preset experiments/presets/<the run's preset>.json \
    --out runs/claude-bridge runs/claude-bridge/requests
  just claude-gateway --mode session --preflight-receipt runs/claude-bridge/preflight-receipt.json ...
  ```

  Pass the gateway the same `--current-turn`, `--tool-schemas` and `--schema-hint` overrides you gave the preflight; the receipt is bound to them.
- `--served-model` changes the advertised id; `POKEBENCH_MODEL` must match it.
- `--claude-config-dir` runs the `claude` child under a dedicated login.
- `--game-port` (or `--run-id`) binds the gateway to the one run it serves, so provider waits pause that run.
- Start the gateway as a detached process (`.claude/skills/detached-long-lived-processes/SKILL.md`). It never starts a run itself.

## 4. Codex, through the capture bridge

Codex plays through `just codex-capture`, an opt-in bridge that serves the same API on `127.0.0.1` and records the Codex session's native transcript and reasoning summaries against each game turn. Unlike the other three, the model is a Codex session taking turns, so the bridge is bound to one named run before it starts:

```bash
just build
just codex-capture --capture-phase serve --control runs/codex-bridge/control.json \
  --source <codex session transcript> --session <codex session id> \
  --run <run id> --events runs/<run id>/events.jsonl \
  --model codex-player --context 200000 --tokens 16000 --port 0
```

`--port 0` lets the bridge pick a free port. `serve` prints JSON whose `url` field is the bridge's address. Then:

```bash
export POKEBENCH_GATEWAY_URL="<bridge url>/v1"
export POKEBENCH_MODEL="codex-player"
export POKEBENCH_RUN_ID="<run id>"
```

The Codex session takes each turn with the `pending`, `begin` and `respond` phases against the same `--control` file; `begin` and `respond` also take `--capture-key`, and `respond` takes `--reply` (a JSON file). Before the first turn, enable reasoning summaries and prove capture with a rehearsal, as `.claude/skills/pokebench-run-coordination/SKILL.md` requires for every attached agent. `docs/explainers/codex-capture.html` explains the mechanism.

## Checking a setup

`just smoke-llm` runs a short live loop on whatever these variables name. `GET <endpoint>/models` should list `POKEBENCH_MODEL`; if it does not, the player's error lists the ids the endpoint does serve.
