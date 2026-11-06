# Junk filter leader lines

The operator 2026-11-06, queued with the correctness switches. The junk filter's R5 drops a gym leader's lines; a replay of ee2a with the filter on shows it for WINONA at T60 (the run itself had the filter off). They should stay until that badge is earned. This changes model-facing memory, so it ships behind `junk-filter-leader-lines-v1`, default OFF, on in both arms.

- [x] RED: tests in `instruction-memory-junk.test.ts`
- [x] GREEN: 29 tests pass in `instruction-memory-junk.test.ts`.
- [x] Replay through `ObservedInstructions` with the cap, junk filter and field dialogue on, sampling every fifth result. With earned badges latched, the block differs in 3 of 118 samples on ee2a, first at T60, and 60 of 437 on 274b, first at T191. Config and explainer done.
- [ ] Gates, review, landing

Review round 1. GPT: BLOCKING. Fix: title-case badges in older runs now match; my merge left a duplicate README paragraph, removed. Claude: BLOCKING. Fix: battle states report `badges:[]`, so a beaten leader's line came back mid-run (ee2a T105 on); earned badges are now latched, and the first replay numbers (12 and 74) included this bug. Docs corrected: the T60 drop is a replay, and the switch spares a line from the junk rule while the size cap still applies. Test renamed, it only checks registration. Follow-ups: no test drives the switch through `observedInstructions`; Tate and Liza's printed intro pages never reach R5, with or without this switch.

