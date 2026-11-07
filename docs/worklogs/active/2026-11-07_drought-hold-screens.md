# Drought holds on battle screens

The operator 2026-11-07, "yes": hold the drought note on the evolution and move screens a battle hands control to. 37ca T1361 got the note on the evolution screen after the Flannery win.

- [x] RED: `drought-hold-screens-v1` tests in `stall-briefing.test.ts`; removing the hold turns the On test red.
- [x] GREEN: 46 stall tests.
- [ ] Replay, gates, reviews, landing (only if it loses no real stall).

Claude BLOCKING: the viewer drew a held screen note as a loop mark on the closed timeline; model.ts now knows the prefix, with a viewer test (RED then GREEN). Also recorded when the other hold switches are off. Replay: removes 37ca T1361 only; loses 0 real stalls (section 9 of the analysis).
