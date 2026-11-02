# Warp targets: goal-only routing, honest labels, both-arm promotion

## Problem Statement

The 24h control run `2026-11-01T09-10-00_deepseek-v4.1-flash_control24h` stalled ~1h40m inside Lavaridge Gym with zero milestones. Read-only forensics on that run established four facts:

1. **The labelling already exists.** On B1F the agent received, per tile, `Warp to map 4/1 at (12,12), elevation 3; … activate_movement …; navigate_to_target target {"kind":"warp","x":12,"y":12}` plus `Element legend: Wp:floor_up = warp (floor up)`, and the "Exits here you have not taken" line carried `(12,12) [handle] -> LAVARIDGE TOWN GYM 1F (map 4/1)` among 16 entries. The pad it needed was advertised. So this work is **not** "add warp labels".
2. **The exits list and the accepted target set disagree.** All 15 `navigate_to_target` warp calls in the gym: **7** returned `target is not listed in the current verified state` (target was in the exits list, 1–3 tiles away, in-window), **3** returned `no supported route to a valid approach`, **3** `arrived at requested coordinate` — and all three of those were calls where the player was already standing on the tile — and **2** map transitions (directional exits) succeeded.
   - `semantic-navigation.ts:343` resolves the target against the current snapshot; `:397` rejects on `listed === null`. That is a **membership** test.
   - `:404` rejects when `choices[0] === undefined`. That is a **reachability** test, reached only after membership passed.
3. **Same mechanic, opposite tile class.** `navigation.ts`'s `UNWALKABLE` contains `0x29` (MB_LAVARIDGE_GYM_B1F_WARP, the geysers) but **not** `0x68` (floor_down holes). 1F holes are navigable exits; B1F pads are walls to the planner. That asymmetry alone produces `no supported route` next to a pad.
4. **Glyph letters flip meaning per map.** `E = W/Wp:floor_down` on 1F and `E = W/Wp:floor_up` on B1F, because the code table is rebuilt per map. The agent was, in its own words, trying to hold "the two floors mirror each other" in mind while the legend changed under it.

Prior art: `active-warp-exits-v1` (landed 2026-10-24, `docs/worklogs/active/2026-10-24_actionable-exits.md`) already narrows *advertised* exits to source-supported activations. It is bundle-only, so it was **OFF** in the control run above. That is the narrowing half; the widening half (every advertised exit is an accepted target) and the step-on routing half do not exist.

**Operator decisions (2026-11-02).** New switch, ON in **both** arms — the "off" arm being the historical record, since the feature does not exist today. Generalizable goal-only target type, but enrollment scoped to the Lavaridge gym. Promote `active-warp-exits-v1` to both arms as well, so widening acceptance cannot re-admit dormant warp records the Oct 24 work removed. The running control run is left untouched. Focused changes.

**Non-goals.** No destination coordinates, no landing tiles, no pad→floor map, no "leads to the leader" hints anywhere in model-facing text (operator: that would be a walkthrough). No story conditions. No change to Mossdeep/Pyre warp behaviours in `UNWALKABLE`. No new tool.

## Skills Loaded

- `pokebench-agent-workflow` (gates, worktrees, TDD shape)
- `.claude/skills/feature-worklog` (this layout)
- `.claude/skills/feature-switch` (switch checklist)
- `.claude/skills/pokebench-game-state` — "Harness messages use the game's own words" for the new labels
- `.claude/skills/pokebench-trace-forensics` (read-only forensics that produced the numbers above)
- `.claude/skills/feature-explainer` (explainer page)
- `.claude/skills/execute-worklog` (gate selection, landing)

## Architecture

Two runtime owners, one switch id.

