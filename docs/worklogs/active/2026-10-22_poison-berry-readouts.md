# Poison and berry readouts

User approved implementation on 2026-10-22: separate feature switches, game-grounded wording, current run untouched.

## Scope
One milestone: two independent default-OFF readouts, registry/preset/server wiring, tests, local explainers and pending experiment definitions. No actions, routes, healing automation, run restart or measured launch. Active GLM run 557c is read-only evidence only. Work in codex/poison-berry-readouts.

- poison-readout-v1: make PSN explicitly poisoned independently of status-names-v1; when a living player-owned Pokémon is poisoned on the field, faithfully quote the walking/HP/fainting sentence from PetalburgCity_Mart_Text_TakeSomeAntidotesWithYou, without introducing ANTIDOTES or other unobserved remedies.
- berry-readout-v1: for visible, loaded trees only, match the existing coherent tree resource snapshot to its native object tree id; distinguish ripe/growing without revealing type or yield before examining. The game still owns the harvest prompt. For medicinal berries already in the BAG, quote their item descriptions.
- OFF leaves previous text and state JSON unchanged. No tool, navigation or timeline changes.

## Grounding
pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 (clean); US Emerald f3ae088181bf583e55daf962a92bb46f4f1d07b7. field_poison.c / field_control_avatar.c, party_menu.c GetAilmentFromStatus; data/maps/PetalburgCity_Mart/scripts.inc; data/scripts/berry_tree.inc; event_object_movement.c SetBerryTreeGraphics; resource reader's verified object +0x1D and tree table.

## Checks
- [ ] RED test commit
- [ ] GREEN implementation and exact OFF tests
- [ ] Production wiring removed/restored, regression goes RED
- [ ] Archived native RAM replay, no active session inputs
- [ ] Build, lint, tests and coverage >=90%
- [ ] Explainers and pending experiment/readiness entries
- [ ] Independent cloud review; report gate status accurately

## Session log
- Isolated worktree created from main; no current-run changes.
