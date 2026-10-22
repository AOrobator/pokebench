# Potion menu observations and factual healing guidance

Authorized outcome: improve actionable menu observations and contextual guidance, remove blanket heal-to-full advice, and verify the complete potion flow on a separate recorded native probe. Do not interrupt, reload, observe through tools, or change the currently measured game servers. Source evidence: bundle 2026-10-21T00-16-44_qwen36-gpu1_2e93, turns 548–563, source a38c8b72; Torchic 24/31, Potion x1; repeated party SUMMARY entries.

## Scope and boundary
- menu-item-guidance-v1: default OFF, additive state-owned observations describing UP/DOWN controls, selected choice, and USE versus held ITEM; short contextual prompt guidance. No input automation or new tool.
- factual-healing-guidance-v1: default OFF, replaces the story full-HP directive and repeated heal-first directive with factual HP/battle/healing options. Removes full-HP gating when enabled, while preserving explicit trainer-sight confirmation. No claim that a battle is safe.
- Existing typed state, result recorder, warning events and feature metadata remain the owners. OFF retains exact prior behavior.
- Two pending experiments and tracked explainers; no measured launch or preset promotion.
- Native proof on an isolated server, copied retained checkpoint; ordinary menu inputs, HP/item delta and cancel/failure/transition checks. No RAM writes or current-server inputs.

## Milestones
1. RED regression tests at production menu/warning/factory seams.
2. GREEN implementation, switch registry/defaults, experiment entries and explainers.
3. Separate native probe; record provenance, raw RAM, screenshots and exact delivered tool text.
4. Full gates, principles self-review, independent cloud review, local landing only if required approvals available. Preserve live gameplay throughout.

## Open questions
- Which existing retained checkpoint has an injured conscious Pokémon and Potion, without using the live run state?
- Which item/menu phases have verified native ownership versus coverage gaps?
- Cloud review availability must be verified, never inferred from old notes.

## Receipts
- Worktree created from main e52a65920; canonical tree clean at intake.

RED: focused suite executes 5 tests, 4 fail on missing menu guidance, readiness guidance, production delivery and full-HP directive replacement. Receipt /tmp/potion-menu-red.log.

GREEN: focused regression suite 9/9. Full TypeScript suites 3255 agent + 1567 viewer passed before final edge-case wording; qualified Python 3564 passed, zero skips. Python coverage lines 97.25%, branches 92.95%, functions 100%. Agent TS coverage lines99.2%, branches93.1%, functions97.67%; viewer lines97.92%, branches91.2%, functions94.41%. TypeScript and Python lint pass. Existing historical registry-position assertions updated only for two appended switches; legacy feature fixture keeps both OFF.

Native battle probe 2026-10-21T01-54-39_potion-native-probe_menu1: retained RIVAL_BATTLE_STARTED checkpoint from frontier-acq-a, Torchic8/21 with Potion3. Target cancellation leaves8/21 and3; actual USE yields21/21 and2 with native message restored13 points. Probe ended completed. Earlier startup probe01-54-03 was terminated after stdin closed, retained as incomplete diagnostic. No measured run touched. Field proof in progress from separate retained OLDALE_TOWN checkpoint.

Additional observation gap found during manual setup: shop_menu item list reports invalid shop item list/index for list_item_id13; screenshot/quantity owner can still identify Potion. This is pre-existing (no Python change in candidate), retained for follow-up rather than silently guessing controls.

Mutation proof: five independent deletions (menu factory, heal-first factory boolean, full-HP gate bypass, story warning factory boolean, second story directive) each fail the focused suite; restoration passes10/10. Logs and exact receipts: runs/potion-proof/mutations/.

Committed implementation221115dd. Pending entries now pin its full SHA. Full final TS tests and coverage pass; final source build passes. Manual field setup bought one Potion through the game shop with Torchic15/19 and retained a native pre-use checkpoint (SHA1 54491b877d54bea1531bcff1d50bcd1cf9510303), labelled validation-only. No current-run inputs or server restart.

Round1 review: GPT + fallback Sol/Astra found two in-contract defects: special berry-only Bag locations falsely got normal controls; V2 no-known-heal-place branch still directed healing. Both accepted and fixed in original owners. RED2 fails2/11, GREEN2 passes12/12 including real b300 factory fixture. Ten independent seam/operand mutations fail and restoration passes, receipts runs/potion-proof/mutations-round2-final. No new production owner. Claude cloud unavailable (dedicated CLI logged out; Sonnet and Opus capped); Grok first round superseded incomplete after blockers converged, will re-review cumulative fix.

