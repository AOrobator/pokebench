# Warp areas readout and boot-start checkpoints

Status: in progress.

Operator request (the operator via coordinator, 2026-11-04): a switched warp readout, on in both arms, that groups each map's warps by landing area, lists reachable and unreachable pads from the player's position, who is in each area and whether the run has visited it. Per-warp facts only, never a route. Also set POKEBENCH_CHECKPOINT_FRONTIER=1 for `just fixed-run` boot starts and commit the plain-run launch.sh that already sets it. Show the operator real rendered output before landing.

## Design

- `warp-areas-v1`, server switch, needs `exit-labels-v3`. Turn 1,533 of run 274b spent 13,252 of 38,156 characters on 15 `Warp destination at` lines that repeat each area's exit facts per pad.
- ON keeps one short `Warp destination at (x,y): LABEL` line per warp, because `blocked-exit-fact`, `no-exit-here` and `low-hp-trainer-warning` read those lines. The repeated detail moves to one block per landing area.
- Visits are tiles the server saw the player on this run (`AreaVisits`), tested against the area's section, so a section label change cannot lose a visit.
- Who is there comes from the ROM object list with hide flags applied. It is shown only for areas the run has been in: the standing no-foreknowledge rule says the harness does not name what the game has not shown.
- `exit_sections` JSON is unchanged, so no event schema or viewer read change.

## Milestones

- [x] M1 RED tests
- [x] M2 GREEN: readout, switch, config, fixed-run checkpoint env. Focused: 222 env tests, agent and viewer switch tests pass. Full gate pending the CPU window.
- [ ] M3 Real render shown to the operator
- [ ] M4 Explainer, review lanes, landing

## Real render

Turn 1,533 re-rendered from raw RAM with the run's own visits: 22,342 to 16,462 characters; the OFF lines equal the recorded lines; pad groups match the approved table. Rustboro at turn 173: 31,279 to 30,682. The repeated caveat sentence moved to the header so no map grows.
