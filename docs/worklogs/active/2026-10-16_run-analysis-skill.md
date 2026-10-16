# Worklog: run-analysis skill

Operator ask (the operator, 2026-10-16, project thread "Top runs analysis and skill"): make the top-runs analysis a repeatable skill that writes an HTML report and a chat summary, includes a PokeBench review of whether changes help or hurt, an agent-frontier section and a promote/hold recommendation for control. Docs-only: no application code, so no coverage gate applies.

Branch `claude/run-analysis-skill`, worktree `/private/tmp/pokebench-run-analysis`.

- [x] Draft `.claude/skills/run-analysis/SKILL.md` and the CLAUDE.md pointer. COMMIT: `skills: add run-analysis for top-run reports with a PokeBench review` (c1238435)
- [x] Review round 1 fixes (Grok BLOCKING): workbench-only ranking, frontier.mjs cross-check, label normalization. COMMIT: (069df9ab)
- [x] Review round 1 fixes (Claude BLOCKING): segments from workbench splits, start-kind tiebreak, review as a report section, switch-file lookup. COMMIT: (9287f167)
- [x] Lessons from the first run (persona review): never rank from run_end/ledger order; count arm pools; lane, pin-drift and tuning confounds; auto-advance credit per arm.
- [x] Round 3: Claude LGTM at 217e5b59. Codex (gpt-5.6-sol) BLOCKING: other-save start group, frontier.mjs cross-check scope, derived splits use split.turn/seq, optional evaluation.features. Fixed. COMMIT: (217e5b59 → next)
- [x] Round 4: Claude LGTM, Grok LGTM at 00129cb2; Codex BLOCKING (cohort pool undefined, segmentMs counts optional splits, screenshot-derived provenance). Fixed with hardening (probe form, viewer-tree order, unknown start, second timeout stops).
- [x] Round 5 at 9309dc7d: Claude LGTM, Codex LGTM, Grok BLOCKING (opening segment from 0 missing). Fixed, with hardening (null elapsedMs, negative deltas, review steps used, forensics selection skipped, self-check order).
- [x] Round 6 at d439d349: Claude LGTM, Grok LGTM, Codex BLOCKING (no visual QA of the HTML per close-the-loop). Fixed.
- [ ] GPT lane: Cursor GPT hit its usage limit; Codex CLI with -m gpt-5.6-sol (standing-authorized harness switch).
- [ ] Claude, Grok and GPT lanes `VERDICT: LGTM` on the frozen packet.
- [ ] Fast-forward merge to local main; report the SHA in the thread.
