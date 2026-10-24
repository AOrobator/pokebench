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
- [x] GREEN implementation and production factory tests
- [x] Wiring deletion/restoration receipts
- [x] Read-only recorded RAM and event replay
- [x] Three linked explainers and background browser checks
- [x] Full test, lint, build, coverage and vendor gates
- [ ] Principles and frozen multi-model review
- [ ] Landing board, local landing and served-build check

## Proof boundaries
Archived replay establishes readout/feedback/detection correctness, not gameplay benefit. No measured benefit claim or experiment launch. Preserve operator desktop focus; all browser proof headless.

## Session log
- Created isolated managed worktree from main `ebed5a7f3`; branch `codex/bag-pocket-bugfixes`.

- RED: agent 5 failing/1 passing; Python 5 failing/1 passing. Failures reproduce wrong enum, missing feature registration, empty-pocket comparison and missing ineffective warning. Viewer both-arm activation fails before config edits. Logs `/tmp/bag-fixes-red-{ts,py,viewer}.log`.

- RED commit `bbe972887`. GREEN: targeted native-memory fixtures, agent production factory/replay and pinned pi message-path tests pass. `bag-ineffective-loop-v1` warning recorded at call 3 and delivered to decision 4; the saved original run remains unchanged.
- Full agent suite 4236 passing; viewer coverage suite 1830 passing; Python 4114 passing. TS lint, Python ruff/format/mypy and build pass. Coverage: viewer lines98.04/branches91.67/functions95.18; Python lines97.39/branches93.38/functions100. Initial full-test failures were updated registry assertions, missing isolated-worktree runtime dependencies, historical recipe hashes and one overloaded 5s timing test; the 30s-budget full agent suite passed. No coverage excludes or thresholds changed.
- Activation corrected after the immutable-recipe tests: 24 current recipes enable all three fixes in base.features and onInBoth. Three historical recipes (`bundle-cook-4h`, `bundle-cook-6h`, `bundle-cook-6h-v2`) retain their exact frozen bytes; pinned control bases and existing runs unchanged.
- Browser: headless Chromium clicked all three actual Harness Config explainer links on an isolated scratch viewer. 1280/1440/375 captures, collapsed/expanded, viewed as QA sheets; no page errors. Artifacts in canonical ignored `runs/mockups/bag-bugfixes/`. Mobile diagrams adjusted to scroll within their own figure for readable labels. These are operator docs and offline replay, not new gameplay.

- GREEN commit `16ab1a2a8`. Synced main `7133032cc`; recipe conflicts resolved by retaining main’s approved trigger-navigation both-arm promotion and adding the three bag repairs. Wiring-deletion checks each failed with its production operand removed, then passed restored, with hashes and separate logs in owned `runs/wiring-proof/`.

- Post-sync full suites: agent4236 and viewer1838 (132 files) pass with maxWorkers4/testTimeout30000; Python4114 pass. On the busy shared host, the default parallel run hit an unrelated serial-comparison child-start timing assertion; reduced worker concurrency passed without changing tests. Full lint passes all languages. Post-sync coverage rerun includes bag feedback wording (explicitly names pocket/list changes). Prior coverage logs retain the first historical-recipe failure before restoration.
- Browser final rehearsal uses a terminal-marked, explicitly manual offline scratch run, not a live game. It preserves copied historic observations and generates the new guard diagnostic through production code. Early scratch proof lacked a terminal marker and its game image was not valid recorded-frame proof; replaced it with ended replay. Verified trace warning, selected raw-event JSON, and all3 explainer click-throughs; no new timeline marks. Screenshots/receipts are not benchmark evidence.
- Reviewer transport discovery: Claude dedicated review profile logged in; Cursor advertises Grok4.5. No local inference calls. Coordinator declines landing holds and requires normal board order; active gameplay must remain up. Authorized viewer restart owner will use `/private/tmp/pokebench-viewer-qwen36-20261024` once, after actual landing, unless coordinator assigns refresh elsewhere.

## Round 1 review / correction
- Frozen packet base7133032cc→a4f41a8c0, diffSHA2568eb817965faeb70f32ba98637b0acb2053ff0679893b72d53730273f06735187. Claude CLI (claude-opus-5-5) and independent GPT Codex both LGTM. Grok/Cursor4.5 failed before review: `ActionRequiredError: ... You’re out of usage.` No Grok verdict. Standing-authorized fallback fresh gpt-6.1-sol LGTM; gpt-6-astra BLOCKING.
- Accepted Astra P2: semanticState returned null on native in_battle before checking the verified bag projection. Native battle_controller_player.c OpenBagAndChooseItem opens BagMenu without clearing gMain.inBattle, item_menu.c uses battle location1 and the same Task_BagMenu_HandleInput. This is within the owned-ready bag scope, not a new owner. Added a regression for battle bag ON warning/recovery, OFF exclusion and continued exclusion of unqualified ordinary battle screens; RED reproduced missing warning.
- Claude hardening follow-up about observation/cycle eligibility: no extra policy change; shared fingerprints intentionally apply existing loop policy. Wrong-but-distinct pocket labels when truth OFF are the independent OFF contract. JSON escaping is value-identical. LIST_NOTHING_CHOSEN=-1 and LIST_CANCEL=-2 verified in pinned include/list_menu.h; rejected unselected sentinel is deliberate. No unrelated capability changes accepted.
- No self-merge while the required Grok lane is unavailable; execute-worklog requires operator waiver. Review correction and all available re-review finish before asking.

- Review correction GREEN: `bag-ineffective-loop-v1` now evaluates the verified bag projection before excluding other in-battle surfaces. Native battle bag location1 warns after three equivalent attempts and recovers on cursor movement; OFF and ordinary battle behavior remain unchanged. Targeted production tests76 and viewer card/byte-serving tests315 pass. Full TS coverage suite4237 agent/1844 viewer passes; allmetrics above90. Full lint passes. No Python production changes in this correction, prior4114 tests/native/archive/coverage proof remains applicable.

- Synced main2594c77ab (gym-label both-arm activation) without conflict; inherited promotion remains baseline, no bag scope growth. Final cumulative gates: agent4237 tests and viewer1847 tests pass with coverage; agent lines99.14/branches92.75/functions97.53; viewer lines98.04/branches91.66/functions95.18. All-language lint and build pass on16154d21e. Python remains4114 pass, lines97.39/branches93.38/functions100 with no Python production changes after that gate. Vendor remains pinned pristine. Preparing round2 frozen cumulative review; missing Grok is an unavailable lane, never a successful verdict.
