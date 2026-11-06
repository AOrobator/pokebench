# Unnamed place story line

The operator 2026-11-06, approved as a correctness switch on in both arms. A place-naming field line from any speaker becomes the Story goal when newer, quoted whole, labelled with what the game shows, never a guessed name.

- [x] RED: `unnamed-place-story-line.test.ts`
- [x] GREEN: 8 tests pass
- [x] Replay, config, explainer. Recorded events through `StoryDestinations` off and on. ee2a: 3 goal changes off, 5 on; the grunt's line takes over at T146, MAY's newer line replaces it at T188, and a HEX_MANIAC taunt on Mt. Pyre at T527 remains as noise because its battle starts in a later call. 274b: 24 changes off, 37 on over 2,305 turns; 14 distinct lines off, 21 on. The game shows no speaker for the T146 page, so its label is the sprites on screen, not "Team Aqua grunt".
- [ ] Gates, review, landing

Gates on 154310863: `just test` passed with 2,609 agent, 1,052 viewer, 2,965 env and 38 gateway tests, floors and `just no-io-proof`; lint and `just verify-vendor` clean.

Review round 1, GPT: BLOCKING, four findings. Fix: a printed name prefix was labelled as a sprite; a PokéNav call from a non-story caller could become a lead. Rebut: a named story character's call goes through the existing branch, unchanged by this diff; `delivered-place-evidence-v1`'s branch is also unchanged. Wording: the same-map rule skips lines naming only the heard-on map; a line naming another known place too is a lead. Boundary and docs corrected.

