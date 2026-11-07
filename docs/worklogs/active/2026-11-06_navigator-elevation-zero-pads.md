# Navigator elevation-zero pads

The operator 2026-11-06, "Fix the navigator". Lavaridge Gym 1F pads such as (10,18) and (5,9) were refused as not listed. pret: `GetPlayerPosition` uses `PlayerGetElevation`, which returns `previousElevation`, and `ObjectEventUpdateElevation` does not update that on elevation-0 tiles or on a step onto a multi-level tile. The navigator compared the current elevation.

- [x] RED: `navigator-elevation-zero-pads.test.ts`
- [x] GREEN: focused navigation suites pass.
- [x] Replay of every recorded warp call through the navigator's lookup, off and on. Lookup only: 274b, 19 warp refusals, 17 now found, the other 2 are (70,5). 5f0f, 6, 5 found, 1 left at Fortree Gym (15,4). ee2a and a0b4 unchanged, all (70,5). 730 warp calls in all, none lost. Routes are unchanged by construction: only the warp lookup and the `previous` value differ, and `planNavigation` is not touched. Config and explainer done.
- [ ] Gates, review, landing

Review round 1, GPT: BLOCKING. Fix: `interactionRecipient` still compared the arrival elevation, so the live tool refused with no valid approach. Warp matching is now one `warpMatches`, and tests go through the real `navigate_to_target`.

Replay through the real tool on recorded refusals: 274b, 19 refusals, 10 now walk, 7 now say "no walkable route" from where the player stood, 2 stay (70,5). 5f0f, 6 refusals, 4 walk, 1 "no walkable route", 1 stays (Fortree Gym 15,4). So 14 walk and 8 get a true reason in place of "not listed".

Claude review LGTM on 1af3f18e5 with one rule error, unreachable on any Emerald map: a step off a multi-level tile does update previousElevation. Fixed with its test, comment and explainer. Follow-up, harmless: Sootopolis Gym B1F ladder (11,22) from (11,21) resolves but will not fire; the server reads only currentElevation, and exposing previousElevation would remove the fallback.
