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
