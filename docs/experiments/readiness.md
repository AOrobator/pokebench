# Experiment readiness

A patch is tested only once the incumbent reliably reaches the milestone where the patch first
acts: at least 3 of the last 4 qualifying incumbent runs (recorded, non-probe, non-human, common
start, planned budget). The rule and procedure live in
`.claude/skills/pokebench-patch-evaluation/SKILL.md` ("Check readiness first"). Re-check BLOCKED
rows whenever the frontier advances, and before planning any experiment.

| Patch | Activation milestone | Verdict | Evidence (checked) |
|---|---|---|---|
| `counter-talk-v1` | `OLDALE_TOWN` (first Pokémon Center) | BLOCKED: models do not yet reach Oldale | 2026-10-14: 0 of 124 recorded model runs reached `ROUTE_101` or `OLDALE_TOWN` (the only Oldale run is human `2026-10-13T23-50-13_human_1848`). The 40 most recent think-fast runs mostly end at `PLAYER_HOUSE_EXITED_AFTER_CLOCK`; best is `RIVAL_MET` (`2026-10-14T00-25-06_think-fast_dea1`). |
| `ledge-hops-v1` | `ROUTE_101` | BLOCKED: models do not yet reach Route 101 | Same 2026-10-14 survey: 0 of 124 model runs reached `ROUTE_101`. |
| `full-map-navigation-v1` | `PLAYER_NAME_CONFIRMED` (whole-map readout starts in the truck) | READY | 2026-10-14 (`just experiments`, recent basis: no run matches the new shared incumbent yet): 3 of the last 4 model runs (`2026-10-14T15-23-36_think-fast_965d`, `…15-37-31_think-fast_15ad`, `…16-07-40_think-fast_7e37`, `…16-37-47_think-fast_671c`) reached it. |
| `elevation-transitions-v1` | `LITTLEROOT_TOWN` (first multi-level tiles) | READY | 2026-10-14 (`just experiments`, recent basis: no run matches the new shared incumbent yet): 3 of the last 4 model runs (`2026-10-14T15-23-36_think-fast_965d`, `…15-37-31_think-fast_15ad`, `…16-07-40_think-fast_7e37`, `…16-37-47_think-fast_671c`) reached it. |
| `one-way-tiles-v1` | `PLAYER_BEDROOM` (the chair) | READY | 2026-10-14 (`just experiments`, recent basis: no run matches the new shared incumbent yet): 3 of the last 4 model runs (`2026-10-14T15-23-36_think-fast_965d`, `…15-37-31_think-fast_15ad`, `…16-07-40_think-fast_7e37`, `…16-37-47_think-fast_671c`) reached it. |
| `grass-cost-navigation-v1` | `ROUTE_101` (first tall grass) | BLOCKED: models do not yet reach Route 101 | 2026-10-14: 0 of the last 4 model runs reached `ROUTE_101` (same four runs as above). |
| `game-evidence-priority-v1` | `NEW_GAME_CREATED` (prompt section from the first turn) | READY | 2026-10-14 (`just experiments`, recent basis: no run matches the shared incumbent yet): 3 of the last 4 model runs (`2026-10-14T15-23-36_think-fast_965d`, `…15-37-31_think-fast_15ad`, `…16-07-40_think-fast_7e37`, `…16-37-47_think-fast_671c`) reached it. |
| `dialogue-log-v1` | `FIRST_TRUCK_EXIT` (first overworld dialogue) | READY | 2026-10-14 (`just experiments`, recent basis: no run matches the shared incumbent yet): 3 of the last 4 model runs (`2026-10-14T15-23-36_think-fast_965d`, `…15-37-31_think-fast_15ad`, `…16-07-40_think-fast_7e37`, `…16-37-47_think-fast_671c`) reached it. |
| `loop-guard-supervisor-v1` | `NEW_GAME_CREATED` (acts wherever the guard would stop a run) | READY | 2026-10-14 (`just experiments`, recent basis: no run matches the shared incumbent yet): 3 of the last 4 model runs (`2026-10-14T15-23-36_think-fast_965d`, `…15-37-31_think-fast_15ad`, `…16-07-40_think-fast_7e37`, `…16-37-47_think-fast_671c`) reached it. |
| `instruction-ledger-v1` | `FIRST_TRUCK_EXIT` (first overworld dialogue and room) | READY | 2026-10-14 (`just experiments`, recent basis: no run matches the shared incumbent yet): 3 of the last 4 model runs (`2026-10-14T15-23-36_think-fast_965d`, `…15-37-31_think-fast_15ad`, `…16-07-40_think-fast_7e37`, `…16-37-47_think-fast_671c`) reached it. |
| `double-context-window-v1` | `NEW_GAME_CREATED` (window first differs at the 7th tool result of any run) | READY | 2026-10-15: 4 of the last 4 recorded think-fast runs (`2026-10-14T19-30-06_think-fast_26e0`, `…19-59-09_think-fast_0c89`, `…20-12-53_think-fast_c547`, `…20-42-56_think-fast_4fe9`, 2×2 trials 3 to 6) reached it, and all ran past 200 turns. Pending, not queued: run it on the 2×2 winner once the factorial finishes. |
