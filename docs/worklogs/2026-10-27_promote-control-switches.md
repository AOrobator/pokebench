# Promote report-recommended switches to control; turn broken ones off

Status: landed on main (ff88c3a03), awaiting operator archive approval
Branch: claude/promote-control-20261027-125859 (worktree /private/tmp/pokebench-promote-control-20261027-125859)
Evidence: runs/reports/run-analysis/2026-10-27_astra-frontier/ (sections/switches.md §3, sections/bugs.md B2/B5/B11)

## Scope
- experiments/feature-configs/current.json only (the maintained owner that bundle-v-control, bundle-v-control-2h and glm53-flash-4h reference). Control base preset unchanged (onInBoth/offInBoth are exempt from controlBaseProblems).
- Pinned-config tests updated to the new state. No production code, registry, prompt, default or explainer change.
- Non-goals: no switch deletions or renames, no fixes to the switches turned off, no change to archived/frozen definitions, no launch.

## M1
- [x] 14 switches → onInBoth, base true: drought-progress-facts-v1, campaign-progress-clock-v1, whiteout-outcomes-v2, moving-npc-target-v1, citation-evidence-v1, interface-guidance-v1, menu-option-tool-v1, battle-move-learn-input-v1, post-battle-readout-v1, move-learn-settle-v1, move-learn-tool-v1, move-learn-loop-fingerprint-v1, fixed-point-breaker-v1, drought-battle-heal-hold-v1
- [x] Dependencies: registry `needs` of all 14 (stall-briefing-v1, cited-destination-v1, active-ui-ownership-v1, battle-details-v2) already ON in the shared base; none added.
- [x] 6 switches → offInBoth (the operator: "lets turn off all of them"): instruction-goal-advisory-v1, goal-review-repair-feedback-v1, milestone-drought-suppression-v1, pokedex-own-v1, navigation-recovery-v1, map-cycle-recovery-v1 (it needs navigation-recovery-v1; coordinator answered option A). instruction-goal-ledger-v1 was already offInBoth.
- [x] Recipe counts: switches 77→57, onInBoth 35→49, offInBoth 14→20.
- [x] Live runs: no game server or agent process on the Mac; newest run write Oct 25 23:43 (6bbd). Nothing touched.
- [x] Gates: agent vitest 4475/4475, viewer vitest 2031/2031, pnpm -r lint clean.
- [x] Review lanes on frozen packet ff88c3a03 vs 0352ae567, diff sha256 16fb4d147ae7c3f5dab479226ba76cf4b55888961e071372931a519192c53cb7 (artifacts /tmp/review-promote-control/):
  - Claude CLI (~/.claude-review, plan mode): VERDICT: LGTM
  - GPT: Cursor gpt-5.6-sol-xhigh out of usage → Codex CLI gpt-5.6-sol (read-only, ephemeral): VERDICT: LGTM. Non-blocking: registry descriptions still say "bundle only" (out of boundary).
  - Grok: Cursor out of usage; fallback fresh read-only Claude subagent reviewer: VERDICT: LGTM (the operator standing rule 2026-10-21/22). Non-blocking: next launch of the three current definitions needs fresh approval because the recipe sha256 changed.
- [x] Landed: `git merge --ff-only ff88c3a03` (main 0352ae567 → ff88c3a03), landing board slot 1.
- [x] Post-land on main: agent vitest 4475/4475, viewer 2031/2031, pytest 4425 passed. trainer-card-check not run (it drives headless Chrome; brief forbids; no viewer presentation change).
- [x] No viewer restart (brief); no live runs existed.
