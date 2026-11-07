# Badge resets cycles

The operator 2026-11-07: "is the supervisor being harmful to deepseek?" and "this is a correctness fix so it goes on in both arms". Analysis: runs/analysis/37ca-supervisor-harm-20261107.md. Cause: stall-briefing.ts returns early for extended-catalog milestones, so only early milestones clear the map-pair count.

- [x] RED: `badge-resets-cycles-v1` tests in `stall-briefing.test.ts`, through the production `stallBriefing` factory. 3 failed before the fix.
- [x] GREEN: 93 tests in the focused suites.
- [x] Replay on five DeepSeek runs through the real StallBriefing, same rule: 22 wrong notes removed, 3 correct lost net (all in 274b, post-badge travel); 37ca 6 removed, 0 lost.
- [ ] Reviews; landing waits for the operator's OK on the 3 lost notes.

37ca is pinned to 25774e1f6 in its own frozen checkout, so landing cannot change it.