Field native proof 2026-10-21T02-06-33_potion-native-probe_menu1: seq102 cancellation retains15/19 HP and Potion1; seq141 success restores4 to19/19 and Potion0. Full-HP no-effect seq365 frame shows “It won’t have any effect.”; decoded HP19/19 and Potion1 unchanged after buying a second Potion through native shop UI. Raw-RAM archives validate hashes and reparse through production reader. Final native checkpoint retained. Probe ended completed.

Follow-up decoder gap (pre-existing, outside frozen no-Python boundary): no-effect party message uses an inline text source; current reader reports Party printer has invalid window/message cursor and stale Use on which POKéMON buffer. Screenshot shows actual no-effect message, HP and inventory prove no consumption. Candidate withholds new controls for diagnostic owners, does not invent a message. Shop owner/index diagnostics also retained. Neither gap is claimed repaired.

Final source pin4fbaba2e contains review fixes; both pending experiments repinned to it without approval. Native proof uses identical ordinary field/battle menu paths from221115dd, and final-reader replay checks the same coherent archives.

2026-10-22 landing authorization: operator answered "yes" to landing with three independent GPT-family approvals and waiving unavailable Claude/Grok lanes. Waiver is specific to those missing cloud lanes; both switches remain default OFF, no experiment approval or launch.

Integration sync to main7eda84361: preserved all newer main features and wrappers, re-applied the two appended registry entries/defaults and historical registry-position assertions, and wrapped current withStalePlanFact outside the updated heal-first call. Main progress-aware gate option and new tool/training/gym wiring retained. The original own diff necessarily changed, so a fresh frozen integration review will precede landing. Full Python3960 zero skipped with coverage gate passes; TypeScript/Python lint pass. Full TS test/build/coverage rerun in progress. Earlier integration test runs exposed only stale registry-position assertions, corrected for two new entries without changing the asserted identities. Native potion mechanics/recordings remain unchanged.

Integration1 frozen712c3b8d: GPT/Sol/Astra each independently VERDICT: LGTM on450791c7ad80636651864acc8dd45eb7f253489e99fb2ef807c027aad3fd451e. Full TS4476+1681 and Python3960 pass; coverage agent99.23/93.32/97.96, viewer97.95/91.34/94.35, Python97.39/93.41/100. Linters/build pass. Joined board with actual chat ID 00000000-0000-4000-8000-33c8d9ca7421.

On landing turn main had advanced to3a43509a8 with navigation-recovery-v1. Sync changed own registry/test-context diff; released slot immediately via land-done before re-review per landing skill. Incoming navigation-recovery implementation/config unchanged; appended our two entries after it and preserved registry assertion identities. Revalidation and fresh integration confirmation required on final merged branch before rejoining. No main merge or viewer restart yet.

## Final landing evidence — 2026-10-22
- Final integration65c81f4c4cf2d8276b3dee091a255150cc799e0b reviewed by independent GPT, Sol and Astra, each VERDICT: LGTM on cumulative SHA256cdcfdeca9038995726bb0a8621325913fc838770bd8f59d99fac66508f0a6568 versus3a43509a8. Read-only clean/hash checks before and after. Missing Claude/Grok cloud lanes waived explicitly by operator's yes in this chat. Reduced vendor diversity retained.
- Final branch lint/build and coverage pass. TS4506 agent+1684 viewer; qualified Python3960 zero skips, coverage97.39/93.41/100. All per-metric coverage floors pass. No vendor edits.
- Joined board with actual chat ID 00000000-0000-4000-8000-33c8d9ca7421; number1 at12:05EDT, main still3a43509a8. Fast-forward landed65c81f4c4, no source delta after frozen packet.
- Required post-landing main just test passes4506+1684+3960=10150. Main build passes. Both flags verified OFF in normalized presets and viewer defaults. Existing run definitions and experiment approvals unchanged.
- Single viewer-main invocation at~12:05EDT built clean65c81f4c4; reported all3 live gameplay PIDs survived. Its background child exited after command completion; restored the exact built viewer as foreground managed exec session64238, without another restart/build or any game input. At12:06-12:08EDT listenerPID47782 alone on127.0.0.1:8790; served build stamp clean65c81f4c4; gameplayPIDs22914,33844,34624 all still alive.
- Live viewer original2e93 replay: HARNESS CONFIG shows both new cards NOT RECORDED, both READ EXPLAINER links clicked and correct pages opened; HTTP bodies exactly match merged tracked files. No browser warnings/errors. Workbench has no build-skew warning (only ordinary historical-run loading status). Opened screenshot runs/mockups/potion-menu-guidance/shots/landed-feature-cards.png. Native Potion proof remains the completed isolated field/battle/cancel/no-effect receipts above; no model efficacy claim.
- Known pre-existing no-effect message-buffer/shop decoder gaps remain follow-ups. Both switches defaultOFF; pending experiments unqueued/unapproved; no gameplay launch/restart/retrofit.
