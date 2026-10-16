# Viewer: timeline error marks red, no black bars on the presses lane

Requested by the operator (2026-10-16 02:58 New York): errors used to show as black bars on the errors lane; black bars now show on the presses lane instead; error bars should be red. The operator gave a standing OK to land this on main once reviews approve.

Viewer-only styling fix; no feature switch (feature-switch skill excludes viewer-only changes). Branch `claude/timeline-error-lane` in `/private/tmp/pokebench-timeline-error-lane`.

## M1: red errors, filled presses-lane marks

- [x] Repro (read-only) on the live cook run `2026-10-16T02-23-17_qwen36-gpu1_sh02` with both main's and the live 8790 build's `dist`: every error mark (4 loop, 3 retry) is drawn at y=126, the errors lane. No lane regression in code.
- [x] Cause of what the operator saw: `loop_guard` and `text_only_supervisor` marks have class `k-loop`, which has no CSS fill, so SVG paints them black. `battle_choice` marks (6 in this run, first recorded 02:49) and `wait_input` marks are drawn on the presses lane as bare `m-press` with no button class, so they are black too. The black presses-lane bars are battle choices, not errors.
- [x] RED: `timeline.test.ts` asserts loop errors sit on the errors lane, `.lanes .m-error` fills red, and `.lanes .m-press` has a default fill declared before the button colors. Lane assertion already passed; fill assertion failed. COMMIT: `test(viewer): RED timeline errors fill red and presses-lane marks are never unstyled black` (8c3f6091)
- [x] GREEN: style.css replaces the per-kind red list with `.lanes .m-error { fill: #ff4d4d; }` (compaction keeps its purple) and adds a default `.lanes .m-press { fill: #dfe8f5; }` before the button colors, so battle choices and host waits read as pale marks.
  - Viewer: 60 files, 804 tests pass; coverage 95.15 lines / 90.52 branches / 93.61 functions. TS lint clean; `just lint` mypy fails only on the unbuilt mGBA binding in this fresh worktree (pre-existing env gap).
  - COMMIT: `fix(viewer): GREEN timeline errors are red and presses-lane marks have a fill` (206cc383)
- [x] Review round 1 on 206cc383: Grok (cursor-grok-4.5-high) LGTM, Claude CLI LGTM (default profile; `~/.claude-review` login expired; Cursor Claude at usage limit until 2026-10-17), Codex CLI (gpt-5.6-sol) BLOCKING for missing browser proof of the candidate.
- [x] Browser proof on live 8790 (no restart, run untouched): before the change, computed fills were `k-loop` rgb(0,0,0) and bare `m-press` rgb(0,0,0), confirming the black bars. The candidate stylesheet (sha256 07cf3d7a…, identical to 206cc383) could not load cross-origin, so its two rule changes were applied to the served sheet through CSSOM at the same positions. Computed fills then: `m-error` with k-loop/retry/tool/model/telemetry rgb(255,77,77); k-compaction rgb(190,140,255); bare `m-press` rgb(223,232,245); b-A, b-B, b-UP, b-START keep their colors; `m-tool err` unchanged.
- [x] Candidate build on the cook run's real events: 34 error marks at y=126 (errors lane); 41 battle-choice renders as bare `m-press` at y=61.5 (presses lane), now pale instead of black.
- [x] Review round 2 on 2abc29dc (diff sha256 in packet): Claude CLI LGTM, Grok (cursor-grok-4.5-high) LGTM, Codex CLI (gpt-5.6-sol) LGTM.
- [x] Merged 2abc29dc into main with the operator's OK ("you can land this change to main once it gets approved", 2026-10-16 02:58 New York). Main had moved since bebb98c3; its only overlap was unrelated `.wb-*` workbench rules in style.css, auto-merged. Viewer on the merged tree: 60 files, 821 tests pass.
- [x] One `just viewer-main` restart: viewer at 0cb1959a, "0 live gameplay process(es) kept running". Cook run #2 had already ended on its own (`run_end` reason `budget`, 03:23:43 New York). Live check on 8790: the served style.css has both rules; computed fills are k-loop/k-retry rgb(255,77,77), k-compaction purple, bare m-press rgb(223,232,245), b-A and b-UP unchanged. The cook run's final window shows three red error bars on the errors lane and no black bars on the presses lane.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-16). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
