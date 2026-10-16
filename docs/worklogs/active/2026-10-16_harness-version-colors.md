# Story frontier: color and group runs by model + harness version

Branch `claude/harness-version-colors`, worktree `.claude/worktrees/agent-ab63ac8e28a531a59`.

## Goal

Operator-approved design `runs/mockups/frontier-grouping/b5-model-switch-set.html` (B revised 4), with one operator change: the selected (isolated) version row never uses a side accent bar. It uses the Pokémon menu-selection look instead (cream panel, full dark rounded border, a ▶ cursor), on phone rows and desktop cards alike.

Viewer-only change: no harness behavior, so no feature switch.

## Rules chosen

- **Harness version** = model + the exact set of switchable features with `on === true` in the run's `config.features`. `false` and `null` both count as not on. `null` is what the snapshot gives for every switch a run did not list in `harness_features` when its config could not be verified (every save-state start, see `configOf`), so treating null as unknown would put every bundle-v-control run in legacy.
- **Legacy** = no switch map: `config === null`, or no switch on and at least one `null` (runs from before switches were recorded, `harness_features` empty). Named `<short model> · legacy <arm>`, never numbered, never compared, grey colors, own legend section "Legacy runs · no switch map".
- **Arm** = `run_start.evaluation.experiment.arm` (new `WorkbenchRun.arm: string | null`), else `config.preset`, else `untagged`. A version takes the arm of its earliest run.
- **Numbering** per model and arm, by the version's first run start (undated last). Name `<short model> · <arm> vN`.
- **Comparison**: vN compares with v(N-1) of the same model and arm; v1 of any arm but control compares with the same model's `control v1` when there is one; otherwise "first version".
- **Short model names** by rule (`shortModelName`): basename after `/`, lower case, no `.gguf`, cut at the first size/quant token (`35b`, `a3b`, `q4…`, `iq4…`, `fp8`, `ud`, `gguf`, `instruct`, `it`…), version dots squeezed (`qwen3.6` → `qwen36`). `/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf` → `qwen36`, `Qwen3.8-Flash-Next-UD-IQ4_XS` → `qwen38-flash-next`, `think-fast` stays. No SKU table.
- **Colors**: bundle warm list, control cool list, other arms a hue hashed from the arm text, legacy grey; none is the frontier gold or the human navy. Each new version takes its family's first color not already held; colors already given out are kept across polls (`versionColors`).
- **Switch labels**: `config.features[].label` (the `FEATURES` title) in sentence case with acronyms kept (`RAM`, `NPCs`, `UI`, `v2`); the id beside it in mono.
- **Selection look** (operator change): the isolated card/row is the Pokémon menu selection: cream `#f8f8d8` panel, 3px `#283038` rounded border, inset bottom shade like the run plates, and a `▶` cursor. No side accent bars anywhere in the feature (a test greps the CSS block).
- **Hover vs isolate**: hover/focus highlights a version only while nothing is isolated; click/Enter/Space isolates; click again or Show all clears. A filter that removes the isolated version clears it.

## Milestones

- [x] M1 RED (f21a7bef): unit tests for version grouping, numbering, diffs, colors, short model names, `arm` in the snapshot, legend/isolate rendering. The new test files import `frontier-versions.js` and `frontier-legend.js`, which do not exist at this commit.
- [x] M1 GREEN (see next entry): `frontier-versions.ts`, `arm` on `WorkbenchRun`, frontier plot colored by version, legend cards / phone bars, hover / isolate / show all.
- [ ] Real-data read-only version table.
- [ ] Browser check on a scratch server + screenshots `runs/mockups/frontier-grouping/shots/impl-*.png`.
- [ ] Gates: viewer tests, coverage ≥ 90, lint.

## Log

- GREEN: viewer 952 tests pass; coverage all files 95.46 / 91.22 / 93.78 / 97.7 (stmts/branches/funcs/lines); `frontier-versions.ts` 100/91.4/100, `frontier-legend.ts` 100/95.3/100; `pnpm lint` (tsc + eslint) clean.
- RED (browser finding): clicking the Human baseline or Agent frontier item in the mark key did nothing, because the click guard skipped anything inside a <details> and the key lives inside the What the marks mean bar. New workbench test fails at this commit.
- RED (browser findings): switch titles with a hyphenated acronym read "Low-hp"; on a phone the isolated chip squeezed the version name to "qwen3…" behind the bar title, so the chip gets a short arm-only label ("bundle v7").
- GREEN (browser findings): mark-key clicks isolate (the guard now only skips controls inside the item itself); hyphenated acronyms ("Low-HP"); phone chip shows "bundle v7" and never shrinks, the bar title truncates instead; phone row names wrap; larger ▶ cursor; desktop version panel scrolls inside the card past min(56vh, 520px) so a long list keeps the chart reachable while the legend still opens by default; bar titles 8px; live key svg has a halo. Viewer 953 tests pass; lint clean.