**Agent (`packages/agent/src`)**
- `navigation.ts` — add a third tile class beside `UNWALKABLE`: **`GOAL_ONLY_BEHAVIORS` = {`0x29`}**. `planNavigation` treats a goal-only tile as non-traversable for intermediate steps and as a legal **terminal** step; `approaches()` emits an adjacent-then-press choice for it. `0x68` is untouched (already traversable, already works as an exit).
- `semantic-navigation.ts:343` — `resolve()` gains a warp source-parity path: a `kind:"warp"` request resolves from the same warp records the exits line is built from (current map only), not only from `interaction_targets`. `:397` keeps its meaning (wrong map, off-grid, not a warp there) but stops firing for a warp the harness itself just advertised.
- `:436` — for a goal-only warp, no-approach returns `no supported route to the step-on warp at (x,y)`, naming the mechanic instead of the generic refusal. `approaches()` also refuses to use a pad as the tile the harness stands on for some *other* target.
- An enrolled pad resolves canonically from the map's warp records on every read, so a walk does not see its own target change when a later observation lists it.
- `features.ts` / `play-preset.ts` / `viewer/src/next-run.ts` — register `warp-target-navigation-v1`, default OFF.

**Env (`env/pokebench_env`)**
- `readout.py` — a warp sitting on a `Wp:floor_up` element reads `Warp (step-on pad) … ; step onto tile` with no destination suffix. Same id joins `SERVER_FEATURES` + the Python default-off list.
- **Dropped:** the glyph and legend work planned here. `Wp:floor_up` / `Wp:floor_down` are already keyed to behaviour and stable across maps; `E` is the Mauville electric door, not a warp. No glyph change was made.

**Config (`experiments/feature-configs`)**
- `current.json` is the sole owner. `warp-target-navigation-v1` and `active-warp-exits-v1` both go into the shared `features` base as `true` **and** into `onInBoth`; README gains a dated entry naming the operator directive.

## Invariants

| ID | Invariant | Rationale | Test strategy |
| --- | --- | --- | --- |
| INV-1 | OFF reproduces today's bytes and plans exactly | Switch contract (`feature-switch`) | Byte-compare readout text, tool schemas and plan for a recorded 1F/B1F fixture with the flag OFF |
| INV-2 | A goal-only tile is never an intermediate step in any path | Routing through a geyser teleports mid-route | Property test over both floors: no returned path contains a `0x29` tile except as the last element |
| INV-3 | No destination, landing tile or pad→floor mapping appears in any model-facing string | Operator: walkthrough | Assert labels contain only mechanic words; snapshot readout text and reject `(x,y)` after a destination arrow |
| INV-4 | Only `0x29` enrols as goal-only | Operator: Lavaridge-scoped | Registry test pins the enrolled behaviour set to exactly `{0x29}` |
| INV-5 | A glyph's meaning is stable across maps in one session | The E/floor_up vs E/floor_down flip misled the agent | Render 1F and B1F legends and assert no letter maps to two mechanics |
| INV-6 | Advertised exits == accepted `navigate_to_target` arguments | The 7/15 rejection class | For a captured B1F state, every exit line's handle resolves successfully; and the reverse for a non-warp coordinate |

## Security Review

- No credentials added or read; provider keys (`HERMES_CUSTOM_ORCA_ROUTER_API_KEY`) untouched.
- ROM stays out of git; no `.gba/.sav/.state` staged; `POKEBENCH_ROM` untouched.
- No network calls; no subprocess shell strings; argv lists only.
- Map data comes from the pinned vendor submodule (read-only) and porymap JSON already in the tree.
- No story conditions, flags or destination names are read or exposed — INV-3 is the guard.

## Milestones

**M1 — Warp targets are always actionable (agent)**
- [ ] Write tests: advertised warp resolves when absent from `interaction_targets`; goal-only pad yields adjacent approach; no path crosses `0x29`; only `0x29` enrols; OFF reproduces recorded bytes
- [ ] COMMIT: `test(agent): warp target parity and goal-only routing` (RED)
- [ ] Implement `GOAL_ONLY_BEHAVIORS`, `resolve()` parity, honest no-approach message, switch registration
- [ ] Cheap checks: tsc on changed files, focused vitest for `semantic-navigation` + `navigation` + `features`
- [ ] Gates per `execute-worklog` after cheap GREEN; record counts and coverage ≥90 both stacks
- [ ] Freeze outcome/path set, consumers (`navigate_to_target`, exits line), non-goals (no destination data), terminator (switch ON in both arms), split triggers (a second behaviour class wanting goal-only)
- [ ] COMMIT: `feat(agent): warp-target-navigation-v1` (GREEN)
- [ ] Independent review; accepted fixes in one batch, two-round cap
- [ ] Record eval plan/readiness (fixed-run arms both ON)

