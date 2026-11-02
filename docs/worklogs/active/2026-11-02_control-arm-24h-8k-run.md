# 24h control arm on `main` — DeepSeek v4.1 Flash

Operator instruction (2026-11-02): "lets kick off a 24hr deepseek api run on the latest control arm
on main".

## The arm

`experiments/presets/current-control-24h-8k.json` (`current-control-24h-8k`, version 2) — the control
arm promoted in `68f7da476`: `max_tokens` 8192, `thinkingLevel` medium, 20000 turns, 86400000 ms,
target `null`, boot start. Its feature keys are exactly `experiments/feature-configs/current.json`'s
recipe, so the run plays the control arm and nothing else.

## Why a new run

The previous 24h control run, `2026-11-02T06-25-22_deepseek-deepseek-v4.1-flash_53be`, ended `crash`
at turn 182 after 46m32s on `Invalid native action journal continuity`: an NTP wall-clock step of
−842 ms landed between two journal reads, and the recorder treated the regressing
`server_timestamp` as a continuity violation. `b463203f4` makes id and frame the ordering authority,
records a `clock_step` instead of throwing, and records `server_exit` evidence. `main` is
`b57154531`, which carries that fix and the gates recorded for it.

## The lane

`deepseek/deepseek-v4.1-flash` on OrcaRouter, reached through the loopback proxy on
`127.0.0.1:18100` (`runs/orca-deepseek-control-24h/proxy.py`, up since 2026-11-01 09:05) via the
endpoint file `runs/orca-deepseek-control-24h/endpoint.json` (`vision: true`, context 1048576).
A one-token completion through that endpoint returned `200` with model
`deepseek/deepseek-v4.1-flash` before the launch.

## Launch

`runs/orca-deepseek-control-8k-24h/launch.sh` — detached (`nohup` + `disown`, ppid 1). It runs
`just run-agent`, so the run executes from the prepared checkout at
`/private/tmp/pokebench-fixed-b57154531754` and cannot record `harness.dirty`, while `POKEBENCH_ROM`
comes from the main checkout's `.env`. `POKEBENCH_GAME_SERVER_URL` is left unset; the configured
default port 8000 was free, so the run took it.

Run: `2026-11-02T15-53-23_deepseek-deepseek-v4.1-flash_80c8`, `run_start` at
`2026-11-02T15:54:10-05:00` (turn 0). Recorded:

- preset `current-control-24h-8k`, `sampling {thinking_level: medium, max_tokens: 8192}`
- budgets `{max_turns: 20000, max_wall_ms: 86400000}`, `extend_run` and `extend_budget` true
- model `deepseek/deepseek-v4.1-flash` (context 1048576, vision), harness
  `b57154531754…`, `dirty: false`, `start_state: boot`
- isolation port 8000, server dir `runs/<id>/server`

Log: `runs/orca-deepseek-control-8k-24h/logs/play-20261102T155138.log`. It ends at the 24 h wall
(2026-11-03T15:54:10-05:00) or at 20000 turns, whichever comes first.

## What this run is here to show

The control arm, unmodified, over a full day. With `b463203f4` a clock step no longer kills a run,
so a `clock_step` event is expected evidence the fix fired, not a failure. The hyperqwen 24h bundle
is in flight beside it (`2026-11-02T14-53-03_hyperqwen-gpu0_de7a`, GPU0 vLLM lane, port 8075): the
two runs share the machine, not the checkout, the model lane, or the game port.
