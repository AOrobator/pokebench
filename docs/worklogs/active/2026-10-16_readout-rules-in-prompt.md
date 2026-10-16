# readout-rules-in-prompt-v1: say the fixed map rules once, in the system prompt

Proposed by the operator 2026-10-16 2:18 AM EDT as the safe slice of readout trimming, for the bundle: move the text that never changes into the system prompt; leave the script-trigger lists alone; do not reorder the readout. Measured on `2026-10-16T00-34-26_qwen36-gpu1_show` (451 overworld results, median 5,509 chars): four fixed rule blocks appear in every one, about 890 chars per result (16.1%):
- the map legend line starting `@ player; N live object; W warp location ...` (430 chars; its content depends on ledge-hops-v1, one-way-tiles-v1, counter-talk-v1 and other glyph switches)
- `Warp destinations are the map you arrive on: ...` (314)
- `Trigger elevation must also match the player on entry (0 matches any elevation).` (80)
- `Terrain rules, elevation and objects can still block movement.` (62)
State lines that merely look constant (`Field-message text: unavailable; ...`, `Menu: unavailable (...)`) are state readings and stay.

Branch `claude/readout-rules-in-prompt` in `/private/tmp/pokebench-readout-rules`. Default-off bundle switch; bundle definition owned by the readiness thread. Standing merge OK once Claude, Codex and Grok LGTM.

## Design
- ON: those blocks are removed from every readout and stated once in the system prompt, generated from the same switches and the same source strings (one owner), so the prompt describes exactly the glyphs this run's map can draw. A one-line pointer stays under the map: `Map symbols and rules: see the system prompt.` Nothing else in the readout changes or moves.
- OFF: readout and system prompt byte-identical.

## Constancy audit (2026-10-16 02:25 AM EDT, from the code and the evidence run)
- `Terrain rules, elevation and objects can still block movement.`: printed under every map, unconditionally. Constant.
- `Warp destinations are ...` block: depends only on warp-activation-guidance-v1 and named-warp-destinations-v1 (`destinations` is a dict, possibly empty, whenever named warps are on). Constant within a run.
- `Trigger elevation must also match ...`: printed whenever coordinate-script-conditions-v1 is on, even with no triggers listed. Constant within a run.
- Legend line: depends on warp-activation-guidance-v1, ledge-hops-v1, one-way-tiles-v1, full-map-navigation-v1 (the `? outside current map.` clause) and counter-talk-v1. **The counter clause is not constant**: it is printed only when the shown map actually draws a `=` (`counters and any("=" in row ...)` in live_map.py). It therefore stays in the readout, as its own line under the pointer, only on maps that draw a counter. The prompt legend never describes `=`. The `?` clause is also map-shape dependent in one corner: with full-map navigation on, a missing whole map falls back to the local map (with `?`); in that case the readout keeps its full legend (OFF form) for that observation, so the prompt is never wrong about `?`. (The evidence run had counter-talk off, so all 2,811 legend lines were one string.)
- Out of scope, unchanged: script-trigger lists, interaction candidates, ordering, `Field-message text: unavailable; ...`, `Menu: unavailable (...)`, the state JSON `local_map` (measurement only).

## One owner: why a generated table, not a server endpoint
The four blocks and the rule for which variant a switch set gets live in one Python module, `env/pokebench_env/map_rules.py`. `live_map.py` and `world_context.py` print the readout from those constants (OFF byte-identical), and `map_rules.prompt_section(off)` composes the system-prompt section from the same constants. The agent cannot import Python, so `just map-rules` writes `packages/agent/src/map-rules.generated.ts`: every combination of the seven switches the section depends on, keyed by which are off. The agent only looks its key up; it composes nothing. A pytest fails when the generated file is stale (the same pattern as `just schema`).
Rejected: a server endpoint (`GET /pokebench/map-rules`). The play system prompt is built and recorded in `run_start` before `withRun` boots the game server, and `probe-decision` rebuilds prompts offline from recorded runs with no server; an endpoint would make the prompt factory async and server-dependent. Both sides derive their switch set from the same FeatureSet via `serverFeatureEnv`, so a lookup by the same off set is equivalent.
Two parentheticals differ in the prompt legend, for truthfulness: `W warp location (see activation below)` becomes `(each warp's activation is listed in the readout's Warps line)`, and `(sides listed under Edge walls)` becomes `(sides listed in the readout's Edge walls line)`, because nothing is "below" in the system prompt.
State-only decisions get no system-prompt section, so `state-only-decisions-v1` requires this switch OFF (stateOnlyProblems).

