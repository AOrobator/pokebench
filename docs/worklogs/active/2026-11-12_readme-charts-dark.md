# README charts dark mode

The operator: "yes we need a dark mode option for the script". Branch `claude/readme-charts-dark`, worktree `~/dev/pokebench-readme-charts-dark`, base main e1dbd1906.

## Problem
`env/pokebench_env/readme_charts.py` builds the two README chart pages (badges-over-time, badges-for-the-money) with colours hard-coded in the CSS constant and the SVG builders. The README shows the light PNGs even for readers in dark mode.

## Design
- A frozen `Palette` dataclass. `LIGHT` holds today's colours; `DARK` holds the approved prototype: page #0f1720, card interior #17212b, text #e6ecef, secondary text #c3ccd2, axis text #9aa6ae, grid #26323d, 8-badge line #4a5866. The green card frame (#2c5f55, #5ab89c) stays. The hollow-point fill is a property equal to the card interior.
- Every colour in the page builders comes from the palette; `CSS` becomes `css(palette)`.
- Series gain an optional `dark_color` in chart-data.json, validated as text like `color`; absent means `color` in dark. Approved: Opus Rayquaza lane #9ec5e8, DeepSeek #4f8ff0, GLM #c79a63, Sol #a9aeb6.
- `build_pages` returns four pages: the two light names unchanged plus `badges-over-time-dark.html` and `badges-for-the-money-dark.html`. The PNG script renders all four.
- README Results images become `<picture>` with a dark `<source>` and the light `<img>` fallback.

## Invariants
- Light HTML is byte-identical to main's for the same input (sha256 of main's output for the test fixture pinned in the test; real chart-data html compared to main's output by hand).
- Dark pages contain no light-only colour.
- No test I/O; no new dependencies; nothing under runs/ changed.

## Milestones
- [x] M1 RED: failing tests for palette, dark pages, dark_color fallback/validation, light byte identity, hollow fill. 8 failed, 45 passed (the light byte-identity test passes on main, pinning its hashes). COMMIT: `test(env): cover README chart dark pages` (this commit).
- [ ] M2 GREEN: palette + dark_color + four pages; PNG script renders four; chart-data dark colours; README `<picture>`; four PNGs regenerated and inspected.
- [ ] Focused checks: pytest file, ruff + mypy on changed Python, eslint on the .mjs.
- [ ] Review / landing: held for the caller (no merge, push or land here).
