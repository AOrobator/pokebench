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
- [x] Real-data read-only version table (below).
- [x] Browser check on a scratch server + screenshots `runs/mockups/frontier-grouping/shots/impl-*.png`.
- [x] Gates: viewer tests, coverage ≥ 90, lint.

## Log

- GREEN: viewer 952 tests pass; coverage all files 95.46 / 91.22 / 93.78 / 97.7 (stmts/branches/funcs/lines); `frontier-versions.ts` 100/91.4/100, `frontier-legend.ts` 100/95.3/100; `pnpm lint` (tsc + eslint) clean.
- RED (browser finding): clicking the Human baseline or Agent frontier item in the mark key did nothing, because the click guard skipped anything inside a <details> and the key lives inside the What the marks mean bar. New workbench test fails at this commit.
- RED (browser findings): switch titles with a hyphenated acronym read "Low-hp"; on a phone the isolated chip squeezed the version name to "qwen3…" behind the bar title, so the chip gets a short arm-only label ("bundle v7").
- GREEN (browser findings): mark-key clicks isolate (the guard now only skips controls inside the item itself); hyphenated acronyms ("Low-HP"); phone chip shows "bundle v7" and never shrinks, the bar title truncates instead; phone row names wrap; larger ▶ cursor; desktop version panel scrolls inside the card past min(56vh, 520px) so a long list keeps the chart reachable while the legend still opens by default; bar titles 8px; live key svg has a halo. Viewer 953 tests pass; lint clean.
- GREEN (phone polish): the closed phone bar keeps "Harness versions · N" whole and clips swatches instead. Final gates: viewer 953 tests; coverage all files 95.47 / 91.22 / 93.79 / 97.7; `frontier-versions.ts` 100 / 92.4 / 100, `frontier-legend.ts` 100 / 95.5 / 100 (lines / branches / functions); `pnpm lint` clean.
- Browser check: built viewer served by `startViewer` (no CLI, no queue runner) on 127.0.0.1:8797 against a copy of 39 run logs (the qwen36 bundle-v-control runs, 3 think-fast, 2 legacy think-swarm, the human reference, dea1) in gitignored `runs/scratch-hv/runs` of this worktree; `/health` answered locally so the two copied in-progress runs show live. Headless Chrome with CDP mouse and key input, waited past two polls: hover dims the rest, click and Enter isolate, Show all clears, Show what changed and the open bars survive polls, mark-key Human baseline isolates, EXPERIMENT/MODEL filters change the version list, FULL BASELINE works, LIVE tags and glow show by version, no horizontal scroll at 375, no console errors. Server stopped.

## Real data (read-only, `~/dev/pokebench/runs`, no disk cache, 2026-10-16 ~13:55 ET)

