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
- [x] Review round 1 on packet 06dcce7d2 (diff sha256 58b5e8a2…). Lanes:
  - Claude CLI failed authentication ("OAuth session expired and could not be refreshed"), so the Claude lane ran as a Claude subagent: BLOCKING.
  - Codex gpt-5.6-sol: BLOCKING.
  - Fallback subagent (Grok out): LGTM.
  - Personas: harness engineer, data scientist, ML engineer and eval integrity all returned "holds with changes".
- [x] Round 1 fixes:
  - Fixed: the honest refusal requires a ready, verified owner (`ready === true`, no diagnostic). Raised by Claude B1, Codex 1, the harness engineer and the ML engineer.
  - Fixed: positive native proof of call text with a702 dump 13788. Mutations to the +18 offset, the printer base and an always-true guard each turn tests red. Raised by Claude B2, Codex 2 and the harness engineer.
  - Fixed: absolute registry pins (switchable 281/282, server 93, harness 305/306) plus the `serverOffWith` delta. Raised by Codex 3.
  - Fixed: a test for the window id >= 32 diagnostic. Raised by the data scientist, Claude and Codex.
  - Fixed: a test for the condition-search short list. Raised by the harness engineer and Claude.
  - Rebutted: Codex 4, the viewer test's repeated reads. It is 8 file reads over 4 recipe rows with no network or process work; this is not a correctness defect.
  - Deferred as non-blocking follow-ups:
    - printer active-byte hardening (fallback)
    - showing the "call can't be made here" ROM text (fallback, Claude)
    - the six START-menu refusals with correct-looking arguments (ML engineer: 9e33 t5259/5264/5295, 6bbd t270/271)
    - a model-behavior probe on the fixed t642 readout (needs the operator and GPU time)
    - per-turn compaction (a model-side switch)
- [ ] Review round 2 on the fix batch
- [ ] Full gates (`just test`, `just lint`) once the heavy-CPU window is granted
- [ ] Land ff-only via the landing board; evidence commit; `just land-done`
- [ ] Explainer pages (deferred follow-up)

## Measurement notes (persona review, 2026-10-27)
- **Claim scope:** the fix removes a false coverage error and restores true Match Call readouts. Evidence is game source plus a702 RAM replay. No turn-savings or progress-rate claim is made, and the earlier "10–15 turns" estimate is withdrawn: it rests on a confounded bundle-vs-control comparison.
- **Baseline break:** runs on this build are not comparable with pre-merge control runs on metrics after MATCH_CALL_UNLOCKED. Post-merge cohorts need contemporaneous post-merge controls, with the harness SHA reported per run.
- **Coverage-error counts:** the Match Call coverage-error count stops being a health signal after the merge. Tag any trend of it by build.
- **Approvals:** fixed definitions that use `featureRecipe: current` get new hashes. Re-approval is the operator's.
- **Reach:** no recorded run unlocked Match Call within 120 wall minutes, so the short-list switch acts only in longer runs.
- **Post-landing checks:**
  - On the first run that reaches MATCH_CALL_UNLOCKED, do an agent-observability check that the readout reaches the model.
  - Confirm the fixed-point breaker and loop guards, now active on that screen, do not fire falsely.

