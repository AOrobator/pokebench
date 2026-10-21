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
