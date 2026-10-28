# PokéNav Match Call correctness: pokenav-short-list-v1 and menu-option-honest-refusal-v1

Status: landed on local main 860d36254 (2026-10-27 9:12 PM NY); archive pending operator approval
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
- [x] Review round 2 on head 5dae792c0:
  - Claude: LGTM. Fallback: LGTM.
  - Codex: BLOCKING on one point only, the viewer test's setup cost (repeated preset builds and a duplicate validation).
  - Per the cap rule, I asked the operator after two rounds. The coordinator relayed option 1: fix the test cost, then a Codex-only round 3 on that delta.
- [x] Round 2 fix: `pokenav-correctness-bundle.test.ts` builds each (phase, arm) preset once and reuses it for both ids and the server check. It drops the duplicate `definitionProblems`, since `parseFixedDefinition` already throws on problems.
- [x] Review round 3 (Codex gpt-5.6-sol, test-only delta 5dae792c0..9f798d6bd): LGTM. Final roster on the frozen head 9f798d6bd: Claude LGTM (r2, subagent harness), fallback LGTM (r2), Codex LGTM (r3).
- [x] CPU window granted (coordinator, 8:45 PM NY). main had moved to 55312588c (scene-followup-prompt-v1). Rebased: the new ids are appended after scene-followup-prompt-v1. The absolute pins shift by one (switchable 282/283, harness 306/307; server 93 is unchanged). `scene-followup.test.ts` now pins its own index 281 instead of "last", because a switch now follows it.
- [x] Full gates on the synced tip 860d36254 (base main d06b9f4db), in the CPU window granted by the coordinator at 8:45 PM NY:
  - Agent: 4643 passed. Viewer: 2106 passed. Coverage thresholds met.
  - Python: 4463 passed; coverage lines 97.48%, branches 93.61%, functions 100%.
  - claude-gateway: 69 passed; coverage gate ok.
  - Trainer-card check: 3 passed.
  - Lint clean: pnpm lint, ruff, ruff format, mypy, gateway mypy --strict.
  - Worktree setup: the viewer dist had to be built, and the card art comes from POKEBENCH_CARD_ART = the main checkout's `runs/sprites`.
- [x] Landed through the landing board. Slot taken 9:10 PM; `git merge --ff-only 860d36254`, d06b9f4db → 860d36254. Review roster on the content:
  - Claude: LGTM (r2, subagent harness after a CLI OAuth failure).
  - Fallback: LGTM (r2).
  - Codex gpt-5.6-sol: LGTM (r3).
  - The later rebases onto scene-followup-prompt-v1 and end-reason-orthogonal were mechanical: list placement and the absolute pins shifted by one. The coordinator's standing rule covers this.
- [x] Post-landing `just test` on main: pass. The first attempt failed 2 agent tests with "unknown feature pokenav-short-list-v1": the main checkout's dist was stale (built before the landing). After `pnpm -r build`:
  - Agent: 4643 passed.
  - Viewer: 2106 passed.
  - Python: 4463 passed, lines 97.48%, branches 93.61%.
  - Gateway: 69 passed.
  - Trainer cards: 3 passed.
- [x] Fixed-definition hashes changed by this landing, before (d06b9f4db) → after (860d36254):
  - bundle-v-control: 26f0b8ac3d6f → 6720e1fcdc16
  - bundle-v-control-2h: 3bdda2b39dc6 → f939f403c8bb
  - glm53-flash-4h: d0eee9fdac15 → 87fe4cb976a9
  - hyperqwen-control-3h: 081c6df9f882 → 356847041a6d
  - The only recorded approval is hyperqwen-control-3h's e88187ff663d (3:22 PM). It was already stale before this landing. Re-approval is the operator's.
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

