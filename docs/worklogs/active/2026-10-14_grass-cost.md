# Grass cost navigation (2026-10-14)

Experiment arm: make `navigate_to` route around grass when the detour is cheap, to test whether
avoiding wild encounters improves progress. Mirrors PokeAgent's `GRASS_TILE_COST_MULTIPLIER`.
Source: `runs/explainers/navigation-followups.md` in the main checkout.

## Game-source grounding

pret/pokeemerald: tall grass (MB_TALL_GRASS 0x02) and long grass (MB_LONG_GRASS 0x03) both have
wild encounters (`metatile_behavior.c` encounter table) and Cut clears both into plain grass
(`fldeff_cut.c`). So both are priced the same; PokeAgent pricing long grass at 1 is not copied.

## Change (one switch: `grass-cost-navigation-v1`, guidance, needs `bounded-navigation-v1`)

- [x] `planNavigation` prices a step into behavior 2 or 3 at 1.5 when the option is on.
- [x] A ledge hop (with `ledge-hops-v1`) costs one step plus the landing tile's step cost.
- [x] Off by default in v1 flag presets, absent-from-v2 presets and the viewer's next-run draft.
- [x] Explainer: `runs/explainers/grass-cost-switch.html` (main checkout).

COMMIT: `feat(agent): add switchable grass step cost to navigate_to planner` (768c404)
COMMIT: `Merge branch 'main' into claude/grass-cost` (96808e0), re-applied on top of ledge hops.
COMMIT: `test(agent): prove a ledge hop pays the grass cost of its landing tile` (3cdfd5c)
COMMIT: `Merge branch 'main' into claude/grass-cost` (c854957), main at 37a961b, clean merge.

## Experiment arms (draft, no runs launched)

`runs/launch-receipts/grass-cost-think-fast-n4/preset-{incumbent,grass}.json` (main checkout).
Base: the `astar` preset of `navigation-topology-astar-think-fast-n4`. Both arms set
`ledge-hops-v1` ON explicitly; the only difference is `grass-cost-navigation-v1`. Both parse
with no dependency problems on 96808e0.

## Gates

- After merge: agent 899/899, viewer 419/419, TS coverage above 90 on all metrics, tsc/eslint
  clean. Python: 1805 pass, 2 fail and mypy reports `mgba._pylib` missing, all worktree setup
  gaps (no vendored porymap data, no mGBA binding in this worktree's venv). No Python is touched.
- After merging main 37a961b (c854957): agent 899/899, viewer 476/476, env 1807/1807. `just
  coverage` passes the 90 floor (Python lines 96.68, branches 91.83, functions 100). `just lint`
  exit 0, `just verify-vendor` OK. The earlier setup gaps were closed by initializing the vendor
  submodule in this worktree and copying the built `mgba` package from the main checkout's venv.
- After merging main 5195c88 (one-way tiles, elevation, explainer links): conflicts in
  navigation, features, play-preset and their tests resolved by keeping both switches.
  Grass pricing now rides main's elevation rules (`mismatch`/`entered`/`jumped`); a ledge hop
  costs `1 + step(landing)`, which is main's 2 with grass off. Guidance group is 12. Added
  `grass-cost-navigation-v1` to the viewer's `FEATURE_EXPLAINERS` with a server test.
  agent 920/920, viewer 478/478, env 1823/1823; `just coverage` exit 0 (agent 97.22/93.32/97.87,
  viewer 95.69/90.56/95.28, Python 96.68/91.84/100); `just lint` exit 0; vendor OK.
  Note: main carries two stray tracked scratch files (`.tmp-chunk-search.py`,
  `.tmp-search-pokeemerald.py`, from 2fc6f9e); left untouched here.
COMMIT: `Merge branch 'main' into claude/grass-cost` (main at 5195c88)
- Switch description said it "matches" PokeAgent's penalty; corrected to say it is adapted
  (PokeAgent leaves long grass at 1). agent 920/920.
COMMIT: `docs(agent): describe grass cost as adapted from PokeAgent`
- [ ] Review: Claude CLI, Codex (GPT lane), Cursor Grok. Local endpoint lanes skipped per operator.
- [ ] Operator approval for the local merge into main.
- [ ] Operator approval before any measured run.
