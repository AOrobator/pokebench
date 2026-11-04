# Timeline clip line, smooth scroll and history feed

Status: in progress. Viewer display only, so no feature switch. Nothing is added to the closed timeline.

Operator request (the operator, 2026-11-04): items stream in and clip behind a line a few pixels past the widest lane label; nothing vanishes early or in batches; remove the "Recorded history is separate" note; remove the yellow dots and keep the diamonds; smooth horizontal scrolling.

## Findings

- Batches vanished because `current-browser.ts` replaces the whole retained history with the newest 64-event page when it passes 4 MiB. The live DeepSeek run carries a median 2.3 MB per 60 s and up to 11 MB, and a page covers about 25 s.
- Marks stopped early because the label gutter was 11% of the panel, not the width of the labels.
- Holding the Agent Trace stopped all history refreshes, so the timeline drained.
- Jitter came from a 10 Hz full rebuild on the main thread.

## Milestones

- [x] M1 RED tests
- [x] M2 GREEN: `LaneMotion`, `TimelineFeed`, `forgetBefore`, head refresh during a trace hold, label column, dots and note removed
- [ ] M3 Headless proof, gates, cloud review
- [ ] M4 Land, post-merge test, `just viewer-main`, live check

## Multi-Model Review Log
