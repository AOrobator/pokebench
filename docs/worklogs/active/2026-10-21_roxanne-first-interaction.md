# First interaction with Roxanne

## Requested outcome
Record first interaction with Roxanne for future runs, backfill every retained run where supported by recorded native state and screenshots, and expose the split consistently in viewer, comparisons and frontier.

## Status
The operator explicitly approved implementation, exhaustive backfill and viewer verification. Isolated branch codex/roxanne-first-interaction. RED: two production-detector tests fail because the milestone is absent (/tmp/roxanne-red.log). Historical inventory is running read-only against all retained events.jsonl.

## Definition and source evidence
Proposed event ROXANNE_FIRST_INTERACTION: first confirmed start of RustboroCity_Gym_EventScript_Roxanne introduction. Not gym entry, proximity, narration, or victory. First battle-start evidence establishes an upper bound if earlier conversation cannot be recovered. Keep victory and badge separate. Repeat attempts emit once; a later loss does not remove credit. Do not infer in-run interaction from a resumed save already holding victory flags.
Game reference clean at 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; data/maps/RustboroCity_Gym/scripts.inc calls trainerbattle_single TRAINER_ROXANNE_1 with RustboroCity_Gym_Text_RoxanneIntro. Verify exact ROM mapping before introducing native reads.
Existing agent catalog and viewer order/frontier omit first interaction. Human run 2026-10-13T23-50-13_human_1848 strategy-audit/summary.json indexes candidate first battle-introduction frame seq 67025, frames/067025_0.png; this is a discovery pointer, not yet visually verified evidence.

## Milestones
- [ ] M1: RED then GREEN production recording and typed propagation. Audit available script/dialogue/battle identity evidence; implement measurement-only once-per-run event with source references and declared metadata. Do not modify prompts, stall clocks or gameplay policy. Test pre-event, unrelated dialogue, correct intro, battle fallback, repeated attempts/loss, unknown data and resumed saves. Audit model-delivery isolation; behavior changes would require feature-switch workflow.
- [ ] M2: Historical inventory across all retained agent and human recordings. Inspect native states and screenshot intervals, hash-bound additive reconstruction sidecars, preserve originals; report supported/unknown/unavailable counts and first-observation upper bounds. Never use model narration as completion proof. Audit live append-only logs with bounded hash snapshots.
- [ ] M3: Shared viewer split order, frontier, replay, comparison and detail provenance. Real-data before/after audit with no missing or duplicate runs; owned scratch viewer and browser checks at desktop/phone sizes. Preserve timeline rules and measurement qualification.
- [ ] M4: Full tests, >=90 percent coverage per required metric, lint/build/vendor checks; frozen principles review and required independent cloud review lanes; only then authorized local-main landing and coordinated viewer refresh/live evidence. Existing running agents keep their pinned code until separately restarted; no measured runs launched or restarted by this task.

## Open questions to resolve during implementation
Which coherent existing native fields identify dialogue start? What capture gaps require battle-start upper bounds? How many retained runs have candidate gym intervals and retained screenshots? Can historical reconstruction share existing sidecar owners without conflating victory-only annotations? How do current frontier qualification rules admit reconstructed interaction evidence?

## Receipt
Implementation, tests, exhaustive backfill, review, landing and live proof are all pending.
