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

## Implementation and validation receipt
- RED commit 84e1fba8: missing production detector tests failed. GREEN adds measurement-only detection, shared pure browser/server predicate, recorder provenance and metadata; no gameplay inputs or model-feedback changes. Real recorder and six retained state fixtures pass.
- Native recovery, shared split/frontier catalogs, status qualification, replay projection, human screenshot reconstruction and comparison-baseline support implemented. Browser checking caught the stripped card-measurement case; visual splits now carry their exact source observation timestamp through the lightweight card projection. A regression exercises that actual projection.
- Historical audit: 542 logs, nine native gym intervals, six native reconstructions plus one reviewed human screenshot reconstruction. Two gym-only model recordings have no interaction evidence. All 76 of their retained gym screenshots reviewed. Original logs and images untouched. Proposed human sidecar staged separately until serving code can read it.
- RED/GREEN and two independent mutations: changing trainer 265 to 264 and replacing the native Roxanne introduction prefix each fail targeted assertions; restored source passes. Evidence in canonical runs/roxanne-first-interaction/.
- Full coverage before final timestamp-projection refinement: 3,249 agent + 1,569 viewer + 3,564 Python tests; every coverage metric >=90. Python first attempt omitted ROM env and failed/skipped integration tests; explicit POKEBENCH_ROM rerun passes without skips. Final TS coverage/lint reruns cover the refinement. Build, vendor, schema byte comparison and explainer self-contained check pass.
- Candidate browser: comparison graph shows seven recovered points, human details retain screenshots/hashes, no lost or duplicate candidate runs. Replay/split and responsive checks ongoing before frozen cloud review. Original live viewer is untouched.

### Pre-review checkpoint
Final TS coverage: 3,251 agent and 1,569 viewer tests pass, required metrics above 90 (agent branches 93.07%; viewer branches 91.10%). Full Python 3,564 passed with matching external ROM and no skips; lines 97.25%, branches 92.95%, functions 100%. Full lint/build/vendor/schema/page checks pass. New measurement recorder, native fixture, historical/replay/wire graph and lightweight-card timestamp regressions pass. Historical screenshots were inspected, including all 76 negative-run gym frames.
Browser candidate: human graph point opens exact source screenshot/hash details; Watch/Replay reaches ENDED with the correct human frame and the split row 1:12:55; 1280/1440/375 screenshots opened and inspected. Required independent cloud review and local-main/live receipt remain pending. No event logs/images were altered; the additive human sidecar is still staged for serving-code adoption.
