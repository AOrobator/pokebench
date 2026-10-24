# Bag pocket, press feedback and ineffective-loop bugfixes

## Authorized outcome
The operator approved implementation on 2026-10-24: “let’s fix all of these behind their own switches but they should be on in both arms since they are bugfixes”. One implementation milestone with RED/GREEN, proof, independent review and local landing. No new gameplay/inference launches or changes to active runs.

## Design
- `bag-pocket-truth-v1`: correct native pocket enum (0 ITEMS, 1 POKE BALLS, 2 TMS HMS, 3 BERRIES, 4 KEY ITEMS). OFF retains legacy labels.
- `bag-press-feedback-v1`: compare verified bag pocket, location, list item and cursor alongside existing interface facts. OFF retains the prior comparison.
- `bag-ineffective-loop-v1`: qualify ready, owned bag list states for the existing ineffective-action guard. Ignore raw task arrays/timers; unsupported/transitioning states remain unqualified. OFF excludes bag menus as before.
- Registry/omitted defaults OFF. User-authorized activation in both arms through `base.features` and `onInBoth` in current fixed-run recipes; never add these fixes to treatment `switches`. Do not change pinned control bases or recorded definitions under runs.
- Separate switches, no tool/prompt changes, no new timeline marks.

## Evidence and source
Run `2026-10-24T10-22-09_qwen36-gpu0_3b6e`, clean harness `bbefc77b80f66a3797b7755fa79a98ad92542b48`, ROM SHA1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. At t1360 seq54011→54019, legacy pocket BERRIES→TMS HMS, selected CLOSE BAG, false unchanged result seq54020. The paired frame shows BERRIES. Hash-validated raw archives sequence19453,19458,19867 have native pockets 4,3,3. Emerald reference `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, clean: `include/constants/item.h`, `include/item_menu.h` BagPosition, `src/item_menu.c` SwitchBagPocket. Broader interface_dwell warnings exist at t1403 and1433; the ineffective guard excludes bag states.

## Skills
feature-switch, feature-explainer, pokebench-game-state, pokebench-trace-forensics, agent-observability, close-the-loop, viewer-e2e, talk-to-claude, execute-worklog and multi-model-review.

## M1
- [x] RED regression tests and commit
- [ ] GREEN implementation and production factory tests
- [ ] Wiring deletion/restoration receipts
- [ ] Read-only recorded RAM and event replay
- [ ] Three linked explainers and background browser checks
- [ ] Full test, lint, build, coverage and vendor gates
- [ ] Principles and frozen multi-model review
- [ ] Landing board, local landing and served-build check

## Proof boundaries
Archived replay establishes readout/feedback/detection correctness, not gameplay benefit. No measured benefit claim or experiment launch. Preserve operator desktop focus; all browser proof headless.

## Session log
- Created isolated managed worktree from main `ebed5a7f3`; branch `codex/bag-pocket-bugfixes`.

- RED: agent 5 failing/1 passing; Python 5 failing/1 passing. Failures reproduce wrong enum, missing feature registration, empty-pocket comparison and missing ineffective warning. Viewer both-arm activation fails before config edits. Logs `/tmp/bag-fixes-red-{ts,py,viewer}.log`.
