# Viewer: timeline error marks red, no black bars on the presses lane

Requested by the operator (2026-10-16 02:58 New York): errors used to show as black bars on the errors lane; black bars now show on the presses lane instead; error bars should be red. The operator gave a standing OK to land this on main once reviews approve.

Viewer-only styling fix; no feature switch (feature-switch skill excludes viewer-only changes). Branch `claude/timeline-error-lane` in `/private/tmp/pokebench-timeline-error-lane`.

## M1: red errors, filled presses-lane marks

- [x] Repro (read-only) on the live cook run `2026-10-16T02-23-17_qwen36-gpu1_sh02` with both main's and the live 8790 build's `dist`: every error mark (4 loop, 3 retry) is drawn at y=126, the errors lane. No lane regression in code.
- [x] Cause of what the operator saw: `loop_guard` and `text_only_supervisor` marks have class `k-loop`, which has no CSS fill, so SVG paints them black. `battle_choice` marks (6 in this run, first recorded 02:49) and `wait_input` marks are drawn on the presses lane as bare `m-press` with no button class, so they are black too. The black presses-lane bars are battle choices, not errors.
- [ ] RED: `timeline.test.ts` asserts loop errors sit on the errors lane, `.lanes .m-error` fills red, and `.lanes .m-press` has a default fill declared before the button colors.
- [ ] GREEN: style.css adds `.lanes .m-error { fill: #ff4d4d; }` (compaction keeps its purple) and a default `.lanes .m-press` fill.
- [ ] Review (cloud lanes only), merge, one `just viewer-main` restart, live check.
