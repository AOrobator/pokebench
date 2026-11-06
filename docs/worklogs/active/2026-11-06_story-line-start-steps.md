# Story line start steps

The operator 2026-11-06, "Yes, list them". The Story line and the briefing's done list should also carry campaign steps already done when a run starts from a checkpoint, read from the save's flags. The recorder already logs these as `present_at_start` milestones.

- [x] RED: tests in `story-line-campaign.test.ts`
- [x] GREEN: focused suites pass.
- [x] Replay: end-of-run Story line through `CampaignSteps`, which does not exercise wiring order (see the review log). ee2a 38 items to 82, 979 characters to 2,027, with knuckle, dynamo, heat and balance badges between route104 cindy and winona. 274b, from boot, has no steps present at the start and is unchanged at 79 items, 1,979 characters. Config and explainer done.
- [x] Gates, review, landing

Review round 1. GPT and Claude both BLOCKING on the same bug: present-at-start milestones are recorded in `recorder.start()`, before the tools subscribe, so a real checkpoint run would keep the old line while the briefing listed the steps. Fix: the wrapper asks for milestone replay, only with this switch on, so off stays exact. Checked against the real `RunRecorder`. GPT also: the briefing half needs `story-briefing-native-milestones-v1`, so the feature text now says so. Claude: two pages still said start steps are left out, corrected. First gate run (on 9ecca8d7a) passed but predates this fix.

Round 2: GPT (Codex CLI, gpt-5.6-sol) LGTM, Claude (subagent) LGTM. Grok out until 11/17. Gates on 729208cab: `just test` passed with 2,635 agent, 1,055 viewer, 2,965 env and 38 gateway tests, floors and `just no-io-proof`; `pnpm -r lint`, env and gateway lint and `just verify-vendor` clean.

