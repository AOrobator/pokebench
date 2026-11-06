# Unnamed place story line

The operator 2026-11-06, approved as a correctness switch on in both arms. A place-naming field line from any speaker becomes the Story goal when newer, quoted whole, labelled with what the game shows, never a guessed name.

- [x] RED: `unnamed-place-story-line.test.ts`
- [x] GREEN: 12 tests pass
- [x] Replay, config, explainer. Recorded events through `StoryDestinations` off and on, with goal retirement on. ee2a: 3 goal changes off, 4 on over 592 turns; the grunt's line takes over at T146 and MAY's newer line replaces it at T188. 274b: 22 changes off, 32 on over 2,305 turns; 14 distinct lines off, 20 on. The game shows no speaker for the T146 page, so its label lists the sprites on screen, not "Team Aqua grunt".
- [x] Gates, review, landing

Gates on 154310863: `just test` passed with 2,609 agent, 1,052 viewer, 2,965 env and 38 gateway tests, floors and `just no-io-proof`; lint and `just verify-vendor` clean.

Review round 1, GPT: BLOCKING, four findings. Fix: a printed name prefix was labelled as a sprite; a PokéNav call from a non-story caller could become a lead. Rebut: a named story character's call goes through the existing branch, unchanged by this diff; `delivered-place-evidence-v1`'s branch is also unchanged. Wording: the same-map rule skips lines naming only the heard-on map; a line naming another known place too is a lead. Boundary and docs corrected.

Review round 1, Claude: BLOCKING. Fix: two-trainer challenges print "want to battle!" and slipped past the challenge skip (ee2a T526, 274b T1084); the feature text's claim about MAY's 400 turns was false; the worklog's T527 explanation was wrong. Follow-ups, not in this change: a done or reached unnamed line hides an older live goal, as a story character's line already does (274b: 223 results, mostly ARCHIE@1262 after T1304); the same-map skip compares exact map ids, so a line about the mountain heard on another floor passes; `staleGoalLine` appends 's to labels, and harness-trust's walk-away note still says "story character".

Round 2 on the delta: GPT (Codex CLI, gpt-5.6-sol) LGTM, Claude (subagent) LGTM. Grok out until 11/17. Gates on c812d01e2: `just test` passed with 2,612 agent, 1,052 viewer, 2,965 env and 38 gateway tests, floors and `just no-io-proof`; lint and `just verify-vendor` clean. Rayquaza lane inherits through `base: current`.

