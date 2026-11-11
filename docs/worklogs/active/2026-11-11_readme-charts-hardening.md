# README charts hardening

## Goal

Apply the five non-blocking hardening notes from the readme-chart-script review (landed 2760e105e). The operator: "sure" (2026-11-11 4:07 PM). Output must stay byte-identical: `check-points` passes and the HTML pages are unchanged.

## Plan

- [ ] Reject unknown stage names in `just readme-charts` and in `run()`, with a clear error; bad JSON in chart-data.json is a ChartError, not a traceback.
- [ ] Validate prices.json and chart-data.json into typed values in `parse_prices` / `parse_series`; ChartError on bad shapes.
- [ ] `stitch` checks that each next leg's checkpoint comes from the previous leg's run folder.
- [ ] Price `cache_write` tokens: optional `cache_write` rate in prices.json, defaulting to the input rate.
- [ ] COSTS.md: DeepSeek peak hours use the event timestamps' local clock, which assumes the run machine is on New York time.

No feature switch: README tooling only, no harness behavior.

## Log

- 2026-11-11 4:12 PM: RED. New and updated tests in env/tests/env/test_readme_charts.py: 26 fail, 19 pass.
