# Junk filter leader lines

The operator 2026-11-06, queued with the correctness switches. The junk filter's R5 drops a gym leader's pre-battle lines (WINONA, ee2a T60). They should stay until that badge is earned. This changes model-facing memory, so it ships behind `junk-filter-leader-lines-v1`, default OFF, on in both arms.

- [x] RED: tests in `instruction-memory-junk.test.ts`
- [x] GREEN: 27 tests pass in `instruction-memory-junk.test.ts`.
- [x] Replay through `ObservedInstructions` with the cap, junk filter and field dialogue on, sampling every fifth result. The block differs in 12 of 118 samples on ee2a, first at T60, and 74 of 437 on 274b, first at T191. Config and explainer done.
- [ ] Gates, review, landing
