# PokéNav Match Call correctness: pokenav-short-list-v1 and menu-option-honest-refusal-v1

Status: in progress (single milestone; landing pending review and gates)
Branch: claude/pokenav-fixes-20261027-195751 (worktree /private/tmp/pokebench-pokenav-fix-20261027-195751)
Evidence: runs/analysis/a702-pokenav-20261027/{findings.md,fix-design.md}

## Why
Run a702 (Qwen3.6 bundle, harness 5940bc2fb) spent turns 641–661 on the Match Call tutorial with every readout a STATE COVERAGE ERROR. The cause was `menu_nav._list_cursor` rejecting a one-contact list in an 8-row window (pret pokenav_list.c CopyPokenavListTemplate keeps entriesOnscreen = maxShowed). The error hid the existing Match Call guidance, press results and call text. On turns 638 and 639, select_menu_option refused the PokéNav menu with a false reason. All six runs that reached Match Call hit the validator error.

## Scope (the operator 2026-10-27: "Validator + honest menu refusal"; "these switches should be on in both arms since it's a correctness fix")
- pokenav-short-list-v1 (server, registered default off). It also stops the stale gStringVar4 call message during the calling dots.
- menu-option-honest-refusal-v1 (agent, registered default off, needs menu-option-tool-v1).
- experiments/feature-configs/current.json: both onInBoth, base true.
- Non-goals: the press-result wording for a rejected-and-reopened menu, the blank START option, PokéNav menu support in select_menu_option, explainer pages (deferred).

## M1
- [x] Validator, call-text guard, registry, presets, next-run default, server lists, wiring. COMMIT: `fix: pokenav-short-list-v1 and menu-option-honest-refusal-v1, on in both arms` (bf7341df6, rebased from a79f827fa)
- [x] Rebased onto main 948095751 (grass-strides-v1): new ids appended after grass-strides-v1; type-gap registry test pins its absolute server index; viewer server-env check typed.
- [x] Targeted tests after rebase: pytest 119 passed; agent vitest 6 files / 116 passed; viewer vitest 11 files / 423 passed. tsc (agent, viewer), eslint (touched files), ruff, mypy (134 files) clean.
- [x] Red checks: removing the play-wiring argument fails the playGameTools factory test; removing the rerender kwarg fails the a702 readout test and the pass-through test.
- [ ] Review loop (Claude, GPT via Codex, fallback reviewer; persona review)
- [ ] Full gates (`just test`, `just lint`) once the heavy-CPU window is granted
- [ ] Land ff-only via the landing board; evidence commit; `just land-done`
- [ ] Explainer pages (deferred follow-up)
