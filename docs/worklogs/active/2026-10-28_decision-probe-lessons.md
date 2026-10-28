# Decision-probe skill lessons (2026-10-28)

Docs only: `.claude/skills/pokebench-decision-probes/SKILL.md`. The operator asked for it on main (relayed 2026-10-28 6:55 PM ET).

- [x] Lessons from the 2026-10-28 probes, all added:
  - what has moved the model so far;
  - test the note at the decision it must change, not where the trigger first fires (heard-line: 0/8 at T665 versus held-out SOUTH 2/96 → 30/96);
  - the PINEAPPLE channel check and its placement ranking (final message 4/4, before-tail 2/4, result line 1/4, merged 0/4);
  - blind and strict scoring;
  - contexts larger than the lane window (88ea);
  - the `--trust-header` exits caveat;
  - the worktree setup checklist.
  COMMIT: `docs(skill): decision-probe lessons to 2026-10-28` (4d93a9e53). Main merged in (39292d1b8).
- [x] Review round 1, Codex gpt-5.6-sol: CHANGES REQUESTED, 4 findings, all fixed:
  - N stated as a rule;
  - the "0 samples" error;
  - question variants overgeneralized (the report has them at 7–10/16);
  - the map_groups path.
- [x] Review round 2 (e80866aaf): CHANGES REQUESTED, 3 findings, all fixed: system-prompt claim scoped to the scene study, N=1–3 as decision-evidence guidance, window check stated as fit rather than same lane.
- [x] Review round 3 (9aaf185d2): one finding fixed: `--recorded-trim` guarantees message and image counts, not tokens.
- [ ] Review round 4, then land through the board.
