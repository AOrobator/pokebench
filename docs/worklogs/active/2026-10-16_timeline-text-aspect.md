# Viewer: timeline text no longer stretches at wide widths

Requested by the operator (2026-10-16 06:18 New York): in full screen the timeline's text (time markers, lane labels such as presses, milestones, errors) is stretched.

Cause: `lanesSvg` draws everything in one SVG with `viewBox="0 0 1000 H"` and `preserveAspectRatio="none"`, so at any width other than 1000 px every glyph is scaled horizontally. Fix is rendering only; nothing is added to the timeline (CLAUDE.md closed-timeline rule). Viewer-only, no switch. Branch `claude/timeline-text-aspect` in `/private/tmp/pokebench-timeline-text`. The 8790 restart goes through the coordinator (stats and mobile-header threads also touch the viewer).

## M1

- [x] RED: `timeline.test.ts` asserts the SVG holds no `<text>`, lane labels, axis labels and press labels are HTML spans positioned in percent over a `lanes-wrap`, and the CSS positions them absolutely; existing label assertions now look for `</span>`. COMMIT: `test(viewer): RED timeline text stays out of the stretched SVG` (680f5b6c)
- [x] GREEN: lane labels, axis labels and press labels render as percent-positioned spans in a `lanes-text` overlay over the SVG; restyled with `color` and a `text-shadow` outline; 9px under 600px wide. Viewer: 67 files, 905 tests pass; coverage 95.32 / 91.10 / 93.63; tsc and eslint clean.
- [x] Browser check on real cook-run events (check page under `runs/mockups/timeline-text-check/`, deleted after): at 2400px wide the "presses" label measured 89.7×12.6px before (stretched) and 38.5×12.5px after (natural), centered on its lane (label mid 137.0 vs lane mid 137.0), SVG has 0 `<text>`, "now" stays inside the panel. At 375px: no sideways scroll; long labels such as "milestones" run up to 12px past the plot start, where before they were squeezed to fit.
- [x] COMMIT: `fix(viewer): GREEN timeline text renders in an HTML overlay ...` (2a88f8cb)
- [x] Review round 1 on 2a88f8cb (base 154d905e): Grok LGTM; Claude BLOCKING (the 9px phone rule came before the press-label `font` shorthand, so press labels stayed 11px); Codex BLOCKING (press-label spans lost `aria-hidden`, so screen readers would announce presses twice; PB13 row worded as if landing had happened). All three taken; tests assert both. Left as a note: `labelPress` clamps its centre in viewBox units, exact only at 1000px.
- [x] COMMIT: `fix(viewer): press labels stay aria-hidden and shrink on phones` (e74a8040)
- [x] Review round 2 on e74a8040 (base 154d905e): Claude LGTM, Grok LGTM, Codex LGTM. Landed fast-forward: main = e74a8040; viewer 905 tests pass on main.
- [x] 8790 restart at 06:28 New York (coordinator's slot): viewer at main. The two round 3 fixed-run trials (live.js 22909, 22914) survived and show LIVE in the run selector (05-51-58 gpu0_7a95 and gpu1_7f38). The restart script reported two lost processes, 55321 and 57550; these were `serial-comparison.test.ts` vitest children in a temp `pokebench-comparison-*` dir from another session's test run, not benchmark runs. Live at 2400px: "presses" label 40.9×13px (natural), 0 `<text>` in the timeline SVG.
