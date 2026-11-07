# Badge resets cycles

The operator 2026-11-07: "is the supervisor being harmful to deepseek?" and "this is a correctness fix so it goes on in both arms". Analysis: runs/analysis/37ca-supervisor-harm-20261107.md. Cause: stall-briefing.ts returns early for extended-catalog milestones, so only early milestones clear the map-pair count.

- [x] RED: `badge-resets-cycles-v1` tests in `stall-briefing.test.ts`, through the production `stallBriefing` factory. 3 failed before the fix.
- [x] GREEN: 93 tests in the focused suites.
- [x] Replay on five DeepSeek runs through the real StallBriefing, same rule: 22 wrong notes removed, 3 correct lost net (all in 274b, post-badge travel); 37ca 6 removed, 0 lost.
- [ ] Reviews; landing waits for the operator's OK on the 3 lost notes.

37ca is pinned to 25774e1f6 in its own frozen checkout, so landing cannot change it.

COMMIT: `feat(agent): a new badge starts the stall note's map count over` (e8a4f8bcb). `just test`: 2,922 agent, 1,237 viewer, 3,051 env, 38 gateway passed; lint clean. GPT LGTM.

Claude (subagent) LGTM; its wording note on the Off clause applied.

## Drought counts turns only

The operator 2026-11-07: the drought note is a correctness issue too. `drought-turns-only-v1` (branch claude/drought-turns, on top of this one): the turn clock without credits for level-ups, wins or heals, 30 actions. RED: 3 tests failed before; GREEN 114; removing the credit gate turns a test red. Model-facing wording drops "level-up, trainer win or full heal" when on. Landing waits for the operator's choice.

COMMIT: `feat(agent): the drought note counts turns, and only story milestones restart it` (def5ae0e7). Test-file lint fix next.

COMMIT: `test(agent): unused parameter in the drought test` (dbb8d6fd9). Gates found 3 campaign-progress tests that set every switch on and expect the wall clock; they now pin this switch off. GPT: a due note held through a battle restarts the clock when it ends. Kept: that is today's hold rule and the replay includes it; the description now says so. Replay on the built code (section 7 of the analysis): both off matches the recorded notes; badge only removes 23 wrong map-cycle notes and loses 0 real stalls; drought only cuts notes 165 to 56, removes 30 wrong, keeps 18 of 29 stalls covered; both on cover 24 of 29.
