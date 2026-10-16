# Viewer: AGENT TRACE default, full-height trace, phone top nav

Requested by the operator (2026-10-16): open the PokéNav on AGENT TRACE, make the trace's scroll area reach the bottom of the panel, and on phones move the PokéNav side directory to a top nav.

Viewer-only layout change; no feature switch (feature-switch skill excludes viewer-only changes). Branch `claude/viewer-trace-default` in `/private/tmp/pokebench-trace-default`. The "Stats page current-run fixes" thread also edits the viewer; merges coordinate with it.

## M1: trace default and full height

- [x] RED: `packages/viewer/src/trace-page-layout.test.ts` asserts AGENT TRACE is the only pressed button and visible page in `index.html`, and that the trace page's content is a flex column whose `.logcols` fills it. COMMIT: `test(viewer): RED PokéNav opens on AGENT TRACE and the trace fills the panel` (b7618907)
- [x] Cause: `.page-content .logcols { height:430px }` was fixed while `.inspection-nav` grows to `100svh` minus the bar, so at 1440x1300 the log ended at y=685 inside a page-content ending at y=1258.
- [x] GREEN: index.html presses AGENT TRACE and hides NEXT RUN; `.trace-content` is a flex column with `.logcols { flex:1 }` and the log and inspector `height:auto`. Phone width keeps the stacked 360px log and inspector and scrolls the page content.
  - Browser proof against live 8790 with the rule injected client-side (no second viewer, runs undisturbed): log and inspector now span y=255 to 1258, matching the page content.
- [x] Review round 1 on 60cd6509 (diff sha256 b3be292b…): Claude CLI BLOCKING, asking to confirm no JS default page (confirmed: `showPage` runs only on clicks; queue polling is gated on its own button), that `.page-content` has a definite height (confirmed in the browser numbers above), and that short windows could clip with `overflow:hidden` (fixed: `.trace-content` scrolls at every width). Grok and Codex lanes failed to start (Cursor workspace trust; Codex read stdin); rerun with the M2 diff.

## M2: phone top nav

- [x] HTML variants sent (`runs/mockups/mobile-topnav/mobile-topnav.html`); The operator picked C, the page picker, 2026-10-16 00:08 New York ("feels more Pokemon-like").
- [x] RED: app.test drives the picker select, directory buttons and ◀ ▶ (wrapping) as one control; trace-page-layout asserts the markup and that only phone width hides the directory and shows the picker.
- [x] RED COMMIT: `test(viewer): RED phone page picker replaces the PokéNav side directory; trace content scrolls at every width` (06445b64)
- [x] GREEN: `.page-picker` (◀, a select built from the directory buttons, ▶) sits above the pages; below 700px the directory hides and the picker shows. `showPage` keeps the select, the buttons and the pages in step; ◀ ▶ wrap.
  - Viewer: 60 files, 786 tests pass; coverage 95.08 lines / 90.39 branches / 93.55 functions; tsc + eslint clean.
  - Browser proof at 375px on live 8790 with the markup and CSS injected client-side (no second viewer, runs undisturbed): picker spans the panel width at y=392, AGENT TRACE selected, no horizontal page scroll (scrollWidth 375).
- [x] Review round 2 on 5d2a8fde (diff sha256 16592fae…): Claude CLI LGTM, Grok (cursor-grok-4.5-high) LGTM. Taken: the picker is a `<nav aria-label="PokéNav page picker">` so phones keep a navigation landmark. Left as notes: iOS zooms on focusing a select under 16px (a 16px pixel font would not fit the panel); `??` fallbacks are unreachable but the 90 branch gate passes; the 700px `.inspection-nav { height:650px }` is pre-existing dead CSS. Codex CLI rejects its default model on this account; Codex lane rerun through Cursor.
- [x] Codex lane: blocked. Codex CLI rejects gpt-6.1-sol and gpt-5.5 on this ChatGPT account, and Cursor Codex models hit the monthly usage limit (resets 2026-10-17). Merge rests on Claude CLI + Grok LGTM, as in earlier viewer worklogs; flagged to the operator.
- [x] the operator approved merge ("merge it", 2026-10-16 00:17 New York). Fix COMMIT: `fix(viewer): phone page picker is a navigation landmark` (737a8131)
- [x] Merged into main (f361b939); viewer 786 tests pass on main. `just viewer-main` restarted 8790 at f361b939 with 0 live gameplay processes. Live check: 375px opens on AGENT TRACE, picker ◀ ▶ and select switch pages, directory hidden, no sideways scroll; 1440x1300 trace bottom 1258 = panel bottom, picker hidden.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-16). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
