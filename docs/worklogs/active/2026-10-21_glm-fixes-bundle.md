# The six GLM-run fixes in the bundle

The operator 2026-10-21: "all six in the bundle". Turn on, in the bundle arm only, the six switches that landed at be531506a: story-goal-player-name-v1, cut-off-reply-feedback-v1, trainer-sight-check-v2, auto-talk-v2, map-wide-triggers-v1, drought-battle-heal-hold-v1.

Files: experiments/fixed/{bundle-v-control, bundle-v-control-2h, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h}.json, the same set shop-interface-v1 went into plus the 2h pair. The GLM four-hour loop materializes bundle-v-control from current main before each pair, so its next pair picks these up. Control stays the same: each switch is false in base.features and absent from onInBoth. DEFAULT_NEXT_RUN stays OFF. The six pending experiments get source.commit be531506a (the landing merge). No harness code changes.

## M1 bundle membership
- [x] RED: fixed-runner test that the six are bundle-only in all five definitions
  COMMIT: `test: the six GLM-run fixes are bundle-only in the five bundle definitions` (d48732acb). Fails before the definitions change.
- [x] GREEN: definitions and source repins
- [ ] Gates, cloud review (Claude, Grok, GPT), land ff-only

COMMIT: `feat: the six GLM-run fixes on in the bundle arm of five fixed bundles; pending experiments pinned to the landing merge` (6f642e9a7). COMMIT: `test: parse each bundle definition once in the six-switch membership test` (f3d412693).
GREEN: the six appended to base.features (false) and switches in the five definitions; source.commit be531506a1504bd5e1e21135e599861a34249545 in the six pending experiments. Three older pinned-incumbent tests (open-goal-prompt, heal-first, story-battle-heal-gate) list the six with the other later bundle additions, as every earlier addition did.
Gates: lint pass; agent 3398, viewer 1636, Python 3806 pass; coverage agent 97.27/93.14/97.8/99.2, viewer 95.44/91.34/94.33/97.91, Python 97.29/93.11/100 (floor 90); verify-vendor, experiments-audit silent.

Review round 1 (packet 7bb61a62): Claude and Grok CHANGES REQUESTED on one test-shape finding: the new test parsed the five definitions once per switch (30 parses). Fixed: each file parsed once, ids looped inside. Also noted drought-battle-heal-hold-v1 needs stall-briefing-v1, true in base in all five.

Synced main 65f350865 into the branch for landing (clean merge, none of this branch's files touched by main).
