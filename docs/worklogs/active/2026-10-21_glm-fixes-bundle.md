# The six GLM-run fixes in the bundle

The operator 2026-10-21: "all six in the bundle". Turn on, in the bundle arm only, the six switches that landed at be531506a: story-goal-player-name-v1, cut-off-reply-feedback-v1, trainer-sight-check-v2, auto-talk-v2, map-wide-triggers-v1, drought-battle-heal-hold-v1.

Files: experiments/fixed/{bundle-v-control, bundle-v-control-2h, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h}.json, the same set shop-interface-v1 went into plus the 2h pair. The GLM four-hour loop materializes bundle-v-control from current main before each pair, so its next pair picks these up. Control stays the same: each switch is false in base.features and absent from onInBoth. DEFAULT_NEXT_RUN stays OFF. The six pending experiments get source.commit be531506a (the landing merge). No harness code changes.

## M1 bundle membership
- [x] RED: fixed-runner test that the six are bundle-only in all five definitions
- [ ] GREEN: definitions and source repins
- [ ] Gates, cloud review (Claude, Grok, GPT), land ff-only
