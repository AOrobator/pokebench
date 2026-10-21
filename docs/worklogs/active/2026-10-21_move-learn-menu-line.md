# Move-learning menu line

User request: put the fix for the contradictory move-learning menu line in the bundle.

Confirmed using the recorded battle-delete-box raw archive: the generic Menu line says no menu choice is open while the battle-script move-learning YES/NO prompt owns input. Repair under the existing bundle-only move-learn-question-v1 switch; OFF retains the previous bytes. No bundle definition change is necessary: this switch already belongs to the bundle arms.

Game reference: clean pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, data/battle_scripts_1.s BattleScript_AskToLearnMove (yesnoboxlearnmove / yesnoboxstoplearningmove). Recorded raw fixtures retain their existing hash provenance.

Plan: assert the Menu line uses the verified battle prompt's ready selection, retain fallback for unknown/busy prompts, update the existing explainer, run focused native archive/readout regressions.

Implemented in readout._menu under move-learn-question-v1. Native battle prompt must be ready, have YES/NO selected, be in the prompt text phase, and have no battle diagnostic. Both battle prompt archives reproduced the failure before the fix; both YES/NO selections now pass, and busy/unknown selections retain the fallback. Existing production render path is exercised; disabling the switch retains the old line. Verified switch membership in bundle-v-control, bundle-cook-1h and whole-map-cook-1h. Focused tests: 127 passed. Ruff, mypy, pages-check and git diff --check pass. Source changes are local; no viewer restart or measured run was performed.

## Review and landing request

User explicitly requested review, commit and landing on main. Patch moved from the shared checkout into the attached isolated worktree on codex/move-learn-menu-line; unrelated viewer edits preserved. Added fallback tests for absent battle/prompt, battle diagnostic and non-prompt phases, plus an unrelated prompt kind. Seven performed independent deletions (wiring, switch, diagnostic, phase, prompt kind, ready, YES/NO selection) each fail the production-render regressions; restored after every mutation. Receipt: /tmp/pokebench-move-menu-review/mutations.log. Native fixture suite: 72 passed. Review boundary and all PB1-PB13 self-review are frozen under /tmp/pokebench-move-menu-review/. Full gates and three cloud verdicts are required before landing. No local inference reviewers.