## Milestones
**M1 — switch, RED, GREEN, gates.**
- [x] OFF goldens rendered at ef9244e2: 35 cases, 5 memories (door, ledge, edge wall, counter, triggers) × 7 switch sets, through the production `read_state` + `render` path (`env/tests/env/fixtures/readout-rules-off-ef9244e2.json`)
- [x] RED: Python ON/OFF tests, generated-file staleness test; TS registry, presets, prompt factory, state-mode refusal. Baseline before RED: agent 1400, viewer 797, pytest 2017 passed + 2 skipped. RED: pytest collection fails (no `pokebench_env.map_rules`); vitest `readout-rules.test.ts` fails to import `map-rules.generated.js`.
  COMMIT: `test(readout-rules): RED for the fixed map rules moving from the readout to the system prompt` (5e500bbf)
- [x] GREEN: map_rules.py owner, live_map/world_context/readout/rerender wiring, generator + `just map-rules` (generated table: 128 keys, deduplicated texts, 45.8 KB); TS registry (observation, needs ram-state-v1, last everywhere), presets (absent = OFF), DEFAULT_NEXT_RUN OFF, SERVER_FEATURES (both, Python default-off), play-config wiring through `mapRulesSection(features)`, stateOnlyProblems refusal. Existing position/registry tests shifted by one (same pattern as blocked-batch-result). Tests: agent 1407, viewer 797, pytest 2029 passed + 2 skipped (ROM).
- [x] wiring-removal check: dropping the play-config append turned `ON states the showcase legend ...` red (1 failed); dropping the `rules_in_prompt` kwarg in rerender.render turned 4 readout-rules ON tests and the rerender pass-through test red (5 failed); both restored and green.
  COMMIT: `feat(readout-rules): state the fixed map rules once in the system prompt (switch readout-rules-in-prompt-v1, default off)` (ecc487e9)
- [x] gates: test, build, verify-vendor green; lint green except the known worktree-venv mypy `mgba._pylib`; coverage agent 97.73 stmts / 94.56 branches / 97.98 funcs / 99.08 lines, viewer 95.11 / 90.43 / 93.59 / 97.61, Python lines 97.10 / branches 92.70 / functions 100 (map_rules.py 100%).
- [x] real-ROM proof (02:41 AM EDT): `pokebench_env.serve` booted twice from `runs/launch-receipts/rival-push-checkpoint/CLOCK_SET.state` (Brendan's house 2F, Mom present, edge-wall chair, stairs warp) on $POKEBENCH_ROM, worktree code via the main venv's mGBA binding, with `POKEBENCH_FEATURES_OFF` taken from the agent's own `serverFeatureEnv` of the showcase arm's recorded switches with this switch ON / OFF. `/pokebench/observation` state_text: OFF 4,040 chars, ON 3,196 chars (−844, −20.9%). The diff is exactly: legend + terrain lines → the pointer line; warp-destination note gone; trigger-elevation line gone; nothing else changed (Edge walls, Live objects, Warps, trigger list header, field-message lines intact). `playSystemPrompt` for the same arm: OFF 7,886 chars, ON 8,941 (+1,055, the section once). Projection on the evidence run (451 overworld tool results carrying the legend): median 5,509 → 4,665 chars, −844 per result, 15.2% of those results' characters.

**M2 — explainer, pending experiment, review (Claude CLI, Codex, Grok) until LGTM.**
- [ ] explainer `docs/explainers/readout-rules-in-prompt-v1.html`, README, FEATURE_EXPLAINERS, `just pages-check`
  - [x] RED: panels.test (mapping + real-ROM numbers and section header in the page) and server.test (allowlist serves it): 2 failed
- [ ] pending `experiments/readout-rules-in-prompt.json`, readiness line, `just experiments-check`
- [ ] principles self-review (docs/agent-principles.md, zero FAIL)
- [ ] Claude CLI, Codex, Grok: VERDICT LGTM

## Session Log
- 2026-10-16 02:29 AM EDT: constancy audit, design and RED written.
- 2026-10-16 02:37 AM EDT: GREEN and gates.
- 2026-10-16 02:41 AM EDT: real-ROM proof and measurement.
- 2026-10-16 02:18 AM EDT: worklog drafted (the operator's proposal).
