# Navigator elevation-zero pads

The operator 2026-11-06, "Fix the navigator". Lavaridge Gym 1F pads such as (10,18) and (5,9) were refused as not listed. pret: `GetPlayerPosition` uses `PlayerGetElevation`, which returns `previousElevation`, and `ObjectEventUpdateElevation` does not update that on elevation-0 tiles or across multi-level tiles. The navigator compared the current elevation.

- [x] RED: `navigator-elevation-zero-pads.test.ts`
- [ ] GREEN, replay, config, explainer
- [ ] Gates, review, landing
