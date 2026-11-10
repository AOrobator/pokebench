---
name: plain-run-launch
description: Launch one ordinary `just run-agent` gameplay run — a solo control arm, a bundle arm, or an ad-hoc play — on a cloud model lane or a local one, and prove it is live from the run's own `run_start` before calling it launched. Use for any `live.js play` launch; use fixed-run-launch for two-arm `just fixed-run` cohorts.
---

# Plain run launch (`just run-agent`)

One run, one arm, with the operator-authorized limits. A launch is not done until `run_start` is read back from
`runs/<id>/events.jsonl` and matches what you meant to launch.

`scripts/launch.sh --meta <dir> --model <id>` does the launch: it refuses a bad preset, endpoint, port or commit, starts the run detached with `POKEBENCH_CHECKPOINT_FRONTIER=1`, and writes `launch.receipt.json`. Every start saves frontier checkpoints by default; `POKEBENCH_CHECKPOINT_FRONTIER=0` turns that off on a hand launch.

`--record` also starts `pokebench_env.recorder` before the run, detached, writing hourly picture and sound files to `runs/<meta>/recording/`. It only reads from the game server, so its failure cannot reach the run; check `recording.jsonl` for failures.

`--backup <folder>` with `--record` starts `scripts/recording-backup.sh`, which copies finished segments, the journal and `events.jsonl` to `<folder>/<run id>/` every 10 minutes at low priority. It only copies, and logs to `recording/backup.log`.

`--definition <id>` resolves a fixed definition's arm to `runs/<meta>/preset.json` at launch, so a plain run follows its recipe pointer and takes no `runner.json` slot. `deepseek-boot-24h` is the DeepSeek boot run on `current`.

## 1. Pick the arm file, not the flags

| What you are launching | File | Launcher |
|---|---|---|
| Control arm / solo arm on the current recipe | `experiments/presets/current-control-24h-8k.json` (promoted `68f7da476`) | `just run-agent` + `POKEBENCH_PLAY_PRESET` |
| A named bundle arm over N trials | `experiments/fixed/<id>.json` | `just fixed-run` — use `fixed-run-launch` |
| A shipped comparison snapshot | `experiments/presets/<name>.json` | `just run-agent` + `POKEBENCH_PLAY_PRESET` |

The preset is the arm: `limits`, `sampling`, and all 313 `features` keys. Do not "just bump
max_tokens" with an env var — there is no such override, and a run that does not match a committed
preset is not a benchmark run.

`version: 2` presets carry `limits {maxTurns, maxWallMs, failureLimit, replyFailuresEndRun}`,
`sampling {thinkingLevel, maxTokens}`, and a flat `features` map; there is no `base` key (that is a
fixed-run definition). Verify with `parsePlayPreset` before launching:

```bash
node -e "const {parsePlayPreset}=require('./packages/agent/dist/play-preset.js');console.log(parsePlayPreset(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))).limits)" experiments/presets/current-control-24h-8k.json
```

## 2. Wire the lane

A run needs a model with `vision` and a gateway or endpoint file. The two are not interchangeable:

- **Endpoint file** (`POKEBENCH_ENDPOINT_FILE`) carries `{base_url, api_key, vision}` and is the only
  path that supplies an API key — `live()` passes `local.apiKey` and nothing else, so a cloud lane
  reached through `POKEBENCH_GATEWAY_URL` alone is unauthenticated and will 401.
- `base_url` must be loopback (`http://127.0.0.1:<port>`); the CLI rejects anything else.
- Cloud lanes get a loopback OpenAI-compatible proxy; the DeepSeek lane's lives at
  `runs/orca-deepseek-control-24h/proxy.py` on `127.0.0.1:18100` with its key in
  `~/.config/local-inference-stack/orcarouter.env`. If it is not listening, start it detached first —
  it is long-lived and belongs to no run.

Prove the lane before launching (a 200 with the right `model` field, not a `/v1/models` read):

```bash
curl -s http://127.0.0.1:18100/v1/models | head -c 400   # expect max_model_len 1048576
# then one 16-token completion through the same base_url + bearer key
```

