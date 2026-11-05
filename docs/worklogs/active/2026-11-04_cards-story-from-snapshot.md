# Cards take story progress from the snapshot

Reported 2026-11-04 by the trainer card thread: run 5f0f's card said "No milestone yet" and STORY 0/203.

Not caused by 99cd6ca85. Current rows carry `splits: []`, and cards waited for `/api/cards`, which reads the opened run's full log. Opening older run 274b (2.4 GB) showed 0/203 on both cards for 3 to 11 s. The live card beside an older run, added in e355f7ce4, made this visible on a live run.

Viewer-only, no feature switch, no card appearance change.

## M1

- [x] RED/GREEN: `currentSplits` builds card splits from the snapshot's recorded progress until the qualified splits arrive
- [ ] Gates
- [ ] Review
- [ ] Land, `just viewer-main`, headless proof on an older run

## Principles self-review

PB1-PB8, PB11, PB12: N/A, display only; qualified splits still replace it and grading is untouched. PB9 PASS. PB10 PASS. PB13 PENDING until the post-merge proof.
