# Navigator elevation-zero pads

The operator 2026-11-06, "Fix the navigator". Lavaridge Gym 1F pads such as (10,18) and (5,9) were refused as not listed. pret: `GetPlayerPosition` uses `PlayerGetElevation`, which returns `previousElevation`, and `ObjectEventUpdateElevation` does not update that on elevation-0 tiles or across multi-level tiles. The navigator compared the current elevation.

- [x] RED: `navigator-elevation-zero-pads.test.ts`
- [x] GREEN: focused navigation suites pass.
- [x] Replay of every recorded warp call through the navigator's lookup, off and on. 274b: 19 warp refusals, 17 fixed, the other 2 are (70,5). 5f0f: 6, 5 fixed, 1 left at Fortree Gym (15,4). ee2a and a0b4: unchanged, all (70,5). 730 warp calls in all, none lost. Routes are unchanged by construction: only the warp lookup and the `previous` value differ, and `planNavigation` is not touched. Config and explainer done.
- [ ] Gates, review, landing