`context_window` comes from the lane's `/v1/models` (`max_model_len`), and `maxTokens` is set equal to
it, so a `max_tokens 8192` sampling cap is what actually bounds replies.

## Preflight every stop condition

Before starting, compare the authorized limits with the effective preset, gateway, and any wrapper or supervisor. Write the comparison to a separate preflight receipt under the run’s ignored artifacts so the launcher can write its own receipt independently. Verify all turn, wall-clock, milestone, token, and spend stops, including defaults inherited from a previous run. Apply the [run-limit authorization rules](../pokebench-run-coordination/SKILL.md#run-limits-belong-to-the-operator) to resolve any mismatch.

The gameplay agent is the sole owner of the preset's wall and turn budgets. Viewer extensions update
those budgets and pause freezes the active wall clock. Do not copy a wall or turn limit into a
launcher, scheduler, shell timeout, or watchdog. A Max gateway may record API-equivalent cost as
telemetry. A reservation or estimate does not authorize any extra stop.

### Prepared checkpoints and subscription gateways

Use `scripts/launch-pinned.sh --prepare <detached checkout> <full commit SHA>` after setting up the
pinned checkout's Node and Python dependencies, including mGBA. Coordinate any needed build before
running preparation. It checks the build stamp and compiles the agent when needed.
Then run `scripts/launch-pinned.sh <detached checkout> <full commit SHA> <existing receipt directory>`
with a reserved game port. Provision the model gateway
separately and keep its lease through agent exit. For a subscription gateway, keep its process
detached and verify the authenticated session lane before play. The launcher starts the agent
directly and records its PID, run ID, pin and log under `<receipt directory>/play/`.

Pass absolute `POKEBENCH_RUNS_ROOT`, `POKEBENCH_PLAY_PRESET` and `POKEBENCH_ROM` paths and set the
reserved `POKEBENCH_RUN_ID`, `POKEBENCH_GAME_SERVER_URL`, `POKEBENCH_MODEL`, and gateway URL or endpoint
file. Verify the checkpoint hash and preset before launch. If native game clear is an authorized
stop, use preset `stopAt: "GAME_CLEAR_CONFIRMED"` and leave `target: null` for the ordinary model goal.
Read the agent's `run_start` and terminal event. Release the gateway only after the owned agent exits.
An extension is effective when the trace records the applied control and new wall budget.

For a Claude quota hold with operator-controlled retry, start the gateway with
`--manual-quota-resume`. The recorded preset must enable `provider-wait-pause-v1`, and the gateway,
agent and viewer must point at the same run directory. A quota rejection freezes the active clock.
Each viewer Resume requests one retry of the held turn. The clock stays paused through failed
retries and resumes after the held reply is delivered. Check Activity History and the gateway
journal for the hold and retry receipts. Keep the gateway attached to the same run and session.

## 3. Launch detached, from `just`

`just run-agent` expands to `just build` + `node packages/viewer/dist/fixed-cli.js play`, which
prepares `/private/tmp/pokebench-fixed-<commit12>` and runs `live.js` from **there**, with cwd kept at
the main checkout. That is why `POKEBENCH_ROM` (from `.env`), a relative preset path, and the runs
root all still resolve, while `harness.dirty` stays false no matter what main does next.

`POKEBENCH_ROM` is read from `process.env` with no dotenv load in the agent, so source `.env` in the
launching shell — a shell without it dies with `POKEBENCH_ROM is required`.

```bash
#!/bin/zsh
set -euo pipefail
cd "$HOME/dev/pokebench"
META="$PWD/runs/<meta-dir>"; mkdir -p "$META/logs"
set -a; source .env; set +a
export POKEBENCH_MODEL="deepseek/deepseek-v4.1-flash"
export POKEBENCH_ENDPOINT_FILE="$PWD/runs/orca-deepseek-control-24h/endpoint.json"
export POKEBENCH_PLAY_PRESET="$PWD/experiments/presets/current-control-24h-8k.json"
unset POKEBENCH_GAME_SERVER_URL POKEBENCH_GATEWAY_URL POKEBENCH_RUN_ID
STAMP=$(date +%Y%m%dT%H%M%S)
nohup just run-agent >"$META/logs/play-$STAMP.log" 2>&1 < /dev/null &
echo "$!" | tee "$META/logs/play-$STAMP.pid"
disown
```

`POKEBENCH_PLAY_PRESET`, `POKEBENCH_MODEL`, `POKEBENCH_ENDPOINT_FILE`, `POKEBENCH_GATEWAY_URL` and
`POKEBENCH_CHECKPOINT_FRONTIER` are the only lane variables `frozenPlay` forwards (`PRESERVED_PLAIN_VARIABLES`); everything else in the shell
env is inherited minus the lane variables. Anonymous `--commit <sha>` runs an older pin.

## 4. Ports

- Leaving `POKEBENCH_GAME_SERVER_URL` unset is the default path and is not the allocator: the
  configured default is `http://127.0.0.1:8000`, so the run takes **8000** if it is free. The
  8090–8099 pool (`GAME_PORT_POOL`) is only consulted when the URL carries no port.
- `launch.sh` always uses 8000 and refuses when it is taken. Check with `lsof` rather than
  `just run-claims`: ended runs whose claims were never closed (e.g. the `server-kill-smoke` pair from
  2026-11-02) are still listed as live owners of 8000. `lsof -nP -iTCP:<port> -sTCP:LISTEN` is the
  truth; a claim with no listener is stale, not a conflict.

## 5. Prove it, from the run's own events

```bash
python3 - <<'EOF'
import json;R="runs/<run-id>";s=json.loads(open(R+"/events.jsonl").readline())
print(s["model"], s["sampling"], s["budgets"], s["harness"], s.get("evaluation",{}).get("preset_id"), s["isolation"]["port"], s["start_state"])
EOF
```

All of these must hold, or the launch was wrong and the run should be stopped (`kill -TERM` the
`live.js` pid — recorded as `operator_abort`), the cause fixed, and a **new** run id started:

- `evaluation.preset_id` is the preset you named; `sampling.max_tokens` and `thinking_level` match it.
- `budgets` is the preset's cap (e.g. `{20000, 86400000}`) and `extend_run`/`extend_budget` are true.
- `harness.commit` is `git rev-parse HEAD` **at launch time** and `harness.dirty` is false.
- `model.id` is the lane, `start_state.kind` is `boot` unless you meant a checkpoint start.
- `isolation.port` matches the listener you expected.

Then confirm liveness: `runs/<id>/run-claim.json` heartbeat is moving, `just tail-run <id>` shows
turns, and `runs/<id>/events.jsonl` is past `GAME_RUNNING` within a few minutes. The launcher chain
must root at pid 1 (`ps -o ppid= -p <pid>` up the chain); `fixed-cli` and `just` are expected parents —
an agent terminal is not.

## 6. Traps that cost a launch

- **Main moves after the launch and that is fine.** A docs commit landing while the run plays leaves
  `harness.commit` at the pinned sha; never "fix" the run by rebuilding or re-checking out. Commits are
  also what makes replay honest: record the launch in a worklog and commit it after the run is live.
- **Never touch `/private/tmp/pokebench-fixed-<sha>` while its run is live** — no edits, no rebuild,
  no checkout. Another live run may share that same tree (it is keyed by commit, not by run).
- **A crash has no resume.** Record the end reason, root-cause it, and launch a fresh run id; the
  crashed one keeps its own evidence directory.
- **`just build` inside `run-agent` rebuilds main's dist.** Safe only because runs execute from the
  frozen tree; it is not safe to rebuild anything a *legacy* run started before run isolation (pre
  `40d51feb8`) is still executing from.
- **The :8790 viewer must be built at or after the pin.** If `packages/viewer/dist/build-stamp.json`
  names an older commit, run `just viewer-main` before the launch, not after.
- **Crash triage starts in the run directory**, not the log: `runs/<id>/server-stdout.log` and
  `server-stderr.log` now carry the vendor's `Received signal N` line, and `server_exit` / `clock_step`
  events are evidence, not errors. A `clock_step` from an NTP step is benign since `b463203f4`;
  before it, the same event killed the run as `Invalid native action journal continuity`.
