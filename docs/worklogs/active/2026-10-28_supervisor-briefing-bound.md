# supervisor-briefing-bound-v1 (bounded supervisor and stall briefing lists)

Operator decisions, relayed from the project thread:

- The operator 2026-10-28 picked bound 2 (the supervisor and stall briefing) with bounds 1, 3, 4 and 6. Each bound is its own default-OFF switch on its own branch off main.
- The operator: "they all need to be on in the bundle". The activation commit puts this switch in current.json `switches` (bundle arm only). Control stays OFF.
- Don't land or activate until the coordinator returns with the operator's OK. Full suites only on a relayed CPU grant.

## Why

The largest recorded supervisor note is GPT run 429f's loop_guard at T2566: 66,297 chars. Two of its lines grow without bound:

- "Dialogue you were shown leading up to the last story step the game confirmed": 44,203 chars. It holds every page since the step before, so a long stall keeps adding to it.
- "Not tried yet on other maps you have been on since your last story progress": 15,816 chars, one entry per map walked since the last progress.

The rest of that note is about 6,300 chars. At a702 T1300 the briefing was 23,676 chars.

## Rule (whole items only; nothing is cut)

- **Story lead-up dialogue.** Whole pages, newest first, are kept while the quoted pages, joined with " | ", fit in 4,000 chars. The newest page always stays. Pages are shown oldest first, as today. When pages are left out, the header says `oldest first (N earlier pages are left out; get_dialogue searches the pages the harness advanced through)`. The get_dialogue clause appears only when dialogue-auto-advance-v1 is on, since that switch owns the tool.
- **Untried on other maps.** Whole map entries, newest first, are kept within 2,000 chars, and the newest map always stays. When maps are left out, the line ends `; N earlier maps are left out`.
- Every other line is unchanged.

**OFF:** byte-identical. **ON with nothing left out:** also byte-identical.

## M1

- [x] RED: `packages/agent/src/supervisor-briefing-bound.test.ts`, 7 tests. The 2 OFF tests pass on main. The 5 ON and registry tests fail (switch and constants absent).
- [x] GREEN: `loop-supervisor.ts` (`newestWithin`, BRIEFING_DIALOGUE_CHARS 4000, BRIEFING_ELSEWHERE_CHARS 2000) in storyContext and untriedElsewhere; registry (index 294, guard, needs null), preset, next-run. 7/7; neighbours (dialogue-context-kept, stall-briefing, briefing-exits, stall-interface, story-progress-clock, bundle-3f21-fixes, features, loop-supervisor, positive-supervisor) 155 passed; agent and viewer tsc clean; eslint clean on changed files.
- [ ] 429f T2566 and a702 T1300 replay: note length OFF vs ON.
- [ ] Explainer + feature-card link.
- [ ] Activation commit: current.json `switches` (bundle ON).
- [ ] Gates on a CPU grant; three-lane review.

Open: "Exits to maps you have not entered since your last story progress" (1,780 chars at 429f) also grows with maps walked. It is outside the approved bound, so it is noted here and not changed.
