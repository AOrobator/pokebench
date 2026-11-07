# Drought holds on battle screens

The operator 2026-11-07, "yes": hold the drought note on the evolution and move screens a battle hands control to. 37ca T1361 got the note on the evolution screen after the Flannery win.

- [x] RED: `drought-hold-screens-v1` tests in `stall-briefing.test.ts`; removing the hold turns the On test red.
- [x] GREEN: 46 stall tests.
- [ ] Replay, gates, reviews, landing (only if it loses no real stall).

Claude BLOCKING: the viewer drew a held screen note as a loop mark on the closed timeline; model.ts now knows the prefix, with a viewer test (RED then GREEN). Also recorded when the other hold switches are off. Replay: removes 37ca T1361 only; loses 0 real stalls (section 9 of the analysis).

Gates on 8281332a1: `just test` 2,931 agent, 1,238 viewer, 3,051 env, 38 gateway; lint clean. GPT and Claude (subagent) LGTM on both rounds. Landed: 0 real stalls lost, per the operator's rule.
