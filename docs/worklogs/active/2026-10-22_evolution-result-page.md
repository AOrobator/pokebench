# Evolution result-page acknowledgment

## Approved scope
User: "Go ahead with the minimal fix and the readout correction. Add the regression tests, get it reviewed, and land it on main so it’s actually in the bundle."
Repair the existing evolution-decision-v1 path only. Recognize native waiting move-learning result text at Task_EvolutionScene result states 15/20/21 after a declared evolution decision; report the waiting result correctly. No move-choice policy, tools, schema, new loop rules, measured runs, or changes to frozen historical logs.

## Evidence and native ownership
Run 2026-10-22T00-22-02_qwen36-gpu0_d951: choose_evolution evolve turn 425; learn_move forget none turn 430, result seq 16514; state seq 16513 raw archive 7202, frame 256445. COMBUSKEN did not learn DOUBLE KICK. State 15, move state 11, task flags 129. Printer 0 waits in battle text at 0x02022E51; result_message_waiting only admits gStringVar4. Retained decision then drops A and B. Source pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 src/evolution_scene.c Task_EvolutionScene EVOSTATE_TRY_LEARN_MOVE, MVSTATE_CANCEL, EVOSTATE_LEARNED_MOVE; src/text.c TextPrinterWait. Matching ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7.

## Invariants and checks
- Existing switch OFF is unchanged; no frame gate installed, same legacy readout.
- Result acknowledgment requires native evolution result state 15, 20 or 21, printer 0/window 0, active waiting printer, no autoscroll; battle text only after TASK_BIT_LEARN_MOVE.
- Real YES/NO move choices remain under caller control. No learned-move strategy.
- Production server factory, state/readout, native frame hook and action journal are regression seams.
- Native archive is retained byte-for-byte with provenance and hash; ROM stays external.

## Milestone
- [x] RED regression commit
- [x] GREEN minimal repair and explainer update
- [x] Gate deletion/restoration; test, lint, build, coverage, vendor
- [x] Frozen Claude + independent GPT + two-model fallback reviews; operator-approved Grok exception; synthesis
- [x] Landing board, ff-only main and main tests
- Post-restart build/live proof is retained in `runs/reviews/evolution-result-page/live-receipt.json`; it is runtime evidence outside Git.

## Session log
- 2026-10-22: Created isolated branch codex/evolution-result-page at a637f683c. Told Claude. No active run modified.

- RED: five regressions fail at discarded result acknowledgment, including the actual d951 native archive. Tests cover the existing server factory OFF/ON and result states 15/20/21. Receipt /tmp/evolution-result-red.log.

- RED commit dd6bcd338. GREEN: existing gate additionally recognizes the verified battle-text result buffer only with TASK_BIT_LEARN_MOVE, and covers native result states 15/20/21 (same result domain as LearnWait). Readout reports evolution_result ready with the printed page. Tests: 24/24 evolution tests. New tests corrected to turn on expanded controls (synthetic fixture has no save), and assert the readout including its value field; final assertions cover production delivery.

- Guard deletion receipts (each restored before next): /tmp/evolution-result-delete-{battle-buffer,result-state-20,result-state-21,readout-ready,result-bit,readout-wiring}.log. Each mutation failed the named targeted test; /tmp/evolution-result-restored.log: 5 passed. The 20/21 cases independently detect each missing state. Gate/readout twin checks are covered by separate readiness and wiring mutations; no claim that every legacy operand was mutated.
- Worktree setup: initial gate attempts used linked dependencies and exposed mixed main/worktree package identity; first viewer test also preceded its build. Replaced with a complete offline pnpm install and worktree-local Python venv. These setup failures are preserved in /tmp/evolution-result-{test,test-after-build,lint}.log; no source workaround or threshold change.
- The existing switch is present and true in bundle-v-control-2h base.features and the bundle switch list; it also applies to control by the existing operator contract. No experiment added because no new switch is introduced. No bundle promotion or measured benefit claimed.

- Production seam extended: state endpoint returns exact corrected controls; ActionJournal records the automatic A/release and evolution_result menu phase. Native mGBA package is linked into the isolated venv (the module alone, not shared editable environment). Main sync 16b76df84 includes the already-landed early move comparison; no conflict in this patch. Landing board number 4, exact Codex session ID verified.

- Full gates after isolated install: just build passed; just test agent 4432, viewer 1669, pytest 3952 passed (/tmp/evolution-result-test-final.log). Earlier Python setup failure was missing mGBA in the new venv; linked only the existing native binding, then the entire suite passed. Native archive fixture and production seam tests passed under the full gate.
- Lint passed on the local-dependency setup (/tmp/evolution-result-lint-local.log); final lint on the frozen candidate running. First coverage attempt failed the unchanged serial-comparison real-child 100ms timeout with empty child stdout while lint was active (/tmp/evolution-result-coverage-final.log). No timeout, test, coverage threshold, or implementation outside scope changed. Retrying the gate after lint finishes; not claiming the failed attempt passed.
- Updated existing explainer checked with pages-theme/pages-check and 200 preview URL. Opened actual 1280x900, 1440x900 and 375x812 full-page screenshots; new section is readable with no horizontal page overflow; there are no new expand/collapse controls.

