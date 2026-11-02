# hyperqwen-bundle-24h-v2 — fresh 24h bundle run on the post-landing build

Operator instruction (2026-11-02): "can u start a fresh hyperqwen 24hr run with the latest bundle on main?"

## Why a new experiment id

`hyperqwen-bundle-24h` was already **1 / 1 done**: its single planned trial,
`runs/2026-11-01T01-37-02_hyperqwen-gpu0_7da5`, ran to its wall cap and is recorded valid
(`reason: "wall cap"`, `primaryReached: true`, furthest `MATCH_CALL_TUTORIAL_COMPLETE`, depth 87).
The fixed-run ledger keys on the experiment id, so relaunching that id correctly starts nothing —
it prints `finished: 1 / 1 done` and exits. A fresh trial therefore needs a new definition, not a
restart.

`experiments/fixed/hyperqwen-bundle-24h-v2.json` is a byte-for-byte copy of
`hyperqwen-bundle-24h.json` except for `id`, `title` and `worklog`. Same lane, same start state,
same 24h cap, same reply caps.

## Design (per `pokebench-experiment-design`)

- **Tier:** exploratory. One bundle arm, `singleArm: "bundle"`, no control — this is not a
  comparison cohort.
- **Start:** `runs/launch-receipts/fast-text/MAIN_MENU.state`, sha1 `b3a6cc1c1983`, unchanged.
- **Cap:** `maxWallMs 86400000` (24h), `maxTurns 20000`.
- **N:** 1 trial, no power sizing; the previous trial's cap is retained unchanged so the two are
  comparable on wall time.
- **Lane:** A, GPU0, game port 8075, `http://127.0.0.1:18020` (vLLM `qwen3.8-27b`, TP2 both 4090s,
  `max_model_len` 262144, 1 slot, vision true).

## What is different from the previous trial

The landing `875132337` adds two flags that are **on in both** arms, and both are present in this
run's recorded feature set (322 features, up from 320):

| flag | effect |
| --- | --- |
| `fresh-retry-v1` | a no-tool reply is dropped from the retry, so the model re-sees its last tool result instead of its own truncated answer |
| `dialogue-a-line-v1` | the prompt no longer tells the model to "leave instead of pressing A" at a person; A remains the talk button |

`dialog-button-b-v1` is also on, which is what the corrected dialogue paragraph keys off.

This is the mechanism the run is measuring: the `hyperqwen` 24h trial stalled at Rusturf Tunnel
around T352–T361 after demoting Devon Goods / Peeko to a "side quest" and never re-entering, with
286 `max_tokens` retries and 552 `no_tool_call` loop breakers behind it.

## Launch record

- Definition sha256 `4b71b781…` is the **old** definition; the v2 file is a copy, so `just fixed-run
  check hyperqwen-bundle-24h-v2` re-derives and reports its own hash. Check passed before launch.
- `just viewer-main` ran first and printed `viewer at 875132337f5e…`, so the viewer is not older than
  the pinned run build.
- Launched detached (nohup + disown, launcher returns immediately) as pid `47550`.
- Preconditions cleared first: the orphaned `live.js play` (pid 10825) and game server (pid 10954)
  from the **ended** `2026-11-01T09-25-00_deepseek-v4.1-flash-mlx_control24h` run were stopped, and
  ports 8075/8076 confirmed free. That control run had ended at 14:05 the previous day with
  `reason: model_error` after 4.8h and `harness.dirty: true`; the lingering processes were not a
  live run.

## Proof of a live launch

Run `2026-11-02T02-55-21_hyperqwen-gpu0_07a7`:

| check | value |
| --- | --- |
| `run_start.evaluation.experiment.id` | `hyperqwen-bundle-24h-v2` |
| `harness.commit` / `dirty` | `875132337f5e…` / **false** |
| `budgets.max_wall_ms` | `86400000` |
| `start_state.sha1` | `b3a6cc1c1983…` |
| recorded features | 322 (`fresh-retry-v1` true, `dialogue-a-line-v1` true) |
| `/api/workbench` | listed, `problem: None`, `problems: []` |
| `just experiments-audit` | prints nothing, exit 0 |

## Open

- `docs/experiments/hyperqwen-bundle-24h-v2.html` (design skill step 9) is not written yet.
- No gate was run for this commit: the change is a new experiment definition and this worklog, and
  the 24h run is live, so a full `just test` would compete with it for CPU.