snapshot runs 267; frontier-drawn agent runs 178; versions 51; frontier 2026-10-16T12-42-29_qwen36-gpu0_4caa = qwen36 · bundle v7
| Version | Runs | Switches on | vs previous | Builds | Color |
|---|---|---|---|---|---|
| qwen36 · bundle v1 | 8 | 33 | control v1: +8 −0 | 3bab974, be38752, c5b7a84, ca37a39, fa09dbe | #c25464 |
| qwen36 · bundle v2 | 1 | 45 | bundle v1: +12 −0 | da8993a | #c16b27 |
| qwen36 · bundle v3 | 1 | 49 | bundle v2: +4 −0 | 6d2be8a | #ae4c96 |
| qwen36 · bundle v4 | 1 | 54 | bundle v3: +5 −0 | 1f4ac74 | #8856b5 |
| qwen36 · bundle v5 | 1 | 59 | bundle v4: +5 −0 | 5b93cda | #9a3b2e |
| qwen36 · bundle v6 | 1 | 60 | bundle v5: +1 −0 | 9e27986 | #d0742f |
| qwen36 · bundle v7 | 2 | 68 | bundle v6: +8 −0 | 6603d64 | #b0466f |
| qwen36 · bundle v8 | 1 | 69 | bundle v7: +1 −0 | 53461a4 | #7d3f8f |
| qwen36 · control v1 | 7 | 25 | — | 3bab974, be38752, c5b7a84, ca37a39 | #2583bd |
| qwen36 · control v2 | 2 | 28 | control v1: +3 −0 | 6d2be8a, da8993a | #208b71 |
| qwen36 · control v3 | 1 | 29 | control v2: +1 −0 | 1f4ac74 | #238e9f |
| qwen36 · control v4 | 2 | 31 | control v3: +2 −0 | 5b93cda, 9e27986 | #4b6fc4 |
| qwen36 · control v5 | 2 | 35 | control v4: +4 −0 | 6603d64 | #2f8f4f |
| qwen36 · control v6 | 1 | 36 | control v5: +1 −0 | 53461a4 | #1d6f8a |
| qwen36 · bundle-v-control-showcase2-cook-bundle v1 | 1 | 40 | control v1: +15 −0 | 0ccf1bd | hsl(300 45% 38%) |
| think-fast · checkpoint-clock-set v1 | 2 | 22 | — | 11163f5, c1a442f | hsl(192 45% 38%) |
| think-fast · dialogue-information-n4-combined v1 | 4 | 23 | — | 0ce117d | hsl(256 45% 38%) |
| think-fast · dialogue-information-n4-dialogue v1 | 4 | 22 | — | 0ce117d | hsl(267 45% 38%) |
| think-fast · dialogue-information-n4-expanded_information v1 | 4 | 21 | — | 0ce117d | hsl(172 45% 38%) |
| think-fast · full-map-navigation-finals-both v1 | 1 | 27 | — | 74ad319 | hsl(53 45% 38%) |
| think-fast · full-map-navigation-finals-incumbent v1 | 2 | 25 | — | 5001252, 74ad319 | hsl(271 45% 38%) |
| think-fast · full-map-navigation-finals-memory v1 | 1 | 26 | — | 74ad319 | hsl(135 45% 38%) |
| think-fast · full-map-navigation-finals-whole v1 | 2 | 26 | — | 5340c08, 74ad319 | hsl(8 45% 38%) |
| qwen38-flash-next · loop-guard-name-n4-diagnostic v1 | 5 | 18 | — | 0632fc0, 5300d02, f67a147 | hsl(207 45% 38%) |
| think-longctx · loop-guard-name-n4-diagnostic v1 | 4 | 18 | — | 5300d02, f67a147 | hsl(238 45% 38%) |
| think-swarm · loop-guard-name-n4-diagnostic v1 | 3 | 18 | — | f67a147 | hsl(269 45% 38%) |
| qwen38-flash-next · loop-guard-name-n4-enforced v1 | 5 | 19 | — | 5300d02, f67a147 | hsl(68 45% 38%) |
| think-longctx · loop-guard-name-n4-enforced v1 | 3 | 19 | — | f67a147 | hsl(99 45% 38%) |
| think-swarm · loop-guard-name-n4-enforced v1 | 4 | 19 | — | 5300d02, f67a147 | hsl(37 45% 38%) |
| think-fast · memory + next-milestone hint v1 | 2 | 26 | — | 42a76aa | hsl(329 45% 38%) |
| think-fast · memory only v1 | 10 | 25 | — | 014f185, 42a76aa | hsl(93 45% 38%) |
| think-fast · named-interactions-clock-on v1 | 9 | 17 | — | 256bf23, 568da26, f0ea5af | hsl(1 45% 38%) |
| think-fast · navigation-full-astar v1 | 4 | 18 | — | 256bf23 | hsl(91 45% 38%) |
| think-fast · navigation-full-combined v1 | 4 | 19 | — | 256bf23 | hsl(18 45% 38%) |
| think-fast · navigation-full-topology v1 | 4 | 18 | — | 256bf23 | hsl(179 45% 38%) |
| think-fast · navigation-memory-n4-off v1 | 2 | 19 | — | 2c46415 | hsl(209 45% 38%) |
| think-fast · navigation-memory-n4-on v1 | 3 | 20 | — | 2c46415 | hsl(261 45% 38%) |
| think-fast · neither v1 | 8 | 24 | — | 014f185 | hsl(321 45% 38%) |
| think-fast · think-fast-objectives-off-30m-1500 v1 | 6 | 16 | — | 568da26, f0ea5af, f67a147 | hsl(294 45% 38%) |
| qwen38-flash-next · untagged v1 | 1 | 14 | — | 7379b75 | hsl(248 45% 38%) |
| qwen38-flash-next · untagged v2 | 4 | 15 | untagged v1: +1 −0 | 40262a0, bf66874 | hsl(279 45% 38%) |
| qwen38-flash-next · untagged v3 | 3 | 16 | untagged v2: +1 −0 | 40262a0 | hsl(341 45% 38%) |
| think-swarm · untagged v1 | 1 | 3 | — | cd93536 | hsl(155 45% 38%) |
| think-swarm · untagged v2 | 1 | 4 | untagged v1: +1 −0 | eb4ef56 | hsl(186 45% 38%) |
| think-swarm · untagged v3 | 2 | 14 | untagged v2: +10 −0 | 08c9c3f, 7379b75 | hsl(217 45% 38%) |
| think-swarm · untagged v4 | 3 | 16 | untagged v3: +2 −0 | 40262a0 | hsl(310 45% 38%) |
| think-swarm · untagged v5 | 3 | 15 | untagged v4: +0 −1 | 40262a0 | hsl(12 45% 38%) |
| think-fast · whole-map + memory v1 | 8 | 26 | — | 014f185 | hsl(97 45% 38%) |
| think-fast · whole-map only v1 | 8 | 25 | — | 014f185 | hsl(43 45% 38%) |
| qwen38-flash-next · legacy untagged | 1 | unknown | — | bdcb776 | hsl(237 10% 50%) |
| think-swarm · legacy untagged | 15 | unknown | — | 38e4011, 63e9aab, 9358c3d, a467f5c, de2f9f4, f44011f, f779368 | hsl(200 10% 42%) |
runs listed twice: 0

- [x] Synced with main (merge commit): style.css and BROWSER_MODULES conflicts resolved by keeping both sides (run-head header + version legend). Viewer 992 tests; coverage 95.54 / 91.3 / 93.89 / 97.74; lint clean. Review next.
- Review 1 (after sync): Codex LGTM; grok and Claude BLOCKING: the sync merge (fa127395) dropped the `}` closing the legend's media block. RED: style-css.test.ts checks every block in static/style.css closes.
- [x] GREEN: closed the media block. Browser check on a scratch server (startViewer, no queue runner): stats page legend at 1280 fine; run viewer phone header hidden at 1280 and shown at 375, no overflow. Viewer tests/coverage/lint below.