**M2 — Step-on mechanics in the readout and glyphs (env server)**
- [x] Write tests: the readout line carries the mechanic and no destination, and is unchanged with the switch off (`format_readout`, both arms). Glyph/legend and `serverOffWith` dropped — see the plan note.
- [ ] COMMIT: `test(env): step-on warp mechanics and stable glyphs` (RED)
- [x] Implement the pad label branch in `readout.py` and the `SERVER_FEATURES` entries on both sides
- [ ] Cheap checks: ruff/mypy on changed files, focused pytest
- [ ] Gates: `just test` (pytest side) with coverage ≥90; record figures
- [ ] COMMIT: `feat(env): name geyser pads with their mechanic` (GREEN)
- [ ] Explainer page + `FEATURE_EXPLAINERS` mapping — **still open**; `panels.ts` degrades gracefully, so no gate notices
- [ ] Independent review; accepted fixes in one batch

**M3 — Promote both switches to both arms (config)**
- [ ] Write tests: `current.json` validates; both ids present in `features` and `onInBoth`; neither in `switches`; a control preset built from it carries both ON
- [ ] COMMIT: `test(config): both arms carry warp switches` (RED)
- [ ] Edit `current.json`; add the dated README entry naming the operator directive
- [ ] Cheap checks: config schema/validation tests
- [ ] Gates: `just test` (config/agent side) with coverage ≥90
- [ ] COMMIT: `feat(config): warp switches on in both arms` (GREEN)
- [ ] Independent review; accepted fixes in one batch

## Closing the Loop

- Source: tests, gates, explainer, review per milestone.
- Landing: `just land-join` before merging, FF only, `just land-done` after evidence commit; report the merge SHA.
- Activation: nothing to restart. The running control run is pinned to its own commit and is **not** touched (operator 2026-11-02). Activation means the next launched run reads the promoted config._No feature code in this stage._
- Surface proof: the promoted config is visible in Harness Config for a next-run preview; explainer page loads locally.

## Session Log

- 2026-11-02: Forensics on the stalled control run (read-only). Established the four problem-statement facts; corrected two of my own hypotheses (wrong `map_id` argument — false; window scoping — false). Operator approved the design across three exchanges, then approved promotion of `active-warp-exits-v1` to both arms. Worktree `pb-warp-target-nav` on `claude/warp-target-navigation` from `e3f7c2ae0`; submodule pinned `bbab97ad7`; `.env` copied. Worklog written; **awaiting operator approval of this body before any implementation edit**.

## Progress Log

**M1 — RED (committed before implementation).** `packages/agent/src/warp-target-navigation.test.ts`. Six cases. Against `e3f7c2ae0` the run is `2 failed | 4 passed`: the two new behaviours fail (an advertised pad absent from `interaction_targets` is refused; the pad is ungoalisable in the planner) and the four OFF-parity guards already pass. The four guards are the byte-parity contract, not filler: OFF refusal string, non-enrolled behaviour still refused, coordinate with no warp record still refused, pad still ungoalisable without goal-only routing.

**M1 — GREEN.** `navigate_to_target` now resolves an advertised warp from the grid's warp records when its tile is enrolled, and the planner gains a goal-only tile class. Focused suites: `warp-target-navigation`, `semantic-navigation`, `features`, `play-preset`, `deterministic-warp-navigation` = 155 passed. `just build` green.

**M2 — readout.** `SERVER_FEATURES` gains the id on both sides (the Python tuple is compared against the `features.ts` list by `test_feature_switches`), and a pad's candidate line now reads `Warp (step-on pad) … ; step onto tile` with no `destination map 4/1 warp 25` suffix. Detection is the observation's own `Wp:floor_up` element, not a ROM join, and it is gated on the switch, so OFF output is byte-identical. `env/tests/env/test_warp_target_navigation.py`: 6 cases, including that a `floor_down` hole is **not** a pad. Correction recorded: the `E` glyph flip I scoped was wrong — `E` is the Mauville electric door, and `Wp:floor_up` / `Wp:floor_down` are already keyed to behaviour, so no glyph work was needed.

