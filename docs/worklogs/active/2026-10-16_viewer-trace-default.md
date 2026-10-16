# Viewer: AGENT TRACE default, full-height trace, phone top nav

Requested by the operator (2026-10-16): open the PokéNav on AGENT TRACE, make the trace's scroll area reach the bottom of the panel, and on phones move the PokéNav side directory to a top nav.

Viewer-only layout change; no feature switch (feature-switch skill excludes viewer-only changes). Branch `claude/viewer-trace-default` in `/private/tmp/pokebench-trace-default`. The "Stats page current-run fixes" thread also edits the viewer; merges coordinate with it.

## M1: trace default and full height

- [x] RED: `packages/viewer/src/trace-page-layout.test.ts` asserts AGENT TRACE is the only pressed button and visible page in `index.html`, and that the trace page's content is a flex column whose `.logcols` fills it. COMMIT: `test(viewer): RED PokéNav opens on AGENT TRACE and the trace fills the panel` (b7618907)
- [x] Cause: `.page-content .logcols { height:430px }` was fixed while `.inspection-nav` grows to `100svh` minus the bar, so at 1440x1300 the log ended at y=685 inside a page-content ending at y=1258.
- [x] GREEN: index.html presses AGENT TRACE and hides NEXT RUN; `.trace-content` is a flex column with `.logcols { flex:1 }` and the log and inspector `height:auto`. Phone width keeps the stacked 360px log and inspector and scrolls the page content.
  - Browser proof against live 8790 with the rule injected client-side (no second viewer, runs undisturbed): log and inspector now span y=255 to 1258, matching the page content.
- [ ] Gates, review

## M2: phone top nav

- [ ] HTML variants sent to the operator; wait for the pick
- [ ] RED / GREEN / review
- [ ] the operator approves merge; local merge into main; `just viewer-main` only with go-ahead if runs live in the 8790 process
