# Where each dollar figure on the README charts comes from

`build_charts.py` plots one cost per model: the API-price cost of its best run **up to the furthest milestone it reached**, not the whole run. This file records the source, the calculation and the prices behind each one, so it can be checked or regenerated. Times and milestones are re-derived by `audit_runs.py`. Paths are relative to the repository; runs are under `runs/<run-id>/`.

| Point | $ | Up to | Kind | Source |
|---|---|---|---|---|
| Claude Opus 5.5, chain `6302→1121→69d8→d718` | 679.16 | Glacia (d718 turn 1127) | cumulative session cost at that moment | gateway session record |
| Claude Opus 5.5, Rayquaza lane `67d7` | 780.00 | Hall of Fame (turn 4119) | cumulative session cost at that moment | gateway session record |
| GPT-6 Astra `429f` | 718.54 | Heat Badge (turn 2418) | cumulative to the badge | operator's 10/30 run-grades report, Codex native session usage |
| GPT-6.1 Sol `3300` | 149.92 | Dynamo Badge (turn 858) | cumulative to the badge | `runs/<id>/attached-harness/codex/native.jsonl` |
| DeepSeek V4.1 Flash `5f0f` | 9.56 | Balance Badge (turn 1684) | cumulative to the badge | `runs/<id>/events.jsonl` usage |
| Qwen3.6 35B-A3B `d41e` | 2.94 | Dynamo Badge | article figure | cheapest OpenRouter provider (the operator, 11/9) |
| Qwen3.6 35B-A3B, Rayquaza lane `3bb0` | 2.82 | Balance Badge | article figure | cheapest OpenRouter provider (the operator, 11/9) |
| GLM-5.3 Flash `6bbd` | 2.85 | Dynamo Badge | article figure | cheapest OpenRouter provider (the operator, 11/9) |
| Qwen3.8 27B `7da5` | 1.04 | Stone Badge | article figure | cheapest OpenRouter provider (the operator, 11/9) |
| Qwen3.8 27B, Rayquaza lane `6056` | 6.09 | Knuckle Badge | article figure | cheapest OpenRouter provider (the operator, 11/9) |

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

Basis: each run's recorded tokens at the **cheapest OpenRouter provider for that model**, which is the method the operator chose on 2026-11-09 and the article uses ("as of 11/8"). The figures plotted are the article's as published.

- **Token source:** `usage` on every `"type":"assistant"` event in `runs/<id>/events.jsonl` (`input`, `cache_read`, `output`), summed up to the plotted milestone. Cache reads are charged at the input rate.
- **Qwen3.6 35B-A3B** (`d41e`, `3bb0`): the cheapest provider was an fp8 host at $0.011 input and $0.101 output per million.
  - Recomputed for `d41e` to the Dynamo Badge: 180,357,696 input + 68,504,132 cache read at $0.011, plus 2,668,903 output at $0.101, gives **$3.01**. The article has $2.94; the small gap is consistent with the 11/8 price snapshot or a slightly different cut-off.
- **GLM-5.3 Flash** (`6bbd`) and **Qwen3.8 27B** (`7da5`, `6056`): the cheapest-provider rates used for the article were not recorded. These figures are the article's as published.
- **Before publishing:** record the per-model provider rates next to this file, so every local figure can be recomputed the way `d41e`'s is above.
