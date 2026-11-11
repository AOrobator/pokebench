# README charts hardening

## Goal

Apply the five non-blocking hardening notes from the readme-chart-script review (landed 2760e105e). The operator: "sure" (2026-11-11 4:07 PM). Output must stay byte-identical: `check-points` passes and the HTML pages are unchanged.

## Plan

- [x] Reject unknown stage names in `just readme-charts` and in `run()`, with a clear error; bad JSON in chart-data.json is a ChartError, not a traceback.
- [x] Validate prices.json and chart-data.json into typed values in `parse_prices` / `parse_series`; ChartError on bad shapes.
- [x] `stitch` checks that each next leg's checkpoint comes from the previous leg's run folder.
- [x] Price `cache_write` tokens: optional `cache_write` rate in prices.json, defaulting to the input rate.
- [x] COSTS.md: DeepSeek peak hours use the event timestamps' local clock, which assumes the run machine is on New York time.

No feature switch: README tooling only, no harness behavior.

## Log

- 2026-11-11 4:12 PM: RED. New and updated tests in env/tests/env/test_readme_charts.py: 26 fail, 19 pass.
- 2026-11-11 4:20 PM: GREEN. 45 tests pass under the no-I/O guard, readme_charts.py 99% branch coverage. ruff, ruff format and mypy are clean. Byte-identical output: check-points against ~/dev/pokebench/runs matches, and both HTML pages from the old code (79704679f) and the new code are identical. `just readme-charts pionts` exits 2 with a usage error before running anything; with [positional-arguments], the default stage still reaches $1.
- 2026-11-11 4:16 PM: in the relay-granted window (4:11 PM), just lint and just test are green at 4858372e4: agent 3,042, viewer 1,281, env 3,364 (floor 69, at 83.68%), claude-gateway 39, no-I/O proof OK. Window released.
