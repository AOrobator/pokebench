# First interaction with Roxanne

The event `ROXANNE_FIRST_INTERACTION` means the first observed start of Roxanne's introduction, independently of victory. Source: clean pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, `data/maps/RustboroCity_Gym/scripts.inc`, `RustboroCity_Gym_EventScript_Roxanne` / `RustboroCity_Gym_Text_RoxanneIntro`. The existing ROM-mapped trainer reader identifies `TRAINER_ROXANNE_1` as 265. This change adds no addresses, ROM reads, inputs, save writes, or game actions.

The existing coherent state is sufficient: started game, Rustboro Gym map 11/3, locked field controls and an active message containing the exact native introduction prefix. An active trainer battle against 265 also establishes interaction by that observation. A last-opponent ID alone persists after battle/whiteout and is never sufficient. Gym arrival, coordinates, model narration, a victory flag in a resumed save, and guide/trainer dialogue are not interaction proof. Observations are sampling upper bounds, not exact first-input timestamps.

The event is measurement-only. It is excluded from model objective delivery, native progress guards, automatic talk reset, and even the optional story-progress-clock promotion. It is declared as `roxanne-first-interaction-v1` in new agent/human/manual metadata. New logs retain a normal native milestone with source-state evidence. Old logs without that metadata derive their event using the identical predicate; missing modern milestone rows are not silently reconstructed.

## Historical audit, 2026-10-21

The exhaustive byte-bounded scan covered 542 retained `events.jsonl` paths (444 root runs, five human recordings, and 93 retained nested evidence/probe/archived copies). Nine contained native Rustboro Gym states. Six model recordings have native first-interaction observations. The human reference has no decoded introduction text, but retained screenshots #66847 and #66857 visibly show Roxanne's opening line. The conservative displayed upper bound uses the full opening page at #66857. The visual receipt binds both image SHA1s to their original human_sample events and full immutable event-log SHA256. Existing victory evidence is preserved.

| Recording suffix | Source event | Active time upper bound | Evidence |
| --- | ---: | ---: | --- |
| petalburg2h-r10-whole-map | 7038 | 28:42.650 | native introduction |
| qwen36-gpu1_35df | 31915 | 112:16.417 | native introduction |
| qwen38-mac_28f3 | 26392 | 212:58.810 | native introduction |
| qwen36-gpu0_a8f9 | 26131 | 93:55.661 | native introduction |
| qwen36-gpu1_97a0 | 30101 | 128:42.460 | native introduction |
| qwen36-gpu1_2e93 | 22234 | 97:27.333 | native introduction |
| human_1848 | 66857 | 72:55.682 | reviewed screenshots |

Petalburg r5 whole-map and `qwen36-gpu0_b300` have gym-trainer battles only. All 64 and 12 retained gym frames respectively were reviewed as galleries, alongside their native opponent IDs. They receive no Roxanne interaction credit. The remaining 533 recordings have no recorded gym-state evidence; this is an evidence statement, not proof that a corrupted/unobserved game could never have been there. Logs with no native state remain limited by their retained observability.

The native backfill is a deterministic viewer projection, not synthetic historical event rows. Source event logs/images remain byte-identical. The human reconstruction extends the existing additive, hash-bound visual sidecar; its prior contents are backed up. Reconstruction does not promote screenshot-only model frontier records.

Reproduction: `python3 scripts/audit-roxanne.py <runs-root>` inventories originals; `node scripts/backfill-roxanne.mjs <inventory.jsonl> <scratch-runs-root> <report.json>` validates the nine candidate copies through the production split reader. Evidence retained under canonical `runs/roxanne-first-interaction/`: inventory, details, before/after report, screenshot galleries, original/proposed human sidecars, mutation logs and browser receipts. Frozen historical experiment progress orders remain unchanged.
