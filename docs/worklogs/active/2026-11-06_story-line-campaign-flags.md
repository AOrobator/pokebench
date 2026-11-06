# Story line campaign flags

The operator 2026-11-06, approved as a correctness switch on in both arms. The readout's `Story:` line stops at the server's early flags for the whole run. It should list the game-confirmed campaign steps the supervisor briefing lists, with no truncation.

- [x] RED: `story-line-campaign.test.ts`
- [x] GREEN: 7 tests pass, including the briefing listing each step once.
- [x] Replay: end-of-run Story line from recorded events. ee2a 34 items to 38, 904 characters to 979, now ending "feather badge; aerial ace received". 274b 34 items to 79, 907 to 1,979 characters. Whole list, nothing cut. Config and explainer done.
- [x] Gates, review, landing

Review round 1. GPT: BLOCKING, two findings. Fix: the wrapper rewrote any text part with a Story line, including a model-authored echo; it now needs a game state in the result. Rebut: a milestone fired by the result's own state record shows one result late, most show on the same result; the next readout carries it, and the docs say so. Claude: LGTM, no bugs. Fix: summaries now say "during the run". Follow-ups, not in this change: checkpoint starts leave steps present at the start unlisted, matching the briefing; each step re-lists people via `readStory`; the longer line uses the memory cap (documented in the README).

Round 2. Claude: LGTM; wording corrected. GPT: asked for a non-null state check. Rebut: no non-game tool returns a state key, and PokéNav results can carry the key with null on a real readout, so a stricter check would drop real Story lines. Gates on a2e17cae8: `just test` passed with 2,620 agent, 1,053 viewer, 2,965 env and 38 gateway tests, floors and `just no-io-proof`; lint and `just verify-vendor` clean. GPT round 3: LGTM, rebuttal confirmed. Grok out until 11/17.
