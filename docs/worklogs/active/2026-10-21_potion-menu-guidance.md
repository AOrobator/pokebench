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
