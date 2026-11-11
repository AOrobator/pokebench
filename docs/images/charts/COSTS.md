# Where each dollar figure on the README charts comes from

`build_charts.py` plots one cost per model: the API-price cost of its best run **up to the furthest milestone it reached**, not the whole run. This file records the source, the calculation and the prices behind each one, so it can be checked or regenerated. Times and milestones are re-derived by `audit_runs.py`. Paths are relative to the repository; runs are under `runs/<run-id>/`.

| Point | $ | Up to | Kind | Source |
|---|---|---|---|---|
| Claude Opus 5.5, chain `6302→1121→69d8→d718` | 679.16 | Glacia (d718 turn 1127) | cumulative session cost at that moment | gateway session record |
| Claude Opus 5.5, Rayquaza lane `67d7` | 780.00 | Hall of Fame (turn 4119) | cumulative session cost at that moment | gateway session record |
| GPT-6 Astra `429f` | 718.54 | Heat Badge (turn 2418) | cumulative to the badge | operator's 10/30 run-grades report, Codex native session usage |
| GPT-6.1 Sol `3300` | 149.92 | Dynamo Badge (turn 858) | cumulative to the badge | `runs/<id>/attached-harness/codex/native.jsonl` |
| DeepSeek V4.1 Flash `5f0f` | 9.56 | Balance Badge (turn 1684) | cumulative to the badge | `runs/<id>/events.jsonl` usage |
| Qwen3.6 35B-A3B `d41e` | 2.94 | Dynamo Badge | copied from the article | not reproducible from disk |
| Qwen3.6 35B-A3B, Rayquaza lane `3bb0` | 2.82 | Balance Badge | copied from the article | not reproducible from disk |
| GLM-5.3 Flash `6bbd` | 2.85 | Dynamo Badge | copied from the article | not reproducible from disk |
| Qwen3.8 27B `7da5` | 1.04 | Stone Badge | copied from the article | not reproducible from disk |
| Qwen3.8 27B, Rayquaza lane `6056` | 6.09 | Knuckle Badge | copied from the article | not reproducible from disk |

## Claude Opus 5.5 (chain and `67d7`)

Opus ran through the Claude session gateway on a Claude Max plan, so `events.jsonl` records zero tokens. The cost comes from the gateway's Claude Code session transcript, which lives in the gateway's Claude config directory, outside the repository: `<claude-config>/projects/<project>/<session-id>.jsonl`. The session ids are `00000000…` for the unassisted chain and `00000001…` for `67d7`.

- The transcript has `"type":"cost-state"` lines carrying a cumulative `totalCostUSD`, which Claude Code computes at Anthropic's list prices. A cost-state line has no timestamp of its own, so it takes the timestamp of the line before it.
- The cost at a milestone is the last `totalCostUSD` at or before the milestone event's wall-clock `t` in `events.jsonl`.
- **Chain:** all four legs ran in one Claude session, so no stitching of dollars is needed. The value at d718's `ELITE_FOUR_GLACIA_DEFEATED` is $679.16. It is cumulative across the whole session, so it **includes** the stretches the stitched timeline drops: each leg's play after the checkpoint the next leg loaded, about 42 minutes of it before the last leg. The cost therefore overstates the stitched path. The same method gives $546.67 at the Rain Badge, the figure the article uses.
- **`67d7`:** $780.00 at `GAME_CLEAR_CONFIRMED`. The README's "$780.55" is the whole run, to `run_end`, from the staged release.

## GPT-6 Astra `429f`

$718.54 is the cumulative cost to `HEAT_BADGE`, taken from the operator's run-grades report of 2026-10-30, in its "Token cost to each earned badge" table. That report read the Codex native session usage over the run's wall-clock window:

- 657,608,898 processed input tokens, of which 653,478,400 were cache reads, and 475,056 output tokens.
- At $10 input, $1 cached input and $50 output per million: (657,608,898 − 653,478,400) × 10 + 653,478,400 × 1 + 475,056 × 50, divided by 10⁶, comes to $718.53, which the report gives as $718.54.

The run's own `runs/<id>/attached-harness/codex/*native-transcript.jsonl` starts partway through the run and ends before the Heat Badge, so the figure **cannot be recomputed from the repository's run folder alone**. It needs the Codex session rollout kept by Codex itself.

## GPT-6.1 Sol `3300`

- Source: `token_count` events in `runs/<id>/attached-harness/codex/native.jsonl`, field `payload.info.total_token_usage`.
- The cost at a milestone uses the last cumulative reading at or before the milestone's time.
- Prices: $2 input, $0.10 cached input and $10 output per million (GPT-6.1 Sol API list price).
- At the Dynamo Badge: 1.328B input, of which 1.321B were cached, and 451k output, giving $149.92.

## DeepSeek V4.1 Flash `5f0f`

- Source: `usage` on every `"type":"assistant"` event in `runs/<id>/events.jsonl`, summed up to the `BALANCE_BADGE` event.
- Prices: OrcaRouter's catalogue (`GET /v1/models`, model `deepseek/deepseek-v4.1-flash`, read 2026-11-11): $0.15 prompt, $0.003 cache read and $0.60 completion per million.
- Peak hours: a turn whose event time falls in 01:00–04:00 or 06:00–10:00 UTC is charged double, matching the gateway's double-price windows.
  - With doubling: $9.56. Without it: $6.56. The article uses $9.56.

## Local models (Qwen3.6, Qwen3.8, GLM-5.3 Flash)

These five figures are **copied from the article** ("01 PokeBench Intro", Badges first, then the bill), as the operator chose on 2026-11-11. The article says they are each run's tokens at the cheapest OpenRouter provider for that model as of 11/8, but **no per-token prices or calculation for them are on disk**, so they are not reproducible from this repository today.

- **Token source:** each run's `events.jsonl` does record usage for local runs, in `assistant` events with `input`, `cache_read` and `output`.
- **Attempt at re-deriving them:** pricing those tokens at the OpenRouter rates we could find gives much larger totals. To the plotted milestone:

  | Run | $/M (input, cache read, output) | Result | Article |
  |---|---|---|---|
  | `d41e` | 0.248, 0.248, 1.485 | $65.68 | $2.94 |
  | `3bb0` | same | $63.24 | $2.82 |
  | `6056` | 0.33, 0.33, 2.4 | $47.16 | $6.09 |
  | `6bbd` | 0.15, 0.03, 0.5 | $3.30 | $2.85 |
  | `7da5` | 0.33, 0.33, 2.4 | $5.68 | $1.04 |

  These rates charge cache reads at the full input rate for Qwen. The gap probably comes from cache handling or the provider chosen, but that is unconfirmed.
- **Before publishing:** confirm the article's per-model prices and cache treatment, then replace the copied figures with computed ones.
