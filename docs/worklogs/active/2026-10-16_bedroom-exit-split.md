# Bedroom exit after the clock: measurement-only split

Operator ask (the operator, 2026-10-16 00:17 EDT): a milestone for leaving your room after the clock is set, and one for leaving your house after the clock is set, grounded in game state, and repeated leaves must not trigger either.

## Findings

- `PLAYER_HOUSE_EXITED_AFTER_CLOCK` already exists: home witness, then a stable own-1F state with the clock set, then the next stable LITTLEROOT TOWN state. Dedupe is per run, so within a run only the first exit counts.
- Gap: a save that starts inside home after the rival visit gets credit for a re-exit. Tighten: the 1F state must not show rival state 2/3/4 (`VAR_LITTLEROOT_RIVAL_STATE`, entered rival bedroom or later), which proves the house was already left.
- Room exit has no milestone. Game grounding (pokeemerald 731ad5bf): `PlayersHouse_2F_EventScript_WallClock` (data/scripts/players_house.inc) sets `VAR_LITTLEROOT_INTRO_STATE` 6 and `FLAG_SET_WALL_CLOCK`. The 1F `map_script_2 VAR_LITTLEROOT_INTRO_STATE, 6` runs `PetalburgGymReport` on arrival, which sets 7. So intro state 6 on the 2F means the room has not been left since the clock was set. Stairs are the only 2F exit.
- Predicate `PLAYER_BEDROOM_EXITED_AFTER_CLOCK`: last settled state on a family's 2F with intro state 6 and the clock set, then a settled state on the same family's 1F with the clock set. Evidence [2F, 1F]. A save at intro 7 gets no credit.
- Real runs 2026-10-16T00-15-59 gpu0_6972 (2F→1F at seq 116, then extra up/down trips at 477–560) and gpu1_cd7b (seq 39) both start on BRENDANS 2F at intro 6.
- Measurement-only: never shown to the model, never restarts stall clocks. Also filter measurement-only names out of the model-facing objective record (`recorded_native_milestones`), which leaked `ROUTE_101_AFTER_HANDOFF` when native objective completion is on.

## Milestones

- [x] M1 RED: tracker, qualification, viewer derivation, frontier axis, feature registry, objective record. RED: agent 7 failing (bedroom-exit 5 incl. ROUTE_101_AFTER_HANDOFF objective-record leak, features 1, milestones order 1); viewer 6 failing (frontier-recording 1, frontier 5).
- [x] M2 GREEN + gates. agent 1273/1273 (cov 97.62 st / 94.19 br / 97.87 fn / 99.03 ln), viewer 789/789 (95.09 / 90.42 / 93.56 / 97.6), tsc+eslint clean both. Python untouched.
  - Mutations, each turned a test red then restored: intro [6]→[6,7] (agent), drop agent rival-state guard, drop viewer rival-state guard; objective-record filter proven by RED.
  - Replay of 52 recorded runs (2026-10-15/16) through the new tracker: all 19 recorded PLAYER_HOUSE_EXITED_AFTER_CLOCK evidence tuples reproduce unchanged; every run that left home also gets PLAYER_BEDROOM_EXITED_AFTER_CLOCK before it (43 runs); boot runs e.g. 504f bedroom [2391,2399] before house [1707,3396,3416].
- [ ] M3 Review: Codex + grok
  - Codex CLI default model gpt-6.1-sol refused (400, ChatGPT account); Cursor gpt-5.6-sol-xhigh hit its usage limit; Codex -m gpt-5.6-sol ran: BLOCKING (High) measurement-only milestones are valid STOP AT targets and the target goes into the model's goal (live.ts playGoal/task). Accepted: refuse measurement-only targets in parsePlayPreset; drop the target-stop branch. RED committed. GREEN: agent 1274/1274 (cov 97.62/94.22/97.87/99.03), lint clean; no on-disk preset targets a measurement-only split.
- [ ] M4 Coordinate with the bundle-v-control thread, operator approval, local merge