- Final lint passed (agent/viewer tsc+eslint, ruff check/format and mypy). Agent coverage passes at ordinary concurrency after competing workload subsided: lines 99.23%, branches 93.29%, functions 97.98%. Initial isolated coverage diagnostic ran 44 tests green but correctly failed whole-stack coverage thresholds because it selected one file; not counted as a coverage pass. A manually split Python coverage attempt omitted the ROM environment and failed native fixtures; discarded as an environment setup receipt, /tmp/evolution-result-python-coverage.log. The complete just coverage (dotenv environment, unchanged thresholds) is the required final receipt /tmp/evolution-result-coverage-clean-load.log.

- Complete final just coverage passed with ordinary settings: agent 4432 tests, lines 99.23% / branches 93.29% / functions 97.98%; viewer 1669 tests, 97.95% / 91.34% / 94.35%; Python 3952 tests, 97.39% / 93.41% / 100%. Receipt /tmp/evolution-result-coverage-clean-load.log. All ≥90. Final lint/build and vendor checks pass. No gameplay run launched.
- Frozen review scope and PB1–PB13 self-review (zero FAIL), all nine test-quality checks: /tmp/evolution-result-review/{boundary,principles}.md. One production file, no model tools/switch defaults changed. Normal cloud roster required for self-merge; reduced-diversity fallback cannot substitute for landing approval.

## Review synthesis and authorized landing

- Frozen packet: base `d14390a486554ae5657b0d1de054cd0acb2aa4b0`, reviewed head `ad408ecebff03b1fd862813b3ba9bdeebbdcb9be`, canonical binary diff SHA-256 `e276a2f113d61c1de0b78ae49e33a3e9682051c736ef9565f073864ccb94e13f`.
- Claude CLI (dedicated review namespace, plan mode): **VERDICT: LGTM**, independently 96 relevant tests. Fresh independent GPT `/root/gpt_result_review` (no inherited turns): **VERDICT: LGTM**, 24 tests. Supplemental Sol `/root/fallback_sol_review` and Astra `/root/fallback_astra_review` (distinct models, no inherited turns): each **VERDICT: LGTM**, each 24 tests. All confirmed exact frozen identity and clean pre/post candidate.
- Grok unavailable: both Cursor `grok-4.7-high` and `cursor-grok-4.5-high` exited with account-usage exhaustion. Direct user answer in this chat: **"Approve fallback roster"**. Reduced vendor diversity is explicit; no Grok approval is invented. The later coordinator relay of the operator's blanket "land without grok" is consistent, but this branch already had direct approval.
- PB1–PB13: zero FAIL; all nine test-quality checks inspected. No concrete code blockers or contradictions. Nonblocking suggestions (existing import conventions/external ROM fixture requirement, physically unreachable gStringVar4 state combinations) stayed outside scope. Initial worklog wording is consolidated to the reviewed 15/20/21 result-state set. No production file or strategy was added by review.
- Durable review packet and full synthesis: `runs/reviews/evolution-result-page/` (`identity.json`, `boundary.md`, `principles.md`, reports, failure receipts and `synthesis.json`). Native read-only post-sync reparse: `post-sync-archive-reparse.json`; it proves the real d951 page reads `evolution_result`, ready, with its exact message, and reconstructed accepted-choice input alternates A/release. It is not a newly played run.
- Landing slot #1 and this chat ID `00000000-0000-4000-8000-ab2299eee63e` verified. Synced current main `84cb94f793ffbeaad07b0e34d923126a9ae2af79` into the branch; its own canonical diff remained byte-identical to the approved SHA-256. Synced head and fast-forward code merge: **`7832d21f5db29b5b2645b67b907e9e317500e3a6`**.
- Re-ran build, test, coverage, lint and vendor gates on that synced tree, all passed. Tests: agent 4445, viewer 1677, Python 3961. Coverage lines/branches/functions: agent 99.23/93.30/97.98%; viewer 97.95/91.33/94.35%; Python 97.39/93.43/100%. No thresholds, skips or timeouts changed. Receipts `/tmp/evolution-result-landing-*.log` and `runs/reviews/evolution-result-page/landing.json`.
- On main after fast-forward, build and the full test gate passed again: **4445 + 1677 + 3961 = 10083 tests**. Receipts `/tmp/evolution-result-main-{build,test}.log`.
- This evidence-only commit touches only this worklog. One coordinated `just viewer-main` restart follows this commit, so the viewer is built at the final main pin. The slot holder owns the restart under the coordinator's standing rule. Actual time, served stamp/hashes, surviving gameplay PIDs, workbench problems and browser/explainer checks are recorded in the runtime receipt linked above.
- Current fixed bundle definitions (bundle-v-control, bundle-cook-1h, bundle-v-control-2h, whole-map-cook-1h, whole-map-pair-2h, glm53-flash-4h) already enable evolution-decision-v1 in base.features for both arms under the existing operator contract. This patch preserves that setting. New bundle runs use the corrected source; existing measured runs keep their frozen builds. No measured cohort launched, run repaired or save edited; no gameplay benefit claim.
