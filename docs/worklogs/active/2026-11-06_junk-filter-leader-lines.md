# Junk filter leader lines

The operator 2026-11-06, queued with the correctness switches. The junk filter's R5 drops a gym leader's pre-battle lines (WINONA, ee2a T60). They should stay until that badge is earned. This changes model-facing memory, so it ships behind `junk-filter-leader-lines-v1`, default OFF, on in both arms.

- [x] RED: tests in `instruction-memory-junk.test.ts`
- [ ] GREEN, replay, config, explainer
- [ ] Gates, review, landing
