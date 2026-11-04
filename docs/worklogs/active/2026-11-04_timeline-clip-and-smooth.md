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
- [x] M3a Headless proof and gates
- [ ] M3b Cloud review
- [ ] M4 Land, post-merge test, `just viewer-main`, live check

## Evidence

Headless against the live run, candidate modules in one tab and the served viewer in another, 239 s:

- Gap from the oldest mark to the clip line after the window filled: candidate 0 s at all samples; served viewer up to 47.3 s.
- Sudden losses: served viewer 78 to 25 and 88 to 22 marks. Candidate none of that kind; one 28 to 20 drop at the same second the served viewer also dropped, a burst of presses leaving the window.
- Motion over 10 s: candidate moved on 100% of frames at 0.31 px; served viewer moved on 19% of frames in steps up to 2.46 px. Across a recenter, one mark's largest per-frame move was 0.94 px over 2,085 frames.
- Same moment, both tabs: thinking 4 and 4, tool 11 and 11, presses 13 and 12, dots 0 and 49. Clip line 3 px past the widest label (102 to 105). Note absent.

Gates at the rebased source: `just test` 0 (agent 2,377, viewer 797, env 2,727, gateway 38), `just verify-vendor` 0. `pnpm -r lint` passes. `just lint` stops at ruff on pre-existing env errors (map_observation.py, adjacent_tiles.py, launcher.py); this branch changes nothing under env/.

## Multi-Model Review Log

Correction during proof: the first page of a mid-run feed derived false "recovered" diamonds (CLOCK_SET at evidence #11834 on the live run). `TimelineFeed` now keeps those as repeat guards off the window. Grid row sizing fixed after the first headless check.

Round 1: Grok lane out of Cursor usage until 11/17 (operator rule: Claude, GPT and one fresh read-only fallback). Claude CLI needed `CLAUDE_CONFIG_DIR=~/.claude-review`. GPT BLOCKING with two Fix findings, both accepted: first-page suppression hid genuine observed diamonds (now only the first state's marks), and `forgetBefore` left five aggregates growing (now trimmed).

Round 2: GPT LGTM; fallback reviewer LGTM; Claude BLOCKING on one Fix: a gap between feed pages left permanent full-width bars. Fixed with `RunView.sealOpen`. Also moved the now line back above marks and scaled the drift tolerance with replay speed. Rebut: a false diamond when a mid-run first state is unsettled exists on the base too; recorded as a follow-up, and the PB1 row now says "the first state's".

Round 3: GPT LGTM; Claude BLOCKING on one Fix: the now-line SVG took the pointer, so mark tooltips stopped working. Fixed with `pointer-events: none`; headless `elementFromPoint` reaches each mark kind. Final `just test` at 288e69724: 0 (agent 2,377, viewer 798, env 2,727, gateway 38), `just verify-vendor` 0. The fix after it is one CSS declaration.
