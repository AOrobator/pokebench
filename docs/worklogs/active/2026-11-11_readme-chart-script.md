# README chart script (2026-11-11)

## Goal

Regenerate the two README charts (badges over time, badges for the money) from the run logs with one command, `just readme-charts`, and make every dollar figure come from one dated price table.

## Why

The charts were drawn by `docs/images/charts/build_charts.py` from hand-copied numbers. Costs came from five different sources, and the local models' prices were never saved, so the article, the charts and COSTS.md disagreed (the operator asked "why do we not have consistent costs?").

## What changed

- `env/pokebench_env/readme_charts.py`, in three stages:
  - `points` reads `runs/<id>/events.jsonl` (and Sol's Codex `native.jsonl`) and writes `docs/images/charts/chart-points.json`.
  - `html` renders the two chart pages from `chart-data.json` and `chart-points.json`.
  - `check-points` fails if the points no longer match the logs.
- Checkpoint chains are stitched at the milestone the next leg loaded; play after a cut is ignored.
- Badges count in the order earned; times are rounded to the nearest second.
- `docs/images/charts/chart-data.json` holds the series, human splits and page text; `prices.json` is the dated price table (as of 2026-11-11), with the provider for each model.
- Local models are now priced at the cheapest OpenRouter provider for each model's recorded tokens. Opus and Astra stay pinned, with their sources written into chart-data.json.
- `packages/viewer/scripts/readme-charts-png.mjs` screenshots the pages to `docs/images/*.png` with the viewer's Playwright.
- `just readme-charts [stage]` and `just readme-charts-check`; the generated HTML is gitignored.
- Retired `build_charts.py` and `audit_runs.py`; rewrote `COSTS.md` around the new files.
- Legend times no longer clip the right edge: the chart body has a fixed width and the screenshot viewport is 1400 px.

## Verification

- 21 tests in `env/tests/env/test_readme_charts.py`, with no IO (fake runs and an in-memory store), 99% branch coverage.
- `chart-points.json` regenerates byte-identically on the Mac; the HTML is byte-identical before and after the lint cleanup.
- Plotted figures: Opus chain $679.16, 67d7 $780.00, DeepSeek $9.56, Astra $718.54, Sol $149.92, Qwen3.6 $2.94, Qwen3.6 lane $2.83, GLM $1.21, Qwen3.8 $0.57, Qwen3.8 lane $4.84.

## Follow-ups

- The article draft was updated to the same figures and rounded times (outside the repo).
