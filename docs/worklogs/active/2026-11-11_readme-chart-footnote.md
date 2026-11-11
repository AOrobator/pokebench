# README chart footnote: what the Rayquaza lane adds

## Goal

Correct the badges-over-time assisted footnote. The Opus lane run had no just-in-time guide, only four one-time hints and a Mach Bike dash tool. The operator approved the exact wording ("ok to both", 2026-11-11).

## Log

- [x] 2026-11-11 5:12 PM: chart-data.json badges_over_time note rewritten to the approved wording. The money page note ("Heavily assisted (Rayquaza lane), shown as hollow points") and COSTS.md make no just-in-time-guide claim, so they are unchanged. `just readme-charts html` rebuilt both PNGs; badges-for-the-money.png came out byte-identical, and badges-over-time.png was viewed: the footnote wraps to two lines inside the card, with no clipping. check-points matches the run logs.
- [x] 2026-11-11 5:17 PM: Codex LGTM (docs-only review). Landed on main at 1a99e7ab7, fast-forward (the operator: "land it"). Post-main docs checks: check-points matches and chart-data.json parses. Docs-only, so no full suite.
