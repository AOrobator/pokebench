# Game-known warp destinations

## Problem Statement

`named-warp-destinations-v1` currently turns every internal map-table name into model-facing text. In the moving truck, `InsideOfTruck_EventScript_SetIntroFlags` sets `SaveBlock1.dynamicWarp` to map 0/9 before MOM says “Well, this is LITTLEROOT TOWN.” The readout therefore labels the exit `LITTLEROOT TOWN` before the game has named the place. That is route foreknowledge, not a truthful player-facing label.

The earlier `unset-dynamic-warp-v1` repair remains separate: it prevents the all-zero dynamic-warp bytes from decoding as PETALBURG CITY. This work changes which resolved names are eligible for display; it does not change dynamic-warp decoding.

## Source Grounding

- Reference checkout: `/Users/user/dev/pokeemerald`, revision `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` (clean when inspected).
- `data/maps/InsideOfTruck/scripts.inc`: `InsideOfTruck_EventScript_SetIntroFlags` sets the dynamic warp to `MAP_LITTLEROOT_TOWN` while keeping the map-name popup hidden.
- MOM later supplies the player-facing name in `LittlerootTown_MaysHouse1F_Text_WellThisIsLittlerootTown` / `...BrendansHouse1F...`: “Well, this is LITTLEROOT TOWN.”
- Littleroot's house and lab signs supply their displayed building names. `displayed-place-names-v1` already derives those exact save-specific names from the sign scripts.

## Design

Keep internal map identities in `GameState.destination_names` and `GameState.dynamic_warp` for harness mechanics. Change only the model-facing rendering under `named-warp-destinations-v1`:

- A warp gets a textual destination name only when `displayed-place-names-v1` supplies a game-displayed name for that destination map.
- Otherwise a static warp keeps its map group/number and a dynamic warp stays `dynamic destination`.
- The named-warp switch consumes `displayed-place-names-v1` when available; without it, ON remains valid but conservatively exposes no textual destination names. Its standalone experiment enables that provenance source in both arms.
- In `bundle-v-control`, the control has the named-warp switch OFF and the bundle flips it ON. `displayed-place-names-v1` remains ON in both arms.

This intentionally does not add a second conversation/history store. A future feature may remember map names the player has already seen, but it is not required to stop this leak.

## Invariants

- INV-1: A set truck dynamic warp to map 0/9 never emits `LITTLEROOT TOWN` merely because the internal table resolved it.
- INV-2: Littleroot house/lab warps can use the exact names their signs show for the current save.
- INV-3: With `named-warp-destinations-v1` OFF, existing bare map-ID output is byte-identical.
- INV-4: `unset-dynamic-warp-v1` independently controls whether all-zero dynamic-warp bytes are unset; this change does not merge the two mechanisms.
- INV-5: The fixed experiment's control keeps the named-warp switch OFF and the bundle arm turns it ON.

## Milestones

- [x] M1 RED: regression tests cover the truck leak, sign-backed names, dependency, and fixed-bundle arm split. The focused Python suite fails on the four old internal-name emissions; the agent tests fail on the old dependency and the bundle's old ON-in-control definition.
- [x] M2 GREEN (`82cb9811`): rendered names now come only from `displayed_places`; internal-only static destinations keep their IDs and the set truck warp stays dynamic. Feature copy, prompt map rules, standalone experiment and fixed bundle updated. Focused gates: 14 named-warp Python tests and 35 agent tests pass; `just experiments-check` validates 111 definitions.
- [x] M3 DOCS: updated the existing named-warp and unset-dynamic-warp explainers; both `just pages-check` validations are clean.
- [x] M4 GATES: full tests pass (agent 2,457; viewer 1,172; Python 2,478 with 229 ROM-dependent skips); lint and build pass; coverage is agent 98/94.26/98.32/99.23, viewer 95.4/91.46/93.83/97.64, Python 97.47 lines / 93.37 branches / 99.43 functions (all above 90); vendor integrity passes; 111 experiment definitions and both explainer pages validate. Viewer coverage's parallel run twice exposed unrelated `server-stream` timing flakes (different cases each run); single-worker coverage passed all 1,172 tests.
- [ ] M5 REVIEW: principles audit and required cloud review lanes reach LGTM on one frozen packet.
- [ ] M6 LAND: fast-forward local `main`, recheck, repin the unstarted experiment, and restart the viewer without launching a measured run.

## Review Log

- Round 1 frozen packet: `b9e501dfd25ba68dca65fed086b3bc9c9c0fc498..2b0830e4fb5556b62602918a6a0c6ca68dc66335`, SHA-256 `a786335067e01ae3a432bbdf6e60ff3a58c820f9cb3d267374d54c060b2c865d`.
- Claude CLI had no active reviewer credential. Cursor Claude Opus and Sonnet both returned the account's monthly usage-limit error; this lane remains unavailable, not green.
- Grok 4.7 High and isolated GPT-5.6 Sol independently found the same blocker: the optional static `Warp destination at` renderer rebuilt names from `state.destination_names`, bypassing the new `displayed_places` filter.
- Fix after `2b0830e4`: the world-destination renderer now reuses `destinations` while ON and preserves its incumbent internal-name map while OFF. Added missing internal-only and displayed-name assertions, updated the observation expectation and four affected compatibility fixtures. Focused result: 81 passed / 24 existing ROM-dependent skips.
- Gate repair after `a6f39202`: formatted the renderer and mechanically rerendered the 35-case readout-rules aggregate so cases with named warps ON expect bare IDs while the named-warp OFF cases retain their byte-identical internal labels. Focused cross-feature result: 63 passed.

## Gate Notes

- Full gate attempt after `45e6f619`: agent 2452/2457 passed; five prompt-golden assertions correctly detected the revised named-warp rule sentence. Pytest 2475 passed / 229 ROM-skipped; three old golden assertions detected the same wording and the deliberate removal of internal-only names when `displayed-place-names-v1` is off. Updated only those compatibility expectations/fixtures; focused repairs pass (29 agent prompt tests, 103 Python adjacency/displayed-name tests).
- Coverage flake triage: first parallel viewer coverage timed out two stream tests; immediate retry failed two different stream tests (one timeout, one scheduling-sensitive write count). `git diff main -- packages/viewer/src/server-stream.test.ts packages/viewer/src/server.ts` is empty. The single-worker coverage run passed 84 files / 1,172 tests at the normal coverage percentages.
