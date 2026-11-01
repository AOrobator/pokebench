---
name: detached-long-lived-processes
description: Launch every long-lived PokeBench process (gameplay, fixed-run runner, viewer, model proxy, local inference) fully detached from the agent session so Cursor/Claude/Codex restarts cannot kill it. Use before any live.js play, fixed-run, viewer-main, or proxy start; not for one-shot checks.
---

# Detached long-lived processes (NON-NEGOTIABLE)

Operator decision 2026-11-01: **when a viewer or run starts, the process can NOT be LLM owned.** Cursor/Claude/Codex session death (restart, compact, stop) must not abort gameplay or the served viewer.

Incident: a DeepSeek control `live.js play` started in a Cursor background terminal (`block_until_ms: 0` / `exec`) died as `operator_abort` when Cursor restarted.

## What counts as long-lived

- `node …/live.js play` (ad-hoc or experiment trial)
- `just fixed-run run …` / `fixed-cli.js run`
- Served viewer on `:8790` (`just viewer-main` and any lasting scratch viewer you intend to keep)
- Loopback model proxies (e.g. Orca/OpenAI-compatible proxies for cloud lanes)
- Local model servers you start for a run (llama-server, MLX serve, etc.) when they outlive the chat

One-shot probes, `just smoke`, builds, and status checks are fine attached.

## Forbidden (LLM-owned)

These **own** the process lifetime and die with the agent UI:

- Cursor / Claude Code **background terminal sessions** (`block_until_ms: 0`, `run_in_background`, lingering `exec … play`)
- Foreground agent shells that never return while `play` / viewer / proxy runs
- Starting play/viewer/proxy and only "monitoring" via that same shell's lifetime

`disown` inside a Cursor-owned background terminal is **not** enough if that terminal session is what Cursor tears down on restart.

## Required detach recipe

Use **`nohup`**, redirect stdin/stdout/stderr to files under `runs/`, background, **`disown`**, and let the **launching shell exit immediately** (a normal foreground tool call that returns). Prefer helpers that already detach (`just fixed-run` via the recipe below; `just viewer-main`).

### Fixed-run

```bash
mkdir -p runs/experiments/<id>
nohup just fixed-run run <id> >> runs/experiments/<id>/runner.log 2>&1 < /dev/null &
echo $! | tee runs/experiments/<id>/runner.pid
disown
```

Then prove liveness with `just fixed-run status` / `runner.json` — not by keeping a terminal attached. Full gate: `fixed-run-launch`.

### Ad-hoc `live.js play` (cloud proxy, solo control arm, etc.)

```bash
META=runs/<meta-dir>   # e.g. runs/orca-deepseek-control-4h
mkdir -p "$META/logs"
# load .env in the same shell, export POKEBENCH_* , then:
nohup node packages/agent/dist/live.js play \
  >>"$META/logs/play.stdout.log" 2>>"$META/logs/play.stderr.log" < /dev/null &
echo $! | tee "$META/logs/play.pid"
disown
```

Proxies the same way (`nohup python …/proxy.py >>…/proxy.stdout.log 2>>…/proxy.stderr.log < /dev/null &` + pid file + `disown`).

### Viewer

Prefer `just viewer-main` (authorized served `:8790`). Do not leave `node …/viewer` running as the agent session's child. Scratch viewers for proof must be stopped when done (`close-the-loop`); a scratch you intend to keep must use the same nohup/disown pattern and a recorded pid/log.

## Prove it is not LLM-owned (required before calling it launched)

1. Launch command returns; agent shell is idle.
2. Pid file exists; `ps -p $(cat …pid)` shows the process.
3. Parent is **not** a Cursor/Claude/Codex helper or the agent terminal wrapper (`ps -o ppid=,command= -p <pid>` / walk parents). After a clean detach, ppid is typically `1` (launchd) or an intentional supervisor — never the chat's shell.
4. Intentionally **do not** rely on the agent terminal remaining open. Optional hard check: if you can confirm the process still runs after the launch shell has exited, that is the bar Cursor restart must also clear.

## Stopping

Still `kill -TERM` the recorded pid (play → `operator_abort`; never SIGKILL the game server first). Detach rules do not change stop semantics in `fixed-run-launch`.

## Related

- `fixed-run-launch` — cohort launch proof
- `pokebench-run-coordination` — compute clearance before launch
- `close-the-loop` — viewer/run proof surfaces
