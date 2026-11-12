# Where each dollar figure on the README charts comes from

`just readme-charts` regenerates both README charts (`docs/images/badges-over-time.png` and `docs/images/badges-for-the-money.png`) from the run logs. Each model's cost is the API-price cost of its best run **up to the furthest milestone it reached**, not the whole run.

The inputs live next to this file:

- `chart-data.json` lists every plotted series: its run ids, colour, whether it is assisted, and how its cost is found. It also holds the human world-record splits and the page titles and notes.
- `prices.json` is the dated price table (dollars per million tokens), with the provider each price came from.
- `chart-points.json` is generated. It records each series' milestone times and cost, so the HTML and PNG stage can run without `runs/`.

The code is `env/pokebench_env/readme_charts.py`; its tests are in `env/tests/env/test_readme_charts.py`.

## Commands

- `just readme-charts` reads `runs/`, rewrites `chart-points.json`, then renders the HTML and PNGs.
- `just readme-charts html` re-renders from the committed `chart-points.json` only, for a copy without `runs/`.
- `just readme-charts-check` fails if `chart-points.json` no longer matches the run logs.

## Times and milestones

Times come from each run's `runs/<id>/events.jsonl`: a milestone's wall-clock `t` minus the `run_start` `t`, rounded to the nearest second. Milestones already held when the run started (`origin: present_at_start`) are skipped.

A checkpoint chain (the Opus chain `6302→1121→69d8→d718`) is stitched: each leg is cut at the milestone whose checkpoint the next leg loaded, the cuts are summed, and anything a leg did after its cut is ignored, because that play was rolled back. Each leg's checkpoint must sit in the previous leg's run folder (`runs/<previous run>/checkpoints/<milestone>.state`), so a misordered `runs` list fails instead of stitching silently.

Badges count up in the order they were earned. The Elite Four, Champion and Hall of Fame rows sit above the eighth badge.

## Costs

Each series' `cost.kind` in `chart-data.json` says how its dollars are found.

| Kind | Series | How |
|---|---|---|
| `events` | DeepSeek V4.1 Flash, all local models | `usage` on every `"type":"assistant"` event in `events.jsonl` (`input`, `cache_read`, `cache_write`, `output`), summed up to the milestone, at the series' `prices.json` entry. `cache_write` is priced at the entry's own `cache_write` rate, or at its input rate when it has none; no plotted run records cache writes today. |
| `codex` | GPT-6.1 Sol | the last cumulative `token_count` reading (`payload.info.total_token_usage`) at or before the milestone, in `runs/<id>/attached-harness/codex/native.jsonl`. Its `input` includes cached tokens. |
| `pinned` | Claude Opus 5.5 (chain and Rayquaza lane), GPT-6 Astra | a fixed figure whose source is written into `chart-data.json`, because the tokens are not in the run folder |

### Prices (`prices.json`, as of 2026-11-11)

| Model | Provider | Input | Cache read | Output |
|---|---|---|---|---|
| DeepSeek V4.1 Flash | OrcaRouter list price | $0.15 | $0.003 | $0.60 |
| GPT-6.1 Sol | OpenAI API list price | $2.00 | $0.10 | $10.00 |
| Qwen3.6 35B-A3B | PrimeIntellect (fp8) on OpenRouter | $0.011 | $0.010 | $0.103 |
| Qwen3.8 27B | PrimeIntellect (fp8) on OpenRouter | $0.064 | $0.007 | $0.456 |
| GLM-5.3 Flash | PrimeIntellect on OpenRouter | $0.0525 | $0.0105 | $0.25 |

- **Local models** (Qwen3.6, Qwen3.8, GLM) ran on our own GPUs, so their figures are estimates: the recorded tokens priced at the OpenRouter provider that is cheapest **for that model's tokens**, from the listings fetched 2026-11-11 19:58 UTC. The provider is picked once per model, over the pooled usage of all that model's plotted runs, so a single run can be marginally cheaper elsewhere: Qwen3.8's `6056` alone would be $4.80 on Chutes against $4.84 on PrimeIntellect. To refresh them, fetch the listings again, update `prices.json` and its `as_of`, and run `just readme-charts`.
- **DeepSeek:** OrcaRouter doubles its prices 8–11 PM and 1–5 AM New York time, so a turn whose event time falls in those hours is charged double (`peak` in `prices.json`). The hours are read from the local clock in each event's own timestamp, which assumes the run machine was on New York time; a run recorded in another timezone would be priced at the wrong hours.

### Pinned figures

- **Claude Opus 5.5** ran through the Claude session gateway on a Claude Max plan, so `events.jsonl` records zero tokens. The cost comes from the Claude Code session transcript in the gateway's config directory, outside the repository: the last cumulative `totalCostUSD` (in `"type":"cost-state"` lines, at Anthropic's list prices) at or before the milestone's time.
  - **Chain:** $679.16 at d718's `ELITE_FOUR_GLACIA_DEFEATED`, from a Claude Code session transcript (outside the repo). All four legs ran in one session, so this figure **includes** the leg tails the stitched timeline drops (about 42 minutes before the last leg) and overstates the stitched path.
  - **Rayquaza lane `67d7`:** $780.00 at `GAME_CLEAR_CONFIRMED`, from a Claude Code session transcript (outside the repo). The README's $780.55 is the whole run, to `run_end`.
- **GPT-6 Astra `429f`:** $718.54 to the Heat Badge, from the operator's run-grades report of 2026-10-30. 657,608,898 input tokens, of which 653,478,400 were cache reads, and 475,056 output, at $10 / $1 / $50 per million. The run folder's own Codex transcript ends before the Heat Badge, so this **cannot be recomputed from the repository**.
