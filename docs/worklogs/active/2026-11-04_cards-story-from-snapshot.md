# Cards take story progress from the snapshot

Reported 2026-11-04 by the trainer card thread: run 5f0f's card said "No milestone yet" and STORY 0/203.

Not caused by 99cd6ca85. Current rows carry `splits: []`, and cards waited for `/api/cards`, which reads the opened run's full log. Opening older run 274b (2.4 GB) showed 0/203 on both cards for 3 to 11 s. The live card beside an older run, added in e355f7ce4, made this visible on a live run.

Viewer-only, no feature switch, no card appearance change.

## M1

- [x] RED/GREEN: `currentSplits` builds card splits from the snapshot's recorded progress until the qualified splits arrive
- [x] Gates: `just lint`, `just build`, `just test`, `just verify-vendor` passed under the coordinator's CPU window
- [x] Review: Claude LGTM and GPT LGTM on the final delta, fallback LGTM on the feature; Grok unavailable (Cursor usage limit until 11/17). Accepted note: after a long pause an old milestone can briefly highlight as new until qualified splits arrive
- [ ] Land, `just viewer-main`, headless proof on an older run

## Review log

Round 1 at 3abab0225: fallback LGTM; Claude and GPT BLOCKING. Provisional splits counted `present_at_start`, unproven and probe milestones, fixed: rows now carry `native`, older rows are trusted only on a boot start, probes get none. Split times are capped at the run's clock.

Rollout order: `just viewer-main`, then `just current-main`.

## Principles self-review

PB1-PB8, PB11, PB12: N/A, display only; qualified splits still replace it and grading is untouched. PB9 PASS. PB10 PASS. PB13 PENDING until the post-merge proof.
