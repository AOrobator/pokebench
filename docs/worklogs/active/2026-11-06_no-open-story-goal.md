# No open story goal

The operator 2026-11-06, "Do both". When the latest Story line is reached or done and nothing newer names a place, the readout says plainly that no story goal is open. No PokéNav mention and no hint.

- [x] RED: tests in `unnamed-place-story-line.test.ts`
- [x] GREEN: 20 focused tests pass.
- [x] Replay of `goalLine` off and on, with retirement on: a0b4 from T279, 133 of 133 results change, all the reached form. ee2a, 0 of 520 change, because its goal stayed open. Config and explainer done.
- [x] Gates, review, landing

Gates on 91454de30: `just test` passed with 2,642 agent, 1,073 viewer, 2,965 env and 38 gateway tests, floors and `just no-io-proof`; `pnpm -r lint`, env and gateway lint and `just verify-vendor` clean. Source changed after that.

Review round 1. GPT: BLOCKING, a repeated story block dropped the line when `story-destinations-v1` and `input-cuts-v1` are on. Fix: a reached goal is not treated as repeated with the switch on. Claude: BLOCKING, a done line brought back the quote `stale-story-goal-v2` retires. Fix: a done goal prints only "Story goal: none open (latest line done).". Tests now go through `HarnessTrust.lines` with recipe options. Follow-up: the line prints on first arrival, before anything happens at the place; the feature text now says so. `ng.mjs` calls `goalLine`, so its a0b4 count covers the reached form.

Round 2: Claude LGTM; its two wording notes are applied.

Round 2 GPT: BLOCKING on one point. Fix: when the story block already carries the quote, the plain line prints alone.

Final: GPT (Codex CLI, gpt-5.6-sol) LGTM and Claude (subagent) LGTM on 1d90d513d. Grok out until 11/17. Gates on 1d90d513d: `just test` passed with 2645 agent, 1073 viewer, 2,965 env and 38 gateway tests, floors and `just no-io-proof`; `pnpm -r lint`, env and gateway lint and `just verify-vendor` clean.

## Switched off in both arms (2026-11-06)

Asked to check first arrivals, I replayed a0b4 and 274b through `goalLine` with `unnamed-place-story-line-v1` on. The switch prints "none open (latest line done)" on a0b4 T181-T271, 91 results during the Mt. Pyre climb; on 274b from T1228 on Route 114, before Meteor Falls; and on 274b from T1304 at Mt. Chimney. The story place is not finished on any of them. My earlier replay began at T279, so it missed this. The older line already said "Story goal: none." on those turns, so the claim is not new; what the switch adds is dropping the quote, and a0b4 climbed with the quote in view. Off in `current.json` and the preset until a fix says none open only after the place's business is done. No launch carried it.

COMMIT: `fix(config): no open story goal off in both arms` (dcfe717ef). A loose README replace in that commit also rewrote five other switches' lines; the next commit restores them, and only this switch's line differs from main. Done reasons confirm the cause: a line retires on the map's first entry when a story step lands on the same arrival ("ROUTE114 ..., first entered at turn 1228, then route 114 at turn 1228").
