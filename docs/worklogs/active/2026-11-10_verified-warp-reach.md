# Verified warp reachability

**Status:** Landed on main at `832894bb3` on 2026-11-10.

The Victory Road B1F header said that ladder (42,25) was walkable while the same result refused the route from (21,11). The terrain flood in `exit_reach.py` intentionally ignores elevation and supplies a superset. It cannot establish a positive route by itself.

`verified-warp-reach-v1` requires the navigation owner's warp resolver and existing route planner before the trust header puts a warp on its walkable list. Warps from the terrain flood with no verified route retain their coordinates and destination in a separate clause without the suggested call. Movement, connection labels, cross-water labels, GameState serialization and historical presets retain their existing behavior. The candidate opts in for both current arms and the Opus Rayquaza lane.

## Evidence

- Emerald source reference `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. `GetCollisionAtCoords` applies directional and elevation collision. `GetWarpEventAtPosition` checks both coordinates and elevation.
- External Emerald ROM SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Six hash-validated raw RAM frames from Opus run `d718` were decoded with production `read_state`, serialized as GameState, and passed to the production header with the switch off and on. Decoded map, position and exit mask matched the retained states. Evidence and scripts are in `runs/proofs/verified-warp-reach-d718/`.
- Turn 475 state 16776 distinguishes the known northeast 1F exit (39,5) from the walkable ladder (9,14). Turns 584, 585 and 605 states 21547, 21554 and 22165 keep B1F ladder (42,25) visible and remove its walkable label and suggested call. The reachable (30,25) remains offered at state 22165. The turn 678 before and after states 25364 and 25415 corroborate that (30,25) was actually traversed later.
- Focused agent suites 176 passed and viewer suites 175 passed. Removing production option wiring failed the new regression test. Restored wiring, changed-file agent lint, agent type check, and HTML validation passed.
- Replay re-renders existing observations without running the model or resuming gameplay. It does not establish whether some other sequence of game actions could eventually reach (42,25).

## Landing evidence

- Independent Claude and GPT approved the frozen patch. The operator waived Grok after Cursor reported its usage limit. Review records and gate logs are in `runs/proofs/verified-warp-reach-landing/`.
- Full lint, branch tests, and vendor verification passed. Post-merge tests passed on `832894bb3` with 2,974 agent, 1,243 viewer, 3,065 environment, and 38 gateway cases. The no-I/O proof passed.
- Replayed the same six GameState snapshots through the build from main. All six outputs matched the branch replay byte for byte. The replay did not resume gameplay.
