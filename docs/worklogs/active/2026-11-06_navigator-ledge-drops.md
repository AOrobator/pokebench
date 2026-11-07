# Navigator ledge drops and surf start warps

Coordinator brief 2026-11-06, for the operator's navigator fixes: plan a surf start to a warp across water, replay the 16 water refusals. Root cause found on the way: the planner refused ledges landing at another elevation, so Lilycove's beach was unreachable. pret `ShouldJumpLedge` reads no elevation; KeepingItIcy `segment_5.csv` took (48,9) and (53,11).

- [x] RED: `navigator-ledge-drops.test.ts`; removing each wiring turned one test red, then restored.
- [x] GREEN: 12 tests.
- [x] Replay, real tool over a fake walker, 39 recorded refusals, with `surf-navigation-v1` on as in the recipe: 30 walk, 8 say no walkable route, 1 stays not listed (Fortree Gym (15,4), unexplained). All 16 at (70,5) reach the surf start.
- [x] Route impact: 1,228 recorded navigate calls, 29 plans changed, all no route to a route, none longer or lost. ROM: 28 of 789 walkable ledges, 5 layouts.
- [ ] Gates, review, landing

Limits: no emulator run yet. `navigate_to` planned the Lilycove walk with a real tool until my fake press ran out; the hop itself rests on pret and the golden path.
