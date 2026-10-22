# Move-learning menu line

User request: put the fix for the contradictory move-learning menu line in the bundle.

Confirmed using the recorded battle-delete-box raw archive: the generic Menu line says no menu choice is open while the battle-script move-learning YES/NO prompt owns input. Repair under the existing bundle-only move-learn-question-v1 switch; OFF retains the previous bytes. No bundle definition change is necessary: this switch already belongs to the bundle arms.

Game reference: clean pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, data/battle_scripts_1.s BattleScript_AskToLearnMove (yesnoboxlearnmove / yesnoboxstoplearningmove). Recorded raw fixtures retain their existing hash provenance.

Plan: assert the Menu line uses the verified battle prompt's ready selection, retain fallback for unknown/busy prompts, update the existing explainer, run focused native archive/readout regressions.

Implemented in readout._menu under move-learn-question-v1. Native battle prompt must be ready, have YES/NO selected, be in the prompt text phase, and have no battle diagnostic. Both battle prompt archives reproduced the failure before the fix; both YES/NO selections now pass, and busy/unknown selections retain the fallback. Existing production render path is exercised; disabling the switch retains the old line. Verified switch membership in bundle-v-control, bundle-cook-1h and whole-map-cook-1h. Focused tests: 127 passed. Ruff, mypy, pages-check and git diff --check pass. Source changes are local; no viewer restart or measured run was performed.

## Review and landing request

User explicitly requested review, commit and landing on main. Patch moved from the shared checkout into the attached isolated worktree on codex/move-learn-menu-line; unrelated viewer edits preserved. Added fallback tests for absent battle/prompt, battle diagnostic and non-prompt phases, plus an unrelated prompt kind. Seven performed independent deletions (wiring, switch, diagnostic, phase, prompt kind, ready, YES/NO selection) each fail the production-render regressions; restored after every mutation. Receipt: /tmp/pokebench-move-menu-review/mutations.log. Native fixture suite: 72 passed. Review boundary and all PB1-PB13 self-review are frozen under /tmp/pokebench-move-menu-review/. Full gates and three cloud verdicts are required before landing. No local inference reviewers.

## Review synthesis and landing — 2026-10-21

Frozen base `8f98367d154945cb0e06cb359c0a0100494ed0bc`, source commit `9f2f77ea9645202e90658bb7c3b8cdd8c5601c83`, binary-diff SHA-256 `e4d74895c297cce83b7ef3d4913cb83a9d4d03d5b9d072a65a8b6250a720321b`. Review receipts and synthesis: `runs/reviews/move-learn-menu-line/` (ignored local evidence).

- Full pre-land gates passed: lint, build, coverage (agent 3281; viewer 1601; Python 3589 = 8471 tests), vendor verification, pages-check, diff-check. Coverage lines/branches/functions: agent 97.26/93.10/97.71; viewer 95.41/91.32/94.33; Python 97.23/92.97/100.
- Grok cloud (`cursor-grok-4.5-high`): terminal `VERDICT: LGTM`, exit 0, empty stderr, frozen identity verified. GPT cloud-family (`gpt-5.6-sol`, xhigh, isolated `/root/gpt_review`): initial BLOCKING evidence gap (two missing null-guard mutation receipts), accepted and supplied without source changes; independently reproduced both, then terminal `VERDICT: LGTM`. All nine independent mutations are proven; all nine test-quality dimensions and PB1–PB13 reviewed, zero unresolved blockers.
- Claude unavailable: dedicated reviewer CLI logged out; Cursor Opus 5.5, Sonnet 5 and Haiku 5.5 each usage-limited. None counted green. Standing outage replacements `/root/fallback_sol_review` (`gpt-6-sol`, high) and `/root/fallback_astra_review` (`gpt-6-astra`, high) each terminal `VERDICT: LGTM`; independent native checks passed. Reduced vendor diversity explicit.
- Operator explicitly approved the exception: **“Allow this fallback and land after Grok approves.”** Grok's completed LGTM was validated before merge. No further review finding changed code or scope. Nonblocking suggestions to widen prompt coverage or change Interface ownership remain out of scope.
- Clean canonical main fast-forwarded to exact reviewed source commit `9f2f77ea9`. Post-landing `just test` **on canonical main**: agent 3281, viewer 1601, Python 3589, all 8471 passed. An additional duplicate test invocation in the branch, overlapping main's run, timed out in an unchanged serial-comparison fixture; the separately required main suite passed with original limits and no gate changes.
- Actual `armFeatureBits` expansion verified bundle=true/control=false for move-learn-question-v1 in bundle-v-control, bundle-cook-1h and whole-map-cook-1h. Recorded battle-delete/stop raw archives through the production reader/render show old no-choice Menu line with switch OFF and native learn_move/stop_learning_move selected YES with it ON; YES and NO variants covered.
- `just viewer-main` restarted once at `9f2f77ea9`; verified at **09:51:57 AM America/New_York**. Running viewer stamp is exact reviewed source SHA, clean; one listener on 127.0.0.1:8790. Both preexisting gameplay PIDs (10664, 10669) remained alive. `/api/workbench` has no older-viewer-build problems. Live 8790 explainer bytes equal tracked document; opened its new menu-line diagram in the browser. Historical event text is unchanged; this correction applies to future observations from the new harness build. No measured runs or approvals issued.

This closing commit touches only this worklog, using execute-worklog's evidence-only post-landing exception. Source behavior remains exactly the reviewed commit.
