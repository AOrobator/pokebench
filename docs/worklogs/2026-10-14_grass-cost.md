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
- Review round 1 on c2af98f (diff sha 11c9de42): Grok (cursor-grok-4.5-high) LGTM; Claude CLI
  BLOCKING: the port test and the long-grass assertion passed with the switch off (tie-break).
  Codex CLI failed (default model `gpt-6.1-sol` rejected for the ChatGPT account, HTTP 400);
  GPT lane moves to Cursor per standing authorization.
- Fix: grass tests use a strip where on and off differ, for behaviors 2 and 3; port test asserts
  on DOWN / off RIGHT / absent RIGHT; new `withNavigation` test drives the feature through the
  production factory; preset omit-key and `needs` tests added (Grok hardening). Mutations
  (GRASS={2}, port forced false, factory key dropped) each fail a test now. Tool description
  deliberately unchanged so the model sees the same tool in both arms.
  agent 923/923, viewer 478/478, Python 96.68/91.84/100; coverage and lint exit 0.
COMMIT: `test(agent): prove grass cost reaches the planner and prices long grass`
- Review round 2 on a4533cf (diff sha da5b0fd2): Claude CLI LGTM; Cursor Grok (cursor-grok-4.5-high)
  LGTM; GPT lane: Cursor gpt-5.6-sol-xhigh hit its usage limit, Codex CLI with explicit
  `-m gpt-5.6-sol` LGTM (packet and tree verified unchanged). Non-blocking: unexport
  GRASS_STEP_COST, ledge off-arm fixture relies on a tie-break.
- [x] Review: Claude CLI, GPT lane (Codex), Cursor Grok. Local endpoint lanes skipped per operator.
- Explainer status block refreshed.
COMMIT: `docs: record grass cost review LGTM and refresh explainer status`
- [x] Operator approval for the local merge into main (2026-10-14 20:18, "merge this as a pending
  experiment").
- Merged main cef13fb (full-map navigation, counter-talk): grass pricing re-applied on main's
  OpenList planner for both local and full modes (priority and cost both use `step`); grass is
  appended after full-map in `playHarnessFeatures`; guidance group 14; viewer switchboard rows 34.
  Removed the stray tracked scratch files `.tmp-chunk-search.py` and `.tmp-search-pokeemerald.py`
  (operator request). agent 945/945, viewer 493/493; coverage (agent 97.2/93.4/97.92, viewer
  95.67/90.53/95.34, Python 96.72/91.91/100) and lint exit 0. Mutations still caught, including
  ledge-landing cost.
COMMIT: `Merge branch 'main' into claude/grass-cost` (main at cef13fb)
- Round 3 (conflict resolution, 7516c95): Claude CLI LGTM; Grok BLOCKING on readiness/counter-talk
  docs "reverted", which was a packet artifact (diff taken against main 2c73b02, which had moved;
  `git diff $(merge-base) HEAD` on those paths is empty). Merged main 2c73b02, refreshed the
  explainer status, re-ran Grok on the merge-base packet.
COMMIT: `docs: grass cost explainer status after landing as a pending experiment`
- Status: PENDING EXPERIMENT (merged behind the switch, off by default, not in the run queue).
  Arms drafted at `runs/launch-receipts/grass-cost-think-fast-n4/` (main checkout). The
  experiment-queue thread owns the pending list and moves it into the queue once ready.
- [ ] Operator approval before any measured run.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-14). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
