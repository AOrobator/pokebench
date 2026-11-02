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
- `:404` — for a goal-only target, no-approach returns `no route to a tile adjacent to the warp at (x,y)`, naming the mechanic instead of the generic refusal.
- `features.ts` / `play-preset.ts` / `viewer/src/next-run.ts` — register `warp-target-navigation-v1`, default OFF.

**Env (`env/pokebench_env`)**
- `readout.py` — `METATILE_TARGETS` gains `0x29` so a geyser is a named interaction target with its **mechanic** (`step-on exit; approach the tile, then press into it; carries you up one floor`), matching the existing `[step onto tile]` / `[directional exit: …]` vocabulary. Same id joins `SERVER_FEATURES` + the Python default-off list.
- Local-map glyph for `0x29` becomes a dedicated letter whose meaning does **not** change between 1F and B1F; the legend is scoped to the current map's glyphs.

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
- [ ] Write tests: `0x29` appears as a named target with mechanic text; glyph stable across 1F/B1F; legend scoped; no destination text; `serverOffWith` pins the Python off-list
- [ ] COMMIT: `test(env): step-on warp mechanics and stable glyphs` (RED)
- [ ] Implement `METATILE_TARGETS[0x29]`, glyph + legend scope, `SERVER_FEATURES` entries
- [ ] Cheap checks: ruff/mypy on changed files, focused pytest
- [ ] Gates: `just test` (pytest side) with coverage ≥90; record figures
- [ ] COMMIT: `feat(env): name geyser pads with their mechanic` (GREEN)
- [ ] Explainer page + `FEATURE_EXPLAINERS` mapping; `just pages-theme` then `just pages-check`
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
