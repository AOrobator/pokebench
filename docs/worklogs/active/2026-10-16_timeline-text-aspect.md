# Viewer: timeline text no longer stretches at wide widths

Requested by the operator (2026-10-16 06:18 New York): in full screen the timeline's text (time markers, lane labels such as presses, milestones, errors) is stretched.

Cause: `lanesSvg` draws everything in one SVG with `viewBox="0 0 1000 H"` and `preserveAspectRatio="none"`, so at any width other than 1000 px every glyph is scaled horizontally. Fix is rendering only; nothing is added to the timeline (CLAUDE.md closed-timeline rule). Viewer-only, no switch. Branch `claude/timeline-text-aspect` in `/private/tmp/pokebench-timeline-text`. The 8790 restart goes through the coordinator (stats and mobile-header threads also touch the viewer).

## M1

- [x] RED: `timeline.test.ts` asserts the SVG holds no `<text>`, lane labels, axis labels and press labels are HTML spans positioned in percent over a `lanes-wrap`, and the CSS positions them absolutely; existing label assertions now look for `</span>`.
- [ ] GREEN: move the three text kinds out of the SVG into a `lanes-text` overlay; restyle with `color`/`text-shadow`.
- [ ] Browser check at normal and very wide widths; review (Claude, Grok, Codex); land; restart via the coordinator.