**M3 — promotion.** `warp-target-navigation-v1` and `active-warp-exits-v1` are base-true and `onInBoth`; `active-warp-exits-v1` leaves `switches`. README entry names the directive and the motivating run. Pin: `warp-target-navigation.test.ts` asserts all three placements for both ids.

## Gate receipts (head 0b53925c5 unless noted)

| Gate | Result |
|------|--------|
| `just build` | pass — `tsc` agent + viewer |
| `just lint` | pass — ts/eslint, ruff, ruff format, mypy, mypy --strict gateway |
| agent coverage | 374 files / **5326 tests** pass, sequential (`--no-file-parallelism`); parallel pass flakes 1–2 tests in `whole-game-instructions` under live-run load, and the file passes alone |
| env coverage | **4985 passed** — lines 97.50 / branches 93.59 / functions 99.90 (floor 90) |
| gateway coverage | **116 passed** — 99.12 / 96.22 / 100.00 |
| `just trainer-card-check` | pass after `just trainer-card-art` generated the worktree's missing sprite art |
| `just verify-rom` | pass — `/Users/user/.roms/pokemon-emerald.gba` |
| `just verify-vendor` | pass — submodule at the reviewed pin |
| `just smoke` | **not run, deliberately**: it spawns a second game server while the operator's live control is running, and the directive is to leave that run untouched |

## Review round 1 (both reviewers: BLOCKING)

Cloud lanes were blocked again (Claude weekly limit, resets 10pm ET; Grok monthly, resets 11/17; Codex rejects every model on this ChatGPT account), so two fresh read-only reviewers ran as the contract's fallback. Both returned BLOCKING, and both were right.

- **Identity flap — fixed.** An enrolled pad resolved from geometry when absent and from the listed record when present, so the next observation after the first press compared a known destination against an unknown one and aborted with `semantic target changed during travel`. An enrolled pad now resolves canonically from the map's warp records on every read, with the tile's own elevation. The regression test fails without the fix (verified by reverting).
- **Pad as an approach tile — fixed.** `options.goalOnly` reached `approaches()`, so a pad could be chosen as the tile to stand on for an unrelated target and teleport mid-command. `approaches()` now drops goal-only tiles from its approach candidates. The regression test fails without the guard (verified by reverting).
- **Phantom message — implemented.** The descriptor promised `no supported route to the step-on warp at (x,y)` and nothing emitted it; `:436` now does.
- **Env tests were decorative — fixed.** None called `format_readout`; deleting the whole readout branch left all six green. Two tests now drive `format_readout` in both arms and both fail when the branch is removed (verified by mutation).
- **`{0x29}` unpinned — fixed.** `expect([...GOAL_ONLY_BEHAVIORS]).toEqual([0x29])` plus a `0x68` refusal case.
- **Server default-off unpinned — fixed.** `features_off_from_env({})` carries the id.
- **Governor pin de-coupled** — it no longer pins a fixed offset from the tail; it asserts the switch is present and gated, and this switch pins its own absolute index instead.
- **Worklog drift — corrected.** The Architecture rows still described `METATILE_TARGETS`, a glyph change and the old message; the plan's checkboxes read as an unstarted milestone.

Round-1 follow-ups, now closed: the explainer page (`docs/explainers/warp-target-navigation-v1.html` + `FEATURE_EXPLAINERS`, themed and pages-checked), the epoch note for `active-warp-exits-v1`, and `hyperqwen-control-3h` / `hyperqwen-bundle-24h` added to the viewer arm test. Still open: the descriptor does not state that the readout half needs `map-observability-v1` and `world-targets-v1` (both on in `current.json`, so nothing changes today), and there is no stored byte snapshot proving OFF parity beyond the readout test's two-arm comparison.

## Surprises

- The pads were labelled, advertised with handles, and listed among untried exits the whole time. The failure was the tool refusing targets its own readout had just offered — not a missing label.
- Two of my initial diagnoses (map-id confusion, window clipping) were wrong; the rejections happened 1–3 tiles away with the correct map id.
- `0x68` and `0x29` are the same class of mechanic with opposite planner treatment.

## Multi-Model Review Log

_(pending; Claude, Grok and GPT/Codex lanes per `execute-worklog`)_

## Boy Scout Log

_(none yet)_

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
