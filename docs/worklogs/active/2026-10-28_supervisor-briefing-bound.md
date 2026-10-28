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
- [x] Replay of recorded events through the built supervisor (`SupervisorBriefing`, both lines compared with the recording): OFF reproduces the recorded lines byte for byte in all three runs. Notes ON: 429f T2566 66,297 → 12,429 chars (dialogue line 44,203 → 4,204, other-map line 15,816 → 1,947); a702 T1300 23,676 → 13,119 (9,794 → 4,209, 6,186 → 1,214); 88ea T1352 23,348 → 10,343 (13,178 → 4,144, 5,034 → 1,063). Read-only on 88ea's events.
- [x] Explainer `docs/explainers/supervisor-briefing-bound-v1.html` (theme, pages-check clean, headless desktop/phone screenshots), README, `FEATURE_EXPLAINERS`; panels/server link tests 2/2.
- [x] Activation commit (this branch only; not landed): appended to current.json `switches` (bundle ON) and `features` false (control OFF). Recipe sha256 on main f8fbd8ed… → 351059e9… on this branch alone (each bound branch changes it separately; once several land, the final sha is computed on main). Launch definitions with featureRecipe "current" need `just fixed-run approve` again. Config readers: viewer 50 passed, agent 61 passed.
- [ ] Gates on a CPU grant; three-lane review.

## M2: exits to maps not entered (coordinator 2026-10-28 11:51 AM NY, under the operator's standing rule that nothing given to the model may grow unbounded)

"Exits to maps you have not entered since your last story progress" (1,780 chars at 429f) also grows with the maps walked. It is now bounded the same way: whole map entries, nearest (most recently walked) first, within 2,000 chars, ending `; N earlier maps are left out`.

- [x] RED: 2 tests in `supervisor-briefing-bound.test.ts`. OFF passes; ON fails (no bound, BRIEFING_EXITS_CHARS absent).
- [x] GREEN: `mapsWithin()` shared by both map lists, BRIEFING_EXITS_CHARS 2000. 9/9; with neighbours 157 passed; tsc and eslint clean. Replays: the exits line was 1,780 / 907 / 619 chars at 429f / a702 / 88ea, under budget, so those notes are unchanged (12,429 / 13,119 / 10,343 ON). OFF still reproduces all three recorded lines. Registry description and explainer updated.

## Lines that grow with run length (running list, reported together at the end)

- Supervisor "Exits to maps you have not entered": bounded in M2.
- Refusal ledger: one entry per refused target on the current map. A single entry's "Latest result" line can be about 3,000 chars, because it carries the whole navigation result with its departure alternatives (9e33 T2417: 10 entries, 24,803 chars). Its attempts turn list also grows with repeats. This is bound 3.
